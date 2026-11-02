import { useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Heart } from 'lucide-react';
import { Badge, Derived, Panel, Skeleton } from '../ui/index.js';
import { EXAMPLE_REPORTS } from './exampleReport.js';
import { useAuth } from '../../lib/auth.jsx';
import { useColorMode } from '../../lib/colorMode.js';
import { navigate } from '../../lib/router.jsx';
import { cx } from '../../lib/cx.js';

const STRENGTH_TONE = { high: 'bad', medium: 'warn', low: 'neutral' };
const hairline = 'border-line';
const label = 'font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-fg-3';

const TABS = [
  { key: 'topics', label: 'Trending now', empty: 'No trending topics in this report.' },
  { key: 'gaps', label: 'Content gaps', empty: 'No content gaps in this report.' },
  { key: 'objections', label: 'Complaints', empty: 'No recurring complaints in this report.' },
  { key: 'avoid', label: 'Avoid', empty: 'Nothing to avoid in this report.' },
];

const coverageText = (c) => (c === 'none' ? 'nobody covers this' : 'weakly covered');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A row's title and its muted line, per tab. `open` marks an unanswered gap, which the row picks out. */
function rowOf(tab, item) {
  if (tab === 'topics') return { title: item.label, meta: Number.isFinite(item.heatScore) ? `buzz ${item.heatScore}` : '' };
  if (tab === 'objections') return { title: item.label, meta: [item.severity, Number.isFinite(item.evidenceCount) && plural(item.evidenceCount, 'comment')].filter(Boolean).join(' · ') };
  if (tab === 'avoid') return { title: item.label, meta: '' };
  return {
    title: item.question,
    meta: [
      Number.isFinite(item.evidenceCount) && plural(item.evidenceCount, 'comment'),
      Number.isFinite(item.distinctVideos) && plural(item.distinctVideos, 'video'),
    ].filter(Boolean).join(' · '),
    coverage: item.coverage ? coverageText(item.coverage) : null,
    open: item.coverage === 'none',
  };
}

/** A quote's source line: likes, then the video it was written under, linked to YouTube. */
function Source({ quote }) {
  const name = quote.videoTitle ? <>on “{quote.videoTitle}”</> : 'on YouTube';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[13px] opacity-80">
      {quote.likes !== null && (
        <>
          <span className="inline-flex items-center gap-1 font-mono nums">
            <Heart aria-hidden className="h-3 w-3" />
            <span><span className="sr-only">Likes: </span>{quote.likes}</span>
          </span>
          <span aria-hidden>·</span>
        </>
      )}
      {quote.href ? (
        <a
          href={quote.href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-w-0 items-center gap-0.5 underline-offset-2 hover:underline"
        >
          <span className="min-w-0 break-words">{name}</span>
          <ArrowUpRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="sr-only">(opens on YouTube in a new tab)</span>
        </a>
      ) : (
        <span className="min-w-0 break-words">{name}</span>
      )}
    </div>
  );
}

