import { median } from './outlier.js';

// How far our own numbers back an "avoid" entry the model proposed. The old
// rule was `confirmed = flagged > 0`, so 1 flagged video out of 7 read "stats
// confirm", and nothing noticed when the numbers said the opposite: in saved
// reports, 11 avoid entries had median engagement ABOVE the run's median --
// "Daily Nifty crash predictions" at 54% against 3.65%.

// Below this many views across an entry's videos, an engagement percentage is
// too noisy to contradict anything (11 views and 6 likes is "54%").
const MIN_VIEWS_TO_CONTRADICT = 500;

/**
 * @param members   the entry's videos (with signals.engagementRate, views, lowEngagementOutlier)
 * @param runVideos every scored video in the run, for the median to compare against
 * @returns level: 'confirmed' | 'partly' | 'model-only' | 'contradicted', plus the
 *          numbers behind it, and `drop` when nothing at all supports the entry.
 */
export function avoidVerdict(members, runVideos) {
  const flagged = members.filter((v) => v.lowEngagementOutlier).length;
  const rate = (v) => v.signals?.engagementRate ?? v.engagementRate ?? 0;
  const entryMedian = median(members.map(rate));
  const runMedian = median(runVideos.map(rate));
  const totalViews = members.reduce((n, v) => n + (v.views ?? 0), 0);

  let level;
  if (entryMedian > runMedian && totalViews >= MIN_VIEWS_TO_CONTRADICT && flagged * 2 < members.length) level = 'contradicted';
  else if (flagged > 0 && flagged * 2 >= members.length) level = 'confirmed';
  else if (flagged > 0) level = 'partly';
  else level = 'model-only';

  return {
    level,
    flaggedCount: flagged,
    medianEngagementRate: entryMedian,
    runMedianEngagementRate: runMedian,
    totalViews,
    // One video, not flagged by our numbers: the model's word alone, about a
    // single upload. Not enough to tell a creator to stay away from an angle.
    drop: members.length === 1 && flagged === 0,
  };
}

/** Confirmed first, contradicted last; within a level, more flagged videos first. */
export const AVOID_ORDER = { confirmed: 0, partly: 1, 'model-only': 2, contradicted: 3 };
