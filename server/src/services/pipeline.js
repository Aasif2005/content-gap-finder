import * as yt from './youtube.js';
import { scoreVideos, scoreTopic } from '../lib/heat.js';
import { clusterTopics, mineGaps, selectComments, groundGaps, heatTier } from './analyze.js';
import { config } from '../config.js';
import { RunLogger } from '../lib/auditLog.js';
import { checkTopicRelevance, checkGapRelevance, summarizeRelevance, checkTagHijack, untrustedVideoIds } from '../lib/relevance.js';
import { matchesRequestedLanguage } from '../lib/language.js';

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
    deepScan = false,
  } = input;

  const warnings = [];
  let thinPool = null; // set below if the scored set is too small for relative scoring to mean much
  const log = new RunLogger(runId, input);

  try {
    return await runPhases();
  } catch (err) {
    log.logError(err);
    log.finish({ status: 'error' });
    throw err;
  }

  async function runPhases() {

  // 1. Search -- the 100-unit-per-slice call, and the whole cost story of a run.
  // How many slices a request needs is lib/searchPlan.js's decision; deep scan
  // widens the pool with a second date-ordered pass so a breakout small channel
  // can actually enter it (order=viewCount alone pre-selects for absolute views,
  // which is exactly what views-per-subscriber scoring is supposed to see past).
  onProgress('searching', `Searching YouTube for "${niche}"${deepScan ? ' (deep scan)' : ''}`, 8);
  const { hits, slices } = await yt.searchVideos({
    niche, window, customAfter, contentType, regionCode, relevanceLanguage, deepScan,
  });
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

  // regionCode/relevanceLanguage on search.list are YouTube's own ranking
  // hints, not filters -- verified empirically: relevanceLanguage=ta against
  // "gym fitness" returned nearly the same channels as no language param at
  // all, none actually in Tamil. Where we can build a real filter, we do --
  // but only when it actually leaves something to narrow to: a filter that
  // can zero out an entire run on its own uncertainty is worse than the
  // soft-hint behavior it's meant to replace, so both filters below only take
  // effect if they leave at least one video; otherwise they're skipped with a
  // warning explaining why, rather than erroring the run out to zero.
  const beforeRegionLang = videos.length;

  if (relevanceLanguage) {
    // Combines each video's declared/detected audio language (the primary
    // signal -- see lib/language.js) with script/common-word text evidence as
    // a second opinion. Works for any language code, not just the ones with a
    // script or word-list modeled here. Exclude only a CONFIRMED mismatch;
    // "cannot judge" (a video with no audio-language field and no rescuing
    // text evidence) stays in, same "unknown is not no" rule as the region
    // filter below.
    const before = videos.length;
    const verdicts = videos.map((v) => matchesRequestedLanguage(relevanceLanguage, v));
    const kept = videos.filter((_, i) => verdicts[i] !== false);
    const confirmedCount = verdicts.filter((v) => v === true).length;
    if (kept.length) {
      videos = kept;
      if (confirmedCount < before) {
        warnings.push(
          `"${relevanceLanguage}" filtered by each video's audio language (plus title/script evidence as a second opinion) -- ${confirmedCount} of ${before} videos confirmed, ${before - kept.length} excluded as a different language, the rest left undecided rather than guessed.`
        );
      }
    } else {
      warnings.push(
        `Every one of ${before} videos was confirmed as a different language than "${relevanceLanguage}" -- results follow YouTube's own relevance ranking instead.`
      );
    }
  }

  if (regionCode) {
    // Exclude only a confirmed mismatch. A channel's country is self-reported
    // and many creators never set it -- unset is "unknown," not "no."
    const regionMatched = videos.filter((v) => {
      const country = channelMap.get(v.channelId)?.country;
      return !country || country === regionCode;
    });
    if (regionMatched.length) {
      videos = regionMatched;
    } else {
      warnings.push(
        `None of ${videos.length} videos' channels report "${regionCode}" as their country -- most creators never set this field. Results follow YouTube's own relevance ranking instead.`
      );
    }
  }

  if (beforeRegionLang - videos.length > 0) {
    warnings.push(`${beforeRegionLang - videos.length} of ${beforeRegionLang} videos dropped by the region/language filter.`);
  }

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

  // Relative scoring needs a population to be relative to. Below the threshold,
  // min-max normalization collapses toward "rank order with decimals", the
  // breadth bonus has almost nothing to count, and one weakly-evidenced topic
  // reads on screen exactly like a well-supported one. Say so rather than
  // presenting a 3-video run with the confidence of a 50-video run.
  if (ranked.length < config.youtube.thinPoolThreshold) {
    thinPool = {
      videos: ranked.length,
      threshold: config.youtube.thinPoolThreshold,
      // What the user can actually do about it, most-likely-to-help first.
      suggestions: [
        window !== '90d' && window !== 'custom' ? 'widen the time window' : null,
        relevanceLanguage ? `drop the "${relevanceLanguage}" language filter` : null,
        regionCode ? `drop the "${regionCode}" region filter` : null,
        minViews > 0 ? `lower the ${minViews.toLocaleString()} minimum-views filter` : null,
        !deepScan ? 'turn on deep scan to widen the candidate pool' : null,
        'try a broader niche phrase',
      ].filter(Boolean),
    };
    warnings.push(
      `Only ${ranked.length} videos made it to scoring (under ${config.youtube.thinPoolThreshold}). Heat scores are relative to this set, so with a set this small they mostly just re-state view order -- treat the ranking below as weak evidence. Try: ${thinPool.suggestions.join(', ')}.`
    );
  }

  log.logSearch(hits, beforeFilter, ranked, warnings, slices);

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

  // Attach the verdict to each topic so the UI can warn on it too, instead of
  // only the audit log seeing it -- the same gap this fix closes for gaps below.
  topics.forEach((t, i) => {
    t.nicheRelevant = topicRelevance[i].relevant;
    t.tagSuspect = topicRelevance[i].tagSuspect;
  });

  // 6. Avoid list -- resolved here (moved up from after gap mining) because it
  // comes from the SAME clusterTopics() call as topics, so it's already
  // available, and the comment filter below needs it to know which tag-only
  // videos clustering actually vouched for.
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
  avoid.forEach((a, i) => { a.nicheRelevant = avoidRelevance[i].relevant; });

  // Drop comments from tag-hijacked videos that clustering never vouched for,
  // before gap mining ever sees them. Real bug this fixes: a "SOORI AS HERO
  // #thalapathyvijay" Short (a different actor, tag-stuffed) was correctly kept
  // out of every topic, but comment-fetching runs by heat score alone -- upstream
  // of any relevance check -- so its comments still reached gap mining and
  // became a "gap" about a completely unrelated film rivalry.
  const confirmedRelevantVideoIds = new Set([
    ...topics.flatMap((t) => t.videos.map((v) => v.videoId)),
    ...avoid.flatMap((a) => a.videos.map((v) => v.videoId)),
  ]);
  const untrusted = untrustedVideoIds(ranked, confirmedRelevantVideoIds);
  const gapComments = untrusted.size ? selected.filter((c) => !untrusted.has(c.videoId)) : selected;
  if (gapComments.length < selected.length) {
    warnings.push(
      `${selected.length - gapComments.length} comments excluded from gap mining -- they came from tag-hijacked videos clustering did not confirm as relevant.`
    );
  }

  // 7. LLM pass B: gap mining, grounded back to real comments.
  const { gaps: rawGaps, usage: gapUsage } = await mineGaps({
    niche, window: windowLabel, videos: ranked, comments: gapComments, topics: rawTopics, gapMode, onProgress,
  });
  const gapsResolved = groundGaps(rawGaps, gapComments).map((g) => ({
    ...g,
    coveringVideos: resolve(g.coveringVideoIds).map(publicVideo),
  }));

  const gapRelevance = gapsResolved.map((g) => checkGapRelevance(niche, g));
  log.logGaps(gapsResolved, gapRelevance);

  // Attach the verdict to each gap so the UI can warn on anything that still
  // slips through the filter above, instead of only the audit log seeing it.
  const gaps = gapsResolved.map((g, i) => ({ ...g, nicheRelevant: gapRelevance[i].relevant }));

  const relevanceSummary = {
    topicRelevance: summarizeRelevance(topicRelevance),
    gapRelevance: summarizeRelevance(gapRelevance),
    avoidRelevance: summarizeRelevance(avoidRelevance),
  };
  log.finish({ status: 'done', ...relevanceSummary });

  onProgress('done', 'Complete', 100);

  return {
    query: { niche, window, customAfter, contentType, regionCode, relevanceLanguage, minViews, gapMode, deepScan },
    generatedAt: new Date().toISOString(),
    runId,
    stats: {
      videosFound: beforeFilter,
      videosAnalyzed: ranked.length,
      videosWithComments: withComments,
      commentsFetched: totalFetched,
      commentsAnalyzed: gapComments.length,
      topicsFound: topics.length,
      gapsFound: gaps.length,
      avoidFound: avoid.length,
      llmUsage: {
        clustering: clusterUsage,
        gaps: gapUsage,
        totalTokens: (clusterUsage?.total_tokens ?? 0) + (gapUsage?.total_tokens ?? 0),
      },
      relevance: relevanceSummary,
      searchSlices: slices,
    },
    warnings,
    thinPool,
    topics,
    gaps,
    avoid,
    topVideos: ranked.slice(0, 20).map(publicVideo),
  };
  }
}
