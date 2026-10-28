import { useState } from 'react';
import { ArrowUpRight, Heart } from 'lucide-react';
import { Badge, Derived, EvidenceMark, Panel, Skeleton } from '../ui/index.js';
import { cx } from '../../lib/cx.js';

const SOFT = 'text-fg-2';
const STRENGTH_TONE = { high: 'bad', medium: 'warn', low: 'neutral' };
const hairline = 'border-line';

const coverageText = (c) => (c === 'none' ? 'nobody covers this' : 'weakly covered');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const meta = (g) => [
  Number.isFinite(g.evidenceCount) && plural(g.evidenceCount, 'comment'),
  Number.isFinite(g.distinctVideos) && plural(g.distinctVideos, 'video'),
  coverageText(g.coverage),
].filter(Boolean).join(' · ');

/** A quote's source line: likes, then the video it was written under, linked to YouTube. */
function Source({ quote, className }) {
  const label = quote.videoTitle ? <>on “{quote.videoTitle}”</> : 'on YouTube';
  return (
    <div className={cx('mt-2 flex flex-wrap items-center gap-x-2 text-[13px] text-fg-3', className)}>
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
          className="inline-flex min-w-0 items-center gap-0.5 underline-offset-2 hover:text-fg hover:underline"
        >
          <span className="min-w-0 break-words">{label}</span>
          <ArrowUpRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="sr-only">(opens on YouTube in a new tab)</span>
        </a>
      ) : (
        <span className="inline-flex items-center gap-0.5">{label}<ArrowUpRight aria-hidden className="h-3.5 w-3.5" /></span>
      )}
    </div>
  );
}

function Detail({ gap, sweepFirst, example }) {
  const tone = STRENGTH_TONE[gap.strength];
  return (
    <div className="min-w-0 px-4 py-5 md:px-8 md:py-7">
      <div className="flex flex-wrap gap-1.5 md:gap-2">
        {gap.strength && <Badge tone={tone}>{gap.strength} demand</Badge>}
        {gap.coverage && <Badge tone={gap.coverage === 'none' ? 'good' : 'warn'}>{coverageText(gap.coverage)}</Badge>}
        {gap.demandScore !== null && gap.demandScore !== undefined && (
          <Badge mono className="!bg-hover !text-fg-2">
            demand score <span className="nums">{gap.demandScore}</span> <Derived />
          </Badge>
        )}
      </div>

      <h3 className="mt-3.5 text-[19px] font-semibold leading-[1.3] md:hidden">{gap.question}</h3>

      <p className="mt-4 text-xs text-fg-3 md:mt-[22px] md:text-[13px]">What viewers said</p>
      {gap.evidence.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-3.5 md:mt-3 md:gap-[18px]">
          {gap.evidence.map((q, i) => (
            <li key={`${q.text}-${i}`}>
              {i === 0 ? (
                <p className="text-[19px] font-medium leading-[1.4] md:text-[22px]">
                  <EvidenceMark sweep={sweepFirst}>“{q.text}”</EvidenceMark>
                </p>
              ) : (
                <p className={cx('text-base leading-[1.45] md:text-[19px]', SOFT)}>“{q.text}”</p>
              )}
              <Source quote={q} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[15px] text-fg-2 md:mt-3">
          {example
            ? 'The comments behind this gap appear here in a real report, each linked to its video.'
            : 'No comments were kept for this gap.'}
        </p>
      )}

      {gap.suggestedTitle && (
        <p className={cx('mt-6 border-t pt-5 text-[15px] text-fg-2 md:mt-[26px]', hairline)}>
          Film this: <span className="font-semibold text-fg">{gap.suggestedTitle}</span>
        </p>
      )}
    </div>
  );
}

function Tab({ label, count, active }) {
  return (
    <span
      aria-current={active ? 'true' : undefined}
      className={cx(
        '-mb-px py-3.5',
        active ? 'border-b-2 border-fg font-semibold text-fg' : 'text-fg-3'
      )}
    >
      {label}
      {count !== null && count !== undefined && (
        <span className={cx('ml-1.5 font-mono text-xs nums', active ? 'text-fg-2' : '')}>{count}</span>
      )}
    </span>
  );
}

function SkeletonBody() {
  return (
    <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]" aria-busy="true">
      <div className={cx('hidden md:block md:border-r', hairline)}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={cx('px-6 py-5', i < 2 && 'border-b', hairline)}>
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="mt-3 h-3.5 w-3/5" />
          </div>
        ))}
      </div>
      <div className="px-4 py-5 md:px-8 md:py-7">
        <div className="flex gap-2"><Skeleton className="h-6 w-24 !rounded-full" /><Skeleton className="h-6 w-32 !rounded-full" /></div>
        <Skeleton className="mt-6 h-3.5 w-28" />
        <Skeleton className="mt-4 h-7 w-3/4" />
        <Skeleton className="mt-3 h-3.5 w-48" />
        <Skeleton className="mt-6 h-6 w-2/3" />
        <Skeleton className="mt-3 h-3.5 w-40" />
      </div>
      <span className="sr-only" role="status">Loading a sample report</span>
    </div>
  );
}

