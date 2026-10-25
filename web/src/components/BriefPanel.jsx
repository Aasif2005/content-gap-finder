import { useEffect, useRef, useState } from 'react';
import { Badge } from './Bits.jsx';
import { getBrief, makeBrief } from '../lib/api.js';
import { copyToClipboard } from '../lib/export.js';

const BAND_TONE = { STRONG: 'good', WORKABLE: 'warm', WEAK: 'neutral' };

// '' means "match the audience": the brief follows the language of the comments.
const LANGUAGES = ['', 'English', 'Tamil', 'Hindi', 'Telugu', 'Malayalam', 'Kannada', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Indonesian'];

const LENGTH_TONE = {
  fits: 'border-emerald-300 bg-emerald-50/70 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200',
  padded: 'border-amber-300 bg-amber-50/70 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
  rushed: 'border-amber-300 bg-amber-50/70 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
  'wrong-format': 'border-sky-300 bg-sky-50/70 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200',
};
const LENGTH_LABEL = { fits: 'Length fits', padded: 'Longer than it needs to be', rushed: 'Shorter than it needs to be', 'wrong-format': 'Wrong format for what was asked' };

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

// Saved briefs from before the three sections have no opportunity block; the gap
// the panel sits on carries the same facts.
function opportunityOf(brief, gap) {
  if (brief?.opportunity) return brief.opportunity;
  if (!gap) return null;
  const ev = gap.evidence ?? [];
  return {
    question: gap.question,
    coverage: gap.coverage,
    comments: ev.length,
    videos: gap.distinctVideos ?? 0,
    likes: ev.reduce((n, e) => n + (e.likes ?? 0), 0),
    earlySignal: false,
    quotes: [],
    covering: (gap.coveringVideos ?? []).slice(0, 2),
    recurrence: null,
  };
}

const coverageText = (c) => (c === 'none' ? 'nobody covers it yet' : c === 'weak' ? 'only weakly covered' : c ? `${c} coverage` : '');

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

export function briefToMarkdown(b, gap = null) {
  const opp = opportunityOf(b, gap);
  const out = [`# ${b.title}`, ''];
  if (b.thumbnailText) out.push(`Thumbnail text: ${b.thumbnailText}`, '');

  out.push('## 1. Content opportunity: why make it', '');
  if (opp) {
    out.push(`**Request:** ${opp.question}`, '');
    out.push(`${plural(opp.comments, 'comment')} across ${plural(opp.videos, 'video')}, ${plural(opp.likes, 'like')}${opp.coverage ? `; ${coverageText(opp.coverage)}` : ''}.${opp.earlySignal ? ' Early signal.' : ''}`, '');
    opp.quotes?.forEach((q) => out.push(`> ${q.text} (${plural(q.likes, 'like')})`));
    if (opp.quotes?.length) out.push('');
  }
  if (b.angle) out.push(`**Angle** (from the covering videos' titles only): ${b.angle}`, '');
  if (b.length) out.push(`**Best as:** about ${mmss(b.length.best ?? b.length.needed)}${b.length.basis === 'measured' ? ' of speech' : ''}, ${b.runtime.format}, ${plural(b.essentials.length, 'essential')}.`, '');

  out.push('## 2. Creator research: before you film', '');
  if (b.sensitive?.level === 'high') out.push('> **Sensitive case.** Real, ongoing case involving identifiable people. Verify every fact with an official source.', '');
  const verify = (b.needs ?? []).filter((n) => n.kind !== 'prepare');
  const prepare = (b.needs ?? []).filter((n) => n.kind === 'prepare');
  if (verify.length) out.push('**Verify**', ...verify.map((n) => `- ${n.claim}${n.why ? ` — ${n.why}` : ''}`), '');
  if (prepare.length) out.push('**Prepare**', ...prepare.map((n) => `- ${n.claim}${n.why ? ` — ${n.why}` : ''}`), '');
  if (opp?.covering?.length) out.push('**Watch first** (to confirm what they miss)', ...opp.covering.map((v) => `- ${v.title} ${watchUrl(v.videoId)}`), '');

  out.push('## 3. Ready-to-film script', '');
  if (b.length) {
    out.push(`_${b.length.summary}_`, ...b.length.reasons.map((r) => `- ${r}`), '');
    if (b.length.core) out.push(`_${b.length.core.note}_`, '');
    if (b.length.earlySignal) out.push(`_${b.length.earlySignal}_`, '');
  }
  if (b.lengthNote) out.push(`_${b.lengthNote}_`, '');
  if (b.essentials?.length) {
    out.push('**Essentials**', ...b.essentials.map((e) => `${e.n}. ${e.point} (${mmss(e.seconds)}${e.demo ? ', demo' : ''})`), '');
  }
  out.push('### Hooks', '');
  b.bestHooks.forEach((h, i) => out.push(`${i + 1}. ${h.hook} _(${h.formula}${h.unscored ? '' : `, ${h.band.toLowerCase()} ${h.verdict}`})_`));
  out.push('', `### ${b.runtime.estimated ? 'Outline' : 'Script'} (${b.runtime.estimated ? 'budgeted at' : 'about'} ${mmss(b.runtime.seconds)})`, '');
  b.beats.forEach((x) => {
    out.push(`**${x.beat}**${x.covers ? ` (essential ${x.covers})` : ''} (${mmss(x.seconds)})${x.say ? ` — ${x.say}` : ''}`);
    x.points.forEach((p) => out.push(`  - ${p}`));
    out.push(`[ON SCREEN: ${x.onScreen}]`, '');
  });
  out.push('### Title, description and tags', '');
  if (b.titleFix) out.push(`Suggested title for search: ${b.titleFix.title}`, '');
  out.push(...b.seo.queries.map((q) => `- ${q}`), '', b.seo.descriptionOpening, '', `Tags: ${b.seo.tags.join(', ')}`);
  return out.join('\n');
}

function SectionHead({ n, title, sub }) {
  return (
    <h3 className="flex items-baseline gap-2 border-b border-ink-200 pb-1 dark:border-ink-700">
      <span className="nums text-xs font-semibold text-ink-400">{n}</span>
      <span className="text-sm font-semibold text-ink-800 dark:text-ink-100">{title}</span>
      <span className="text-[11px] text-ink-400">{sub}</span>
    </h3>
  );
}

function Opportunity({ brief, opp }) {
  return (
    <section className="space-y-2">
      <SectionHead n="1" title="Content opportunity" sub="why this video is worth making" />
      {opp && (
        <p className="text-xs text-ink-600 dark:text-ink-300">
          <span className="nums">{plural(opp.comments, 'comment')} across {plural(opp.videos, 'video')}, {plural(opp.likes, 'like')}</span>
          {opp.coverage && <>; {coverageText(opp.coverage)}</>}
          {opp.recurrence?.timesSeen > 1 && <>; asked for in {opp.recurrence.timesSeen} runs</>}.
          {opp.earlySignal && (
            <Badge tone="warm" title="Few comments and few likes. Real, but not yet proven demand.">early signal</Badge>
          )}
        </p>
      )}
      {brief.angle && (
        <p className="text-ink-800 dark:text-ink-100">
          <span className="mr-1.5 text-[11px] font-semibold uppercase text-ink-400">Angle</span>{brief.angle}
          <span className="ml-1 text-[11px] text-ink-400">(inferred from the covering videos&rsquo; titles, not from watching them)</span>
        </p>
      )}
      {brief.length && (
        <p className="text-xs text-ink-600 dark:text-ink-300">
          <span className="mr-1.5 text-[11px] font-semibold uppercase text-ink-400">Best as</span>
          about <span className="nums">{mmss(brief.length.best ?? brief.length.needed)}</span>{brief.length.basis === 'measured' ? ' of speech' : ''},{' '}
          {brief.runtime.format === 'short' ? 'a Short' : 'long-form'}, {plural(brief.essentials.length, 'essential')} to teach
        </p>
      )}
    </section>
  );
}

function NeedList({ title, items }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-amber-900 dark:text-amber-200">{title}</h4>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-900 dark:text-amber-200">
        {items.map((n, i) => <li key={i}>{n.claim}{n.why && <span className="text-amber-700 dark:text-amber-400"> — {n.why}</span>}</li>)}
      </ul>
    </div>
  );
}

