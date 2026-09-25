import { useCallback, useEffect, useState } from 'react';
import { getWatches, createWatch, updateWatch, deleteWatch, getDigest } from '../lib/api.js';
import { Badge } from './Bits.jsx';

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

  const load = useCallback(() => {
    getWatches().then(setState).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const add = async (hours) => {
    setError(null);
    try {
      await createWatch(currentQuery, hours);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggle = async (w) => {
    setBusyId(w.id);
    try { await updateWatch(w.id, { enabled: !w.enabled }); load(); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  const remove = async (w) => {
    setBusyId(w.id);
    try { await deleteWatch(w.id); load(); }
    catch (e) { setError(e.message); }
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
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-ink-500 underline-offset-4 hover:underline dark:text-ink-400"
      >
        {open ? 'Hide watches' : `Watches${watches.length ? ` (${watches.length})` : ''}`}
      </button>

      {open && (
        <div className="rise mt-2 rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
          <div className="border-b border-ink-100 px-4 py-3 dark:border-ink-800">
            <p className="text-sm text-ink-600 dark:text-ink-300">
              A watch re-runs a query on a schedule, so gaps can be marked <em>recurring</em> or
              <em> closed</em>. Repeat demand is the strongest buy signal here, and it only becomes
              visible across runs.
            </p>
            {state && !state.schedulerEnabled && (
              <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                The scheduler is disabled on this server, so watches will not fire until it is turned on.
              </p>
            )}
            {currentQuery && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Watch this query
                </span>
                {INTERVALS.filter((i) => !state || i.hours >= state.minIntervalHours).map((i) => (
                  <button
                    key={i.hours}
                    type="button"
                    disabled={full}
                    onClick={() => add(i.hours)}
                    title={full ? 'Watch limit reached — delete one first.' : `Re-run this query every ${i.hours} hours. Each run spends YouTube quota.`}
                    className="rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-100 disabled:opacity-40 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className="px-4 py-2 text-sm text-rose-700 dark:text-rose-400">{error}</p>}

          {watches.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-400">
              No watches yet. Run an analysis, then save it here to start building a recurrence baseline.
            </p>
          )}

          {watches.map((w) => {
            const d = digests[w.id];
            return (
              <div key={w.id} className="border-b border-ink-100 px-4 py-3 last:border-0 dark:border-ink-800">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800 dark:text-ink-100">
                    {w.label}
                  </span>
                  {!w.enabled && <Badge tone="neutral">paused</Badge>}
                  {w.lastError && <Badge tone="bad" title={w.lastError}>last run failed</Badge>}
                  <span className="nums text-xs text-ink-400">
                    every {w.intervalHours >= 24 ? `${Math.round(w.intervalHours / 24)}d` : `${w.intervalHours}h`}
                    {' · '}
                    {w.runCount} run{w.runCount === 1 ? '' : 's'}
                    {' · '}
                    last {when(w.lastRunAt)}
                    {w.enabled && `, next ${when(w.nextRunAt, { future: true })}`}
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    {w.lastRunId && (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpenRun(w.lastRunId)}
                          className="rounded border border-ink-200 px-2 py-0.5 text-xs text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => showDigest(w)}
                          className="rounded border border-ink-200 px-2 py-0.5 text-xs text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
                        >
                          {d ? 'Hide' : 'Changes'}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={busyId === w.id}
                      onClick={() => toggle(w)}
                      className="rounded border border-ink-200 px-2 py-0.5 text-xs text-ink-600 hover:bg-ink-100 disabled:opacity-40 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
                    >
                      {w.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === w.id}
                      onClick={() => remove(w)}
                      className="rounded border border-ink-200 px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-40 dark:border-ink-700 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      Delete
                    </button>
                  </span>
                </div>

                {d && !d.empty && (
                  <div className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs dark:bg-ink-800/60">
                    {d.runsCompared === 0 ? (
                      <p className="text-ink-500 dark:text-ink-400">
                        Only one run stored so far — nothing to compare against yet.
                      </p>
                    ) : (
                      <DigestBody d={d} />
                    )}
                  </div>
                )}
                {d?.empty && (
                  <p className="mt-2 text-xs text-ink-400">This watch has not completed a run yet.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DigestBody({ d }) {
  const groups = [
    { key: 'provenGaps', label: 'Proven — asked for 3+ runs running', tone: 'text-emerald-700 dark:text-emerald-400' },
    { key: 'newGaps', label: 'New since last run', tone: 'text-sky-700 dark:text-sky-400' },
    { key: 'risingGaps', label: 'Rising demand', tone: 'text-rose-700 dark:text-rose-400' },
    { key: 'closedGaps', label: 'Closed — someone probably filmed it', tone: 'text-ink-500 dark:text-ink-400' },
  ];

  const any = groups.some((g) => (d[g.key] ?? []).length);
  if (!any) return <p className="text-ink-500 dark:text-ink-400">Nothing changed since the previous run.</p>;

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const items = d[g.key] ?? [];
        if (!items.length) return null;
        return (
          <div key={g.key}>
            <p className={`font-semibold ${g.tone}`}>{g.label} ({items.length})</p>
            <ul className="mt-0.5 space-y-0.5">
              {items.slice(0, 4).map((it, i) => (
                <li key={i} className={`text-ink-700 dark:text-ink-200 ${g.key === 'closedGaps' ? 'line-through decoration-ink-400' : ''}`}>
                  {it.question}
                  {it.timesSeen && <span className="nums ml-1.5 text-ink-400 no-underline">×{it.timesSeen}</span>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