/**
 * The evidence panel. `view` is undefined while loading, otherwise what
 * `toView` or EXAMPLE_VIEW built. One gap is selected at a time; the first quote
 * of the first gap gets the highlighter sweep, once, until the visitor picks
 * another gap.
 */
export default function SampleReport({ view }) {
  const [selected, setSelected] = useState(0);
  const [touched, setTouched] = useState(false);
  const loading = view === undefined;
  const gap = view?.gaps[Math.min(selected, (view?.gaps.length ?? 1) - 1)];

  return (
    <Panel
      as="section"
      padding="none"
      aria-label={loading ? 'Sample report' : `Sample report: ${view.niche}`}
      className="!rounded-[18px] !border-line-strong overflow-hidden !shadow-[0_40px_80px_-40px_rgba(15,30,46,0.18)]"
    >
      <div className={cx('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3.5 md:px-6 md:py-4', hairline)}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-2 md:text-[15px]">
          {loading ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            <>
              <span className="font-semibold text-fg">{view.niche}</span>
              {view.windowLabel && <span className="hidden md:inline">{view.windowLabel}</span>}
              {view.formatLabel && <span className="hidden md:inline">{view.formatLabel}</span>}
            </>
          )}
        </div>
        {!loading && (
          <div className="flex items-center gap-2.5 font-mono text-[11px] text-fg-3 md:text-xs">
            {view.example && (
              <Badge mono>Example data</Badge>
            )}
            {view.asOf && (
              <span>YouTube data as of <time dateTime={view.asOfISO}>{view.asOf}</time></span>
            )}
          </div>
        )}
      </div>

      <div className={cx('hidden gap-7 border-b px-6 text-[15px] md:flex', hairline)}>
        <Tab label="Trending now" count={view?.counts?.topics} />
        <Tab label="Content gaps" count={view?.counts?.gaps} active />
        <Tab label="Complaints" />
        <Tab label="Avoid" />
      </div>

      {loading ? (
        <SkeletonBody />
      ) : (
        <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
          <ul className={cx('hidden md:block md:border-r', hairline)} aria-label="Content gaps in this report">
            {view.gaps.map((g, i) => {
              const on = i === selected;
              return (
                <li key={g.question} className={cx(i < view.gaps.length - 1 && 'border-b', hairline)}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => { setSelected(i); setTouched(true); }}
                    className={cx(
                      'block w-full px-6 py-5 text-left transition-colors duration-150 ease-[var(--ease-out)] focus-visible:-outline-offset-2',
                      on ? 'bg-surface-2' : 'hover:bg-surface-2/60'
                    )}
                  >
                    <span className={cx('block text-[17px] leading-[1.3]', on ? 'font-semibold text-fg' : cx('font-medium', SOFT))}>
                      {g.question}
                    </span>
                    <span className={cx('mt-2 block font-mono text-[13px]', on ? 'text-fg-2' : 'text-fg-3')}>{meta(g)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div id="sample-gap-detail" className="min-w-0">
            <Detail key={selected} gap={gap} sweepFirst={selected === 0 && !touched} example={view.example} />
          </div>
        </div>
      )}
    </Panel>
  );
}
