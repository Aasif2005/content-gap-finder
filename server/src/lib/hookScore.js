import { classifyFormula } from './hookFormulas.js';

// Hook scorer. Port of youtube-agent-skill's hookscore.py (MIT, see data/NOTICE).
//
// Five properties, 0-100 each; the verdict is 60% the mean and 40% the weakest,
// because a hook with four strong properties and one dead one leaks at the dead
// one and averaging hides that.
//
// WHAT THIS CAN AND CANNOT TELL YOU -- from the original, measured on 74 real
// hooks: it separates deliberately bad hooks from real ones well, and a creator's
// own hits from their own misses barely at all. A low score is a reason to look
// again; a high score is never a promise.

const FILLER = new Set(['basically', 'actually', 'literally', 'just', 'really', 'very', 'so', 'kind', 'sort', 'like',
  'guys', 'hey', 'welcome', 'today', 'video', 'subscribe', 'channel']);
const VAGUE = new Set(['amazing', 'incredible', 'insane', 'crazy', 'huge', 'massive', 'game', 'changer', 'secret',
  'powerful', 'ultimate', 'best', 'revolutionary', 'mind', 'blowing', 'unbelievable']);
const CONCRETE = /\b(\d[\d,.]*\s?(%|k|m|x|s|m|h)?|\$\d|\d+\s?(second|minute|hour|day|week|month|year)s?)\b/gi;
const YOU = /\b(you|your|you're|youre|yourself)\b/i;
const STAKE = /\b(lose|lost|wasting|waste|quit|fail|broke|cost|risk|before|stop|never|die|dying|dead)\b/gi;
const CURIOSITY = /\b(why|how|what|which|until|before|but|nobody|almost|except|reason|actually)\b/gi;
const CLOSED = /\b(because|so that|which means)\b/i;

const words = (t) => t.toLowerCase().match(/[a-z0-9'%$.]+/g) ?? [];
const count = (re, t) => (t.match(re) ?? []).length;
const clamp = (x) => Math.max(0, Math.min(100, x));
const isCapital = (c) => c !== '' && c !== c.toLowerCase();

// Python 3's round() is half-to-even; Math.round is half-up. They disagree on
// exact .5, which a 0.6*mean + 0.4*min verdict hits often enough to matter.
function roundHalfEven(x) {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

function specificity(t) {
  const w = words(t);
  if (!w.length) return 0;
  const nums = count(CONCRETE, t);
  const vague = w.filter((x) => VAGUE.has(x)).length;
  const filler = w.filter((x) => FILLER.has(x)).length;
  let s = 34 + nums * 22 - vague * 16 - filler * 5;
  // Proper nouns that are not sentence-initial read as named things.
  s += Math.min(18, 6 * t.split(/\s+/).filter(Boolean).slice(1).filter((x) => isCapital(Array.from(x)[0] ?? '')).length);
  return clamp(s);
}

function address(t) {
  const n = count(new RegExp(YOU.source, 'gi'), t);
  const first = YOU.test(t.split(/\s+/).filter(Boolean).slice(0, 6).join(' ')) ? 30 : 0;
  return clamp(26 + n * 20 + first);
}

function stakes(t) {
  const n = count(STAKE, t);
  return clamp(22 + n * 26 + (new RegExp(CONCRETE.source, 'i').test(t) ? 14 : 0));
}

function curiosity(t) {
  const n = count(CURIOSITY, t);
  const q = t.trim().endsWith('?') ? 18 : 0;
  // A hook that resolves itself has no gap left.
  const closed = CLOSED.test(t) ? -18 : 0;
  return clamp(24 + n * 17 + q + closed);
}

function brevity(t) {
  const n = words(t).length;
  if (n === 0) return 0;
  // 9-24 words is the band a spoken hook lands in at ~150wpm inside 10 seconds.
  if (n >= 9 && n <= 24) return 100;
  if (n < 9) return Math.max(30, 100 - (9 - n) * 11);
  return Math.max(10, 100 - (n - 24) * 7);
}

const PROPS = [['SPECIFICITY', specificity], ['ADDRESS', address], ['STAKES', stakes], ['CURIOSITY', curiosity], ['BREVITY', brevity]];

export const FIX = {
  SPECIFICITY: 'swap one adjective for a number, a name or a date',
  ADDRESS: "say 'you' in the first six words",
  STAKES: 'name what it costs them to keep doing it the current way',
  CURIOSITY: 'cut the half of the sentence that answers itself',
  BREVITY: '9 to 24 words. Read it out loud and stop where you run out of breath',
};

export const band = (v) => (v >= 72 ? 'STRONG' : v >= 55 ? 'WORKABLE' : 'WEAK');

export function scoreHook(text) {
  const properties = Object.fromEntries(PROPS.map(([name, fn]) => [name, fn(text)]));
  const vals = Object.values(properties);
  const verdict = roundHalfEven(0.6 * (vals.reduce((a, b) => a + b, 0) / vals.length) + 0.4 * Math.min(...vals));
  const formula = classifyFormula(text);
  const weakest = Object.keys(properties).reduce((a, b) => (properties[b] < properties[a] ? b : a));
  return { hook: text.trim(), properties, verdict, band: band(verdict), formula: formula.name, weakest, fix: FIX[weakest] };
}
