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
