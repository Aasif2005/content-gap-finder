// Title + thumbnail lint. Port of youtube-agent-skill's title.py (MIT, see
// data/NOTICE), plus one check it does not have: a number in a title must come
// from the evidence, because the lint rewards numbers and a model chasing the
// score would otherwise invent them.

const DESKTOP = 60;
const MOBILE = 40;
const HARD = 100;
const VAGUE = new Set(['amazing', 'incredible', 'insane', 'crazy', 'huge', 'massive', 'ultimate', 'best', 'powerful',
  'secret', 'revolutionary', 'mindblowing', 'epic', 'perfect', 'complete', 'everything']);
const STOP = new Set(['the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'and', 'or', 'is', 'are', 'with', 'your', 'you', 'my', 'i',
  'this', 'that', 'it', 'how', 'what', 'why']);

const words = (t) => t.toLowerCase().match(/[a-z0-9']+/g) ?? [];
const codePoints = (s) => Array.from(s);
// Python's str.isupper(): at least one cased character, and none lowercase.
const isUpper = (w) => w !== w.toLowerCase() && w === w.toUpperCase();

export function lintTitle(title, thumb = null) {
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

  const score = Math.max(0, Math.min(100, 100 - 14 * issues.length + 4 * good.length));
  return { title: t, chars: n, score, issues, good };
}

const digitRuns = (s) => (s.match(/\d+/g) ?? []).map((d) => d.replace(/^0+(?=\d)/, ''));

/**
 * Numbers in `title` that appear nowhere in `corpus` (the cited comments, the
 * question, the video titles). A grounded number is one a creator can defend.
 */
export function ungroundedNumbers(title, corpus) {
  const known = new Set(digitRuns(corpus));
  return [...new Set(digitRuns(title))].filter((d) => !known.has(d));
}

/**
 * Lints every candidate, marks invented numbers, and returns them best-first.
 * The winner is chosen here, in code: a candidate with an ungrounded number can
 * only win if every candidate has one.
 */
export function rankTitleOptions(candidates, { thumb = null, corpus = '' } = {}) {
  const seen = new Set();
  const unique = candidates
    .filter((c) => typeof c === 'string' && c.trim())
    .map((c) => c.trim())
    .filter((c) => !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()));

  return unique
    .map((title, order) => {
      const lint = lintTitle(title, thumb);
      const invented = ungroundedNumbers(title, corpus);
      if (invented.length) {
        lint.issues.push(['ungrounded-number', `${invented.join(', ')} appears in none of the cited comments or videos`]);
        lint.score = Math.max(0, lint.score - 40);
      }
      return { ...lint, ungrounded: invented.length > 0, order };
    })
    .sort((a, b) => Number(a.ungrounded) - Number(b.ungrounded) || b.score - a.score || a.order - b.order);
}
