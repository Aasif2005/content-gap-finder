import { config } from '../config.js';

const { wVelocity, wOutperformance, wEngagement, commentWeight, minSubsFloor } = config.heat;

// Views, subscriber counts and view velocity are all heavy-tailed: one video with
// 4M views would otherwise flatten every other score to ~0 after min-max. Log
// compression puts them on a comparable scale before normalizing.
const compress = (x) => Math.log10(1 + Math.max(0, x));

function minMax(values) {
  const finite = values.filter(Number.isFinite);
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  // All-equal set (or a single video): no spread to normalize against.
  return (v) => (max === min ? 0.5 : (v - min) / (max - min));
}

function percentileRanker(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return (v) => {
    if (sorted.length <= 1) return 0.5;
    let lo = 0;
    while (lo < sorted.length && sorted[lo] < v) lo++;
    return lo / (sorted.length - 1);
  };
}

/**
 * Per-video signal components. Kept separate from the final score so the UI can
 * show a creator *why* something is hot rather than just handing them a number.
 */
export function videoSignals(video, channel) {
  const ageDays = Math.max(
    0.25, // a 2-hour-old video shouldn't get a 12x velocity multiplier
    (Date.now() - new Date(video.publishedAt).getTime()) / 86_400_000
  );
  const views = Math.max(0, video.views);

  // Subscriber counts can be hidden; fall back to the floor so a hidden-count
  // channel scores on velocity and engagement instead of getting a fake boost.
  const subs = channel?.hiddenSubscribers ? minSubsFloor : Math.max(channel?.subscribers ?? 0, minSubsFloor);

  const velocity = views / ageDays;
  const outperformance = views / subs; // views per subscriber: the size normalizer
  const engagementRate = (video.likes + commentWeight * video.comments) / Math.max(views, 1);

  return { ageDays, velocity, outperformance, engagementRate, subscribers: channel?.subscribers ?? 0 };
}

/**
 * Scores every video relative to the others in the same result set. Absolute
 * numbers are meaningless across niches -- 50k views is huge for woodworking and
 * nothing for gaming -- so heat is always relative to the set we fetched.
 */
export function scoreVideos(videos, channelMap) {
  const withSignals = videos.map((v) => ({ ...v, signals: videoSignals(v, channelMap.get(v.channelId)) }));

  const normVel = minMax(withSignals.map((v) => compress(v.signals.velocity)));
  const normOut = minMax(withSignals.map((v) => compress(v.signals.outperformance * 100)));
  const normEng = minMax(withSignals.map((v) => compress(v.signals.engagementRate * 1000)));

  const viewPct = percentileRanker(withSignals.map((v) => v.views));
  const engPct = percentileRanker(withSignals.map((v) => v.signals.engagementRate));

  return withSignals
    .map((v) => {
      const parts = {
        velocity: normVel(compress(v.signals.velocity)),
        outperformance: normOut(compress(v.signals.outperformance * 100)),
        engagement: normEng(compress(v.signals.engagementRate * 1000)),
      };
      const heat = 100 * (wVelocity * parts.velocity + wOutperformance * parts.outperformance + wEngagement * parts.engagement);

      const viewPercentile = viewPct(v.views);
      const engagementPercentile = engPct(v.signals.engagementRate);

      return {
        ...v,
        heat: Math.round(heat * 10) / 10,
        heatParts: parts,
        viewPercentile,
        engagementPercentile,
        // The avoid signal: plenty of impressions, but the audience didn't care.
        // Comments being disabled (comments === 0) is a publishing choice, not
        // disinterest, so those videos are excluded from the flag.
        lowEngagementOutlier:
          viewPercentile >= 0.6 && engagementPercentile <= 0.35 && v.comments > 0,
      };
    })
    .sort((a, b) => b.heat - a.heat);
}

/**
 * Rolls per-video heat up to a topic. Weighted toward the topic's best videos
 * (a cluster's ceiling is what a creator can aim at) with a breadth bonus, since
 * five channels succeeding on a topic is a trend and one is a fluke.
 */
export function scoreTopic(memberVideos) {
  if (!memberVideos.length) return { heatScore: 0, breadth: 0, peakHeat: 0 };

  const heats = memberVideos.map((v) => v.heat).sort((a, b) => b - a);
  const top = heats.slice(0, 3);
  const meanTop = top.reduce((a, b) => a + b, 0) / top.length;
  const meanAll = heats.reduce((a, b) => a + b, 0) / heats.length;

  const distinctChannels = new Set(memberVideos.map((v) => v.channelId)).size;
  const breadthBonus = Math.min(1.15, 1 + 0.05 * (distinctChannels - 1));

  return {
    heatScore: Math.round(Math.min(100, (0.7 * meanTop + 0.3 * meanAll) * breadthBonus) * 10) / 10,
    peakHeat: heats[0],
    breadth: distinctChannels,
    totalViews: memberVideos.reduce((a, v) => a + v.views, 0),
    medianEngagementRate:
      [...memberVideos.map((v) => v.signals.engagementRate)].sort((a, b) => a - b)[
        Math.floor(memberVideos.length / 2)
      ] ?? 0,
  };
}