function Research({ brief, opp }) {
  const needs = brief.needs ?? [];
  const verify = needs.filter((n) => n.kind !== 'prepare');
  const prepare = needs.filter((n) => n.kind === 'prepare');
  const c = brief.checks;
  const found = c && [
    c.needsSource && `${plural(c.needsSource, '[NEEDS SOURCE] marker')}`,
    c.unverifiedNames?.length && `unverified name${c.unverifiedNames.length === 1 ? '' : 's'}: ${c.unverifiedNames.join(', ')}`,
    c.inventedNumbers?.length && `figure${c.inventedNumbers.length === 1 ? '' : 's'} not in the evidence: ${c.inventedNumbers.join(', ')}`,
  ].filter(Boolean);
  return (
    <section className="space-y-2">
      <SectionHead n="2" title="Creator research" sub="what to verify and prepare before filming" />
      <SensitiveNotice sensitive={brief.sensitive} />
      {(verify.length > 0 || prepare.length > 0) && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2.5 dark:border-amber-500/40 dark:bg-amber-500/10">
          <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
            The draft relies on these, but the evidence (a few viewer comments and video titles) does not contain them.
          </p>
          <NeedList title={prepare.length ? 'Verify' : 'Confirm these'} items={verify} />
          <NeedList title="Prepare" items={prepare} />
        </div>
      )}
      {opp?.covering?.length > 0 && (
        <div className="text-xs text-ink-600 dark:text-ink-300">
          <span className="font-semibold text-ink-700 dark:text-ink-200">Watch first:</span>{' '}
          {opp.covering.map((v, i) => (
            <span key={v.videoId}>
              {i > 0 && ' · '}
              <a href={watchUrl(v.videoId)} target="_blank" rel="noreferrer" className="underline decoration-ink-300 hover:text-ink-900 dark:hover:text-ink-100">{v.title}</a>
            </span>
          ))}
          <span className="text-ink-400"> to confirm what they really miss. The angle is based on their titles.</span>
        </div>
      )}
      {found?.length > 0 && (
        <p className="text-[11px] text-ink-500">
          Checks found: {found.join('; ')}{c.flaggedBeats?.length > 0 && <> (beat{c.flaggedBeats.length === 1 ? '' : 's'} {c.flaggedBeats.join(', ')})</>}.
        </p>
      )}
    </section>
  );
}

