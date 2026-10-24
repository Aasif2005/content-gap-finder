// Title + thumbnail lint. Port of youtube-agent-skill's title.py (MIT, see
// data/NOTICE), plus one check it does not have: a number in a title must come
// from the evidence, because the lint rewards numbers and a model chasing the
// score would otherwise invent them.

const DESKTOP = 60;
const MOBILE = 40;
const HARD = 100;
const VAGUE = new Set(['amazing', 'incredible', 'insane', 'crazy', 'huge', 'massive', 'ultimate', 'best', 'powerful',
  'secret', 'revolutionary', 'mindblowing', 'epic', 'perfect', 'complete', 'everything']);
export const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'and', 'or', 'is', 'are', 'with', 'your', 'you', 'my', 'i',
  'this', 'that', 'it', 'how', 'what', 'why']);

export const words = (t) => t.toLowerCase().match(/[a-z0-9']+/g) ?? [];
const codePoints = (s) => Array.from(s);
// Python's str.isupper(): at least one cased character, and none lowercase.
const isUpper = (w) => w !== w.toLowerCase() && w === w.toUpperCase();

export function lintTitle(title, thumb = null, { sensitive = false } = {}) {
  const t = title.trim();
  const n = codePoints(t).length;
  const issues = [];
  const good = [];

  if (n > HARD) issues.push(['length', `${n} characters - YouTube's hard limit is ${HARD}`]);
  else if (n > DESKTOP) issues.push(['length', `${n} characters - desktop search cuts near ${DESKTOP}`]);
  else good.push(`${n} characters, inside the ${DESKTOP}-character desktop cut`);

  if (n > MOBILE) {
    const cut = codePoints(t).slice(0, MOBILE).join('');
    const head = cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut;
    issues.push(['mobile', `a mobile feed shows about "${head}..." - check the subject survives`]);
  }

  const caps = t.split(/\s+/).filter((w) => codePoints(w).length > 2 && isUpper(w));
  if (caps.length > 2) issues.push(['shouting', `${caps.length} all-caps words - two is the ceiling before it reads as spam`]);
  else if (caps.length) good.push(`${caps.length} all-caps word for emphasis`);

  const vague = words(t).filter((w) => VAGUE.has(w));
  if (vague.length) issues.push(['vague', `${[...new Set(vague)].sort().join(', ')} - swap for a number, a name or a date`]);

  const nums = t.match(/\d[\d,.]*%?/g) ?? [];
  if (nums.length) good.push(`carries a concrete figure (${nums.slice(0, 3).join(', ')})`);
  else issues.push(['no-number', 'no number, date or name - the most reliable single fix']);

  if (t.endsWith('?')) good.push('open question in the title');

  if (!words(t).slice(0, 3).some((w) => !STOP.has(w))) {
    issues.push(['front-load', 'the first three words are all filler - move the subject forward']);
  }

  if (thumb) {
    const tw = new Set(words(t).filter((w) => !STOP.has(w)));
    const hw = new Set(words(thumb).filter((w) => !STOP.has(w)));
    const shared = [...tw].filter((w) => hw.has(w)).sort();
    if (shared.length) {
      issues.push(['duplicate', `thumbnail repeats the title on ${shared.join(', ')} - the thumbnail should say what the title does not`]);
    } else {
      good.push('thumbnail and title carry different words');
    }
    if (words(thumb).length > 4) issues.push(['thumb-length', `${words(thumb).length} words on the thumbnail - three is the ceiling at feed size`]);
  }

  if (sensitive && (impliesAccusation(t) || impliesAccusation(thumb))) {
    issues.push(['accusation', 'implies guilt or suspicion of identifiable people in a real case - say what is confirmed and what is not instead']);
  }

  const score = Math.max(0, Math.min(100, 100 - 14 * issues.length + 4 * good.length));
  return { title: t, chars: n, score, issues, good };
}

// Spelled-out numbers are numbers too: "Nine days" slipped past a digits-only
// check in a real brief. "one" is left out on purpose -- it is far more often a
// pronoun ("one of the") than a figure, and flagging it would drown the signal.
const NUMBER_WORDS = new Map(Object.entries({
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000, million: 1000000,
}));

// Digit runs and number words, both as plain numeric strings, so "nine" in a
// comment grounds "9" in a hook and the other way round.
const numberTokens = (s) => [
  ...(s.match(/\d+/g) ?? []).map((d) => d.replace(/^0+(?=\d)/, '')),
  ...words(s).filter((w) => NUMBER_WORDS.has(w)).map((w) => String(NUMBER_WORDS.get(w))),
];

/**
 * Numbers in `title` that appear nowhere in `corpus` (the cited comments, the
 * question, the niche). A grounded number is one a creator can defend.
 */
export function ungroundedNumbers(title, corpus) {
  const known = new Set(numberTokens(corpus));
  return [...new Set(numberTokens(title))].filter((d) => !known.has(d));
}

// Capitalised words that are not names of anything we would expect a script to
// assume the audience knows.
const NAME_ALLOW = new Set(['English', 'Tamil', 'Hindi', 'Telugu', 'Malayalam', 'Kannada', 'Spanish', 'French', 'German',
  'YouTube', 'Google', 'Instagram', 'Facebook', 'Twitter', 'India', 'Indian', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'June', 'July', 'August',
  'September', 'October', 'November', 'December']);
const GENERIC_TAG_WORDS = new Set(['tamil', 'hindi', 'english', 'telugu', 'latest', 'news', 'explained', 'explanation',
  'review', 'tutorial', 'update', 'updates', 'video', 'videos', 'story', 'stories', 'full', 'today', 'guide', 'tips',
  'best', 'vlog', 'shorts', 'short', 'case', 'facts', 'history', 'analysis', 'reaction', 'trending', 'viral', 'live',
  'official', 'with', 'from', 'about', 'what', 'why', 'how', 'this', 'that', 'your']);

const knownWords = (corpus) => {
  const known = new Set();
  for (const w of words(corpus)) { known.add(w); known.add(w.replace(/'s$/, '')); }
  return known;
};

/**
 * Proper nouns in `text` (a capitalised Latin word that is not the first word of
 * its sentence) that appear nowhere in `corpus`. A script that names a person,
 * place or channel the evidence never mentioned is guessing.
 */
export function unverifiedNames(text, corpus) {
  const known = knownWords(corpus);
  const out = new Set();
  for (const sentence of text.split(/(?<=[.!?\u2026])\s+|\n/)) {
    sentence.split(/\s+/).filter(Boolean).forEach((tok, i) => {
      if (i === 0) return;
      const w = tok.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
      if (w.length < 3 || !/^[A-Z][a-z'\u2019-]+$/.test(w) || NAME_ALLOW.has(w)) return;
      const lw = w.toLowerCase().replace(/['\u2019]s$/, '');
      if (!known.has(lw)) out.add(w);
    });
  }
  return [...out];
}

/** Tags with a long Latin word the evidence never used -- usually a guessed name. */
export function unverifiedTags(tags, corpus) {
  const known = knownWords(corpus);
  return tags.filter((tag) =>
    words(tag).some((w) => /^[a-z]{4,}$/.test(w) && !known.has(w) && !GENERIC_TAG_WORDS.has(w))
  );
}

const ACCUSATION =
  /\b(suspect(?:s|ed)?|guilty|culprits?|killers?|murderers?|fishy|framed|cover[- ]?up|did it|behind (?:it|this))\b|\u0b9a\u0ba8\u0bcd\u0ba4\u0bc7\u0b95|\u0b95\u0bc1\u0bb1\u0bcd\u0bb1\u0bb5\u0bbe\u0bb3\u0bbf|\u0b95\u0bca\u0bb2\u0bc8\u0baf\u0bbe\u0bb3\u0bbf/i;

/** True when a title or thumbnail text implies guilt or suspicion of someone. */
export const impliesAccusation = (text) => ACCUSATION.test(text ?? '');

/**
 * Lints every candidate, marks invented numbers, and returns them best-first.
 * The winner is chosen here, in code: a candidate with an ungrounded number can
 * only win if every candidate has one.
 */
export function rankTitleOptions(candidates, { thumb = null, corpus = '', sensitive = false } = {}) {
  const seen = new Set();
  const unique = candidates
    .filter((c) => typeof c === 'string' && c.trim())
    .map((c) => c.trim())
    .filter((c) => !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()));

  return unique
    .map((title, order) => {
      const lint = lintTitle(title, thumb, { sensitive });
      const invented = ungroundedNumbers(title, corpus);
      if (invented.length) {
        lint.issues.push(['ungrounded-number', `${invented.join(', ')} appears in none of the cited comments or videos`]);
        lint.score = Math.max(0, lint.score - 40);
      }
      return { ...lint, ungrounded: invented.length > 0, order };
    })
    .sort((a, b) => Number(a.ungrounded) - Number(b.ungrounded) || b.score - a.score || a.order - b.order);
}
