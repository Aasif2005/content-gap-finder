import * as jobs from '../lib/jobs.js';
import * as store from '../lib/store.js';
import { config } from '../config.js';
import { chatJSON } from './deepseek.js';
import { truncate } from './analyze.js';
import { FORMULAS, classifyFormula, normalizeFormulaId } from '../lib/hookFormulas.js';
import { scoreHook, partialHookCheck, weakOpener } from '../lib/hookScore.js';
import { assessSensitivity } from '../lib/sensitive.js';
import { languageMismatch } from '../lib/language.js';
import {
  lintTitle, rankTitleOptions, requestPhrase, ungroundedNumbers, unverifiedNames, unverifiedTags, STOP,
} from '../lib/titleLint.js';

// "Make it": turn one grounded gap into a brief a creator can film from, in three
// parts -- why it is worth making (opportunity), what to check and prepare first
// (research), and the script itself. Ports the prompts of youtube-agent-skill's
// yt-script and yt-seo (MIT, see data/NOTICE) onto DeepSeek, with every
// judgement that can be made in code made in code: hooks are scored, the title
// is linted, the query test is a string check, and the LENGTH is checked
// against what viewers asked for. The model writes; it never grades its own
// writing.
//
// Two hard problems. Honesty: the model's only inputs are a handful of comments
// and some video titles, so it lists what it assumes (`needs`) instead of
// asserting it, and numbers and names are checked against the evidence.
// Length: told "about 8 minutes" it filled 8 minutes, with beats no viewer asked
// for. So it now lists the essentials first, each tied to the comments it
// answers, and every body beat says which essential it teaches; assessLength
// then says whether the draft is padded, rushed or right.

const SHORT_MAX_SECONDS = 60;

const isShortFormat = (format) => /short/i.test(format ?? '') && !/long/i.test(format ?? '');

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

function formatRules(format, { style = '', targetMinutes = null, core = false } = {}) {
  if (isShortFormat(format)) {
    return `FORMAT: a YouTube Short, under ${SHORT_MAX_SECONDS} seconds (about 150 spoken words in total).
- "essentials": at most 2, the one or two things the viewer must leave with.
- At most 3 beats: "turn", one "body" (with "covers"), then "payoff". Fold the ask into the payoff.
- Write every beat as full spoken prose in "say". Do not use "points".
- If what viewers asked for cannot be taught in under a minute, teach essential 1 only and say so in "length_note".`;
  }
  // A full script is the default: its runtime is measured from its words, and
  // the model's own time estimates proved about twice what it then wrote.
  const script = style !== 'points';
  return `FORMAT: long-form. There is NO target length.
- Length is whatever the essentials need. Never add a beat, example, tangent or recap to reach a length. If two essentials can be taught together, teach them together.
- Then the beats: "turn", body beats, "payoff", "close". Every body beat names the essential it teaches in "covers" (the essential's number). Give every beat a "seconds" budget.
${script
    ? '- Write EVERY beat, body beats included, as full natural spoken prose in "say", the way the creator would say it on camera. Do not use "points".'
    : '- Write "turn", "payoff" and "close" as full spoken prose in "say". For each body beat write "points": 3-5 short talking points in the order to cover them, instead of prose; the creator will speak them in their own words.'}
- If the essentials would need more than ${config.brief.maxMinutes} minutes, the request is too broad for one video: keep the most-asked part and say what you left out in "length_note".${core
    ? `\n- CORE CUT: teach only what the request itself needs or more than one comment asked for. A side-topic only one comment raised is NOT an essential here: at most one line in the close, and put what to check about it in "needs".${targetMinutes ? ` Aim for about ${targetMinutes} minutes.` : ''}`
    : targetMinutes
      ? `\n- TARGET: fit it in about ${targetMinutes} minutes. Keep every essential; cut depth and examples, not essentials. If they cannot all fit, say which one to drop in "length_note".`
      : ''}`;
}

function languageRule(language) {
  const l = (language ?? '').trim();
  return l
    ? `LANGUAGE: write the essentials, needs, hooks, script, queries, description and tags in ${l}. Keep the TITLE exactly as given.`
    : 'LANGUAGE: write in the language the viewers used in their comments (if they mix languages or scripts, mix the same way). Keep the TITLE exactly as given.';
}