function GapDetail({ gap, example }) {
  // The highlighter is for light themes; the dark design sets a quote on a raised panel instead.
  const dark = useColorMode().mode === 'dark';
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {gap.strength && <Badge tone={STRENGTH_TONE[gap.strength]}>{gap.strength} demand</Badge>}
        {gap.coverage && <Badge tone={gap.coverage === 'none' ? 'good' : 'warn'}>{coverageText(gap.coverage)}</Badge>}
        {gap.demandScore !== null && gap.demandScore !== undefined && (
          <Badge mono className="!bg-hover !text-fg-2">
            demand score <span className="nums">{gap.demandScore}</span> <Derived />
          </Badge>
        )}
      </div>

      <p className={cx(label, 'mt-6')}>What viewers said</p>
      {gap.evidence.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-3">
          {gap.evidence.map((q, i) => (
            <li
              key={`${q.text}-${i}`}
              className={cx('min-w-0 rounded-xl p-4', dark ? 'border border-line-strong bg-surface-2 text-fg' : 'bg-mark text-on-mark')}
            >
              <p className="text-[16px] italic leading-[1.45]">“{q.text}”</p>
              <Source quote={q} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[15px] text-fg-2">
          {example
            ? 'The comments behind this gap appear here in a real report, each linked to its video.'
            : 'No comments were kept for this gap.'}
        </p>
      )}

      {gap.suggestedTitle && (
        <div className={cx('mt-6 border-t pt-5', hairline)}>
          <p className={label}>Suggested title</p>
          <p className="mt-2 text-[17px] font-semibold leading-snug text-fg">{gap.suggestedTitle}</p>
        </div>
      )}
    </>
  );
}

function TopicDetail({ topic }) {
  return (
    <>
      {Number.isFinite(topic.heatScore) && (
        <Badge mono className="!bg-hover !text-fg-2">buzz <span className="nums">{topic.heatScore}</span> <Derived /></Badge>
      )}
      <p className="mt-4 text-[19px] font-semibold leading-snug text-fg">{topic.label}</p>
      {topic.summary && <p className="mt-2 text-[16px] leading-relaxed text-fg-2">{topic.summary}</p>}
    </>
  );
}

function ComplaintDetail({ complaint }) {
  return (
    <>
      {complaint.severity && <Badge tone={STRENGTH_TONE[complaint.severity] ?? 'neutral'}>{complaint.severity} severity</Badge>}
      <p className="mt-4 text-[19px] font-semibold leading-snug text-fg">{complaint.label}</p>
      {complaint.detail && <p className="mt-2 text-[16px] leading-relaxed text-fg-2">{complaint.detail}</p>}
      {complaint.fix && (
        <div className={cx('mt-6 border-t pt-5', hairline)}>
          <p className={label}>Do this instead</p>
          <p className="mt-2 text-[17px] font-semibold leading-snug text-fg">{complaint.fix}</p>
        </div>
      )}
    </>
  );
}

function AvoidDetail({ item }) {
  return (
    <>
      <p className="text-[19px] font-semibold leading-snug text-fg">{item.label}</p>
      {item.reason && <p className="mt-2 text-[16px] leading-relaxed text-fg-2">{item.reason}</p>}
    </>
  );
}

function Detail({ tab, item, example }) {
  if (tab === 'topics') return <TopicDetail topic={item} />;
  if (tab === 'objections') return <ComplaintDetail complaint={item} />;
  if (tab === 'avoid') return <AvoidDetail item={item} />;
  return <GapDetail gap={item} example={example} />;
}

function Rail({ reports, selected, onSelect }) {
  return (
    <div className={cx('min-w-0 border-b bg-bg lg:border-b-0 lg:border-r lg:p-3', hairline)}>
      <p className={cx(label, 'hidden items-center justify-between px-3 pb-3 pt-2 lg:flex')}>
        <span>Reports</span><span className="nums">{reports.length}</span>
      </p>
      <ul aria-label="Reports" className="flex gap-1.5 overflow-x-auto p-3 lg:block lg:space-y-1 lg:overflow-visible lg:p-0">
        {reports.map((r, i) => {
          const on = i === selected;
          return (
            <li key={r.niche} className="shrink-0">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onSelect(i)}
                className={cx(
                  'block min-h-11 w-full rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 ease-[var(--ease-out)]',
                  on ? 'border-line-strong bg-surface' : 'border-transparent hover:bg-surface-2',
                )}
              >
                <span className={cx('block whitespace-nowrap text-[15px] lg:whitespace-normal', on ? 'font-semibold text-fg' : 'font-medium text-fg-2')}>{r.niche}</span>
                <span className="mt-0.5 hidden font-mono text-xs text-fg-3 nums lg:block">
                  {[plural(r.counts?.gaps ?? r.gaps.length, 'gap'), r.age].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Same as the homepage search: it runs nothing, it carries the niche to the Explorer. */
function SearchBar() {
  const { user } = useAuth();
  const id = useId();
  const [niche, setNiche] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const value = niche.trim().replace(/\s+/g, ' ');
    if (!value) return;
    const target = `/explore?niche=${encodeURIComponent(value)}`;
    navigate(user ? target : `/signup?next=${encodeURIComponent(target)}`);
  };
  return (
    <form role="search" onSubmit={submit} className={cx('border-t p-3 md:px-6 md:py-4', hairline)}>
      <div className="flex items-center gap-2 rounded-full border border-line-strong bg-bg p-1.5 pl-5">
        <label htmlFor={id} className="sr-only">Search any niche</label>
        <input
          id={id}
          type="text"
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          placeholder="Search any niche…"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={120}
          className="min-h-9 min-w-0 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-3"
        />
        <button
          type="submit"
          aria-label="Find gaps"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink transition-opacity duration-150 hover:opacity-85"
        >
          <ArrowRight aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function SkeletonBody() {
  return (
    <div className="grid lg:h-[640px] lg:grid-cols-[230px_minmax(0,1fr)]" aria-busy="true">
      <div className={cx('hidden space-y-4 border-r bg-bg p-6 lg:block', hairline)}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
      <div className="p-6 md:p-8">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="mt-3 h-3.5 w-2/5" />
        {[0, 1, 2].map((i) => <Skeleton key={i} className="mt-6 h-16 w-full" />)}
      </div>
      <span className="sr-only" role="status">Loading a sample report</span>
    </div>
  );
}

/**
 * A small working copy of the app. `views` is undefined while loading, otherwise
 * the real reports `toView` built. They come first; labelled examples fill the
 * rest of the four places. It only reads what it was handed, so clicking around
 * never spends quota.
 */
export default function SampleReport({ views }) {
  const [state, setState] = useState({ report: 0, tab: 'gaps', item: 0 });
  const id = useId();
  const tabRefs = useRef({});
  const loading = views === undefined;
  const reports = useMemo(() => {
    const real = views ?? [];
    const taken = new Set(real.map((r) => r.niche.toLowerCase()));
    return [...real, ...EXAMPLE_REPORTS.filter((r) => !taken.has(r.niche.toLowerCase()))].slice(0, 4);
  }, [views]);
  const report = reports[Math.min(state.report, reports.length - 1)];
  const items = report[state.tab] ?? [];
  const item = items[Math.min(state.item, items.length - 1)];

  const pickTab = (tab) => setState((s) => ({ ...s, tab, item: 0 }));
  const onTabKey = (e, i) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = TABS[(i + step + TABS.length) % TABS.length].key;
    pickTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <Panel
      as="section"
      padding="none"
      aria-label={`Example of the Gapstronaut app: ${report.niche}`}
      className="!rounded-[18px] !border-line-strong overflow-hidden !shadow-[0_40px_80px_-40px_rgba(15,30,46,0.18)]"
    >
      <div className={cx('grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b px-4 py-3', hairline)}>
        <span aria-hidden className="flex gap-1.5">
          {[0, 1, 2].map((i) => <i key={i} className="h-2.5 w-2.5 rounded-full bg-line-strong" />)}
        </span>
        <p className="text-sm font-semibold text-fg">Gapstronaut</p>
        <div className="flex justify-end font-mono text-[11px] text-fg-3">
          {!loading && report.example && <Badge mono>Example data</Badge>}
          {!loading && !report.example && report.asOf && (
            <span className="hidden sm:inline">YouTube data as of <time dateTime={report.asOfISO}>{report.asOf}</time></span>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonBody />
      ) : (
        <div className="grid lg:h-[640px] lg:grid-cols-[230px_minmax(0,1fr)]">
          <Rail reports={reports} selected={state.report} onSelect={(i) => setState({ report: i, tab: 'gaps', item: 0 })} />

          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <div className={cx('flex min-h-0 min-w-0 flex-col border-b md:border-b-0 md:border-r', hairline)}>
                <div className="px-4 pt-5 md:px-6">
                  <h3 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-fg">{report.niche}</h3>
                  <p className="mt-1 text-sm text-fg-2">{[report.windowLabel, report.formatLabel].filter(Boolean).join(' · ')}</p>
                  <div role="tablist" aria-label="Report sections" className={cx('mt-4 flex gap-5 overflow-x-auto border-b', hairline)}>
                    {TABS.map((t, i) => {
                      const on = t.key === state.tab;
                      return (
                        <button
                          key={t.key}
                          ref={(el) => { tabRefs.current[t.key] = el; }}
                          type="button"
                          role="tab"
                          id={`${id}-tab-${t.key}`}
                          aria-selected={on}
                          aria-controls={`${id}-panel`}
                          tabIndex={on ? 0 : -1}
                          onClick={() => pickTab(t.key)}
                          onKeyDown={(e) => onTabKey(e, i)}
                          className={cx(
                            '-mb-px shrink-0 whitespace-nowrap border-b-2 py-2.5 text-sm transition-colors duration-150',
                            on ? 'border-fg font-semibold text-fg' : 'border-transparent text-fg-3 hover:text-fg',
                          )}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div
                  role="tabpanel"
                  id={`${id}-panel`}
                  aria-labelledby={`${id}-tab-${state.tab}`}
                  className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6"
                >
                  {items.length > 0 ? (
                    <ul className="flex flex-col gap-2.5">
                      {items.map((entry, i) => {
                        const on = entry === item;
                        const row = rowOf(state.tab, entry);
                        return (
                          <li key={row.title}>
                            <button
                              type="button"
                              aria-pressed={on}
                              onClick={() => setState((s) => ({ ...s, item: i }))}
                              className={cx(
                                'block w-full rounded-xl border px-4 py-3 text-left transition-colors duration-150 ease-[var(--ease-out)]',
                                on ? 'border-focus bg-info-bg' : 'border-line hover:border-line-strong',
                              )}
                            >
                              <span className="block text-[15px] font-semibold leading-snug text-fg">{row.title}</span>
                              {(row.meta || row.coverage) && (
                                <span className="mt-1 block font-mono text-xs text-fg-3 nums">
                                  {row.meta}
                                  {row.meta && row.coverage && ' · '}
                                  {row.coverage && <span className={row.open ? 'text-focus' : undefined}>{row.coverage}</span>}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="py-4 text-[15px] text-fg-2">{TABS.find((t) => t.key === state.tab).empty}</p>
                  )}
                </div>
              </div>

              <div className="min-h-0 min-w-0 overflow-y-auto px-4 py-5 md:px-6">
                {item && <Detail tab={state.tab} item={item} example={report.example} />}
              </div>
            </div>

            <SearchBar />
          </div>
        </div>
      )}
    </Panel>
  );
}
