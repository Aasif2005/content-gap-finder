import { config } from '../config.js';
import { currentRun, throwIfCancelled, signalWithTimeout, CancelledError } from '../lib/runContext.js';

const { base, apiKey, timeoutMs } = config.deepseek;

// Verified accepted by the API; retries escalate up to this ceiling.
const MAX_OUTPUT_TOKENS = 64000;

/**
 * Chat completion constrained to JSON. DeepSeek's json_object mode requires the
 * word "json" to appear in the prompt, which every caller here satisfies.
 * Retries on transport errors, 5xx and unparseable bodies -- a reasoning model
 * occasionally truncates, and one retry is cheaper than failing the whole run.
 */
/**
 * The request body. `thinking` is sent only when the caller sets it: DeepSeek
 * models think by default, and in thinking mode `temperature` is accepted but
 * has no effect (api-docs.deepseek.com, "Thinking mode"). So `temperature`
 * here only means something for a call made with thinking 'disabled'.
 */
export function requestBody({ model, system, user, maxTokens, temperature, thinking = null, stream = false }) {
  return {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    max_tokens: maxTokens,
    temperature,
    ...(thinking ? { thinking: { type: thinking } } : {}),
    // Streaming changes only how the reply is delivered, not what the model writes.
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  };
}

/**
 * Reads an OpenAI-style SSE body into the same shape a non-streamed reply has:
 * { choices: [{ message: { content }, finish_reason }], usage, model }.
 * `onDelta({ content, reasoningChars })` is called as text arrives: the answer so
 * far, and how many reasoning characters the model has written so far.
 */
export async function readStream(body, onDelta = () => {}) {
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoningChars = 0;
  let finishReason = null;
  let usage = null;
  let model = null;

  const handleLine = (line) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    const chunk = JSON.parse(payload);
    if (chunk.model) model = chunk.model;
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta ?? {};
    let changed = false;
    if (delta.reasoning_content) { reasoningChars += delta.reasoning_content.length; changed = true; }
    if (delta.content) { content += delta.content; changed = true; }
    if (changed) onDelta({ content, reasoningChars });
  };

  for await (const piece of body) {
    buffer += decoder.decode(piece, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      handleLine(buffer.slice(0, nl).replace(/\r$/, ''));
      buffer = buffer.slice(nl + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleLine(buffer.trim());

  return { choices: [{ message: { content }, finish_reason: finishReason }], usage, model };
}

/**
 * The value of top-level `key` in a JSON object that is still being written, once
 * that value (an array) is complete -- or null while it is not. Used to act on a
 * reply's first field before the model has finished the rest.
 */
export function completedTopLevelArray(text, key) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  let lastKey = null; // the most recent string read at depth 1
  let valueStart = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') {
        inString = false;
        if (depth === 1) lastKey = text.slice(stringStart + 1, i);
      }
      continue;
    }
    if (ch === '"') { inString = true; stringStart = i; continue; }
    if (ch === '{' || ch === '[') {
      if (depth === 1 && ch === '[' && lastKey === key) valueStart = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 1 && valueStart !== -1) {
        try { return JSON.parse(text.slice(valueStart, i + 1)); } catch { return null; }
      }
      if (depth <= 0) return null; // the object closed without the key
    }
  }
  return null;
}

export async function chatJSON({ system, user, model = config.deepseek.analysisModel, maxTokens = 16000, temperature = 0.3, attempts = 3, thinking = null, onDelta = null }) {
  let lastError;
  let activeModel = model;
  let budget = maxTokens;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    throwIfCancelled();
    const startedAt = Date.now();
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(requestBody({ model: activeModel, system, user, maxTokens: budget, temperature, thinking, stream: Boolean(onDelta) })),
        signal: signalWithTimeout(timeoutMs),
      });

      if (!res.ok) {
        const body = await res.text();
        const err = new Error(`DeepSeek ${res.status}: ${body.slice(0, 300)}`);
        err.status = res.status;
        // 4xx other than rate-limit is our bug (bad key, bad model) -- don't burn retries.
        if (res.status < 500 && res.status !== 429) throw Object.assign(err, { fatal: true });
        throw err;
      }

      const data = onDelta ? await readStream(res.body, (d) => onDelta({ ...d, attempt })) : await res.json();
      const choice = data.choices?.[0];
      const content = choice?.message?.content ?? '';

      if (choice?.finish_reason === 'length') {
        // These models spend a large share of the budget on reasoning tokens, so
        // a payload that fits one day can overflow the next. Mark it so the
        // retry raises the ceiling instead of repeating the same failure.
        throw Object.assign(
          new Error(`DeepSeek response hit the ${budget}-token limit before closing its JSON`),
          { truncated: true }
        );
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed > 60_000) {
        console.warn(`[deepseek] slow call: ${activeModel} took ${(elapsed / 1000).toFixed(0)}s (attempt ${attempt})`);
      }
      return { data: parseJSON(content), usage: data.usage ?? null, model: data.model, fellBack: activeModel !== model };
    } catch (err) {
      if (currentRun()?.signal?.aborted) throw new CancelledError(); // stopped by the person: no retry
      lastError = err;
      if (err.fatal || attempt === attempts) break;

      // A timeout means this model is too slow for this payload, not that the
      // request was malformed -- retrying it identically just burns another
      // full timeout, so drop to the fast model for the remaining attempts.
      const timedOut = err.name === 'TimeoutError' || /timed? ?out|aborted/i.test(err.message);
      if (timedOut) {
        // Always report a timeout. This used to log only when falling back to a
        // different model, which meant the default config (analysis == fast)
        // burned attempts x timeoutMs in complete silence.
        console.warn(
          `[deepseek] ${activeModel} timed out after ${timeoutMs / 1000}s on attempt ${attempt}/${attempts}`
        );
        if (activeModel !== config.deepseek.fastModel) {
          console.warn(`[deepseek] falling back to ${config.deepseek.fastModel}`);
          activeModel = config.deepseek.fastModel;
        }
      }
      if (err.truncated) {
        budget = Math.min(Math.round(budget * 2), MAX_OUTPUT_TOKENS);
        console.warn(`[deepseek] response truncated; retrying with max_tokens=${budget}`);
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