function LengthBanner({ brief, busy, onRedraft }) {
  const l = brief.length;
  if (!l) return null;
  const longForm = brief.runtime.format !== 'short';
  return (
    <div className={`rounded-lg border p-2.5 text-xs ${LENGTH_TONE[l.verdict]}`}>
      <p><b>{LENGTH_LABEL[l.verdict]}.</b> {l.summary}</p>
      {l.reasons.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">{l.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      )}
      {brief.lengthNote && <p className="mt-1">{brief.lengthNote}</p>}
      {l.core && <p className="mt-1">{l.core.note}</p>}
      {l.earlySignal && <p className="mt-1">{l.earlySignal}</p>}
      <p className="mt-1 text-[11px] opacity-75">
        {l.basis === 'measured'
          ? 'Timed from the script’s own words at 150 words a minute (an English speaking rate; other languages run differently), not from the model’s estimate. Which beats teach nothing viewers asked for is checked in code.'
          : 'Built from the essentials below: each one’s time is the model’s estimate, but which beats teach nothing viewers asked for is checked in code. A full script is timed from its words instead.'}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {l.offerRedraft && (
          <RedraftButton busy={busy} onClick={() => onRedraft({ targetMinutes: l.suggestedMinutes })}>
            Redraft at ~{l.suggestedMinutes}:00
          </RedraftButton>
        )}
        {l.core && (
          <RedraftButton busy={busy} onClick={() => onRedraft({ core: true, targetMinutes: l.core.minutes })}>
            Redraft the core (~{l.core.minutes}:00)
          </RedraftButton>
        )}
        {l.verdict === 'wrong-format' && (
          <RedraftButton busy={busy} onClick={() => onRedraft({ format: longForm ? 'short' : 'long-form' })}>
            Redraft as {longForm ? 'a Short' : 'long-form'}
          </RedraftButton>
        )}
        {(l.earlySignal && longForm && l.verdict !== 'wrong-format') && (
          <RedraftButton busy={busy} onClick={() => onRedraft({ format: 'short' })}>Draft a test Short</RedraftButton>
        )}
      </div>
    </div>
  );
}

function RedraftButton({ busy, onClick, children }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded border border-current/30 bg-white/60 px-2 py-0.5 text-[11px] font-medium hover:bg-white disabled:opacity-60 dark:bg-transparent dark:hover:bg-white/10"
    >
      {busy ? 'Redrafting…' : children}
    </button>
  );
}

