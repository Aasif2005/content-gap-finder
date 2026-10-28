import { useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TopicCard } from '../TopicCard.jsx';
import { GapCard } from '../GapCard.jsx';
import { AvoidCard } from '../AvoidCard.jsx';
import { ObjectionCard } from '../ObjectionCard.jsx';
import { EmptyState } from '../Bits.jsx';
import { cx } from '../../lib/cx.js';

// Channel mode reports on one creator's own catalogue and own audience, so the
// niche wording is simply wrong there ("what is working in this niche" on a
// report about a single channel). Hints take the mode rather than papering over
// it with subject-neutral phrasing that says less in both cases.
export const TABS = [
  {
    key: 'topics',
    label: 'Trending now',
    hint: (ch) => (ch ? 'Which of this channel’s angles are working right now' : 'What is working in this niche right now'),
  },
  {
    key: 'gaps',
    label: 'Content gaps',
    hint: (ch) =>
      ch
        ? 'What this channel’s own viewers keep asking for and have not been given'
        : 'What the audience keeps asking for and nobody has answered well',
  },
  // Gaps are a production decision ("film this"); complaints are an execution
  // note ("stop doing this"). Same comments, different action, so a separate tab.
  {
    key: 'objections',
    label: 'Complaints',
    hint: (ch) => (ch ? 'What this channel’s viewers dislike about its existing videos' : 'What viewers dislike about the videos that already exist'),
  },
  {
    key: 'avoid',
    label: 'Avoid',
    hint: (ch) => (ch ? 'This channel’s angles with plenty of views but an audience that did not care' : 'Angles with plenty of views but an audience that did not care'),
  },
];

export const tabCounts = (result) => ({
  topics: result.topics?.length ?? 0,
  gaps: result.gaps?.length ?? 0,
  objections: result.objections?.length ?? 0,
  avoid: result.avoid?.length ?? 0,
});

const PREVIEW = 3;

/** The four tabs and the active one's list. Remounted per report, so each opens on Trending now. */
export function ReportTabs({ result, canMake, canRun }) {
  const [tab, setTab] = useState('topics');
  const [expanded, setExpanded] = useState({}); // tabs whose full list is open; the rest show the first few

  const uid = useId();
  const refs = useRef({});
  const channel = Boolean(result.channelMode);
  const counts = tabCounts(result);
  const active = TABS.find((t) => t.key === tab);
  const limit = expanded[tab] ? Infinity : PREVIEW;
  const total = counts[tab];

  // Roving focus: arrows, Home and End move between tabs, as in any tab list.
  const onKeyDown = (e) => {
    const i = TABS.findIndex((t) => t.key === tab);
    let next = null;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    setTab(TABS[next].key);
    refs.current[TABS[next].key]?.focus();
  };

  return (
    <section>
      {/* Scrolls sideways on a narrow screen rather than wrapping into two rows. */}
      <div
        role="tablist"
        aria-label="Report sections"
        onKeyDown={onKeyDown}
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:inline-flex sm:max-w-full sm:rounded-full sm:bg-surface-2 sm:p-1 sm:px-1"
      >
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              ref={(el) => { refs.current[t.key] = el; }}
              id={`${uid}-tab-${t.key}`}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={`${uid}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(t.key)}
              title={t.hint(channel)}
              className={cx(
                'inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[15px] transition-colors',
                on ? 'bg-ink font-semibold text-on-ink' : 'text-fg-2 hover:bg-hover hover:text-fg'
              )}
            >
              {t.label}
              <span className={cx('nums font-mono text-xs', on ? 'opacity-80' : 'text-fg-3')}>{counts[t.key]}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${tab}`}>
        <p className="mt-4 text-[15px] text-fg-2">{active.hint(channel)}</p>
        {tab === 'gaps' && result.evidence?.gaps && result.evidence.gaps.level !== 'solid' && result.evidence.gaps.level !== 'n/a' && (
          <p className="mt-1 text-[13px] text-warn-fg">{result.evidence.gaps.why}</p>
        )}

        <div className="mt-6 space-y-5">
          {tab === 'topics' &&
            (result.topics.length ? (
              result.topics.slice(0, limit).map((t, i) => <TopicCard key={t.label + i} topic={t} rank={i + 1} />)
            ) : (
              <EmptyState title="No clear topics">
                The videos in this window were too scattered to cluster. Try a broader niche or a longer window.
              </EmptyState>
            ))}

          {tab === 'gaps' &&
            (result.gaps.length ? (
              result.gaps.slice(0, limit).map((g, i) => (
                <GapCard key={`${result.runId}:${i}`} gap={g} rank={i + 1} runId={result.runId} index={i} canMake={canMake} />
              ))
            ) : (
              <EmptyState title="No unmet demand found">
                Every recurring request in these comments is already answered by a strong video &mdash; a sign
                this niche is well served. Try a narrower niche, a shorter window, or the looser
                &ldquo;Uncovered + weak&rdquo; gap setting.
              </EmptyState>
            ))}

          {tab === 'gaps' && result.resolvedGaps?.length > 0 && (
            <details className="group rounded-panel border border-dashed border-line-strong p-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-medium text-fg-2 hover:text-fg">
                <span>
                  {result.resolvedGaps.length} gap{result.resolvedGaps.length === 1 ? '' : 's'} no longer being asked since the last run
                </span>
                <ChevronDown aria-hidden className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
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
            </details>
          )}

          {tab === 'objections' &&
            (result.objections?.length ? (
              result.objections.slice(0, limit).map((o, i) => <ObjectionCard key={o.label + i} objection={o} rank={i + 1} />)
            ) : result.objections === undefined ? (
              <EmptyState title="Not computed for this report">
                This report was saved before complaints were extracted.{canRun && ' Refresh it to get them.'}
              </EmptyState>
            ) : (
              <EmptyState title="No recurring complaints">
                No criticism of the existing videos was raised by at least two separate
                commenters. Either the execution is landing, or the comments here are mostly
                praise and requests rather than critique.
              </EmptyState>
            ))}

          {tab === 'avoid' &&
            (result.avoid.length ? (
              result.avoid.slice(0, limit).map((a, i) => <AvoidCard key={a.label + i} item={a} rank={i + 1} />)
            ) : (
              <EmptyState title="Nothing to avoid">
                No angle in this set showed the high-views / low-engagement pattern. That is a good sign
                for the niche.
              </EmptyState>
            ))}
        </div>

        {total > PREVIEW && (
          <div className="mt-7 flex flex-col items-center gap-2">
            <p className="nums text-[13px] text-fg-3">{expanded[tab] ? `All ${total}` : `Showing the top ${PREVIEW} of ${total}`}</p>
            <button
              type="button"
              onClick={() => setExpanded((e) => ({ ...e, [tab]: !e[tab] }))}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-5 text-[15px] font-medium text-fg-2 transition-colors hover:bg-hover hover:text-fg"
            >
              {expanded[tab] ? 'Show fewer' : `Show all ${total}`}
              <ChevronDown aria-hidden className={cx('h-4 w-4 transition-transform', expanded[tab] && 'rotate-180')} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
