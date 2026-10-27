import { reportPathFor } from './urlState.js';

/**
 * Pure helpers behind the dashboard and the report header: turning what the
 * server returns (a run summary, a watch, a saved report, an error) into the
 * words the page shows. No React and no DOM, so the unit tests can run them.
 */

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const WINDOWS = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};

/** "Last 7 days". A custom range names its start date. */
export function windowLabel(window, customAfter) {
  if (window === 'custom') {
    const at = new Date(customAfter ?? '');
    if (Number.isNaN(at.getTime())) return 'Custom range';
    return `Since ${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return WINDOWS[window] ?? (window ? String(window) : '');
}

/** "Long-form and Shorts". `both` is the default and what an older run without the field means. */
export function formatLabel(contentType) {
  if (contentType === 'shorts') return 'Shorts';
  if (contentType === 'long') return 'Long-form';
  return 'Long-form and Shorts';
}

const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "today", "yesterday", "3 days ago", or a date once it is over a month old. Empty for a bad date. */
export function relativeDay(iso, now = new Date()) {
  const then = new Date(iso ?? '');
  if (Number.isNaN(then.getTime())) return '';
  const days = Math.round((dayStart(now) - dayStart(then)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 30) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** A run summary (server/src/lib/store.js summarize) as a dashboard row. */
export function toRunRow(summary, now = new Date()) {
  const channel = Boolean(summary.channelMode);
  const title = channel ? (summary.channelTitle || 'Channel report') : (summary.niche || 'Untitled report');
  return {
    id: summary.runId,
    href: reportPathFor(channel ? 'channel' : 'niche', summary.runId),
    title,
    channel,
    thin: Boolean(summary.thinPool),
    meta: [
      channel ? 'Channel' : null,
      windowLabel(summary.window),
      formatLabel(summary.contentType),
      relativeDay(summary.generatedAt, now),
    ].filter(Boolean),
    counts: `${plural(summary.gapsFound ?? 0, 'gap')} · ${plural(summary.topicsFound ?? 0, 'topic')}`,
  };
}

/** "Every 24 hours", "Every 7 days". */
export function intervalLabel(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return 'On a schedule';
  if (hours > 24 && hours % 24 === 0) return `Every ${hours / 24} days`;
  return `Every ${hours} hours`;
}

/**
 * A watch as a dashboard row. The digest ("2 new gaps since the last run") is
 * one request per watch, so the row says what the watch itself records: when
 * it last ran, and whether that failed.
 */
export function toWatchRow(watch, now = new Date()) {
  const every = intervalLabel(watch.intervalHours);
  let status = 'ok';
  let detail;
  if (watch.enabled === false) { status = 'paused'; detail = `${every} · paused`; }
  else if (watch.lastError) { status = 'failed'; detail = `${every} · last run failed`; }
  else if (watch.lastRunAt) detail = `${every} · last run ${relativeDay(watch.lastRunAt, now)}`;
  else { status = 'pending'; detail = `${every} · first run pending`; }
  const channel = Boolean(watch.input?.channelId);
  return {
    id: watch.id,
    label: watch.label || watch.input?.niche || watch.input?.channelId || 'Untitled watch',
    status,
    detail,
    error: watch.lastError ?? null,
    href: watch.lastRunId ? reportPathFor(channel ? 'channel' : 'niche', watch.lastRunId) : null,
  };
}

const timeOf = (d, locale) => d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

/** "at 6:00 PM", or "tomorrow at 6:00 PM" / "Fri at 6:00 PM" when the reset is not today. Empty for a bad date. */
export function resetTimeLabel(iso, now = new Date(), locale) {
  const at = new Date(iso ?? '');
  if (Number.isNaN(at.getTime())) return '';
  const days = Math.round((dayStart(at) - dayStart(now)) / 86_400_000);
  if (days <= 0) return `at ${timeOf(at, locale)}`;
  if (days === 1) return `tomorrow at ${timeOf(at, locale)}`;
  return `${at.toLocaleDateString(locale, { weekday: 'short' })} at ${timeOf(at, locale)}`;
}

/** The meta line under a report's title: window, format, videos, comments read. */
export function reportMeta(result) {
  const q = result?.query ?? {};
  const s = result?.stats ?? {};
  return [
    windowLabel(q.window, q.customAfter),
    formatLabel(q.contentType),
    s.videosAnalyzed != null ? plural(s.videosAnalyzed, 'video') : null,
    s.commentsAnalyzed != null ? `${s.commentsAnalyzed.toLocaleString('en-US')} ${s.commentsAnalyzed === 1 ? 'comment' : 'comments'} read` : null,
  ].filter(Boolean);
}

/** What a report is called: the channel's title in channel mode, else the niche. */
export function reportName(result) {
  if (result?.channel?.title) return result.channel.title;
  if (result?.query?.niche) return result.query.niche;
  return result?.channelMode ? 'Channel report' : 'Report';
}

/**
 * Turns a failed analysis into what the page should say. `kind` picks the
 * recovery: 'daily' (allowance spent, shows the reset), 'verify' (email not
 * confirmed), 'auth' (the page sends them to log in), 'quota' (the site's
 * YouTube budget), anything else 'generic' with the server's own message.
 */
export function describeRunError(err, { limit, now = new Date(), locale } = {}) {
  const code = err?.code;
  if (code === 'DAILY_LIMIT') {
    const reset = resetTimeLabel(err.resetsAt, now, locale);
    const n = Number.isFinite(limit) && limit > 0 ? ` ${plural(limit, 'analysis', 'analyses')}` : ' analyses';
    return {
      kind: 'daily',
      tone: 'warn',
      title: `You’ve used your${n} for today.`,
      message: `${reset ? `They reset ${reset}.` : 'They reset at midnight Pacific.'} Opening a saved or cached report doesn’t use any.`,
    };
  }
  if (code === 'EMAIL_NOT_VERIFIED') {
    return {
      kind: 'verify',
      tone: 'warn',
      title: 'Verify your email to run analyses',
      message: 'We sent a link when you signed up. Open it, then come back and press Find gaps.',
    };
  }
  if (code === 'AUTH_REQUIRED' || err?.status === 401) {
    return { kind: 'auth', tone: 'info', title: 'Log in to continue', message: 'Your session ended. Log in and your search will be waiting.' };
  }
  if (code === 'QUOTA_EXHAUSTED') {
    return {
      kind: 'quota',
      tone: 'info',
      title: 'Gapstronaut has used its YouTube allowance for today',
      message: 'New analyses can’t run until it resets, around midnight Pacific. Opening saved reports still works, and nothing was taken from your own allowance.',
    };
  }
  return { kind: 'generic', tone: 'bad', title: 'Analysis failed', message: err?.message || 'Something went wrong. Try again.' };
}

/** A saved report that would not open. Expired and missing are calm facts, not faults. */
export function describeLoadError(err) {
  if (err?.code === 'RUN_EXPIRED') return { kind: 'gone', tone: 'info', title: 'This report has expired', message: err.message };
  if (err?.code === 'RUN_NOT_FOUND' || err?.status === 404) {
    return { kind: 'gone', tone: 'info', title: 'We could not find that report', message: err.message || 'It may have been removed, or the link is mistyped.' };
  }
  return { kind: 'load', tone: 'bad', title: 'Could not load that report', message: err?.message || 'Try again in a moment.' };
}