// A redraft keeps the essentials it was given, so restyling, retargeting or
// translating a brief changes its wording, not its scope. Re-planning from
// scratch was the main cause of a gap drafting at 7:56 one run and 10:02 the next.
function planRules(plan) {
  if (!plan?.length) return '';
  return `
FIXED PLAN: the essentials are already decided. Return exactly these ${plan.length} as "essentials", in this order, keeping each one's meaning, "answers", "seconds" and "demo" (write "point" in the brief's language). Do not add, merge, split or drop any. Every body beat "covers" one of them by number.
${plan.map((e, i) => `${i + 1}. ${e.point} (answers ${JSON.stringify(e.answers)}, ${e.seconds}s${e.demo ? ', demo' : ''})`).join('\n')}`;
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

export function systemPrompt({ format, language, sensitive, style = '', targetMinutes = null, core = false, plan = null } = {}) {
  // The language rule leads AND closes the prompt: at the end only, the model
  // wrote the script in Tamil but the essentials and research notes in English.
  return `${languageRule(language)}

You draft a YouTube video brief for ONE audience request that real viewers voiced in comments.
You are given the request, the exact comments behind it, the existing videos that only partly cover it, and a title.
Everything you write must follow ONLY from that evidence.

HARD RULES
- Never invent a number (spelled out or in digits), statistic, result, price, source, name, date or quote. If a figure would strengthen a line and the evidence does not contain it, write the line without it. This includes counts like "three ways".
- Facts are labelled by where they came from: [comment], [video title], [channel's own title]. A phrase quoted in a video title is NOT an established fact or an official statement; attribute it ("the title of X says ...").
- You cannot know facts the evidence does not contain. Where the script needs one, do NOT assert it: write [NEEDS SOURCE: what to confirm] in the script and add it to "needs".
- Promise in the hook and title only what the beats actually deliver. The payoff may not claim more than the beats showed.
- "angle": one sentence on what this video does that the existing videos listed do not. You only know those videos' TITLES, so say what the titles suggest they cover; do not claim what they show. The "turn" must make the angle clear.

ESSENTIALS (decide these before writing anything else)
- "essentials": the fewest things a viewer must leave with for the request to be answered. Each lists in "answers" the numbers of the comments it answers (or "q" for the request itself), "seconds": the time to teach it clearly including any demonstration, and "demo": true when it has to be shown on screen.
- A thing no comment asked for is not an essential. Side-topics that appear in only one comment are not essentials unless the request needs them.
- "seconds" is the honest time a focused creator needs, not a generous one: one idea explained with one on-screen example is usually 45-90 seconds; a multi-step demonstration 90-150. Do not round up.${planRules(plan)}

${formatRules(format, { style, targetMinutes, core })}

HOOKS (the first 15 seconds is the whole job)
- Write exactly 5 spoken openers, 9-24 words each, each using a DIFFERENT formula from the list below.
- Each one must confirm what the title promises in its first sentence, carry ONE idea, and open a question the viewer cannot close.
- Never open by announcing the video ("In this video I will show you", "இந்த வீடியோவில்", "इस वीडियो में"), with who the creator is, a greeting, a channel intro or a subscribe ask. Start with the thing itself.
- Speak TO the viewer. The comments are your research, not your script: a hook must never mention "comments", "commenters", "viewers say" or "someone asked".
- A hook is graded on five things, so write to them: SPECIFICITY (a number, name or date taken from the evidence beats an adjective), ADDRESS (say "you" within the first six words), STAKES (what the viewer risks by staying uninformed or believing the wrong version; use only consequences the evidence supports), CURIOSITY (open a question and do NOT answer it in the same breath: no "because", no "which means"), BREVITY (9-24 words, one breath).

SCRIPT
- First "turn" (say what the video will do and start doing it), then body beats, then "payoff" (deliver what the hook promised and say you are delivering it), then "close" (one ask, not three; omit it for a Short).
- For every beat say what is ON SCREEN, not just what is said. A talking head with nothing to look at is a podcast.

RESEARCH
- "needs": what the creator must sort out before filming. "kind": "verify" for a fact to confirm (and where), "prepare" for something to have ready (a recording, a screen, an example, a document).

SEO
- queries: the three searches a real person would type into YouTube search to find this video, in the audience's own vocabulary. A query is a search, never a request to a creator: no "video podunga", "pathi video", "please make", "bro".
- description_opening: the first two lines of the description. They are the search snippet: say what the video gives, and it MUST contain the key words of at least two of your three queries, read naturally.
- tags: at most 15, only for disambiguation (spellings, tool names, abbreviations people actually type). No stuffing, nothing unrelated, no names the evidence does not contain.
- title_fix: if your queries' words are mostly not in the TITLE, one alternate title (under 60 characters) that uses them and makes the same promise. Otherwise "".

${languageRule(language)}${sensitiveRules(sensitive)}`;
}

export const formulaList = () => FORMULAS.map((f) => `- ${f.id}: ${f.shape}`).join('\n');

// Query words in ANY script. With the Latin-only words() a Tamil query word was
// invisible, so "footprint chart எப்படி படிக்கலாம்" scored 100% covered by an
// English title.
const queryWords = (s) => String(s ?? '').toLowerCase().match(/[\p{L}\p{M}\p{N}'’]+/gu) ?? [];
const isLatin = (w) => /^[a-z0-9'’]+$/.test(w);
const len = (w) => Array.from(w).length;

// A token worth testing a query against: not a stopword, and not a 1-2 letter
// particle ("ah", "la") that transliterated queries are full of.
const tokensOf = (q) => queryWords(q).filter((w) => (isLatin(w) ? !STOP.has(w) && (w.length >= 3 || /\d/.test(w)) : len(w) >= 2));

// Tamil and Hindi inflect by suffix ("படிக்க" / "படிக்கலாம்"), so a non-Latin
// word also matches a form sharing its stem (the shorter of the two, at least
// four code points). Latin words match whole.
function hasWord(set, w) {
  if (set.has(w)) return true;
  if (isLatin(w)) return false;
  for (const x of set) {
    if (!isLatin(x) && Math.min(len(x), len(w)) >= 4 && (x.startsWith(w) || w.startsWith(x))) return true;
  }
  return false;
}

/**
 * The query test. For each target query: are all its words in the title, in the
 * title plus the description opening, in the tags -- and if not, which words are
 * missing. A fraction, not just pass/fail, because a query in transliterated
 * Tamil can never be fully in an English title and "0 of 3" would hide that two
 * of its words did make it. `request` marks a "query" copied from a comment's
 * request phrasing rather than something a person searches.
 */
export function queryTest(queries, title, opening, tags = []) {
  const inTitleSet = new Set(queryWords(title));
  const inBothSet = new Set(queryWords(`${title} ${opening}`));
  const inTagSet = new Set(queryWords(tags.join(' ')));
  return queries.map((query) => {
    const t = tokensOf(query);
    const missing = t.filter((w) => !hasWord(inBothSet, w));
    return {
      query,
      inTitle: t.length > 0 && t.every((w) => hasWord(inTitleSet, w)),
      inOpening: t.length > 0 && missing.length === 0,
      inTags: t.length > 0 && t.every((w) => hasWord(inTagSet, w) || hasWord(inBothSet, w)),
      coverage: t.length ? Math.round(((t.length - missing.length) / t.length) * 100) / 100 : 0,
      missing,
      request: requestPhrase(query),
    };
  });
}

/** Mean share of the queries' words that a title alone carries. */
export function titleCoverage(queries, title) {
  const inTitle = new Set(queryWords(title));
  const per = queries.map(tokensOf).filter((t) => t.length).map((t) => t.filter((w) => hasWord(inTitle, w)).length / t.length);
  return per.length ? Math.round((per.reduce((a, b) => a + b, 0) / per.length) * 100) / 100 : 0;
}

const strings = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []);
// The colon is optional: the model writes a bare "[NEEDS SOURCE]" about half the
// time, and a colon-only pattern silently counted those as zero.
const NEEDS_MARKER = /\[NEEDS SOURCE(?::[^\]]*)?\]/gi;
const WPM = 150;

// Words for TIMING, in any script. lib/titleLint's words() is Latin-only (it
// exists to lint English text), so a Tamil script would have counted as a few
// words and a 40-second beat as 4.
const spokenWordCount = (text) =>
  (String(text).replace(NEEDS_MARKER, ' ').match(/[\p{L}\p{M}\p{N}'’]+/gu) ?? []).length;

// Share of letters that are Latin. The hook checklist and the name/number checks
// are written for English; below this the brief says so instead of scoring
// Tamil script as if it were English and calling every hook weak.
const latinShare = (text) => {
  const letters = String(text).match(/\p{L}/gu) ?? [];
  if (!letters.length) return 1;
  return letters.filter((c) => /[A-Za-z]/.test(c)).length / letters.length;
};
const LATIN_MIN = 0.6;

const clampInt = (x, lo, hi, fallback) => (Number.isFinite(Number(x)) ? Math.max(lo, Math.min(hi, Math.round(Number(x)))) : fallback);

/**
 * Is the draft as long as what viewers asked for, no longer and no shorter?
 *
 * Two clocks. The model's: each essential's teaching time plus the frame (turn,
 * payoff, close; capped, since a minute and a half is plenty to set up and land
 * a video). And the draft's: beats written as prose are timed from their words,
 * which is a measurement; talking-point beats keep the model's budget, which is
 * not. Measured live, the model's clock ran about twice the script it then
 * wrote (4:59 of essentials, 2:40 spoken), so a measured script is never called
 * "rushed" against the model's guess. What code checks either way is structure:
 * a beat that teaches nothing viewers asked for, a beat far longer than its
 * essential, an essential no comment is behind or no beat teaches, and which
 * essentials only one comment wanted (the core cut). Mutates `beats` and
 * `essentials` to flag them.
 */
export function assessLength(essentials, beats, { format = 'long-form', demand = null, targetMinutes = null, maxMinutes = config.brief.maxMinutes } = {}) {
  if (!essentials.length) return null;
  const short = isShortFormat(format);
  const frameCap = short ? 30 : 90;
  const slack = short ? 15 : 60;
  const byN = new Map(essentials.map((e) => [e.n, e]));
  const reasons = [];
  const measured = beats.length > 0 && beats.every((b) => b.measured);

  beats.forEach((b, i) => {
    b.number = i + 1;
    if (b.beat !== 'body') return;
    b.offPlan = !byN.has(b.covers);
    if (b.offPlan) reasons.push(`Beat ${b.number} teaches nothing on the essentials list, so no viewer asked for it: cut it.`);
  });

  const spentOn = new Map();
  for (const e of essentials) {
    const covering = beats.filter((b) => b.beat === 'body' && b.covers === e.n);
    e.coveredBy = covering.map((b) => b.number);
    const spent = covering.reduce((n, b) => n + b.seconds, 0);
    spentOn.set(e.n, spent);
    if (!covering.length) reasons.push(`Essential ${e.n} ("${truncate(e.point, 60)}") is not taught by any beat.`);
    else if (spent > e.seconds * 1.5 && spent - e.seconds > 30) {
      covering.forEach((b) => { b.stretched = true; });
      reasons.push(`Beat${covering.length > 1 ? 's' : ''} ${e.coveredBy.join(', ')} run${covering.length > 1 ? '' : 's'} ${mmss(spent)} for an essential budgeted at ${mmss(e.seconds)}.`);
    }
    if (e.unrequested) reasons.push(`Essential ${e.n} cites no comment and not the request, so nobody is shown asking for it.`);
  }

  const frameRaw = beats.filter((b) => b.beat !== 'body').reduce((n, b) => n + b.seconds, 0);
  const needed = essentials.reduce((n, e) => n + e.seconds, 0) + Math.min(frameRaw, frameCap);
  const draft = beats.reduce((n, b) => n + b.seconds, 0);
  // The length to judge the format by: the measurement when there is one.
  const best = measured ? draft : needed;
  if (frameRaw > frameCap + slack / 2) reasons.push(`The turn, payoff and close run ${mmss(frameRaw)}; ${mmss(frameCap)} is enough to set up and land it.`);
  const demos = essentials.some((e) => e.demo);
  const spokenNote = measured
    ? `${mmss(draft)} of speech${demos ? ', plus the screen time the demonstrations take' : ''}`
    : `${mmss(draft)} budgeted`;

  const structural = beats.some((b) => b.offPlan || b.stretched);
  let verdict;
  let summary;
  if (short && best > SHORT_MAX_SECONDS + 15) {
    verdict = 'wrong-format';
    let fit = 0;
    let acc = Math.min(frameRaw, frameCap);
    for (const e of essentials) { acc += measured ? spentOn.get(e.n) : e.seconds; if (acc > SHORT_MAX_SECONDS) break; fit++; }
    summary = `What viewers asked for needs about ${mmss(best)}, more than a Short holds.${fit ? ` A Short can cover essential${fit > 1 ? `s 1-${fit}` : ' 1'}; the rest needs long-form.` : ' It needs long-form.'}`;
  } else if (!short && best <= SHORT_MAX_SECONDS) {
    verdict = 'wrong-format';
    summary = `Everything viewers asked for fits in about ${mmss(best)}: this could be a Short.`;
  } else if (structural || (draft > needed * 1.25 && draft - needed > slack)) {
    verdict = 'padded';
    summary = `This draft runs ${spokenNote}, but what viewers asked for needs about ${mmss(Math.min(needed, draft))}.`;
  } else if (!measured && draft < needed * 0.8 && needed - draft > slack) {
    verdict = 'rushed';
    summary = `This outline is budgeted at ${mmss(draft)}, but its essentials need about ${mmss(needed)}: something is squeezed.`;
  } else {
    verdict = 'fits';
    summary = `${spokenNote}: every section teaches something viewers asked for.`;
  }

  const suggestedMinutes = short ? null : Math.max(1, Math.min(maxMinutes, Math.round(best / 60)));

  // The draft can fit its own list and still be longer than the topic needs,
  // because the model writes the list. One thing code can judge is how many
  // viewers are behind each item: a side-topic one low-liked comment raised,
  // that the request itself does not cite, is optional. The core cut is the
  // video without those; it is offered only when it is a minute or more shorter.
  const optional = short ? [] : essentials.filter((e) => e.thin && e.coveredBy.length);
  const optionalSeconds = optional.reduce((n, e) => n + (measured ? spentOn.get(e.n) : e.seconds), 0);
  const coreSeconds = best - optionalSeconds;
  const core = optional.length && coreSeconds >= 60 && optionalSeconds >= (measured ? 30 : 60)
    ? {
      seconds: coreSeconds,
      minutes: Math.max(1, Math.min(maxMinutes, Math.round(coreSeconds / 60))),
      drop: optional.map((e) => e.n),
      note: `Essential${optional.length > 1 ? 's' : ''} ${optional.map((e) => e.n).join(', ')} rest${optional.length > 1 ? '' : 's'} on a single comment the request itself does not need. Without ${optional.length > 1 ? 'them' : 'it'}, the core video is about ${mmss(coreSeconds)}${measured ? ' of speech' : ''}.`,
    }
    : null;
  const early = demand?.earlySignal && !short
    ? `Early signal: ${demand.comments} comment${demand.comments === 1 ? '' : 's'} and ${demand.likes} like${demand.likes === 1 ? '' : 's'} behind this. Consider testing it as a Short before filming the long version.`
    : '';

  return {
    basis: measured ? 'measured' : 'budgeted',
    needed,
    draft,
    best,
    verdict,
    summary,
    reasons,
    suggestedMinutes,
    // Offer a redraft at the suggested length only when it is a real change.
    offerRedraft: !short && (verdict === 'padded' || verdict === 'rushed') && Math.abs(suggestedMinutes * 60 - draft) >= 60,
    core,
    targetMinutes: targetMinutes ?? null,
    earlySignal: early,
  };
}

/** Why the video is worth making, built from the gap itself -- never by the model, so it cannot be invented. */
export function buildOpportunity(gap, { thinComments = config.brief.thinComments, thinLikes = config.brief.thinLikes } = {}) {
  const ev = gap.evidence ?? [];
  const likes = ev.reduce((n, e) => n + (Number(e.likes) || 0), 0);
  const comments = ev.length;
  return {
    question: gap.question,
    explanation: gap.explanation ?? '',
    coverage: gap.coverage ?? null,
    demandScore: gap.demandScore ?? null,
    comments,
    videos: gap.distinctVideos ?? new Set(ev.map((e) => e.videoId)).size,
    likes,
    // Both few comments AND few likes: three comments with 400 likes is real demand.
    earlySignal: comments <= thinComments && likes <= thinLikes,
    quotes: [...ev].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).slice(0, 2).map((e) => ({ text: truncate(e.text, 200), likes: e.likes ?? 0 })),
    covering: (gap.coveringVideos ?? []).slice(0, 2).map((v) => ({ videoId: v.videoId, title: v.title, channelTitle: v.channelTitle, views: v.views })),
    recurrence: gap.recurrence && gap.recurrence.status !== 'unknown' ? { status: gap.recurrence.status, timesSeen: gap.recurrence.timesSeen } : null,
  };
}

/**
 * Everything deterministic about a brief, applied to the model's raw output.
 * `corpus` is where a NUMBER may legitimately come from (the audience's own
 * words, the question, the niche, the title). `nameCorpus` is wider -- it adds
 * the covering videos' and the channel's own titles -- because a name that
 * appears in an existing video title is real even though a number there is not
 * evidence of anything. Anything outside is flagged, never silently dropped.
 */
export function finalizeBrief(raw, {
  title, thumbnailText = '', corpus = '', nameCorpus, format = 'long-form', sensitive = null,
  evidenceCount = 10, evidenceLikes = [], opportunity = null, style = '', targetMinutes = null, plan = null,
} = {}) {
  const names = nameCorpus ?? corpus;
  const short = isShortFormat(format);

  const hooks = (Array.isArray(raw?.hooks) ? raw.hooks : [])
    .map((h, order) => ({ text: typeof h === 'string' ? h : h?.text, claimed: h?.formula_id ?? null, order }))
    .filter((h) => typeof h.text === 'string' && h.text.trim())
    .map((h) => {
      const invented = ungroundedNumbers(h.text, corpus);
      const unknownNames = unverifiedNames(h.text, names);
      const scorable = latinShare(h.text) >= LATIN_MIN;
      // The wording match is English regex; when it finds nothing, the model's
      // own (validated) label is shown instead of a bare "Unclassified".
      const byWording = classifyFormula(h.text);
      const claimed = normalizeFormulaId(h.claimed);
      const partial = scorable ? null : partialHookCheck(h.text);
      return {
        ...(scorable
          ? scoreHook(h.text)
          : { hook: h.text.trim(), properties: null, verdict: null, band: 'UNSCORED', weakest: null, fix: null }),
        formula: byWording.hits ? byWording.name : claimed ? claimed.name : 'Unclassified',
        formulaSource: byWording.hits ? 'wording' : claimed ? 'model' : null,
        unscored: !scorable,
        partial,
        weakOpener: weakOpener(h.text),
        claimedFormula: claimed?.id ?? null,
        ungrounded: invented.length > 0,
        inventedNumbers: invented,
        unverifiedNames: unknownNames,
        order: h.order,
      };
    })
    // A hook with an invented figure or an unknown name can only win if they all
    // have one; an "In this video..." opener only beats another such opener.
    // Unscored hooks rank by the share of the partial checklist they pass.
    .sort((a, b) =>
      Number(a.ungrounded || a.unverifiedNames.length > 0) - Number(b.ungrounded || b.unverifiedNames.length > 0)
      || Number(a.weakOpener) - Number(b.weakOpener)
      || rankOf(b) - rankOf(a) || a.order - b.order);

  const beats = (Array.isArray(raw?.beats) ? raw.beats : [])
    .map((b) => ({
      beat: String(b?.beat ?? 'body'),
      say: typeof b?.say === 'string' ? b.say.trim() : '',
      points: strings(b?.points),
      onScreen: String(b?.on_screen ?? '').trim(),
      covers: Number.isInteger(Number(b?.covers)) && b?.covers !== null && b?.covers !== '' ? Number(b.covers) : null,
      budget: clampInt(b?.seconds, 10, 240, null),
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
        measured: proseWords > 0,
        needsSource: (text.match(NEEDS_MARKER) ?? []).length,
        unverifiedNames: unverifiedNames(claims, names),
        inventedNumbers: ungroundedNumbers(claims, corpus),
        offPlan: false,
        stretched: false,
      };
    });

  // With a fixed plan the scope is the plan's, whatever the model returned: its
  // wording of each point is kept (it may be a translation), the rest is not.
  const modelEssentials = Array.isArray(raw?.essentials) ? raw.essentials : [];
  const essentialsIn = plan?.length
    ? plan.map((p, i) => ({ ...p, point: String(modelEssentials[i]?.point ?? '').trim() || p.point }))
    : modelEssentials;
  const essentials = essentialsIn
    .map((e, i) => {
      const point = String(e?.point ?? '').trim();
      const cites = (Array.isArray(e?.answers) ? e.answers : [e?.answers])
        .map((a) => (String(a).trim().toLowerCase() === 'q' ? 'q' : Number(a)))
        .filter((a) => a === 'q' || (Number.isInteger(a) && a >= 1 && a <= evidenceCount));
      return {
        n: i + 1,
        point,
        answers: [...new Set(cites)],
        unrequested: cites.length === 0,
        // One comment, not the request, and few likes on it: optional (see assessLength's core cut).
        thin: !cites.includes('q') && new Set(cites).size === 1 && (Number(evidenceLikes[cites[0] - 1]) || 0) < config.brief.thinLikes,
        seconds: short ? clampInt(e?.seconds, 5, 60, 20) : clampInt(e?.seconds, 20, 240, 60),
        demo: e?.demo === true,
        inventedNumbers: ungroundedNumbers(point, corpus),
        unverifiedNames: unverifiedNames(point, names),
        coveredBy: [],
      };
    })
    .filter((e) => e.point)
    .slice(0, 12);

  const length = assessLength(essentials, beats, { format, demand: opportunity, targetMinutes });

  const spokenWords = beats.reduce((n, b) => n + spokenWordCount(b.say), 0);
  const estimated = beats.some((b) => !spokenWordCount(b.say));

  const seo = raw?.seo ?? {};
  const queries = strings(seo.queries).slice(0, 3);
  const opening = typeof seo.description_opening === 'string' ? seo.description_opening.trim() : '';
  const seenTags = new Set();
  const tags = strings(seo.tags).filter((t) => !seenTags.has(t.toLowerCase()) && seenTags.add(t.toLowerCase())).slice(0, 15);
  const searchQueries = queries.filter((q) => !requestPhrase(q));

  // A tag using a word the brief itself uses is consistent with the brief; only a
  // word from nowhere (neither the evidence nor anything the draft says) is
  // flagged. Judged against the evidence alone it flagged "police" and "demand".
  const briefText = [...hooks.map((h) => h.hook), ...beats.map((b) => `${b.say} ${b.points.join(' ')}`), opening].join(' ');

  const needs = (Array.isArray(raw?.needs) ? raw.needs : [])
    .map((n) => ({
      kind: String(n?.kind ?? '').toLowerCase() === 'prepare' ? 'prepare' : 'verify',
      claim: String(n?.claim ?? '').trim(),
      why: String(n?.why ?? '').trim(),
    }))
    .filter((n) => n.claim);

  const titleLint = lintTitle(title, thumbnailText || null, { sensitive: sensitive?.level === 'high' });

  // The brief keeps the gap's title, so when the searches people type are not in
  // it, the brief can only suggest one that is. Shown only if it really carries
  // more of the search words and passes the same number and accusation checks.
  const fixRaw = typeof raw?.title_fix === 'string' ? raw.title_fix.trim() : '';
  let titleFix = null;
  if (fixRaw && fixRaw.toLowerCase() !== String(title ?? '').trim().toLowerCase() && searchQueries.length) {
    const [lint] = rankTitleOptions([fixRaw], { thumb: thumbnailText || null, corpus: `${corpus} ${opening} ${queries.join(' ')}`, sensitive: sensitive?.level === 'high' });
    const coverage = titleCoverage(searchQueries, fixRaw);
    const originalCoverage = titleCoverage(searchQueries, title ?? '');
    const accuses = lint.issues.some(([k]) => k === 'accusation');
    if (coverage > originalCoverage && !lint.ungrounded && !accuses) {
      titleFix = { title: lint.title, score: lint.score, issues: lint.issues, coverage, originalCoverage };
    }
  }

  const uniq = (xs) => [...new Set(xs)];
  return {
    title,
    titleLint,
    titleFix,
    thumbnailText,
    opportunity,
    angle: typeof raw?.angle === 'string' ? raw.angle.trim() : '',
    needs,
    sensitive,
    // One line for the research section: what the checks found, and where.
    checks: {
      needsSource: beats.reduce((n, b) => n + b.needsSource, 0),
      unverifiedNames: uniq([...beats.flatMap((b) => b.unverifiedNames), ...essentials.flatMap((e) => e.unverifiedNames), ...unverifiedNames(opening, names)]),
      inventedNumbers: uniq([...beats.flatMap((b) => b.inventedNumbers), ...essentials.flatMap((e) => e.inventedNumbers), ...ungroundedNumbers(opening, corpus)]),
      flaggedBeats: beats.map((b, i) => (b.needsSource || b.unverifiedNames.length || b.inventedNumbers.length ? i + 1 : 0)).filter(Boolean),
    },
    // The hook checklist and the name/number-word checks only understand Latin
    // script. Say so rather than silently skipping them.
    languageNote: latinShare(`${hooks.map((h) => h.hook).join(' ')} ${beats.map((b) => b.say).join(' ')}`) < LATIN_MIN
      ? 'Written mostly in a non-Latin script: hooks get a partial checklist instead of a score, and the name and number-word checks only cover Latin text. Digits are still checked.'
      : '',
    hooks,
    bestHooks: hooks.slice(0, 2),
    essentials,
    length,
    lengthNote: typeof raw?.length_note === 'string' ? raw.length_note.trim() : '',
    planned: Boolean(plan?.length),
    style: short ? 'script' : style === 'points' ? 'points' : 'script',
    beats,
    runtime: {
      words: spokenWords,
      seconds: beats.reduce((n, b) => n + b.seconds, 0),
      // Talking-points beats are budgeted, not measured: say so rather than
      // present an outline's runtime as if it were a recorded read-through.
      estimated,
      format: short ? 'short' : 'long-form',
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

// Scored hooks rank by verdict; unscored ones by the share of the partial
// checklist they pass, on the same 0-100 scale.
const rankOf = (h) => h.verdict ?? (h.partial ? Math.round((h.partial.passed / h.partial.total) * 100) : -1);

const sourceTag = (e) => (e.source === 'video-title' ? '[video title]' : '[comment]');
const EVIDENCE_SHOWN = 10;

export function briefPrompt({ run, gap, language = '' }) {
  // Per-field cues, next to the fields themselves: a rule many lines away lost
  // to English field descriptions about half the time.
  const l = (language ?? '').trim();
  const inL = l ? ` (in ${l})` : '';
  const evidence = gap.evidence.slice(0, EVIDENCE_SHOWN).map((e, i) => `[${i + 1}] ${sourceTag(e)} (${e.likes} likes) ${truncate(e.text, 240)}`).join('\n');
  const covering = (gap.coveringVideos ?? []).slice(0, 5).map((v) => `- [video title] ${truncate(v.title, 110)}`).join('\n') || '(none)';
  const house = houseTitles(run);
  return `${run.channelMode ? `Channel: "${run.channel?.title}".` : `Niche: "${run.query.niche}".`}

THE REQUEST (as the audience asks it): ${gap.question}
What they want and why current videos miss it: ${gap.explanation || '(not given)'}
Coverage today: ${gap.coverage}. Suggested format: ${gap.suggestedFormat || 'either'}.

TITLE TO DELIVER ON: ${gap.suggestedTitle}
THUMBNAIL TEXT: ${gap.thumbnailText || '(none chosen)'}

WHAT VIEWERS ACTUALLY SAID (cite these numbers in "answers"):
${evidence}

EXISTING VIDEOS THAT ONLY PARTLY COVER IT (titles only; you have not seen these videos):
${covering}
${house.length ? `\nTHIS CHANNEL'S OWN RECENT TITLES (style and vocabulary reference only; these are not facts and not the creator's voice):\n${house.map((t) => `- [channel's own title] ${truncate(t, 100)}`).join('\n')}\n` : ''}
HOOK FORMULAS (formula_id: shape):
${formulaList()}

Return json with exactly this shape:
{
  "angle": "what this video adds that the listed videos do not${inL}",
  "essentials": [{ "point": "one thing the viewer must leave with${inL}", "answers": [1, "q"], "seconds": 60, "demo": true }],
  "needs": [{ "kind": "verify" | "prepare", "claim": "a fact to confirm, or a thing to have ready${inL}", "why": "where to confirm it, or why it is needed${inL}" }],
  "hooks": [{ "text": "the spoken opener${inL}", "formula_id": "one id from the list" }],
  "beats": [{ "beat": "turn" | "body" | "payoff" | "close", "covers": 1, "seconds": 45, "say": "spoken prose${inL}", "points": ["talking points, long-form body beats only${inL}"], "on_screen": "what the viewer sees${inL}" }],
  "length_note": "${inL ? `optional note${inL}` : ''}",
  "seo": { "queries": ["", "", ""], "description_opening": "first two lines${inL}", "tags": ["..."] },
  "title_fix": ""
}${l ? `\n\nEvery text field above is written in ${l}, including the essentials and the needs. Technical terms the viewers themselves use in English may stay in English.` : ''}`;
}

/** A channel run's own recent titles: all we know of its voice, and a real source of names. */
function houseTitles(run) {
  if (!run.channelMode) return [];
  return [...(run.topVideos ?? [])]
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 10)
    .map((v) => v.title);
}

// Creator-facing text fields of a raw brief, by path, so a language check can
// name what drifted and a repair can put translations back where they belong.
function textFields(raw) {
  const out = [];
  const add = (id, obj, key) => { if (obj && typeof obj[key] === 'string' && obj[key].trim()) out.push({ id, obj, key }); };
  add('angle', raw, 'angle');
  add('length_note', raw, 'length_note');
  (Array.isArray(raw?.essentials) ? raw.essentials : []).forEach((e, i) => add(`essentials.${i}.point`, e, 'point'));
  (Array.isArray(raw?.needs) ? raw.needs : []).forEach((n, i) => { add(`needs.${i}.claim`, n, 'claim'); add(`needs.${i}.why`, n, 'why'); });
  (Array.isArray(raw?.hooks) ? raw.hooks : []).forEach((h, i) => add(`hooks.${i}.text`, h, 'text'));
  (Array.isArray(raw?.beats) ? raw.beats : []).forEach((b, i) => {
    add(`beats.${i}.say`, b, 'say');
    add(`beats.${i}.on_screen`, b, 'on_screen');
    if (Array.isArray(b?.points)) b.points.forEach((_, j) => add(`beats.${i}.points.${j}`, b.points, j));
  });
  return out;
}

/** Fields of a raw brief that are not in the requested language's script. */
export function mismatchedFields(raw, language) {
  if (!(language ?? '').trim()) return [];
  return textFields(raw).filter((f) => languageMismatch(language, f.obj[f.key]));
}

/**
 * Translates only the drifted fields, with one small call (fast model, no
 * thinking, temperature 0), and keeps a translation only if it now passes the
 * same script check. Mutates `raw`. A failed repair leaves the original text.
 */
export async function repairLanguage(raw, language) {
  const drifted = mismatchedFields(raw, language);
  if (!drifted.length) return null;
  try {
    const items = Object.fromEntries(drifted.map((f) => [f.id, f.obj[f.key]]));
    const { data } = await chatJSON({
      system: `Translate each value into ${language}. Keep technical terms the audience uses in English, tool and platform names, digits and anything inside [square brackets] exactly as they are. Do not add or remove information. Return json {"items": {"<same id>": "<translation>"}}.`,
      user: JSON.stringify({ items }),
      model: config.deepseek.fastModel,
      thinking: 'disabled',
      temperature: 0,
      maxTokens: 8000,
      attempts: 2,
    });
    let fixed = 0;
    for (const f of drifted) {
      const t = data?.items?.[f.id];
      if (typeof t === 'string' && t.trim() && !languageMismatch(language, t)) { f.obj[f.key] = t.trim(); fixed++; }
    }
    return { fields: drifted.length, fixed, ids: drifted.map((f) => f.id) };
  } catch (err) {
    console.error('[brief] language repair failed:', err.message);
    return { fields: drifted.length, fixed: 0, ids: drifted.map((f) => f.id), error: true };
  }
}

const inFlight = new Map();
// Normalised like the store's file key, so "Tamil" and "tamil" are one draft, not two paid calls.
const briefKey = (runId, index, language) => `${runId}:${index}:${String(language ?? '').trim().toLowerCase()}`;

/** Cheap pre-check for the route: does the gap exist, and is a draft already running? */
export async function peekBrief(runId, index, language = '') {
  const run = await store.readRun(runId);
  if (!run?.gaps?.[index]) return { missing: true };
  return { missing: false, jobId: inFlight.get(briefKey(runId, index, language)) ?? null };
}

/**
 * Starts (or returns) the brief for one gap in one language. A saved brief is
 * returned at no cost; a second request while one is generating joins the
 * running job instead of paying for a duplicate call. `format`, `style` and
 * `targetMinutes` reshape a redraft; the result replaces the saved brief for
 * that language.
 */
export async function startBrief(runId, index, { force = false, language = '', format: formatOverride = '', style = '', targetMinutes = null, core = false, planFrom = null } = {}) {
  const run = await store.readRun(runId);
  const gap = run?.gaps?.[index];
  if (!gap) {
    throw Object.assign(new Error('That gap was not found in this report.'), { status: 404, code: 'GAP_NOT_FOUND' });
  }

  if (!force) {
    const saved = await store.readBrief(runId, index, language);
    if (saved) return { status: 'done', cached: true, brief: saved };
  }

  const key = briefKey(runId, index, language);
  // Joined: someone else's request is drafting it, so this one spent nothing (the route refunds it).
  if (inFlight.has(key)) return { status: 'running', jobId: inFlight.get(key), cached: false, joined: true };

  const id = jobs.create({ kind: 'brief', runId, index, language });
  inFlight.set(key, id);
  jobs.update(id, { phase: 'gaps', detail: 'Drafting hooks, script and SEO', progress: 15 });

  // Anything below that throws before the model call is chained must still free
  // the key, or every later request joins a job that never settles.
  try {
    const house = houseTitles(run);
    const corpus = [run.query.niche ?? '', run.channel?.title ?? '', gap.question, gap.suggestedTitle, ...gap.evidence.map((e) => e.text)].join(' ');
    const nameCorpus = [corpus, ...(gap.coveringVideos ?? []).map((v) => v.title), ...house].join(' ');
    const format = formatOverride || gap.suggestedFormat;
    const target = isShortFormat(format) ? null : targetMinutes;
    // Reports saved before sensitivity was recorded on the gap get it detected here.
    const sensitive = gap.sensitive
      ?? assessSensitivity([gap.question, gap.explanation, ...gap.evidence.map((e) => e.text)].join(' '));
    const opportunity = buildOpportunity(gap);
    // A full long-form script is several times the words of an outline.
    const maxTokens = style !== 'points' && !isShortFormat(format) ? 22000 : 14000;

    // The plan comes from the saved brief in the database, never from the request body.
    // A core cut is that plan minus the optional (single-comment) essentials, so
    // it is decided in code rather than by asking the model to drop something.
    // A read failure here must not leave the draft marked running forever.
    const saved = planFrom !== null ? await store.readBrief(runId, index, planFrom).catch(() => null) : null;
    let plan = (saved?.essentials ?? []).map(({ point, answers, seconds, demo, thin }) => ({ point, answers, seconds, demo, thin }));
    if (core && plan.length) plan = plan.filter((e) => !e.thin);
    if (isShortFormat(format) && !isShortFormat(saved?.runtime?.format)) plan = []; // a Short re-plans: it holds at most 2
    plan = plan.map(({ thin, ...e }) => e);
    const usePlan = plan.length > 0;

    chatJSON({
      system: systemPrompt({ format, language, sensitive, style, targetMinutes: target, core: core && !usePlan && !isShortFormat(format), plan: usePlan ? plan : null }),
      user: briefPrompt({ run, gap, language }),
      maxTokens,
      ...(config.brief.thinking ? { thinking: config.brief.thinking, temperature: config.brief.temperature } : {}),
    })
      .then(async ({ data, usage }) => {
        const languageRepair = await repairLanguage(data, language);
        return { data, usage, languageRepair };
      })
      .then(async ({ data, usage, languageRepair }) => {
        const brief = {
          ...finalizeBrief(data, {
            title: gap.suggestedTitle, thumbnailText: gap.thumbnailText, corpus, nameCorpus, format, sensitive,
            evidenceCount: Math.min(EVIDENCE_SHOWN, gap.evidence.length),
            evidenceLikes: gap.evidence.slice(0, EVIDENCE_SHOWN).map((e) => e.likes ?? 0),
            opportunity, style, targetMinutes: target, plan: usePlan ? plan : null,
          }),
          languageRepair,
          // Fields still not in the requested language after any repair.
          languageDrift: mismatchedFields(data, language).map((f) => f.id),
          runId,
          gapIndex: index,
          language,
          generatedAt: new Date().toISOString(),
          usage: { total_tokens: usage?.total_tokens ?? null },
        };
        try { await store.saveBrief(runId, index, brief, language); } catch (err) { console.error(`[brief ${id}] could not persist:`, err.message); }
        jobs.finish(id, brief);
      })
      .catch((err) => {
        console.error(`[brief ${id}] failed:`, err.message);
        jobs.fail(id, err);
      })
      .finally(() => inFlight.delete(key));
  } catch (err) {
    inFlight.delete(key);
    jobs.fail(id, err);
    throw err;
  }

  return { status: 'running', jobId: id, cached: false };
}
