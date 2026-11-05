import { useCallback, useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getWatches, createWatch, updateWatch, deleteWatch, getDigest } from '../lib/api.js';
import { useConsent } from '../lib/consent.jsx';
import { cx } from '../lib/cx.js';
import { Badge } from './Bits.jsx';
import { Button } from './ui/Button.jsx';
import { Panel } from './ui/Panel.jsx';
import { Collapse } from './ui/Disclosure.jsx';
import { publicMessage } from '../lib/runRows.js';

const INTERVALS = [
  { hours: 24, label: 'Daily' },
  { hours: 24 * 7, label: 'Weekly' },
  { hours: 24 * 14, label: 'Fortnightly' },
];

const when = (iso, { future = false } = {}) => {
  if (!iso) return 'never';
  const diffMin = (new Date(iso).getTime() - Date.now()) / 60000;
  const mins = Math.abs(diffMin);
  const unit = mins < 60 ? `${Math.round(mins)}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
  return future ? `in ${unit}` : `${unit} ago`;
};

// Row actions: quiet text buttons at the 44px target size (the kit's ghost look).
const ROW_BTN =
  'inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45';
const ROW_BTN_NEUTRAL = 'text-fg-2 hover:bg-hover hover:text-fg';
const ROW_BTN_DANGER = 'text-bad-fg hover:bg-bad-bg';

/**
 * Saved watches: subjects that re-analyse themselves on an interval.
 *
 * This is what makes gap recurrence work at all. Recurrence compares a run
 * against earlier runs of the same subject, so on a tool nobody remembers to
 * re-open, nothing is ever recurring and the most valuable signal in the product
 * stays permanently unavailable. A watch is the thing that builds the baseline.
 */
export function WatchPanel({ currentQuery, onOpenRun, mode = 'niche' }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [digests, setDigests] = useState({});
  const [busyId, setBusyId] = useState(null);
  const panelId = useId();
  const ensureConsent = useConsent();

  const load = useCallback(() => {
    getWatches().then(setState).catch((e) => setError(publicMessage(e.message, 'Something went wrong. Try again in a minute.')));
  }, []);

  // Loaded on mount (so the count shows before the panel is opened), again
  // when a new report lands (a run may have been a watch's), and every minute
  // while open (scheduled runs fire without anyone clicking).
  useEffect(() => { load(); }, [load, currentQuery]);
  useEffect(() => {
    if (!open) return undefined;
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [open, load]);

  const add = async (hours) => {
    setError(null);
    // A watch reads YouTube data on a schedule, and a shared report gets here without a run.
    if (!(await ensureConsent())) return;
    try {
      await createWatch(currentQuery, hours);
      load();
    } catch (e) {
      setError(publicMessage(e.message, 'Something went wrong. Try again in a minute.'));
    }
  };

  const toggle = async (w) => {
    setBusyId(w.id);
    try { await updateWatch(w.id, { enabled: !w.enabled }); load(); }
    catch (e) { setError(publicMessage(e.message, 'Something went wrong. Try again in a minute.')); }
    finally { setBusyId(null); }
  };

  const remove = async (w) => {
    setBusyId(w.id);
    try { await deleteWatch(w.id); load(); }
    catch (e) { setError(publicMessage(e.message, 'Something went wrong. Try again in a minute.')); }
    finally { setBusyId(null); }
  };

  const showDigest = async (w) => {
    if (digests[w.id]) return setDigests((d) => ({ ...d, [w.id]: null }));
    try {
      const { digest } = await getDigest(w.id);
      setDigests((d) => ({ ...d, [w.id]: digest }));
    } catch {
      setDigests((d) => ({ ...d, [w.id]: { empty: true } }));
    }
  };

  // Watches carry the full query they re-run, so the mode split is a client-side
  // filter here rather than a separate endpoint -- one watch list, two views of it.
  const watches = (state?.watches ?? []).filter((w) =>
    mode === 'channel' ? Boolean(w.input?.channelId) : !w.input?.channelId
  );
  const full = state && (state.watches?.length ?? 0) >= state.maxWatches;

  return (
    <div className={cx('min-w-0', open && 'basis-full')}>
      <Button
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="-ml-2"
      >
        {open ? 'Hide watches' : `Watches${watches.length ? ` (${watches.length})` : ''}`}
        <ChevronDown aria-hidden className={cx('h-4 w-4 transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]', open && 'rotate-180')} />
      </Button>

      <Collapse open={open}>
        <Panel id={panelId} padding="none" className="mt-2 overflow-hidden">
          <div className="border-b border-line-soft px-5 py-4">
            <p className="max-w-[68ch] text-[15px] leading-relaxed text-fg-2">
              A watch re-runs a query on a schedule, so gaps can be marked <em>recurring</em> or
              <em> closed</em>. Repeat demand is the strongest buy signal here, and it only becomes
              visible across runs.
            </p>
            {state && !state.schedulerEnabled && (
              <p role="status" className="mt-2 text-sm font-medium text-warn-fg">
                The scheduler is disabled on this server, so watches will not fire until it is turned on.
              </p>
            )}
            {currentQuery && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm font-medium text-fg">Watch this query</span>
                {INTERVALS.filter((i) => !state || i.hours >= state.minIntervalHours).map((i) => (
                  <Button
                    key={i.hours}
                    variant="secondary"
                    disabled={full}
                    onClick={() => add(i.hours)}
                    title={full ? 'Watch limit reached — delete one first.' : `Re-run this query every ${i.hours} hours. Each run counts toward your daily allowance.`}
                  >
                    {i.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {error && <p role="alert" className="border-b border-line-soft px-5 py-3 text-[15px] text-bad-fg">{error}</p>}

          {watches.length === 0 && (
            <p className="px-5 py-4 text-[15px] leading-relaxed text-fg-2">
              No watches yet. Run an analysis, then save it here to start building a recurrence baseline.
            </p>
          )}

          {watches.map((w) => {
            const d = digests[w.id];
            return (
              <div key={w.id} className="border-b border-line-soft px-5 py-3 last:border-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="min-w-0 flex-1 basis-48 truncate text-base font-semibold text-fg">
                    {w.label}
                  </span>
                  {!w.enabled && <Badge tone="neutral">paused</Badge>}
                  {w.lastError && <Badge tone="bad" title={w.lastError}>last run failed</Badge>}
                  <span className="nums font-mono text-[13px] text-fg-3">
                    every {w.intervalHours >= 24 ? `${Math.round(w.intervalHours / 24)}d` : `${w.intervalHours}h`}
                    {' · '}
                    {w.runCount} run{w.runCount === 1 ? '' : 's'}
                    {' · '}
                    last {when(w.lastRunAt)}
                    {w.enabled && `, next ${when(w.nextRunAt, { future: true })}`}
                  </span>
                  <span className="-mx-1 flex shrink-0 flex-wrap">
                    {w.lastRunId && (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpenRun(w.lastRunId)}
                          className={cx(ROW_BTN, ROW_BTN_NEUTRAL)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => showDigest(w)}
                          aria-expanded={Boolean(d)}
                          className={cx(ROW_BTN, ROW_BTN_NEUTRAL)}
                        >
                          {d ? 'Hide' : 'Changes'}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={busyId === w.id}
                      onClick={() => toggle(w)}
                      className={cx(ROW_BTN, ROW_BTN_NEUTRAL)}
                    >
                      {w.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === w.id}
                      onClick={() => remove(w)}
                      className={cx(ROW_BTN, ROW_BTN_DANGER)}
                    >
                      Delete
                    </button>
                  </span>
                </div>

                {d && !d.empty && (
                  <div className="mb-2 mt-1 rounded-control bg-surface-2 px-4 py-3 text-sm">
                    {d.runsCompared === 0 ? (
                      <p className="text-fg-2">
                        Only one run stored so far — nothing to compare against yet.
                      </p>
                    ) : (
                      <DigestBody d={d} />
                    )}
                  </div>
                )}
                {d?.empty && (
                  <p className="mb-1 mt-1 text-sm text-fg-3">This watch has not completed a run yet.</p>
                )}
              </div>
            );
          })}
        </Panel>
      </Collapse>
    </div>
  );
}

function DigestBody({ d }) {
  const groups = [
    { key: 'provenGaps', label: 'Proven — asked for 3+ runs running', tone: 'text-good-fg' },
    { key: 'newGaps', label: 'New since last run', tone: 'text-info-fg' },
    { key: 'risingGaps', label: 'Rising demand', tone: 'text-info-fg' },
    { key: 'closedGaps', label: 'Closed — someone probably filmed it', tone: 'text-fg-3' },
  ];

  const any = groups.some((g) => (d[g.key] ?? []).length);
  if (!any) return <p className="text-fg-2">Nothing changed since the previous run.</p>;

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const items = d[g.key] ?? [];
        if (!items.length) return null;
        return (
          <div key={g.key}>
            <p className={cx('font-semibold', g.tone)}>{g.label} <span className="nums font-mono font-normal">({items.length})</span></p>
            <ul className="mt-1 space-y-1">
              {items.slice(0, 4).map((it, i) => (
                <li key={i} className={cx('text-fg', g.key === 'closedGaps' && 'text-fg-2 line-through decoration-fg-3')}>
                  {it.question}
                  {it.timesSeen && <span className="nums ml-2 font-mono text-xs text-fg-3 no-underline">×{it.timesSeen}</span>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
