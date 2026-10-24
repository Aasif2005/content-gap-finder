import { useEffect, useState } from 'react';
import { Badge } from './Bits.jsx';
import { getBrief, makeBrief } from '../lib/api.js';
import { copyToClipboard } from '../lib/export.js';

const BAND_TONE = { STRONG: 'good', WORKABLE: 'warm', WEAK: 'neutral' };

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function briefToMarkdown(b) {
  const out = [`# ${b.title}`, ''];
  if (b.thumbnailText) out.push(`Thumbnail text: ${b.thumbnailText}`, '');
  out.push('## Hooks', '');
  b.bestHooks.forEach((h, i) => out.push(`${i + 1}. ${h.hook} _(${h.formula}, ${h.band.toLowerCase()} ${h.verdict})_`));
  out.push('', `## Script (about ${mmss(b.runtime.seconds)} at 150 words a minute)`, '');
  b.beats.forEach((x) => out.push(`**${x.beat}** — ${x.say}`, `[ON SCREEN: ${x.onScreen}]`, ''));
  out.push('## Search', '', ...b.seo.queries.map((q) => `- ${q}`), '', b.seo.descriptionOpening, '', `Tags: ${b.seo.tags.join(', ')}`);
  return out.join('\n');
}

/** On-demand hooks + script + SEO for one gap. Nothing is spent until the button is pressed. */
export function BriefPanel({ runId, index }) {
  const [brief, setBrief] = useState(null);
  const [state, setState] = useState('idle'); // idle | working | error
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // A brief drafted earlier is a disk read -- show it without another click.
  useEffect(() => {
    let live = true;
    if (runId) getBrief(runId, index).then((b) => live && b && setBrief(b)).catch(() => {});
    return () => { live = false; };
  }, [runId, index]);

  const run = async (force = false) => {
    setState('working');
    setError('');
    try {
      setBrief(await makeBrief(runId, index, { force }));
      setState('idle');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  };

  if (!runId) return null;

  if (!brief) {
    return (
      <div className="mt-3">
        <button
          onClick={() => run()}
          disabled={state === 'working'}
          className="rounded-lg border border-ink-300 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-60 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
        >
          {state === 'working' ? 'Drafting hooks, script and search text… (30-90s)' : 'Make it →'}
        </button>
        {state === 'error' && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    );
  }

  return (
    <details className="group mt-3 rounded-lg border border-ink-200 p-3 dark:border-ink-700" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
        <span>Make it · brief</span>
        <span className="flex items-center gap-2 normal-case tracking-normal">
          <button
            onClick={async (e) => { e.preventDefault(); setCopied(await copyToClipboard(briefToMarkdown(brief))); setTimeout(() => setCopied(false), 1500); }}
            className="rounded border border-ink-300 px-2 py-0.5 text-[11px] font-medium text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
          >
            {copied ? 'Copied' : 'Copy all'}
          </button>
          <button
            onClick={(e) => { e.preventDefault(); run(true); }}
            disabled={state === 'working'}
            className="rounded border border-ink-300 px-2 py-0.5 text-[11px] font-medium text-ink-600 hover:bg-ink-100 disabled:opacity-60 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
          >
            {state === 'working' ? 'Redrafting…' : 'Redraft'}
          </button>
        </span>
      </summary>

      <div className="mt-3 space-y-4 text-sm">
        <section>
          <h4 className="text-xs font-semibold text-ink-700 dark:text-ink-200">Opening lines</h4>
          <p className="mt-0.5 text-[11px] text-ink-400">
            A checklist (does it speak to the viewer, name something specific, open a question), not a prediction of retention.
            It tends to score plain hooks low when no figure in the comments could be used.
          </p>
          <ul className="mt-2 space-y-2">
            {(brief.hooks ?? []).map((h, i) => (
              <li key={i} className={i < 2 ? '' : 'opacity-70'}>
                <p className="text-ink-800 dark:text-ink-100">&ldquo;{h.hook}&rdquo;</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone={BAND_TONE[h.band]}>{h.band.toLowerCase()} {h.verdict}</Badge>
                  <Badge title="Closest hook formula by wording, matched in code.">{h.formula}</Badge>
                  {h.ungrounded && <Badge tone="bad" title={`${h.inventedNumbers.join(', ')} is not in the viewers' own words`}>invented figure</Badge>}
                  <span className="text-[11px] text-ink-400">weakest: {h.weakest.toLowerCase()} — {h.fix}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h4 className="text-xs font-semibold text-ink-700 dark:text-ink-200">
            Script beats <span className="nums font-normal text-ink-400">· about {mmss(brief.runtime.seconds)} spoken at 150 words a minute</span>
          </h4>
          <ol className="mt-2 space-y-2">
            {brief.beats.map((b, i) => (
              <li key={i}>
                <p className="text-ink-800 dark:text-ink-100"><span className="mr-1.5 text-[11px] font-semibold uppercase text-ink-400">{b.beat}</span>{b.say}</p>
                {b.onScreen && <p className="text-xs text-sky-700 dark:text-sky-300">on screen: {b.onScreen}</p>}
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h4 className="text-xs font-semibold text-ink-700 dark:text-ink-200">Search</h4>
          <ul className="mt-1 space-y-0.5">
            {brief.seo.queryTest.map((q) => (
              <li key={q.query} className="text-xs text-ink-600 dark:text-ink-300">
                &ldquo;{q.query}&rdquo;{' '}
                <span className={q.inTitle ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                  {q.inTitle ? '✓ in the title' : q.inOpening ? '✗ not in the title, only the description' : '✗ in neither'}
                </span>
              </li>
            ))}
          </ul>
          {brief.seo.queryTest.some((q) => !q.inTitle) && (
            <p className="mt-1 text-[11px] text-ink-400">If the words people type are not in the title, the title is the thing to change, not the description.</p>
          )}
          <p className="mt-2 text-ink-800 dark:text-ink-100">{brief.seo.descriptionOpening}</p>
          {brief.seo.descriptionInvented?.length > 0 && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">Contains a figure ({brief.seo.descriptionInvented.join(', ')}) that is not in the viewers&rsquo; own words. Check it before using it.</p>
          )}
          <p className="mt-2 flex flex-wrap gap-1">
            {brief.seo.tags.map((t) => <Badge key={t}>{t}</Badge>)}
          </p>
        </section>
      </div>
    </details>
  );
}
