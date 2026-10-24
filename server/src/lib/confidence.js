import { config } from '../config.js';

// How much to trust each output, judged by what THAT output computes.
//
// One flat rule ("under 12 videos is weak") was the same number whether the thing
// being computed was a ranking, a gap list or a recurrence streak. It flagged a
// channel's complete 7-video week as weak evidence when 7 of 7 is the whole
// population, not a sample, and it said nothing about the thing that actually
// limits gap quality, which is how many comments were read.
//
// Levels: solid | small | thin | n/a. `small` is real but coarse -- say so, don't
// alarm. `thin` is the only level that earns a banner.

const { evidence: cfg } = config;

const level = (lv, n, needed, why) => ({ level: lv, n, needed, why });

/** Points a single video moves a ranked 0-100 score by, in a set of n. */
export const rankSwing = (n) => (n > 1 ? Math.round(100 / (n - 1)) : 100);

function assessHeat({ channelMode, scored, distinctChannels, population, uploadsTruncated }) {
  const swing = rankSwing(scored);
  const moves = `One video moves a ranked score by about ${swing} points.`;

  // A channel's uploads in a window are the whole population (unless the walk was
  // cut short): ranking 7 of 7 is complete, just coarse. Absolute size is not the
  // question there; coverage is.
  if (channelMode && !uploadsTruncated) {
    if (scored >= cfg.heatMinVideos) return level('solid', scored, cfg.heatMinVideos, `${scored} uploads, the channel's complete output for this window.`);
    if (scored >= 3) {
      return level('small', scored, cfg.heatMinVideos,
        `${scored} of ${population} eligible uploads: the channel's complete output for this window, so this is small but not a sample. ${moves}`);
    }
    return level('thin', scored, 3, `Only ${scored} upload${scored === 1 ? '' : 's'} in this window: too few to rank against each other.`);
  }

  if (scored < cfg.heatFloor || distinctChannels < 2) {
    return level('thin', scored, cfg.heatMinVideos, `${scored} videos from ${distinctChannels} channel${distinctChannels === 1 ? '' : 's'}. ${moves}`);
  }
  if (scored < cfg.heatMinVideos || (!channelMode && distinctChannels < cfg.heatMinChannels)) {
    return level('small', scored, cfg.heatMinVideos,
      `${scored} videos from ${distinctChannels} channels (solid needs ${cfg.heatMinVideos}${channelMode ? '' : ` from ${cfg.heatMinChannels}+ channels`}). ${moves}`);
  }
  return level('solid', scored, cfg.heatMinVideos, `${scored} videos from ${distinctChannels} channels.`);
}

function assessGaps({ commentVideos, commentsAnalysed }) {
  const have = `${commentsAnalysed} comments from ${commentVideos} video${commentVideos === 1 ? '' : 's'}`;
  if (commentsAnalysed === 0) return level('thin', 0, cfg.gapMinComments, 'No comments were available, so there is nothing to mine.');
  if (commentVideos >= cfg.gapMinVideos && commentsAnalysed >= cfg.gapMinComments) return level('solid', commentsAnalysed, cfg.gapMinComments, `${have}.`);
  if (commentVideos >= cfg.gapFloorVideos && commentsAnalysed >= cfg.gapFloorComments) {
    return level('small', commentsAnalysed, cfg.gapMinComments,
      `${have}: enough to see repeated asks, not enough to rank them against each other (solid needs ${cfg.gapMinComments}+ from ${cfg.gapMinVideos}+ videos).`);
  }
  return level('thin', commentsAnalysed, cfg.gapMinComments, `${have}: a request seen here may just be one person's.`);
}

function assessOutliers(outlierChannels) {
  if (outlierChannels == null) return level('n/a', 0, cfg.outlierMinChannels, 'Not measured for this run.');
  if (outlierChannels >= cfg.outlierMinChannels) return level('solid', outlierChannels, cfg.outlierMinChannels, `${outlierChannels} channels had enough history for a median.`);
  if (outlierChannels >= 3) return level('small', outlierChannels, cfg.outlierMinChannels, `Only ${outlierChannels} channels had enough history for a median.`);
  return level('thin', outlierChannels, cfg.outlierMinChannels, `Only ${outlierChannels} channel${outlierChannels === 1 ? '' : 's'} had enough history for a median.`);
}

function assessRecurrence(runsCompared) {
  if (!runsCompared) return level('n/a', 0, 2, 'The first run of this subject: nothing to compare against yet.');
  if (runsCompared >= 2) return level('solid', runsCompared, 2, `Compared against ${runsCompared} earlier runs.`);
  return level('small', runsCompared, 2, 'Compared against one earlier run: a streak needs at least two.');
}