function Essentials({ essentials }) {
  if (!essentials?.length) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-ink-700 dark:text-ink-200">Essentials: what the viewer must leave with</h4>
      <ol className="mt-1 space-y-1 text-xs">
        {essentials.map((e) => (
          <li key={e.n} className="text-ink-700 dark:text-ink-200">
            <span className="nums mr-1 font-semibold text-ink-400">{e.n}.</span>
            {e.point}{' '}
            <span className="inline-flex flex-wrap items-baseline gap-1.5 align-baseline">
            <span className="nums text-ink-400">{mmss(e.seconds)}{e.demo ? ' · demo' : ''}</span>
            {e.coveredBy?.length > 0
              ? <Badge tone="good">beat {e.coveredBy.join(', ')}</Badge>
              : <Badge tone="bad">not taught</Badge>}
            {e.unrequested && <Badge tone="warm" title="Cites no viewer comment and not the request itself">nobody asked</Badge>}
            {e.thin && !e.unrequested && <Badge title="Only one comment, with few likes, asked for this, and the request itself does not need it">optional: one comment</Badge>}
            {e.answers?.length > 0 && !e.unrequested && (
              <span className="text-[11px] text-ink-400">answers {e.answers.map((a) => (a === 'q' ? 'the request' : `comment ${a}`)).join(', ')}</span>
            )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// What the language check found: fields translated after drafting, and any
// still not in the chosen language.
function LanguageNote({ brief }) {
  const r = brief.languageRepair;
  const drift = brief.languageDrift ?? [];
  if (!r?.fixed && !drift.length) return null;
  return (
    <p className="mt-0.5 text-[11px] text-ink-500">
      {r?.fixed > 0 && <>{plural(r.fixed, 'field')} came back in another language and {r.fixed === 1 ? 'was' : 'were'} translated to {brief.language}. </>}
      {drift.length > 0 && <Badge tone="warm" title={drift.join(', ')}>{plural(drift.length, 'field')} still not in {brief.language}</Badge>}
    </p>
  );
}

function HookBadges({ h }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {h.unscored
        ? h.partial
          ? (
            <Badge title={`The five-property scorer only reads English. Language-neutral checks: ${h.partial.checks.map((c) => `${c.pass ? '✓' : '✗'} ${c.label}`).join(', ')}`}>
              partial check {h.partial.passed}/{h.partial.total}
            </Badge>
          )
          : <Badge title="The hook checklist is written for English text, so it does not score this language.">not scored</Badge>
        : <Badge tone={BAND_TONE[h.band]}>{h.band.toLowerCase()} {h.verdict}</Badge>}
      <Badge title={h.formulaSource === 'model' ? 'No wording match in code; this is the formula the model says it used.' : 'Closest hook formula by wording, matched in code.'}>
        {h.formula}{h.formulaSource === 'model' ? ' (model’s label)' : ''}
      </Badge>
      {h.weakOpener && <Badge tone="warm" title="Opens by announcing the video instead of starting it">announces the video</Badge>}
      {h.ungrounded && <Badge tone="bad" title={`${h.inventedNumbers.join(', ')} is not in the viewers' own words`}>invented figure</Badge>}
      {h.unverifiedNames?.length > 0 && <Badge tone="bad" title="A name the evidence never mentioned">unverified name: {h.unverifiedNames.join(', ')}</Badge>}
      {h.weakest && <span className="text-[11px] text-ink-400">weakest: {h.weakest.toLowerCase()} — {h.fix}</span>}
    </div>
  );
}

function Script({ brief, busy, onRedraft }) {
  const scriptStyle = brief.style === 'script';
  const longForm = brief.runtime.format !== 'short';
  return (
    <section className="space-y-3">
      <SectionHead n="3" title="Ready-to-film script" sub="how to make it" />
      <LengthBanner brief={brief} busy={busy} onRedraft={onRedraft} />
      <Essentials essentials={brief.essentials} />

      <div>
        <h4 className="text-xs font-semibold text-ink-700 dark:text-ink-200">Opening lines</h4>
        <p className="mt-0.5 text-[11px] text-ink-400">
          A checklist (does it speak to the viewer, name something specific, open a question), not a prediction of retention.
          It tends to score plain hooks low when no figure in the comments could be used.
        </p>
        {brief.languageNote && <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">{brief.languageNote}</p>}
        <LanguageNote brief={brief} />
        <ul className="mt-2 space-y-2">
          {(brief.hooks ?? []).map((h, i) => (
            <li key={i} className={i < 2 ? '' : 'opacity-70'}>
              <p className="text-ink-800 dark:text-ink-100">&ldquo;{h.hook}&rdquo;</p>
              <HookBadges h={h} />
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-xs font-semibold text-ink-700 dark:text-ink-200">
            {brief.runtime.estimated ? 'Outline' : 'Script beats'}{' '}
            <span className="nums font-normal text-ink-400">
              · {brief.runtime.estimated ? 'budgeted at about' : 'about'} {mmss(brief.runtime.seconds)}
              {brief.runtime.estimated ? ' (talking points are budgeted, not read through)' : ' spoken at 150 words a minute'}
            </span>
          </h4>
          {longForm && (
            <RedraftButton busy={busy} onClick={() => onRedraft({ style: scriptStyle ? 'points' : 'script' })}>
              {scriptStyle ? 'Switch to talking points' : 'Write it as a full script'}
            </RedraftButton>
          )}
        </div>
        <ol className="mt-2 space-y-2.5">
          {brief.beats.map((b, i) => (
            <li key={i} className={b.offPlan ? 'opacity-60' : ''}>
              <p className="text-ink-800 dark:text-ink-100">
                <span className="mr-1.5 text-[11px] font-semibold uppercase text-ink-400">
                  {b.beat}{b.beat === 'body' && b.covers && !b.offPlan ? ` · essential ${b.covers}` : ''} · {mmss(b.seconds)}
                </span>
                {b.say}
              </p>
              {b.points?.length > 0 && (
                <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-ink-700 dark:text-ink-200">
                  {b.points.map((p, j) => <li key={j}>{p}</li>)}
                </ul>
              )}
              {b.onScreen && <p className="text-xs text-sky-700 dark:text-sky-300">on screen: {b.onScreen}</p>}
              {(b.offPlan || b.stretched || b.needsSource > 0 || b.unverifiedNames?.length > 0 || b.inventedNumbers?.length > 0) && (
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  {b.offPlan && <Badge tone="warm" title="Teaches no essential, so no viewer asked for it">not asked for: cut?</Badge>}
                  {b.stretched && <Badge tone="warm" title="Runs far longer than the essential it teaches">stretched</Badge>}
                  {b.needsSource > 0 && <Badge tone="warm">needs source ×{b.needsSource}</Badge>}
                  {b.unverifiedNames?.length > 0 && <Badge tone="bad">unverified name: {b.unverifiedNames.join(', ')}</Badge>}
                  {b.inventedNumbers?.length > 0 && <Badge tone="bad" title="Not in the viewers' own words">figure: {b.inventedNumbers.join(', ')}</Badge>}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-ink-700 dark:text-ink-200">Title, description and tags</h4>
        {brief.titleFix && (
          <p className="mt-1 text-xs text-ink-700 dark:text-ink-200">
            <span className="font-semibold">Suggested title for search:</span> {brief.titleFix.title}{' '}
            <span className="nums text-ink-400">
              · carries {Math.round(brief.titleFix.coverage * 100)}% of the search words (current title {Math.round(brief.titleFix.originalCoverage * 100)}%) · lint {brief.titleFix.score}/100
            </span>
          </p>
        )}
        <ul className="mt-1 space-y-0.5">
          {brief.seo.queryTest.map((q) => (
            <li key={q.query} className="text-xs text-ink-600 dark:text-ink-300">
              &ldquo;{q.query}&rdquo;{' '}
              {q.request
                ? <span className="text-amber-600 dark:text-amber-400">reads like a request to a creator, not a search people type</span>
                : (
                  <span className={q.inTitle ? 'text-emerald-600 dark:text-emerald-400' : q.inOpening ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}>
                    {q.inTitle
                      ? '✓ in the title'
                      : q.inOpening
                        ? '✗ not in the title, only the description'
                        // Briefs saved before coverage was measured have neither field.
                        : q.missing ? `✗ ${Math.round((q.coverage ?? 0) * 100)}% covered, missing: ${q.missing.join(', ')}` : '✗ not in the title or description'}
                  </span>
                )}
            </li>
          ))}
        </ul>
        {brief.seo.queryTest.some((q) => !q.inTitle && !q.request) && !brief.titleFix && (
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
      </div>
    </section>
  );
}

/** On-demand brief for one gap: why make it, what to check first, and the script. Nothing is spent until the button is pressed. */
export function BriefPanel({ runId, index, sensitive, gap }) {
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

  // Which (run, gap, language) a draft was started for, and whether the panel is
  // still on screen: a draft finishing after the report changed, or after the
  // card unmounted, must not land here (or keep polling for four minutes).
  const target = useRef('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  target.current = `${runId}:${index}:${language}`;

  const run = async (opts = {}) => {
    const mine = target.current;
    const gone = () => !mounted.current || target.current !== mine;
    setState('working');
    setError('');
    try {
      const b = await makeBrief(runId, index, { language, ...opts, isCancelled: gone });
      if (gone()) return;
      setBrief(b);
      setState('idle');
    } catch (err) {
      if (err.cancelled || gone()) return;
      setError(err.message);
      setState('error');
    }
  };
  // A redraft keeps the current brief's style, format and essentials (its plan)
  // unless told otherwise, so it changes the wording rather than the scope.
  // "New plan" is the one way to re-plan from scratch.
  const redraft = (opts = {}) => run({
    force: true,
    planFrom: brief?.essentials?.length ? (brief.language ?? '') : null,
    style: brief?.style === 'points' ? 'points' : '',
    format: brief?.runtime?.format === 'short' ? 'short' : '',
    ...opts,
  });

  if (!runId) return null;
  const busy = state === 'working';

  const picker = (
    <label className="flex items-center gap-1.5 text-[11px] text-ink-500">
      Write in
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        disabled={busy}
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
            disabled={busy}
            className="rounded-lg border border-ink-300 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-60 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
          >
            {busy ? 'Drafting the brief… (30-90s)' : 'Make it →'}
          </button>
          {picker}
        </div>
        {state === 'error' && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    );
  }

  const opp = opportunityOf(brief, gap);

  return (
    <details className="group mt-3 rounded-lg border border-ink-200 p-3 dark:border-ink-700" open>
      {/* The summary holds only its title: a select and buttons inside a
          <summary> are nested controls, and the select toggled the panel. */}
      <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-ink-500">
        Make it · brief <span className="font-normal normal-case text-ink-400 group-open:hidden">(show)</span>
      </summary>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {picker}
          <button
            onClick={async () => { setCopied(await copyToClipboard(briefToMarkdown(brief, gap))); setTimeout(() => setCopied(false), 1500); }}
            className="rounded border border-ink-300 px-2 py-0.5 text-[11px] font-medium text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
          >
            {copied ? 'Copied' : 'Copy all'}
          </button>
          <button
            onClick={() => redraft()}
            disabled={busy}
            className="rounded border border-ink-300 px-2 py-0.5 text-[11px] font-medium text-ink-600 hover:bg-ink-100 disabled:opacity-60 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
          >
            {busy ? 'Redrafting…' : 'Redraft'}
          </button>
          {brief.essentials?.length > 0 && (
            <button
              onClick={() => redraft({ planFrom: null })}
              disabled={busy}
              title="Redraft keeps the essentials. This decides them again from the comments, so the scope and length can change."
              className="rounded border border-ink-300 px-2 py-0.5 text-[11px] font-medium text-ink-600 hover:bg-ink-100 disabled:opacity-60 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
            >
              New plan
            </button>
          )}
      </div>
      {state === 'error' && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="mt-3 space-y-5 text-sm">
        <Opportunity brief={brief} opp={opp} />
        <Research brief={brief} opp={opp} />
        <Script brief={brief} busy={busy} onRedraft={redraft} />
      </div>
    </details>
  );
}
