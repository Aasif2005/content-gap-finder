import fs from 'node:fs';

// The 21 hook formulas from youtube-agent-skill (MIT, see data/NOTICE). Each
// carries regexes written for spoken hooks; here they label a TITLE, which is a
// judgement about the words on screen -- not a claim about why a video worked.
const { hooks } = JSON.parse(fs.readFileSync(new URL('../data/hooks.json', import.meta.url), 'utf8'));

export const FORMULAS = hooks.map((f) => ({ ...f, regexes: f.match.map((p) => new RegExp(p, 'i')) }));

/** Best-matching formula for a piece of text, or `{name:'Unclassified', hits:0}`. */
export function classifyFormula(text) {
  let best = null;
  let hits = 0;
  for (const f of FORMULAS) {
    const n = f.regexes.reduce((acc, re) => acc + (re.test(text) ? 1 : 0), 0);
    if (n > hits) { best = f; hits = n; }
  }
  return best ? { id: best.id, name: best.name, hits } : { id: null, name: 'Unclassified', hits: 0 };
}

/**
 * A formula id the model claimed, checked against the real list. Models drift
 * on the prefix ("the-contrarian-flip" for "contrarian-flip"), so one stray or
 * missing "the-" is forgiven; anything else is not a formula and returns null.
 */
export function normalizeFormulaId(id) {
  const s = String(id ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!s) return null;
  for (const c of [s, s.replace(/^the-/, ''), `the-${s}`]) {
    const f = FORMULAS.find((x) => x.id === c);
    if (f) return f;
  }
  return null;
}

/** One-line prompt hint naming the formulas outperforming in a niche, with their shape. */
export function formulaHint(topFormulas = [], limit = 2) {
  const lines = topFormulas
    .slice(0, limit)
    .map((t) => FORMULAS.find((f) => f.name === t.name))
    .filter(Boolean)
    .map((f) => `- ${f.name}: ${f.shape}`);
  if (!lines.length) return '';
  return `TITLE WORDING that is beating its channel's median in this niche (use only if it fits a gap honestly; do not force it):\n${lines.join('\n')}`;
}
