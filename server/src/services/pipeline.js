import * as yt from './youtube.js';
import { scoreVideos, scoreTopic } from '../lib/heat.js';
import { clusterTopics, mineGaps, selectComments, groundGaps, heatTier } from './analyze.js';
import { config } from '../config.js';
import { RunLogger } from '../lib/auditLog.js';
import { checkTopicRelevance, checkGapRelevance, summarizeRelevance, checkTagHijack } from '../lib/relevance.js';

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
  tagOnlyMatch: Boolean(v.tagOnlyMatch),
  url: `https://www.youtube.com/watch?v=${v.videoId}`,
});

export async function runPipeline(input, onProgress = () => {}, runId) {
  const {
    niche,
    window = '7d',
    customAfter,
    contentType = 'both',
    regionCode,
    relevanceLanguage,
    minViews = 0,
    gapMode = 'inclusive',
  } = input;

  const warnings = [];
  const log = new RunLogger(runId, input);

  try {
    return await runPhases();
  } catch (err) {
    log.logError(err);
    log.finish({ status: 'error' });
    throw err;
  }

  async function runPhases() {

  // 1. Search -- the only 100-unit call in the whole run.
  onProgress('searching', `Searching YouTube for "${niche}"`, 8);
  const hits = await yt.searchVideos({ niche, window, customAfter, contentType, regionCode, relevanceLanguage });
  if (!hits.length) {
    throw Object.assign(
      new Error(`No videos found for "${niche}" in this time range. Try a broader niche or a longer window.`),
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

  // Mark videos that matched the niche only through tags/hashtags. The LLM makes
  // the final call on these -- we just make sure it can see the signal.
  for (const v of ranked) v.tagOnlyMatch = checkTagHijack(niche, v).suspect;
  const tagOnlyCount = ranked.filter((v) => v.tagOnlyMatch).length;
  if (tagOnlyCount) {
    warnings.push(
      `${tagOnlyCount} of ${ranked.length} videos mention "${niche}" only in tags/hashtags, not in the title. They may be tag-hijacked.`
    );
  }

  log.logSearch(hits, ranked);

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
  const windowLabel = window === 'custom' ? `since ${customAfter.slice(0, 10)}` : `last ${window}`;
  const { topics: rawTopics, avoid: rawAvoid, usage: clusterUsage } = await clusterTopics({
    niche, window: windowLabel, videos: ranked, onProgress,
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

  // Keyword-overlap check on what the model actually returned -- catches drift
  // that a fabrication check can't, since these topics are all grounded in real
  // videos (the ids resolved). The question here is whether those videos are
  // actually about the niche, not whether the model made them up.
  const topicRelevance = topics.map((t) => checkTopicRelevance(niche, t));
  log.logTopics(topics, topicRelevance);

  // 6. LLM pass B: gap mining, grounded back to real comments.
  const { gaps: rawGaps, usage: gapUsage } = await mineGaps({
    niche, window: windowLabel, videos: ranked, comments: selected, topics: rawTopics, gapMode, onProgress,
  });
  const gaps = groundGaps(rawGaps, selected).map((g) => ({
    ...g,
    coveringVideos: resolve(g.coveringVideoIds).map(publicVideo),
  }));

  const gapRelevance = gaps.map((g) => checkGapRelevance(niche, g));
  log.logGaps(gaps, gapRelevance);

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

  // checkTopicRelevance is generic over {label, summary, whyHot, videos}, which
  // an avoid entry also has (reason/counterEvidence standing in for summary/whyHot).
  const avoidRelevance = avoid.map((a) =>
    checkTopicRelevance(niche, { label: a.label, summary: a.reason, whyHot: a.counterEvidence, videos: a.videos })
  );
  log.logAvoid(avoid, avoidRelevance);

  const relevanceSummary = {
    topicRelevance: summarizeRelevance(topicRelevance),
    gapRelevance: summarizeRelevance(gapRelevance),
    avoidRelevance: summarizeRelevance(avoidRelevance),
  };
  log.finish({ status: 'done', ...relevanceSummary });

  onProgress('done', 'Complete', 100);

  return {
    query: { niche, window, customAfter, contentType, regionCode, relevanceLanguage, minViews, gapMode },
    generatedAt: new Date().toISOString(),
    runId,
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
      relevance: relevanceSummary,
    },
    warnings,
    topics,
    gaps,
    avoid,
    topVideos: ranked.slice(0, 20).map(publicVideo),
  };
  }
}
