import { useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { GapCard } from '../GapCard.jsx';
import { AvoidCard } from '../AvoidCard.jsx';
import { CommentQuote } from '../CommentQuote.jsx';
import { VideoStrip } from '../VideoStrip.jsx';
import { Badge, EmptyState, Rank } from '../Bits.jsx';
import { Derived } from '../ui/Derived.jsx';
import { Disclosure, Collapse } from '../ui/Disclosure.jsx';
import { compact } from '../../lib/format.js';
import { cx } from '../../lib/cx.js';
import { EqualRows } from './EqualRows.jsx';

const ROW_SUMMARY = 'flex min-h-11 cursor-pointer list-none gap-4 px-5 py-5 transition-colors hover:bg-surface-2 sm:px-6 [&::-webkit-details-marker]:hidden';
// One white card holding hairline-separated rows (gaps, skip).
const ROW_CARD = 'divide-y divide-line-soft overflow-hidden rounded-panel bg-surface shadow-card';
const PREVIEW = 4;

// Channel mode reports on one creator's own audience, so the section names and
// hints change with it. The hints keep the channel/niche distinction the tabs had.
export const SECTIONS = (channel) => [
  { id: 'summary', label: channel ? 'Overview' : 'Summary' },
  { id: 'gaps', label: channel ? 'What your audience asks' : 'Content gaps' },
  { id: 'complaints', label: channel ? 'Objections' : 'Complaints' },
  { id: 'trending', label: channel ? 'Trending in your audience' : 'Trending now' },
  { id: 'avoid', label: channel ? 'Skip' : 'Avoid' },
  { id: 'evidence', label: 'Evidence' },
];

const HINTS = {
  gaps: (ch) => (ch ? 'What this channel’s own viewers keep asking for and have not been given' : 'What the audience keeps asking for and nobody has answered well'),
  complaints: (ch) => (ch ? 'What this channel’s viewers dislike about its existing videos' : 'What viewers dislike about the videos that already exist'),
  trending: (ch) => (ch ? 'Which of this channel’s angles are working right now' : 'What is working in this niche right now'),
  avoid: (ch) => (ch ? 'This channel’s angles with plenty of views but an audience that did not care' : 'Angles with plenty of views but an audience that did not care'),
};

/** A titled section: display heading with its hint, the count aside, then its content. */
export function Section({ id, title, hint, aside, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div className="min-w-0">
          <h2 id={`${id}-h`} className="text-[24px] font-semibold leading-tight tracking-[-0.025em] text-fg">{title}</h2>
          {hint && <p className="mt-1.5 max-w-[62ch] text-[14px] text-fg-2">{hint}</p>}
        </div>
        {aside && <p className="nums text-[13px] text-fg-3">{aside}</p>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MoreToggle({ shown, total, open, onToggle }) {
  if (total <= PREVIEW) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-panel bg-surface-2 text-[15px] font-medium text-fg transition-colors hover:bg-hover"
    >
      {open ? 'Show fewer' : `Show all ${total}`}
      <ChevronDown aria-hidden className={cx('h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]', open && 'rotate-180')} />
      <span className="sr-only">{open ? '' : `(showing ${shown})`}</span>
    </button>
  );
}

const coverageTag = (gap, channel) =>
  gap.coverage === 'none'
    ? [channel ? 'Not covered yet' : 'nobody covers this', 'good']
    : [channel ? 'Partly covered' : 'weakly covered', 'warn'];

function GapRow({ gap, rank, runId, index, canMake, channel }) {
  const [label, tone] = coverageTag(gap, channel);
  return (
    <Disclosure
      summaryClassName={ROW_SUMMARY}
      summary={(
        <>
        <Rank n={String(rank).padStart(2, '0')} />
        <span className="min-w-0 flex-1">
          <span className="block text-[18px] font-semibold leading-snug tracking-[-0.015em] text-fg [text-wrap:balance]">{gap.question}</span>
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={tone}>{label}</Badge>
            <span className="nums font-mono text-[12px] capitalize text-fg-2">{gap.demandStrength}</span>
            {/* One unit, so a phone wraps it onto its own line instead of starting a line with a dot. */}
            <span
              className="nums whitespace-nowrap font-mono text-[12px] text-fg-3 max-sm:basis-full"
              title="Demand score: comment count, spread across videos, and how many likes those comments got."
            >
              <span className="max-sm:hidden">&middot; </span>{gap.evidenceCount} {channel ? 'inquiries' : 'comments'} &middot; demand score {gap.demandScore} <Derived className="text-[12px] text-fg-3" />
            </span>
          </span>
        </span>
        <ChevronRight aria-hidden className="mt-1.5 h-4 w-4 shrink-0 text-fg-3 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] group-open:rotate-90" />
      </>
      )}
      bodyClassName="px-5 pb-6 sm:px-6"
    >
      <GapCard gap={gap} rank={rank} runId={runId} index={index} canMake={canMake} inRow />
    </Disclosure>
  );
}

function Tile({ children, className }) {
  return <div className={cx('min-w-0 rounded-panel bg-surface p-6 shadow-card', className)}>{children}</div>;
}

function ComplaintTile({ objection, rank }) {
  const [first, ...rest] = objection.evidence ?? [];
  return (
    <Tile className="flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">
          {String(rank).padStart(2, '0')} // {objection.severity}
        </span>
        <span
          className="nums font-mono text-xs text-fg-2"
          title="Distinct comments raising this, across how many different videos"
        >
          {objection.evidenceCount} comments
        </span>
      </div>
      <h3 className="mt-3 text-[18px] font-bold leading-snug tracking-[-0.015em] text-fg [text-wrap:balance]">{objection.label}</h3>
      {objection.detail && <p className="mt-2 text-[15px] leading-relaxed text-fg-2">{objection.detail}</p>}
      {first && (
        <ul className="mt-4">
          <CommentQuote comment={first} block />
        </ul>
      )}
      {rest.length > 0 && (
        <Disclosure
          className="mt-2"
          summaryClassName="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-medium text-fg-2 hover:text-fg"
          summary={(
            <>
              <span className="group-open:hidden">{rest.length} more comment{rest.length === 1 ? '' : 's'}</span>
              <span className="hidden group-open:inline">Hide</span>
              <ChevronDown aria-hidden className="h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] group-open:rotate-180" />
            </>
          )}
        >
          <ul className="mb-1 space-y-4">
            {rest.slice(0, 5).map((e, i) => <CommentQuote key={i} comment={e} />)}
          </ul>
        </Disclosure>
      )}
      {objection.fix && (
        <p className="mt-auto border-t border-line pt-4 text-[15px] font-semibold leading-snug text-fg">
          <span className="font-normal text-fg-2">Do this instead: </span>{objection.fix}
        </p>
      )}
    </Tile>
  );
}

function TrendTile({ topic, rank }) {
  return (
    <Tile className="flex flex-col">
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
        title={`Buzz ${topic.heatScore}/100, relative to this result set.`}
      >
        <div className="h-full rounded-full bg-focus" style={{ width: `${Math.max(2, Math.min(100, topic.heatScore))}%` }} />
      </div>
      <h3 className="mt-4 text-[18px] sm:min-h-[2lh] font-semibold leading-snug tracking-[-0.015em] text-fg [text-wrap:balance]">{topic.label}</h3>
      {topic.summary && <p className="mt-2 line-clamp-4 text-[15px] sm:min-h-[4lh] leading-relaxed text-fg-2">{topic.summary}</p>}
      <p className="nums mt-3 flex flex-wrap sm:min-h-[3lh] content-start items-center gap-x-2 border-t border-line-soft pt-3 font-mono text-[12px] text-fg-3">
        <span className="font-medium text-focus">
          #{String(rank).padStart(2, '0')} &middot; buzz {topic.heatScore} <Derived className="text-[12px] text-fg-3" />
        </span>
        <span aria-hidden className="max-sm:hidden">&middot;</span>
        <span className="max-sm:basis-full">{topic.videos.length} video{topic.videos.length === 1 ? '' : 's'} · {topic.breadth} channel{topic.breadth === 1 ? '' : 's'} · {compact(topic.totalViews)} views</span>
      </p>
      {(topic.nicheRelevant === false || (topic.evidence && topic.evidence.level !== 'solid')) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {topic.nicheRelevant === false && <Badge tone="bad" title="No niche keyword appears in this topic's label, summary, or backing videos. Check the example videos before trusting it.">check relevance</Badge>}
          {topic.evidence && topic.evidence.level !== 'solid' && (
            <Badge tone={topic.evidence.level === 'thin' ? 'warn' : 'neutral'} title={topic.evidence.why}>
              {topic.evidence.level === 'thin' ? 'single video' : 'one channel'}
            </Badge>
          )}
        </div>
      )}
      <Disclosure
        className="mt-auto pt-2"
        summaryClassName="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-medium text-fg-2 hover:text-fg"
        bodyClassName="space-y-4 pb-1"
        summary={(
          <>
            <span className="group-open:hidden">Why it&rsquo;s hot, angles and videos</span>
            <span className="hidden group-open:inline">Hide</span>
            <ChevronDown aria-hidden className="h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] group-open:rotate-180" />
          </>
        )}
      >
          {topic.whyHot && <p className="text-[15px] leading-relaxed text-fg">{topic.whyHot}</p>}
          {topic.suggestedAngles?.length > 0 && (
            <ul className="space-y-1.5">
              {topic.suggestedAngles.map((a, i) => (
                <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-fg">
                  <span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-fg-3" />{a}
                </li>
              ))}
            </ul>
          )}
          <VideoStrip videos={topic.videos} limit={6} />
      </Disclosure>
    </Tile>
  );
}

function AvoidRow({ item, rank }) {
  return (
    <Disclosure
      summaryClassName={cx(ROW_SUMMARY, 'py-4')}
      summary={(
        <>
        <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-fg-3">
          <X className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 text-[16px] leading-snug text-fg-2">
          <span className="sr-only">{rank}. </span>
          <b className="font-semibold text-fg">{item.label}</b>
          <span className="line-clamp-2"> — {item.reason}</span>
        </span>
        <ChevronRight aria-hidden className="mt-1 h-4 w-4 shrink-0 text-fg-3 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] group-open:rotate-90" />
      </>
      )}
      bodyClassName="px-5 pb-6 sm:pl-16 sm:pr-6"
    >
      <AvoidCard item={item} rank={rank} inRow />
    </Disclosure>
  );
}

/**
 * Every list of a report in one scroll, each under its own anchor: the biggest
 * gap as a hero, the rest of the gaps as hairline rows that open to the full
 * card, complaints and trends as tiles, and avoid as a quiet list. Nothing the
 * old tabs offered is dropped; it is one level down instead of one tab away.
 */
export function ReportSections({ result, canMake, canRun, evidence }) {
  const [open, setOpen] = useState({});
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const channel = Boolean(result.channelMode);
  const gaps = result.gaps ?? [];
  const [hero, ...restGaps] = gaps;

  return (
    <div className="space-y-16">
      {hero && (
        <section id="summary" aria-labelledby="summary-h" className="scroll-mt-24">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-focus">
            {channel ? 'The clearest thing your audience keeps asking for' : 'The biggest gap'}
          </p>
          <h2 id="summary-h" className="sr-only">Biggest gap</h2>
          <div className="mt-3">
            <GapCard gap={hero} rank={1} runId={result.runId} index={0} canMake={canMake} summary />
          </div>
        </section>
      )}

      <Section
        id="gaps"
        title={SECTIONS(channel)[1].label}
        hint={HINTS.gaps(channel)}
        aside={restGaps.length ? `Showing top ${open.gaps ? restGaps.length : Math.min(restGaps.length, PREVIEW)} of ${restGaps.length}` : undefined}
      >
        {result.evidence?.gaps && result.evidence.gaps.level !== 'solid' && result.evidence.gaps.level !== 'n/a' && (
          <p className="pb-3 text-[13px] text-warn-fg">{result.evidence.gaps.why}</p>
        )}
        {gaps.length === 0 && (
          <div>
            <EmptyState title="No unmet demand found">
              Every recurring request in these comments is already answered by a strong video &mdash; a sign
              this niche is well served. Try a narrower niche, a shorter window, or the looser
              &ldquo;Uncovered + weak&rdquo; gap setting.
            </EmptyState>
          </div>
        )}
        {restGaps.length > 0 && (
          <div className={ROW_CARD}>
            {restGaps.slice(0, PREVIEW).map((g, i) => (
              <GapRow key={`${result.runId}:${i + 1}`} gap={g} rank={i + 2} runId={result.runId} index={i + 1} canMake={canMake} channel={channel} />
            ))}
            {restGaps.length > PREVIEW && (
              <Collapse open={open.gaps} className="divide-y divide-line-soft">
                {restGaps.slice(PREVIEW).map((g, i) => (
                  <GapRow key={`${result.runId}:${i + PREVIEW + 1}`} gap={g} rank={i + PREVIEW + 2} runId={result.runId} index={i + PREVIEW + 1} canMake={canMake} channel={channel} />
                ))}
              </Collapse>
            )}
          </div>
        )}
        <MoreToggle shown={PREVIEW} total={restGaps.length} open={open.gaps} onToggle={() => toggle('gaps')} />

        {result.resolvedGaps?.length > 0 && (
          <Disclosure
            className="mt-6 rounded-panel bg-surface-2 p-4"
            summaryClassName="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-[15px] font-medium text-fg-2 hover:text-fg"
            summary={(
              <>
                <span>{result.resolvedGaps.length} gap{result.resolvedGaps.length === 1 ? '' : 's'} no longer being asked since the last run</span>
                <ChevronDown aria-hidden className="h-4 w-4 shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] group-open:rotate-180" />
              </>
            )}
          >
            <p className="mt-1 text-[13px] text-fg-3">
              These were open the last time this subject was analysed and no longer show up.
              Usually that means somebody made the video &mdash; the window has closed.
            </p>
            <ul className="mt-3 space-y-2">
              {result.resolvedGaps.map((r, i) => (
                <li key={i} className="text-[15px] text-fg-2 line-through decoration-fg-3">
                  {r.question}
                  <span className="nums ml-2 font-mono text-xs text-fg-3 no-underline">
                    (score was {r.previousDemandScore}, last seen {(r.lastSeen ?? '').slice(0, 10)})
                  </span>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </Section>

      <Section
        id="complaints"
        title={SECTIONS(channel)[2].label}
        hint={HINTS.complaints(channel)}
        aside={result.objections?.length ? `${result.objections.length} recurring` : undefined}
      >
        <div>
          {result.objections?.length ? (
            <>
            <EqualRows className="md:grid-cols-2">
              {result.objections.slice(0, PREVIEW).map((o, i) => <ComplaintTile key={o.label + i} objection={o} rank={i + 1} />)}
            </EqualRows>
            {result.objections.length > PREVIEW && (
              <Collapse open={open.complaints} className="pt-4">
                <EqualRows className="md:grid-cols-2">
                {result.objections.slice(PREVIEW).map((o, i) => <ComplaintTile key={o.label + i + PREVIEW} objection={o} rank={i + PREVIEW + 1} />)}
                </EqualRows>
              </Collapse>
            )}
            </>
          ) : result.objections === undefined ? (
            <EmptyState title="Not computed for this report">
              This report was saved before complaints were extracted.{canRun && ' Refresh it to get them.'}
            </EmptyState>
          ) : (
            <EmptyState title="No recurring complaints">
              No criticism of the existing videos was raised by at least two separate commenters. Either the
              execution is landing, or the comments here are mostly praise and requests rather than critique.
            </EmptyState>
          )}
          <MoreToggle shown={PREVIEW} total={result.objections?.length ?? 0} open={open.complaints} onToggle={() => toggle('complaints')} />
        </div>
      </Section>

      <Section
        id="trending"
        title={SECTIONS(channel)[3].label}
        hint={HINTS.trending(channel)}
      >
        <div>
          {result.topics.length ? (
            <>
            <EqualRows className="md:grid-cols-2 lg:grid-cols-3">
              {result.topics.slice(0, 3).map((t, i) => <TrendTile key={t.label + i} topic={t} rank={i + 1} />)}
            </EqualRows>
            {result.topics.length > 3 && (
              <Collapse open={open.trending} className="pt-4">
                <EqualRows className="md:grid-cols-2 lg:grid-cols-3">
                {result.topics.slice(3).map((t, i) => <TrendTile key={t.label + i + 3} topic={t} rank={i + 4} />)}
                </EqualRows>
              </Collapse>
            )}
            </>
          ) : (
            <EmptyState title="No clear topics">
              The videos in this window were too scattered to cluster. Try a broader niche or a longer window.
            </EmptyState>
          )}
          {result.topics.length > 3 && (
            <button
              type="button"
              onClick={() => toggle('trending')}
              aria-expanded={Boolean(open.trending)}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-panel bg-surface-2 text-[15px] font-medium text-fg transition-colors hover:bg-hover"
            >
              {open.trending ? 'Show fewer' : `Show all ${result.topics.length}`}
              <ChevronDown aria-hidden className={cx('h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]', open.trending && 'rotate-180')} />
            </button>
          )}
        </div>
      </Section>

      <Section
        id="avoid"
        title={SECTIONS(channel)[4].label}
        hint={HINTS.avoid(channel)}
      >
        {result.avoid.length ? (
          <>
            <div className={ROW_CARD}>
              {result.avoid.slice(0, PREVIEW).map((a, i) => <AvoidRow key={a.label + i} item={a} rank={i + 1} />)}
              {result.avoid.length > PREVIEW && (
                <Collapse open={open.avoid} className="divide-y divide-line-soft">
                  {result.avoid.slice(PREVIEW).map((a, i) => <AvoidRow key={a.label + i + PREVIEW} item={a} rank={i + PREVIEW + 1} />)}
                </Collapse>
              )}
            </div>
            <MoreToggle shown={PREVIEW} total={result.avoid.length} open={open.avoid} onToggle={() => toggle('avoid')} />
          </>
        ) : (
          <div>
            <EmptyState title="Nothing to avoid">
              No angle in this set showed the high-views / low-engagement pattern. That is a good sign for the niche.
            </EmptyState>
          </div>
        )}
      </Section>

      <section id="evidence" aria-label="Evidence" className="scroll-mt-24">
        {evidence}
      </section>
    </div>
  );
}
