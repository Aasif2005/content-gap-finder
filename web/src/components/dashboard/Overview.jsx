import { useEffect, useState } from 'react';
import { ArrowRight, Compass, Layers, MessageSquareQuote, Radar, Target, Trash2 } from 'lucide-react';
import { Link } from '../../lib/router.jsx';
import { Button, EvidenceMark, Panel, Skeleton } from '../ui/index.js';
import { getRun } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useRemoveReport } from '../../lib/removeReport.jsx';
import { compact } from '../../lib/format.js';
import { WATCHES } from '../../lib/features.js';
import { cx } from '../../lib/cx.js';

/** Four numbers about the reports still kept, summed from the run list. Zeros on a new account. */
export function StatStrip({ runs }) {
  const niches = new Set(runs.filter((r) => !r.channelMode).map((r) => (r.niche ?? '').toLowerCase()).filter(Boolean));
  const stats = [
    { label: 'Reports saved', value: runs.length },
    { label: 'Niches explored', value: niches.size },
    { label: 'Gaps found', value: runs.reduce((n, r) => n + (r.gapsFound ?? 0), 0) },
    { label: 'Videos analyzed', value: runs.reduce((n, r) => n + (r.videosAnalyzed ?? 0), 0) },
  ];
  return (
    <section aria-label="Your workspace" className="mt-12">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-fg-3">Your workspace</h2>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col-reverse bg-surface px-6 py-6">
            <dt className="mt-2.5 text-sm text-fg-2">{s.label}</dt>
            <dd className="nums text-[40px] font-semibold leading-none tracking-[-0.03em]">{compact(s.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 text-[13px] text-fg-3">Counted from the reports you still have; they are kept for 30 days.</p>
    </section>
  );
}

const ENTRIES = [
  {
    href: '/explore',
    icon: Compass,
    title: 'Explore a niche',
    body: 'What viewers keep asking for that nobody has made yet, with the comments to prove it.',
    cta: 'Explore niche',
  },
  {
    href: '/channel',
    icon: Radar,
    title: 'Analyze a channel',
    body: 'Which of its videos work, and what its own viewers want next.',
    cta: 'Analyze channel',
  },
];

export function EntryCards() {
  return (
    <section aria-label="Start an analysis" className="mt-12 grid gap-5 md:grid-cols-2">
      {ENTRIES.map(({ href, icon: Icon, title, body, cta }) => (
        <Link
          key={href}
          href={href}
          className="group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-panel border border-line bg-surface p-7 shadow-panel transition-colors hover:border-line-strong sm:p-8"
        >
          <div className="relative">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-focus">
              <Icon aria-hidden className="h-5 w-5" />
            </span>
            <h3 className="mt-5 text-[26px] font-semibold tracking-[-0.02em]">{title}</h3>
            <p className="mt-2 max-w-[42ch] text-[16px] leading-relaxed text-fg-2">{body}</p>
          </div>
          <span className="relative mt-6 inline-flex items-center gap-2 border-t border-line pt-4 text-[15px] font-semibold">
            {cta}
            <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
    </section>
  );
}

// The newest report's top request, kept per account so a returning visit paints it at once and a
// failed refresh keeps showing it. Cleared on sign-out together with `gs:runs` (lib/recentRuns.jsx).
const TOP_KEY = 'gs:top';
const readTop = (uid, id) => {
  try {
    const hit = JSON.parse(localStorage.getItem(TOP_KEY) || 'null');
    return hit && hit.uid === uid && hit.id === id && hit.gap ? hit.gap : null;
  } catch { return null; }
};
const writeTop = (uid, id, gap) => { try { localStorage.setItem(TOP_KEY, JSON.stringify({ uid, id, gap })); } catch { /* private mode, or full */ } };

const RETRY_MS = 1500;

/**
 * The newest report as a feature: its top unmet request (first gap and first comment), read from the saved run.
 *
 * A request that failed used to be shown as "this report found no open request", right next to
 * "4 gaps". Now a failure is never an empty report: it retries once, then says it could not load
 * and offers Try again. "No open request" shows only when the report itself has no gaps.
 */
export function LatestReport({ row, summary }) {
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid ?? null;
  const requestRemove = useRemoveReport();
  const expected = summary.gapsFound ?? 0;
  // status: loading | ready | error. A saved copy of this report's top request counts as ready.
  const [top, setTop] = useState(() => {
    const saved = uid ? readTop(uid, row.id) : null;
    return saved ? { status: 'ready', gap: saved } : { status: 'loading', gap: null };
  });
  const [attempt, setAttempt] = useState(0); // bumped by Try again

  useEffect(() => {
    // Wait for the sign-in: a request sent before it is restored has no valid token and fails.
    if (authLoading || !uid) return undefined;
    let live = true;
    let timer;
    const saved = readTop(uid, row.id);
    setTop((t) => (saved ? { status: 'ready', gap: saved } : t.status === 'error' || t.gap === null ? { status: 'loading', gap: null } : t));

    const fetchTop = (retried) => {
      getRun(row.id).then(
        ({ result }) => {
          if (!live) return;
          const gap = result?.gaps?.[0] ?? null;
          if (gap) { writeTop(uid, row.id, gap); setTop({ status: 'ready', gap }); return; }
          // The list says there are gaps but the report has none: the two disagree, so do not claim "none".
          if (expected > 0 && !retried) { timer = setTimeout(() => fetchTop(true), RETRY_MS); return; }
          setTop((t) => (expected > 0 && !t.gap ? { status: 'error', gap: null } : { status: 'ready', gap: t.gap }));
        },
        () => {
          if (!live) return;
          if (!retried) { timer = setTimeout(() => fetchTop(true), RETRY_MS); return; }
          // Keep a saved copy on screen; only a first-ever failure shows the error.
          setTop((t) => (t.gap ? t : { status: 'error', gap: null }));
        },
      );
    };
    fetchTop(false);
    return () => { live = false; clearTimeout(timer); };
  }, [row.id, uid, authLoading, attempt, expected]);

  const quote = top.gap?.evidence?.[0]?.text;
  return (
    <section aria-label="Latest report" className="mt-12">
      <Panel padding="none" className="overflow-hidden">
        <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          <div className="flex min-w-0 flex-col">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-fg-3">Latest report</p>
            <h2 className="mt-3 break-words text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[44px]">{row.title}</h2>
            <p className="mt-3 text-[15px] text-fg-2">{row.meta.join(' · ')}</p>
            <p className="nums mt-5 text-[15px] text-fg-2">
              {summary.gapsFound ?? 0} gaps · {summary.topicsFound ?? 0} topics · {summary.objectionsFound ?? 0} complaints
            </p>
            <div className="mt-auto pt-8">
              <div className="flex flex-wrap items-center gap-3">
                <Button href={row.href}>Open report <ArrowRight aria-hidden className="h-4 w-4" /></Button>
                <Button variant="ghost" onClick={() => requestRemove({ runId: row.id, title: row.title })}>
                  <Trash2 aria-hidden className="h-4 w-4" /> Remove
                </Button>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-[1.5rem] bg-surface-2 p-6 sm:p-7">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-fg-3">Top unmet request</p>
            {top.status === 'loading' ? (
              <div role="status" aria-label="Loading the top request" className="mt-4 space-y-3">
                <Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-4/5" /><Skeleton className="h-4 w-2/5" />
              </div>
            ) : top.gap ? (
              <>
                <p className="mt-3 text-[22px] font-semibold leading-snug tracking-[-0.015em] [text-wrap:balance]">{top.gap.question}</p>
                {quote && (
                  <p className="mt-5 text-[16px] leading-[1.55]">
                    <EvidenceMark>&ldquo;{quote.length > 200 ? `${quote.slice(0, 190).replace(/\s+\S*$/, '')}…` : quote}&rdquo;</EvidenceMark>
                  </p>
                )}
                <p className="nums mt-4 text-[13px] text-fg-3">
                  {top.gap.evidenceCount} comments across {top.gap.distinctVideos} video{top.gap.distinctVideos === 1 ? '' : 's'}
                </p>
              </>
            ) : top.status === 'error' ? (
              <div className="mt-3">
                <p className="text-[16px] leading-relaxed text-fg-2">Could not load the top request.</p>
                <Button variant="secondary" className="mt-4" onClick={() => { setTop({ status: 'loading', gap: null }); setAttempt((n) => n + 1); }}>
                  Try again
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-[16px] leading-relaxed text-fg-2">This report found no open request. Open it to see what is trending.</p>
            )}
          </div>
        </div>
      </Panel>
    </section>
  );
}

const TIPS = [
  { icon: Target, title: 'Be specific', body: '“Cast iron restoration” finds sharper gaps than “cooking”: every comment is about the same subject.' },
  { icon: MessageSquareQuote, title: 'Trust the comments', body: 'Each gap links to the viewer words behind it. Check them before you commit to a video.' },
  { icon: Layers, title: 'Watch what recurs', body: 'A watch re-runs a search on a schedule, so you can see which gaps keep coming back.' },
];

export function Tips() {
  const tips = TIPS.filter((t) => WATCHES || t.title !== 'Watch what recurs');
  return (
    <section aria-label="How to get sharper gaps" className="mt-14">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-fg-3">How to get sharper gaps</h2>
      <ul className={cx('mt-5 grid gap-x-10 gap-y-8', tips.length > 2 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
        {tips.map(({ icon: Icon, title, body }) => (
          <li key={title} className="border-t border-line pt-5">
            <Icon aria-hidden className="h-5 w-5 text-focus" />
            <h3 className="mt-3 text-[17px] font-semibold">{title}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-fg-2">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
