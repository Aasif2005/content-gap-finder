import * as jobs from '../lib/jobs.js';
import * as store from '../lib/store.js';
import { config } from '../config.js';
import { chatJSON } from './deepseek.js';
import { truncate } from './analyze.js';
import { FORMULAS, classifyFormula } from '../lib/hookFormulas.js';
import { scoreHook } from '../lib/hookScore.js';
import { assessSensitivity } from '../lib/sensitive.js';
import { lintTitle, ungroundedNumbers, unverifiedNames, unverifiedTags, words, STOP } from '../lib/titleLint.js';

// "Make it": turn one grounded gap into a brief a creator can film from -- hooks,
// script beats, SEO. Ports the prompts of youtube-agent-skill's yt-script and
// yt-seo (MIT, see data/NOTICE) onto DeepSeek, with every judgement that can be
// made in code made in code: hooks are scored by lib/hookScore.js, the title is
// linted, the query test is a string check, runtime is arithmetic. The model
// writes; it never grades its own writing.
//
// The hard problem is not style, it is honesty. The model's only inputs are a
// handful of viewer comments and some video titles, so it cannot know the facts a
// payoff needs. The brief therefore (a) labels where each fact came from, (b)
// makes the model list what it is assuming (`needs`) instead of asserting it, and
// (c) is checked in code for numbers and names the evidence never contained.

const SHORT_MAX_SECONDS = 60;

const isShortFormat = (format) => /short/i.test(format ?? '') && !/long/i.test(format ?? '');

function formatRules(format) {
  if (isShortFormat(format)) {
    return `FORMAT: a YouTube Short, under ${SHORT_MAX_SECONDS} seconds (about 150 spoken words in total).
- At most 3 beats: "turn", one "body", then "payoff". Fold the ask into the payoff.
- Write every beat as full spoken prose in "say". Do not use "points".`;
  }
  const n = config.brief.longMinutes;
  return `FORMAT: long-form, about ${n} minutes.
- Give every beat a "seconds" budget; the budgets together should come to about ${n * 60} seconds.
- Write "turn", "payoff" and "close" as full spoken prose in "say".
- For each "body" beat write "points": 3-5 short talking points, in the order to cover them, instead of prose. The creator will speak them in their own words; do not script ${n} minutes of dialogue.
- Use 4-6 body beats.`;
}

function languageRule(language) {
  const l = (language ?? '').trim();
  return l
    ? `LANGUAGE: write the hooks, script, queries, description and tags in ${l}. Keep the TITLE exactly as given.`
    : 'LANGUAGE: write in the language the viewers used in their comments (if they mix languages or scripts, mix the same way). Keep the TITLE exactly as given.';
}

function sensitiveRules(sensitive) {
  if (sensitive?.level !== 'high') return '';
  return `
SENSITIVE CASE (${(sensitive.reasons ?? []).join('; ')}): this request is about a real, ongoing case involving identifiable people.
- Never state or imply that anyone is guilty, suspicious, lying or hiding something. Viewer suspicion may only be reported as what viewers are saying, never as a finding.
- Structure the video as CONFIRMED (attributed to an official source or a named report) versus NOT CONFIRMED / UNKNOWN. No speculation about motives or what "really" happened.
- Every confirmed fact needs [NEEDS SOURCE: ...] naming the kind of source (police statement, court record, a named news report); you have none beyond the evidence below.
- Hooks must not accuse. The creator is explaining what is and is not known.`;
}

