import { useEffect, useState } from 'react';
import { Badge } from './Bits.jsx';
import { getBrief, makeBrief } from '../lib/api.js';
import { copyToClipboard } from '../lib/export.js';

const BAND_TONE = { STRONG: 'good', WORKABLE: 'warm', WEAK: 'neutral' };

// '' means "match the audience": the brief follows the language of the comments.
const LANGUAGES = ['', 'English', 'Tamil', 'Hindi', 'Telugu', 'Malayalam', 'Kannada', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Indonesian'];

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function SensitiveNotice({ sensitive }) {
  if (sensitive?.level !== 'high') return null;
  return (
    <div className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
      <b>Real, ongoing case involving identifiable people.</b> Viewer suspicion is not a finding. The brief is written as
      what is <em>confirmed</em> versus <em>not confirmed</em>, and titles that imply guilt are flagged. Check every fact against an official source before filming.
      {sensitive.reasons?.length > 0 && <span className="text-rose-600 dark:text-rose-400"> ({sensitive.reasons.join('; ')})</span>}
    </div>
  );
}

export function briefToMarkdown(b) {
  const out = [`# ${b.title}`, ''];
  if (b.thumbnailText) out.push(`Thumbnail text: ${b.thumbnailText}`, '');
  if (b.sensitive?.level === 'high') out.push('> **Sensitive case.** Real, ongoing case involving identifiable people. Verify every fact with an official source.', '');
  if (b.angle) out.push(`**Angle:** ${b.angle}`, '');
  if (b.needs?.length) {
    out.push('## Before you film: confirm these', '', ...b.needs.map((n) => `- ${n.claim}${n.why ? ` — ${n.why}` : ''}`), '');
  }
  out.push('## Hooks', '');
  b.bestHooks.forEach((h, i) => out.push(`${i + 1}. ${h.hook} _(${h.formula}${h.unscored ? ', not scored' : `, ${h.band.toLowerCase()} ${h.verdict}`})_`));
  out.push('', `## ${b.runtime.estimated ? 'Outline' : 'Script'} (${b.runtime.estimated ? 'budgeted at' : 'about'} ${mmss(b.runtime.seconds)})`, '');
  b.beats.forEach((x) => {
    out.push(`**${x.beat}** (${mmss(x.seconds)})${x.say ? ` — ${x.say}` : ''}`);
    x.points.forEach((p) => out.push(`  - ${p}`));
    out.push(`[ON SCREEN: ${x.onScreen}]`, '');
  });
  out.push('## Search', '', ...b.seo.queries.map((q) => `- ${q}`), '', b.seo.descriptionOpening, '', `Tags: ${b.seo.tags.join(', ')}`);
  return out.join('\n');
}

/** On-demand hooks + script + SEO for one gap. Nothing is spent until the button is pressed. */
export function BriefPanel({ runId, index, sensitive }) {
  const [language, setLanguage] = useState('');
  const [brief, setBrief] = useState(null);
  const [state, setState] = useState('idle'); // idle | working | error
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // A brief drafted earlier (in this language) is a disk read -- show it without another click.
  useEffect(() => {
    let live = true;
    setBrief(null);
    if (runId) getBrief(runId, index, language).then((b) => live && setBrief(b)).catch(() => {});
    return () => { live = false; };
  }, [runId, index, language]);

  const run = async (force = false) => {
    setState('working');
    setError('');
    try {
      setBrief(await makeBrief(runId, index, { force, language }));
      setState('idle');
    } catch (err) {
      setError(err.message);
      setState('error');
    }
  };

  if (!runId) return null;

  const picker = (
    <label className="flex items-center gap-1.5 text-[11px] text-ink-500">
      Write in
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        disabled={state === 'working'}
        className="rounded border border-ink-300 bg-transparent px-1.5 py-0.5 text-[11px] dark:border-ink-700"
      >
        {LANGUAGES.map((l) => <option key={l} value={l}>{l || 'the audience’s language'}</option>)}
      </select>
    </label>
  );

  if (!brief) {
    return (
      <div className="mt-3 space-y-2">
        <SensitiveNotice sensitive={sensitive} />
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => run()}
            disabled={state === 'working'}
            className="rounded-lg border border-ink-300 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-60 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
          >
            {state === 'working' ? 'Drafting hooks, script and search text… (30-90s)' : 'Make it →'}
          </button>
          {picker}
        </div>
        {state === 'error' && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    );
  }

  return (
    <details className="group mt-3 rounded-lg border border-ink-200 p-3 dark:border-ink-700" open>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
        <span>Make it · brief</span>
        <span className="flex flex-wrap items-center gap-2 normal-case tracking-normal">
          {picker}
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
      {state === 'error' && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="mt-3 space-y-4 text-sm">
        <SensitiveNotice sensitive={brief.sensitive} />

        {brief.angle && (
          <p className="text-ink-800 dark:text-ink-100">
            <span className="mr-1.5 text-[11px] font-semibold uppercase text-ink-400">Angle</span>{brief.angle}
          </p>
        )}

        {brief.needs?.length > 0 && (
          <section className="rounded-lg border border-amber-300 bg-amber-50/70 p-2.5 dark:border-amber-500/40 dark:bg-amber-500/10">
            <h4 className="text-xs font-semibold text-amber-900 dark:text-amber-200">Before you film: confirm these</h4>
            <p className="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-300/80">
              The draft assumes these but the evidence (a few viewer comments and video titles) does not contain them.
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-amber-900 dark:text-amber-200">
              {brief.needs.map((n, i) => <li key={i}>{n.claim}{n.why && <span className="text-amber-700 dark:text-amber-400"> — {n.why}</span>}</li>)}
            </ul>
          </section>
        )}

        <section>
          <h4 className="text-xs font-semibold text-ink-700 dark:text-ink-200">Opening lines</h4>
          <p className="mt-0.5 text-[11px] text-ink-400">
            A checklist (does it speak to the viewer, name something specific, open a question), not a prediction of retention.
            It tends to score plain hooks low when no figure in the comments could be used.
          </p>
          {brief.languageNote && <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">{brief.languageNote}</p>}
          <ul className="mt-2 space-y-2">
            {(brief.hooks ?? []).map((h, i) => (
              <li key={i} className={i < 2 ? '' : 'opacity-70'}>
                <p className="text-ink-800 dark:text-ink-100">&ldquo;{h.hook}&rdquo;</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {h.unscored
                    ? <Badge title="The hook checklist is written for English text, so it does not score this language.">not scored</Badge>
                    : <Badge tone={BAND_TONE[h.band]}>{h.band.toLowerCase()} {h.verdict}</Badge>}
                  <Badge title="Closest hook formula by wording, matched in code.">{h.formula}</Badge>
                  {h.ungrounded && <Badge tone="bad" title={`${h.inventedNumbers.join(', ')} is not in the viewers' own words`}>invented figure</Badge>}
                  {h.unverifiedNames?.length > 0 && <Badge tone="bad" title="A name the evidence never mentioned">unverified name: {h.unverifiedNames.join(', ')}</Badge>}
                  {h.weakest && <span className="text-[11px] text-ink-400">weakest: {h.weakest.toLowerCase()} — {h.fix}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h4 className="text-xs font-semibold text-ink-700 dark:text-ink-200">
            {brief.runtime.estimated ? 'Outline' : 'Script beats'}{' '}
            <span className="nums font-normal text-ink-400">
              · {brief.runtime.estimated ? 'budgeted at about' : 'about'} {mmss(brief.runtime.seconds)}
              {brief.runtime.estimated ? ' (talking points are budgeted, not read through)' : ' spoken at 150 words a minute'}
            </span>
          </h4>
          <ol className="mt-2 space-y-2.5">
            {brief.beats.map((b, i) => (
              <li key={i}>
                <p className="text-ink-800 dark:text-ink-100">
                  <span className="mr-1.5 text-[11px] font-semibold uppercase text-ink-400">{b.beat} · {mmss(b.seconds)}</span>
                  {b.say}
                </p>
                {b.points?.length > 0 && (
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-ink-700 dark:text-ink-200">
                    {b.points.map((p, j) => <li key={j}>{p}</li>)}
                  </ul>
                )}
                {b.onScreen && <p className="text-xs text-sky-700 dark:text-sky-300">on screen: {b.onScreen}</p>}
                {(b.needsSource > 0 || b.unverifiedNames?.length > 0 || b.inventedNumbers?.length > 0) && (
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    {b.needsSource > 0 && <Badge tone="warm">needs source ×{b.needsSource}</Badge>}
                    {b.unverifiedNames?.length > 0 && <Badge tone="bad">unverified name: {b.unverifiedNames.join(', ')}</Badge>}
                    {b.inventedNumbers?.length > 0 && <Badge tone="bad" title="Not in the viewers' own words">figure: {b.inventedNumbers.join(', ')}</Badge>}
                  </div>
                )}
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
                <span className={q.inTitle ? 'text-emerald-600 dark:text-emerald-400' : q.inOpening ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}>
                  {q.inTitle
                    ? '✓ in the title'
                    : q.inOpening
                      ? '✗ not in the title, only the description'
                      : `✗ ${Math.round(q.coverage * 100)}% covered, missing: ${q.missing.join(', ')}`}
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
          {brief.seo.descriptionNames?.length > 0 && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">Names a person or place the evidence never mentioned ({brief.seo.descriptionNames.join(', ')}). Check it before using it.</p>
          )}
          <p className="mt-2 flex flex-wrap gap-1">
            {brief.seo.tags.map((t) => (
              <Badge key={t} tone={brief.seo.unverifiedTags?.includes(t) ? 'warm' : 'neutral'} title={brief.seo.unverifiedTags?.includes(t) ? 'Contains a word neither the evidence nor the draft uses - check it' : undefined}>{t}</Badge>
            ))}
          </p>
        </section>
      </div>
    </details>
  );
}