/** Per card: a topic resting on one video reads exactly like one resting on ten unless this says so. */
export function assessTopic(topic, { channelMode = false } = {}) {
  const videos = topic.videos?.length ?? 0;
  if (videos < 2) return level('thin', videos, 2, 'Rests on a single video.');
  if (!channelMode && (topic.breadth ?? 0) < 2) return level('small', videos, 2, 'Every video is from one channel.');
  return level('solid', videos, 2, `${videos} videos.`);
}

export function assessEvidence({
  channelMode = false, scored, distinctChannels, population = scored, uploadsTruncated = false,
  topics = [], commentVideos = 0, commentsAnalysed = 0, outlierChannels = null, runsCompared = 0,
}) {
  const thinTopics = topics.filter((t) => assessTopic(t, { channelMode }).level === 'thin').length;
  return {
    heat: assessHeat({ channelMode, scored, distinctChannels, population, uploadsTruncated }),
    topics: !topics.length
      ? level('n/a', 0, 1, 'No topics.')
      : thinTopics
        ? level('small', topics.length - thinTopics, topics.length, `${thinTopics} of ${topics.length} topics rest on a single video.`)
        : level('solid', topics.length, topics.length, `${topics.length} topic${topics.length === 1 ? '' : 's'}, each backed by 2+ videos.`),
    gaps: assessGaps({ commentVideos, commentsAnalysed }),
    outliers: channelMode ? level('n/a', 0, cfg.outlierMinChannels, 'Not applicable: every video is one channel\'s own.') : assessOutliers(outlierChannels),
    recurrence: assessRecurrence(runsCompared),
  };
}

/**
 * Why the set is the size it is, from the exclusion ledger: filters you set, or
 * simply what exists. The remedy differs completely -- dropping a filter does
 * nothing for a channel that published four videos this week.
 */
export function explainShortfall({ funnel, byReason, channelMode, uploadsTruncated = false }) {
  const found = funnel.find((f) => f.key === 'found')?.count ?? 0;
  const scored = funnel.find((f) => f.key === 'scored')?.count ?? 0;
  const byFilter = byReason.filter((r) => r.kind === 'excluded' && r.filter);
  const filtered = byFilter.reduce((n, r) => n + r.count, 0);

  if (found && filtered / found >= cfg.filterBlameShare) {
    const parts = byFilter.map((r) => `${r.label}: ${r.count}`).join('; ');
    return { cause: 'filters', detail: `Your filters removed ${filtered} of ${found} (${parts}).` };
  }
  if (channelMode) {
    return uploadsTruncated
      ? { cause: 'truncated', detail: 'The channel published more uploads than were walked; only the most recent were analysed.' }
      : { cause: 'cadence', detail: `The channel published ${found} upload${found === 1 ? '' : 's'} in this window${found === scored ? ', and all of them were scored' : ''}.` };
  }
  return { cause: 'niche', detail: `Only ${found} videos matched this niche in this window.` };
}

/** What to try, in the order the cause says will help. Strings for the warning and audit log; the UI builds buttons from the query. */
export function suggestionsFor(cause, { window, relevanceLanguage, regionCode, minViews, deepScan, contentType, channelMode }) {
  const widen = window !== '90d' && window !== 'custom' ? 'widen the time window' : null;
  const filters = [
    contentType && contentType !== 'both' ? `include both formats (now ${contentType === 'long' ? 'long-form' : 'Shorts'} only)` : null,
    relevanceLanguage ? `drop the "${relevanceLanguage}" language filter` : null,
    regionCode ? `drop the "${regionCode}" region filter` : null,
    minViews > 0 ? `lower the ${minViews.toLocaleString()} minimum-views filter` : null,
  ];
  const wider = [widen, !channelMode && !deepScan ? 'turn on deep scan to widen the candidate pool' : null, !channelMode ? 'try a broader niche phrase' : null];
  return (cause === 'filters' ? [...filters, ...wider] : [...wider, ...filters]).filter(Boolean);
}

/** The banner object, built only when the ranking itself is thin. */
export function thinPoolFrom(evidence, shortfall, query, funnel) {
  if (evidence.heat.level !== 'thin') return null;
  const suggestions = suggestionsFor(shortfall.cause, query);
  const warning = `${evidence.heat.why} ${shortfall.detail} The ranking below is close to view order restated -- treat it as weak evidence.${suggestions.length ? ` Try: ${suggestions.join(', ')}.` : ''}`;
  return {
    videos: evidence.heat.n,
    threshold: evidence.heat.needed,
    swing: rankSwing(evidence.heat.n),
    cause: shortfall.cause,
    detail: shortfall.detail,
    suggestions,
    warning,
  };
}
