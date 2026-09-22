import { config } from '../config.js';

const { base, apiKey, timeoutMs } = config.deepseek;

/**
 * Chat completion constrained to JSON. DeepSeek's json_object mode requires the
 * word "json" to appear in the prompt, which every caller here satisfies.
 * Retries on transport errors, 5xx and unparseable bodies -- a reasoning model
 * occasionally truncates, and one retry is cheaper than failing the whole run.
 */
export async function chatJSON({ system, user, model = config.deepseek.analysisModel, maxTokens = 8000, temperature = 0.3, attempts = 3 }) {
  let lastError;
  let activeModel = model;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: activeModel,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
          max_tokens: maxTokens,
          temperature,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        const body = await res.text();
        const err = new Error(`DeepSeek ${res.status}: ${body.slice(0, 300)}`);
        err.status = res.status;
        // 4xx other than rate-limit is our bug (bad key, bad model) -- don't burn retries.
        if (res.status < 500 && res.status !== 429) throw Object.assign(err, { fatal: true });
        throw err;
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      const content = choice?.message?.content ?? '';

      if (choice?.finish_reason === 'length') {
        throw new Error('DeepSeek response hit the token limit before closing its JSON');
      }

      return { data: parseJSON(content), usage: data.usage ?? null, model: data.model, fellBack: activeModel !== model };
    } catch (err) {
      lastError = err;
      if (err.fatal || attempt === attempts) break;

      // A timeout means this model is too slow for this payload, not that the
      // request was malformed -- retrying it identically just burns another
      // full timeout, so drop to the fast model for the remaining attempts.
      const timedOut = err.name === 'TimeoutError' || /timed? ?out|aborted/i.test(err.message);
      if (timedOut && activeModel !== config.deepseek.fastModel) {
        console.warn(`[deepseek] ${activeModel} timed out; falling back to ${config.deepseek.fastModel}`);
        activeModel = config.deepseek.fastModel;
      }
      await new Promise((r) => setTimeout(r, 800 * attempt)); // linear backoff
    }
  }

  throw Object.assign(new Error(`DeepSeek analysis failed: ${lastError.message}`), { code: 'DEEPSEEK_ERROR' });
}

/** json_object mode is reliable, but strip fences/prose defensively before parsing. */
function parseJSON(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error(`could not parse JSON from model response: ${cleaned.slice(0, 200)}`);
  }
}