export function systemPrompt({ format, language, sensitive } = {}) {
  return `You draft a YouTube video brief for ONE audience request that real viewers voiced in comments.
You are given the request, the exact comments behind it, the existing videos that only partly cover it, and a title.
Everything you write must follow ONLY from that evidence.

HARD RULES
- Never invent a number (spelled out or in digits), statistic, result, price, source, name, date or quote. If a figure would strengthen a line and the evidence does not contain it, write the line without it. This includes counts like "three ways".
- Facts are labelled by where they came from: [comment], [video title], [channel's own title]. A phrase quoted in a video title is NOT an established fact or an official statement; attribute it ("the title of X says ...").
- You cannot know facts the evidence does not contain. Where the script needs one, do NOT assert it: write [NEEDS SOURCE: what to confirm] in the script and add it to "needs".
- Promise in the hook and title only what the beats actually deliver. The payoff may not claim more than the beats showed.
- Every beat must answer or advance the request itself. Drop side-topics that only appear in one comment.
- "angle": one sentence on what this video does that the existing videos listed do not. The "turn" must make that angle clear.

${formatRules(format)}

HOOKS (the first 15 seconds is the whole job)
- Write exactly 5 spoken openers, 9-24 words each, each using a DIFFERENT formula from the list below.
- Each one must confirm what the title promises in its first sentence, carry ONE idea, and open a question the viewer cannot close.
- Never open with who the creator is, a channel intro, "before we get started" or a subscribe ask.
- Speak TO the viewer. The comments are your research, not your script: a hook must never mention "comments", "commenters", "viewers say" or "someone asked".
- A hook is graded on five things, so write to them: SPECIFICITY (a number, name or date taken from the evidence beats an adjective), ADDRESS (say "you" within the first six words), STAKES (what the viewer risks by staying uninformed or believing the wrong version; use only consequences the evidence supports), CURIOSITY (open a question and do NOT answer it in the same breath: no "because", no "which means"), BREVITY (9-24 words, one breath).

SCRIPT
- First "turn" (say what the video will do and start doing it), then body beats, then "payoff" (deliver what the hook promised and say you are delivering it), then "close" (one ask, not three; omit it for a Short).
- For every beat say what is ON SCREEN, not just what is said. A talking head with nothing to look at is a podcast.

SEO
- queries: the three searches a real person would type to find this video, in THEIR words from the comments.
- description_opening: the first two lines of the description. They are the search snippet: say what the video gives, and it MUST contain the key words of at least two of your three queries.
- tags: at most 15, only for disambiguation (spellings, tool names, abbreviations people actually type). No stuffing, nothing unrelated, no names the evidence does not contain.

${languageRule(language)}${sensitiveRules(sensitive)}`;
}

export const formulaList = () => FORMULAS.map((f) => `- ${f.id}: ${f.shape}`).join('\n');

// A token worth testing a query against: not a stopword, and not a 1-2 letter
// particle ("ah", "la") that transliterated queries are full of.
const tokensOf = (q) => words(q).filter((w) => !STOP.has(w) && (w.length >= 3 || /\d/.test(w)));

/**
 * The query test. For each target query: are all its words in the title, in the
 * title plus the description opening, in the tags -- and if not, which words are
 * missing. A fraction, not just pass/fail, because a query in transliterated
 * Tamil can never be fully in an English title and "0 of 3" would hide that two
 * of its words did make it.
 */
export function queryTest(queries, title, opening, tags = []) {
  const inTitleSet = new Set(words(title));
  const inBothSet = new Set(words(`${title} ${opening}`));
  const inTagSet = new Set(words(tags.join(' ')));
  return queries.map((query) => {
    const t = tokensOf(query);
    const missing = t.filter((w) => !inBothSet.has(w));
    return {
      query,
      inTitle: t.length > 0 && t.every((w) => inTitleSet.has(w)),
      inOpening: t.length > 0 && missing.length === 0,
      inTags: t.length > 0 && t.every((w) => inTagSet.has(w) || inBothSet.has(w)),
      coverage: t.length ? Math.round(((t.length - missing.length) / t.length) * 100) / 100 : 0,
      missing,
    };
  });
}

const strings = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []);
const NEEDS_MARKER = /\[NEEDS SOURCE:[^\]]*\]/gi;
const WPM = 150;

