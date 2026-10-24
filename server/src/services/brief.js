import * as jobs from '../lib/jobs.js';
import * as store from '../lib/store.js';
import { chatJSON } from './deepseek.js';
import { truncate } from './analyze.js';
import { FORMULAS } from '../lib/hookFormulas.js';
import { scoreHook } from '../lib/hookScore.js';
import { lintTitle, ungroundedNumbers, words, STOP } from '../lib/titleLint.js';

// "Make it": turn one grounded gap into a brief a creator can film from -- hooks,
// script beats, SEO. Ports the prompts of youtube-agent-skill's yt-script and
// yt-seo (MIT, see data/NOTICE) onto DeepSeek, with every judgement that can be
// made in code made in code: hooks are scored by lib/hookScore.js, the title is
// linted, the query test is a string check, runtime is a word count. The model
// writes; it never grades its own writing.

const SYSTEM = `You draft a YouTube video brief for ONE audience request that real viewers voiced in comments.
You are given the request, the exact comments behind it, the existing videos that only partly cover it, and a title.
Everything you write must follow ONLY from that evidence.

HARD RULES
- Never invent a number, statistic, result, price, source, name, date or quote. If a figure would strengthen a line and the evidence does not contain it, write the line without it. This includes counts like "3 ways".
- Never promise something the evidence does not support.

HOOKS (the first 15 seconds is the whole job)
- Write exactly 5 spoken openers, 9-24 words each, each using a DIFFERENT formula from the list below.
- Each one must confirm what the title promises in its first sentence, carry ONE idea, and open a question the viewer cannot close.
- Never open with who the creator is, a channel intro, "before we get started" or a subscribe ask.
- Speak TO the viewer. The comments are your research, not your script: a hook must never mention "comments", "commenters", "viewers say" or "someone asked".
- A hook is graded on five things, so write to them: SPECIFICITY (a number, name or date taken from the evidence beats an adjective), ADDRESS (say "you" within the first six words), STAKES (what it costs the viewer to keep doing it the current way), CURIOSITY (open a question and do NOT answer it in the same breath: no "because", no "which means"), BREVITY (9-24 words, one breath).

SCRIPT
- Beats, one idea each: first "turn" (0:15-0:45: say what the video will do and start doing it), then 2-5 "body" beats, then "payoff" (deliver what the hook promised and say you are delivering it), then "close" (one ask, not three).
- For every beat say what is ON SCREEN, not just what is said. A talking head with nothing to look at is a podcast.

SEO
- queries: the three searches a real person would type to find this video, in THEIR words from the comments.
- description_opening: the first two lines of the description. They are the search snippet: say what the video gives, in the words of those queries.
- tags: at most 15, only for disambiguation (spellings, tool names, abbreviations people actually type). No stuffing, nothing unrelated.`;

export const formulaList = () => FORMULAS.map((f) => `- ${f.id}: ${f.shape}`).join('\n');

/** The query test: do the words of each target query appear in the title / the title plus the description opening? */
export function queryTest(queries, title, opening) {
  const tokens = (q) => words(q).filter((w) => !STOP.has(w));
  const have = (text) => new Set(words(text));
  const inTitle = have(title);
  const inBoth = have(`${title} ${opening}`);
  return queries.map((query) => {
    const t = tokens(query);
    return { query, inTitle: t.length > 0 && t.every((w) => inTitle.has(w)), inOpening: t.length > 0 && t.every((w) => inBoth.has(w)) };
  });
}

const strings = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []);

/**
 * Everything deterministic about a brief, applied to the model's raw output.
 * `corpus` is the text a number may legitimately come from (the audience's own
 * words, the question, the niche, the title); anything numeric outside it is
 * flagged, and a hook with an invented figure can only win if all of them have one.
 */
