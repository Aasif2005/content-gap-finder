import * as yt from './youtube.js';
import { scoreVideos, scoreTopic } from '../lib/heat.js';
import { clusterTopics, mineGaps, selectComments, groundGaps, heatTier } from './analyze.js';
import { config } from '../config.js';

/** Trims a scored video down to what the UI actually renders. */
const publicVideo = (v) => ({
  videoId: v.videoId,
  title: v.title,
  channelTitle: v.channelTitle,
  channelId: v.channelId,
  subscribers: v.signals.subscribers,
  publishedAt: v.publishedAt,
  ageDays: Math.round(v.signals.ageDays * 10) / 10,
  thumbnail: v.thumbnail,
  durationSeconds: v.durationSeconds,
  isShort: v.isShort,
  views: v.views,
  likes: v.likes,
  comments: v.comments,
  heat: v.heat,
  tier: v.tier,
  viewsPerSubscriber: Math.round(v.signals.outperformance * 100) / 100,
  engagementRate: Math.round(v.signals.engagementRate * 10000) / 10000,
  lowEngagementOutlier: v.lowEngagementOutlier,
  url: `https://www.youtube.com/watch?v=${v.videoId}`,
});

export async function runPipeline(input, onProgress = () => {}) {
  const {
    niche,
    window = '7d',
    contentType = 'both',
    regionCode,
    relevanceLanguage,
    minViews = 0,
    gapMode = 'inclusive',
  } = input;

  const warnings = [];

  // 1. Search -- the only 100-unit call in the whole run.
  onProgress('searching', `Searching YouTube for "${niche}"`, 8);
  const hits = await yt.searchVideos({ niche, window, contentType, regionCode, relevanceLanguage });
  if (!hits.length) {
    throw Object.assign(
      new Error(`No videos found for "${niche}" in the last ${window}. Try a broader niche or a longer window.`),
      { status: 404, code: 'NO_RESULTS' }
    );
  }

  // 2. Stats + channels, both batched at 50 ids per call.
  onProgress('stats', `Pulling stats for ${hits.length} videos`, 22);
  let videos = await yt.getVideoDetails(hits.map((h) => h.videoId));

  // search.list can only pre-filter to <4min; the real Shorts boundary is 180s,
  // so the precise cut has to happen here, after contentDetails.duration lands.
  const beforeFilter = videos.length;
  if (contentType === 'shorts') videos = videos.filter((v) => v.isShort);
  else if (contentType === 'long') videos = videos.filter((v) => !v.isShort);
  if (minViews > 0) videos = videos.filter((v) => v.views >= minViews);

  if (!videos.length) {
    throw Object.assign(
      new Error(
        `Found ${beforeFilter} videos for "${niche}", but none matched the ${contentType} / ${minViews}+ views filter. Loosen the filters.`
      ),
      { status: 404, code: 'NO_RESULTS_AFTER_FILTER' }
    );
  }
  if (beforeFilter - videos.length > 0) {
    warnings.push(`${beforeFilter - videos.length} of ${beforeFilter} videos dropped by the format/view filters.`);
  }

  onProgress('stats', 'Fetching channel sizes', 30);
  const channelMap = await yt.getChannels(videos.map((v) => v.channelId));

  // 3. Deterministic scoring. The LLM never does arithmetic.
  const ranked = scoreVideos(videos, channelMap);
  for (const v of ranked) v.tier = heatTier(v, ranked);

  // 4. Comments for the top slice only. commentThreads.list is per-video, so
  // this is N round trips -- the cap is about latency as much as quota.
  const commentTargets = ranked.slice(0, config.youtube.maxCommentVideos);
  const commentsByVideo = {};
  const ownerByVideo = {};
  let withComments = 0;

  for (const [i, v] of commentTargets.entries()) {
    onProgress('comments', `Reading comments (${i + 1}/${commentTargets.length})`, 32 + Math.round((i / commentTargets.length) * 20));
    const list = await yt.getComments(v.videoId, config.youtube.commentsPerVideo);
    if (list.length) {
      commentsByVideo[v.videoId] = list;
      ownerByVideo[v.videoId] = v.channelId;
      withComments++;
    }
  }
  const selected = selectComments(commentsByVideo, { ownerByVideo });
  const totalFetched = Object.values(commentsByVideo).reduce((a, c) => a + c.length, 0);
  if (!withComments) warnings.push('No comments were available on any top video, so the gap list will be empty.');

  // 5. LLM pass A: clustering + avoid.
  const { topics: rawTopics, avoid: rawAvoid, usage: clusterUsage } = await clusterTopics({
    niche, window, videos: ranked, onProgress,
  });

  const byId = new Map(ranked.map((v) => [v.videoId, v]));
  const resolve = (ids) => (ids ?? []).map((id) => byId.get(id)).filter(Boolean);

  const topics = rawTopics
    .map((t) => {
      const members = resolve(t.video_ids);
      if (!members.length) return null; // drop hallucinated clusters outright
      return {
        label: t.label,
        summary: t.summary ?? '',
        whyHot: t.why_hot ?? '',
        suggestedAngles: t.suggested_angles ?? [],
        videos: members.map(publicVideo),
        ...scoreTopic(members),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.heatScore - a.heatScore);

  // 6. LLM pass B: gap mining, grounded back to real comments.
  const { gaps: rawGaps, usage: gapUsage } = await mineGaps({
    niche, window, videos: ranked, comments: selected, topics: rawTopics, gapMode, onProgress,
  });
  const gaps = groundGaps(rawGaps, selected).map((g) => ({
    ...g,
    coveringVideos: resolve(g.coveringVideoIds).map(publicVideo),
  }));

  // 7. Avoid list: the model's reasoning, enriched with the deterministic flag
  // so a creator can check the numbers rather than trust the prose.
  const avoid = rawAvoid
    .map((a) => {
      const members = resolve(a.video_ids);
      if (!members.length) return null;
      const flagged = members.filter((v) => v.lowEngagementOutlier).length;
      return {
        label: a.label,
        reason: a.reason ?? '',
        counterEvidence: a.counter_evidence ?? '',
        videos: members.map(publicVideo),
        flaggedCount: flagged,
        medianEngagementRate:
          [...members.map((v) => v.signals.engagementRate)].sort((x, y) => x - y)[Math.floor(members.length / 2)] ?? 0,
        // "Confirmed" means our own numbers agree with the model's warning.
        confirmedByStats: flagged > 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.flaggedCount - a.flaggedCount);

  onProgress('done', 'Complete', 100);

  return {
    query: { niche, window, contentType, regionCode, relevanceLanguage, minViews, gapMode },
    generatedAt: new Date().toISOString(),
    stats: {
      videosFound: beforeFilter,
      videosAnalyzed: ranked.length,
      videosWithComments: withComments,
      commentsFetched: totalFetched,
      commentsAnalyzed: selected.length,
      topicsFound: topics.length,
      gapsFound: gaps.length,
      avoidFound: avoid.length,
      llmUsage: {
        clustering: clusterUsage,
        gaps: gapUsage,
        totalTokens: (clusterUsage?.total_tokens ?? 0) + (gapUsage?.total_tokens ?? 0),
      },
    },
    warnings,
    topics,
    gaps,
    avoid,
    topVideos: ranked.slice(0, 20).map(publicVideo),
  };
}