// Words for TIMING, in any script. lib/titleLint's words() is Latin-only (it
// exists to lint English text), so a Tamil script would have counted as a few
// words and a 40-second beat as 4.
const spokenWordCount = (text) =>
  (String(text).replace(NEEDS_MARKER, ' ').match(/[\p{L}\p{M}\p{N}'\u2019]+/gu) ?? []).length;

// Share of letters that are Latin. The hook checklist and the name/number checks
// are written for English; below this the brief says so instead of scoring
// Tamil script as if it were English and calling every hook weak.
const latinShare = (text) => {
  const letters = String(text).match(/\p{L}/gu) ?? [];
  if (!letters.length) return 1;
  return letters.filter((c) => /[A-Za-z]/.test(c)).length / letters.length;
};
const LATIN_MIN = 0.6;

/**
 * Everything deterministic about a brief, applied to the model's raw output.
 * `corpus` is where a NUMBER may legitimately come from (the audience's own
 * words, the question, the niche, the title). `nameCorpus` is wider -- it adds
 * the covering videos' and the channel's own titles -- because a name that
 * appears in an existing video title is real even though a number there is not
 * evidence of anything. Anything outside is flagged, never silently dropped.
 */
export function finalizeBrief(raw, { title, thumbnailText = '', corpus = '', nameCorpus, format = 'long-form', sensitive = null } = {}) {
  const names = nameCorpus ?? corpus;

  const hooks = (Array.isArray(raw?.hooks) ? raw.hooks : [])
    .map((h, order) => ({ text: typeof h === 'string' ? h : h?.text, claimed: h?.formula_id ?? null, order }))
    .filter((h) => typeof h.text === 'string' && h.text.trim())
    .map((h) => {
      const invented = ungroundedNumbers(h.text, corpus);
      const unknownNames = unverifiedNames(h.text, names);
      const scorable = latinShare(h.text) >= LATIN_MIN;
      return {
        ...(scorable
          ? scoreHook(h.text)
          : { hook: h.text.trim(), properties: null, verdict: null, band: 'UNSCORED', formula: classifyFormula(h.text).name, weakest: null, fix: null }),
        unscored: !scorable,
        claimedFormula: h.claimed,
        ungrounded: invented.length > 0,
        inventedNumbers: invented,
        unverifiedNames: unknownNames,
        order: h.order,
      };
    })
    // A hook with an invented figure or an unknown name can only win if they all have one.
    .sort((a, b) =>
      Number(a.ungrounded || a.unverifiedNames.length > 0) - Number(b.ungrounded || b.unverifiedNames.length > 0)
      || (b.verdict ?? -1) - (a.verdict ?? -1) || a.order - b.order);

  const beats = (Array.isArray(raw?.beats) ? raw.beats : [])
    .map((b) => ({
      beat: String(b?.beat ?? 'body'),
      say: typeof b?.say === 'string' ? b.say.trim() : '',
      points: strings(b?.points),
      onScreen: String(b?.on_screen ?? '').trim(),
      budget: Number.isFinite(Number(b?.seconds)) ? Math.max(10, Math.min(240, Math.round(Number(b.seconds)))) : null,
    }))
    .filter((b) => b.say || b.points.length)
    .map((b) => {
      const proseWords = spokenWordCount(b.say);
      // Prose beats are timed by their words. A talking-points beat has no prose
      // to count, so it keeps the budget the model gave it and the total says so.
      const seconds = proseWords ? Math.round((proseWords / WPM) * 60) : (b.budget ?? 60);
      const text = [b.say, ...b.points].join(' ');
      // The marker's own words ("NEEDS SOURCE", "confirm with ...") are
      // instructions to the creator, not claims, so they are not checked.
      const claims = text.replace(NEEDS_MARKER, ' ');
      return {
        ...b,
        seconds,
        needsSource: (text.match(NEEDS_MARKER) ?? []).length,
        unverifiedNames: unverifiedNames(claims, names),
        inventedNumbers: ungroundedNumbers(claims, corpus),
      };
    });

  const spokenWords = beats.reduce((n, b) => n + spokenWordCount(b.say), 0);
  const estimated = beats.some((b) => !spokenWordCount(b.say));

  const seo = raw?.seo ?? {};
  const queries = strings(seo.queries).slice(0, 3);
  const opening = typeof seo.description_opening === 'string' ? seo.description_opening.trim() : '';
  const seenTags = new Set();
  const tags = strings(seo.tags).filter((t) => !seenTags.has(t.toLowerCase()) && seenTags.add(t.toLowerCase())).slice(0, 15);

  // A tag using a word the brief itself uses is consistent with the brief; only a
  // word from nowhere (neither the evidence nor anything the draft says) is
  // flagged. Judged against the evidence alone it flagged "police" and "demand".
  const briefText = [...hooks.map((h) => h.hook), ...beats.map((b) => `${b.say} ${b.points.join(' ')}`), opening].join(' ');

  const needs = (Array.isArray(raw?.needs) ? raw.needs : [])
    .map((n) => ({ claim: String(n?.claim ?? '').trim(), why: String(n?.why ?? '').trim() }))
    .filter((n) => n.claim);

  return {
    title,
    titleLint: lintTitle(title, thumbnailText || null, { sensitive: sensitive?.level === 'high' }),
    thumbnailText,
    angle: typeof raw?.angle === 'string' ? raw.angle.trim() : '',
    needs,
    sensitive,
    // The hook checklist and the name/number-word checks only understand Latin
    // script. Say so rather than silently skipping them.
    languageNote: latinShare(`${hooks.map((h) => h.hook).join(' ')} ${beats.map((b) => b.say).join(' ')}`) < LATIN_MIN
      ? 'Written mostly in a non-Latin script: hooks are not scored, and the name and number-word checks only cover Latin text. Digits are still checked.'
      : '',
    hooks,
    bestHooks: hooks.slice(0, 2),
    beats,
    runtime: {
      words: spokenWords,
      seconds: beats.reduce((n, b) => n + b.seconds, 0),
      // Talking-points beats are budgeted, not measured: say so rather than
      // present an outline's runtime as if it were a recorded read-through.
      estimated,
      format: isShortFormat(format) ? 'short' : 'long-form',
    },
    seo: {
      queries,
      queryTest: queryTest(queries, title, opening, tags),
      descriptionOpening: opening,
      descriptionInvented: ungroundedNumbers(opening, corpus),
      descriptionNames: unverifiedNames(opening, names),
      tags,
      unverifiedTags: unverifiedTags(tags, `${names} ${briefText}`),
    },
  };
}

const sourceTag = (e) => (e.source === 'video-title' ? '[video title]' : '[comment]');

export function briefPrompt({ run, gap, language = '' }) {
  const evidence = gap.evidence.slice(0, 10).map((e, i) => `[${i + 1}] ${sourceTag(e)} (${e.likes} likes) ${truncate(e.text, 240)}`).join('\n');
  const covering = (gap.coveringVideos ?? []).slice(0, 5).map((v) => `- [video title] ${truncate(v.title, 110)}`).join('\n') || '(none)';
  const house = houseTitles(run);
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
${house.length ? `\nTHIS CHANNEL'S OWN RECENT TITLES (style and vocabulary reference only; these are not facts and not the creator's voice):\n${house.map((t) => `- [channel's own title] ${truncate(t, 100)}`).join('\n')}\n` : ''}
HOOK FORMULAS (formula_id: shape):
${formulaList()}

Return json with exactly this shape:
{
  "angle": "what this video adds that the listed videos do not",
  "needs": [{ "claim": "a fact the script relies on that the evidence does not contain", "why": "where the creator should confirm it" }],
  "hooks": [{ "text": "the spoken opener", "formula_id": "one id from the list" }],
  "beats": [{ "beat": "turn" | "body" | "payoff" | "close", "seconds": 45, "say": "spoken prose (omit for long-form body beats)", "points": ["talking points, long-form body beats only"], "on_screen": "what the viewer sees" }],
  "seo": { "queries": ["", "", ""], "description_opening": "first two lines", "tags": ["..."] }
}`;
}

/** A channel run's own recent titles: all we know of its voice, and a real source of names. */
function houseTitles(run) {
  if (!run.channelMode) return [];
  return [...(run.topVideos ?? [])]
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 10)
    .map((v) => v.title);
}

const inFlight = new Map();

/**
 * Starts (or returns) the brief for one gap in one language. A saved brief is
 * returned at no cost; a second request while one is generating joins the
 * running job instead of paying for a duplicate call.
 */
export function startBrief(runId, index, { force = false, language = '' } = {}) {
  const run = store.readRun(runId);
  const gap = run?.gaps?.[index];
  if (!gap) {
    throw Object.assign(new Error('That gap was not found in this report.'), { status: 404, code: 'GAP_NOT_FOUND' });
  }

  if (!force) {
    const saved = store.readBrief(runId, index, language);
    if (saved) return { status: 'done', cached: true, brief: saved };
  }

  const key = `${runId}:${index}:${language}`;
  if (inFlight.has(key)) return { status: 'running', jobId: inFlight.get(key), cached: false };

  const id = jobs.create({ kind: 'brief', runId, index, language });
  inFlight.set(key, id);
  jobs.update(id, { phase: 'gaps', detail: 'Drafting hooks, script and SEO', progress: 15 });

  const house = houseTitles(run);
  const corpus = [run.query.niche ?? '', run.channel?.title ?? '', gap.question, gap.suggestedTitle, ...gap.evidence.map((e) => e.text)].join(' ');
  const nameCorpus = [corpus, ...(gap.coveringVideos ?? []).map((v) => v.title), ...house].join(' ');
  const format = gap.suggestedFormat;
  // Reports saved before sensitivity was recorded on the gap get it detected here.
  const sensitive = gap.sensitive
    ?? assessSensitivity([gap.question, gap.explanation, ...gap.evidence.map((e) => e.text)].join(' '));

  chatJSON({ system: systemPrompt({ format, language, sensitive }), user: briefPrompt({ run, gap, language }), maxTokens: 14000 })
    .then(({ data, usage }) => {
      const brief = {
        ...finalizeBrief(data, { title: gap.suggestedTitle, thumbnailText: gap.thumbnailText, corpus, nameCorpus, format, sensitive }),
        runId,
        gapIndex: index,
        language,
        generatedAt: new Date().toISOString(),
        usage: { total_tokens: usage?.total_tokens ?? null },
      };
      try { store.saveBrief(runId, index, brief, language); } catch (err) { console.error(`[brief ${id}] could not persist:`, err.message); }
      jobs.finish(id, brief);
    })
    .catch((err) => {
      console.error(`[brief ${id}] failed:`, err.message);
      jobs.fail(id, err);
    })
    .finally(() => inFlight.delete(key));

  return { status: 'running', jobId: id, cached: false };
}