export function finalizeBrief(raw, { title, thumbnailText, corpus }) {
  const hooks = (Array.isArray(raw?.hooks) ? raw.hooks : [])
    .map((h, order) => ({ text: typeof h === 'string' ? h : h?.text, claimed: h?.formula_id ?? null, order }))
    .filter((h) => typeof h.text === 'string' && h.text.trim())
    .map((h) => {
      const invented = ungroundedNumbers(h.text, corpus);
      return { ...scoreHook(h.text), claimedFormula: h.claimed, ungrounded: invented.length > 0, inventedNumbers: invented, order: h.order };
    })
    .sort((a, b) => Number(a.ungrounded) - Number(b.ungrounded) || b.verdict - a.verdict || a.order - b.order);

  const beats = (Array.isArray(raw?.beats) ? raw.beats : [])
    .filter((b) => b && typeof b.say === 'string' && b.say.trim())
    .map((b) => ({ beat: String(b.beat ?? 'body'), say: b.say.trim(), onScreen: String(b.on_screen ?? '').trim() }));
  const spokenWords = beats.reduce((n, b) => n + words(b.say).length, 0);

  const seo = raw?.seo ?? {};
  const queries = strings(seo.queries).slice(0, 3);
  const opening = typeof seo.description_opening === 'string' ? seo.description_opening.trim() : '';
  const seenTags = new Set();
  const tags = strings(seo.tags).filter((t) => !seenTags.has(t.toLowerCase()) && seenTags.add(t.toLowerCase())).slice(0, 15);

  return {
    title,
    titleLint: lintTitle(title, thumbnailText || null),
    thumbnailText: thumbnailText || '',
    hooks,
    bestHooks: hooks.slice(0, 2),
    beats,
    // 150 words a minute: the pace a spoken script lands at, so a creator can
    // tell a 90-second Short from a 12-minute video before writing a line.
    runtime: { words: spokenWords, seconds: Math.round((spokenWords / 150) * 60) },
    seo: {
      queries,
      queryTest: queryTest(queries, title, opening),
      descriptionOpening: opening,
      descriptionInvented: ungroundedNumbers(opening, corpus),
      tags,
    },
  };
}

export function briefPrompt({ run, gap }) {
  const evidence = gap.evidence.slice(0, 10).map((e, i) => `[${i + 1}] (${e.likes} likes) ${truncate(e.text, 240)}`).join('\n');
  const covering = (gap.coveringVideos ?? []).slice(0, 5).map((v) => `- ${truncate(v.title, 110)}`).join('\n') || '(none)';
  return `${run.channelMode ? `Channel: "${run.channel?.title}".` : `Niche: "${run.query.niche}".`}

THE REQUEST (as the audience asks it): ${gap.question}
What they want and why current videos miss it: ${gap.explanation || '(not given)'}
Coverage today: ${gap.coverage}. Suggested format: ${gap.suggestedFormat || 'either'}.

TITLE TO DELIVER ON: ${gap.suggestedTitle}
THUMBNAIL TEXT: ${gap.thumbnailText || '(none chosen)'}

WHAT VIEWERS ACTUALLY SAID:
${evidence}

EXISTING VIDEOS THAT ONLY PARTLY COVER IT:
${covering}

HOOK FORMULAS (formula_id: shape):
${formulaList()}

Return json with exactly this shape:
{
  "hooks": [{ "text": "the spoken opener", "formula_id": "one id from the list" }],
  "beats": [{ "beat": "turn" | "body" | "payoff" | "close", "say": "what is spoken", "on_screen": "what the viewer sees" }],
  "seo": { "queries": ["", "", ""], "description_opening": "first two lines", "tags": ["..."] }
}`;
}

const inFlight = new Map();

/**
 * Starts (or returns) the brief for one gap. A saved brief is returned at no
 * cost; a second request while one is generating joins the running job instead
 * of paying for a duplicate call.
 */
export function startBrief(runId, index, { force = false } = {}) {
  const run = store.readRun(runId);
  const gap = run?.gaps?.[index];
  if (!gap) {
    throw Object.assign(new Error('That gap was not found in this report.'), { status: 404, code: 'GAP_NOT_FOUND' });
  }

  if (!force) {
    const saved = store.readBrief(runId, index);
    if (saved) return { status: 'done', cached: true, brief: saved };
  }

  const key = `${runId}:${index}`;
  if (inFlight.has(key)) return { status: 'running', jobId: inFlight.get(key), cached: false };

  const id = jobs.create({ kind: 'brief', runId, index });
  inFlight.set(key, id);
  jobs.update(id, { phase: 'gaps', detail: 'Drafting hooks, script and SEO', progress: 15 });

  const corpus = [run.query.niche ?? '', run.channel?.title ?? '', gap.question, gap.suggestedTitle, ...gap.evidence.map((e) => e.text)].join(' ');

  chatJSON({ system: SYSTEM, user: briefPrompt({ run, gap }), maxTokens: 12000 })
    .then(({ data, usage }) => {
      const brief = {
        ...finalizeBrief(data, { title: gap.suggestedTitle, thumbnailText: gap.thumbnailText, corpus }),
        runId,
        gapIndex: index,
        generatedAt: new Date().toISOString(),
        usage: { total_tokens: usage?.total_tokens ?? null },
      };
      try { store.saveBrief(runId, index, brief); } catch (err) { console.error(`[brief ${id}] could not persist:`, err.message); }
      jobs.finish(id, brief);
    })
    .catch((err) => {
      console.error(`[brief ${id}] failed:`, err.message);
      jobs.fail(id, err);
    })
    .finally(() => inFlight.delete(key));

  return { status: 'running', jobId: id, cached: false };
}

