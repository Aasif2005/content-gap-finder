import * as yt from './youtube.js';
import { scoreVideos, scoreTopic } from '../lib/heat.js';
import { clusterTopics, mineGaps, selectComments, groundGaps, groundObjections, heatTier } from './analyze.js';
import { config } from '../config.js';
import { RunLogger } from '../lib/auditLog.js';
import { avoidVerdict, AVOID_ORDER } from '../lib/avoid.js';
import { checkTopicRelevance, checkGapRelevance, summarizeRelevance, checkTagHijack, untrustedVideoIds, nicheVideoIdSet } from '../lib/relevance.js';
import { languageDecision } from '../lib/language.js';
import { ExclusionLedger } from '../lib/exclusions.js';
import { assessEvidence, assessTopic, explainShortfall, thinPoolFrom } from '../lib/confidence.js';
import { classifyRecurrence } from '../lib/recurrence.js';
import { annotateOutliers } from '../lib/outlier.js';
import { formulaHint } from '../lib/hookFormulas.js';
import * as store from '../lib/store.js';

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
  likesHidden: Boolean(v.likesHidden),
  comments: v.comments,
  heat: v.heat,
  tier: v.tier,
  viewsPerSubscriber: Math.round(v.signals.outperformance * 100) / 100,
  engagementRate: Math.round(v.signals.engagementRate * 10000) / 10000,
  lowEngagementOutlier: v.lowEngagementOutlier,
  tagOnlyMatch: Boolean(v.tagOnlyMatch),
  outlier: v.outlier ?? null,
  formula: v.formula?.id ? v.formula.name : null,
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
    channelId,
  } = input;

  // Channel mode analyses one channel's own recent uploads and its own
  // audience's comments, instead of searching a niche. Two consequences shape
  // everything below:
  //
  // 1. Discovery is playlistItems (1 unit/page) instead of search.list (100),
  //    which is why a channel run costs ~29 units against 127+.
  // 2. There is no ambiguity about what the videos are about. The entire
  //    relevance subsystem -- niche keyword matching, tag-hijack detection,
  //    the nicheRelevant flags -- exists to compensate for search.list pulling
  //    in adjacent content. Applied here it would be worse than useless: an
  //    audience asking "how do you edit these" on a camera channel doesn't
  //    mention the channel's name, so keyword matching would flag nearly every
  //    real gap. So it is switched off, and the UI says so rather than showing
  //    a relevance score that means nothing.
  const channelMode = Boolean(channelId);

  const warnings = [];
  // Every video set aside, and why (lib/exclusions.js). Surfaced in the report and the audit log.
  const ledger = new ExclusionLedger();
  let thinPool = null; // set at the end, only if the ranking itself is thin (lib/confidence.js)
  // What the report is ABOUT, for prompts and messages: the niche in niche mode,
  // the channel's title in channel mode.
  let subject = niche;
  const log = new RunLogger(runId, input);

  try {
    return await runPhases();
  } catch (err) {
    log.logError(err);
    log.finish({ status: 'error' });
    throw err;
  }

  async function runPhases() {

  // 1. Discovery. In niche mode this is the 100-unit-per-slice search.list call
  // and the whole cost story of a run; how many slices a request needs is
  // lib/searchPlan.js's decision, and deep scan widens the pool with a second
  // date-ordered pass so a breakout small channel can actually enter it
  // (order=viewCount alone pre-selects for absolute views, which is exactly what
  // views-per-subscriber scoring is supposed to see past). In channel mode it is
  // a walk of the uploads playlist at 1 unit per page of 50.
  let hits;
  let slices = [];
  let channel = null;
  let uploadsTruncated = false;

  if (channelMode) {
    onProgress('searching', 'Resolving channel', 5);
    channel = await yt.resolveChannel(yt.parseChannelInput(channelId) ?? { kind: 'id', value: channelId });
    subject = channel.title || subject;

    onProgress('searching', `Reading ${channel.title}'s recent uploads`, 10);
    const uploads = await yt.getChannelUploads({
      uploadsPlaylistId: channel.uploadsPlaylistId,
      publishedAfter: yt.windowToPublishedAfter(window, customAfter),
    });
    hits = uploads.hits;
    uploadsTruncated = uploads.truncated;
    if (uploads.truncated) {
      warnings.push(`${channel.title} uploaded more than ${hits.length} videos in this window; only the most recent ${hits.length} were analysed.`);
    }
    if (!hits.length) {
      throw Object.assign(
        new Error(`${channel.title} published no videos in this time range. Try a longer window.`),
        { status: 404, code: 'NO_RESULTS' }
      );
    }
  } else {
    onProgress('searching', `Searching YouTube for "${niche}"${deepScan ? ' (deep scan)' : ''}`, 8);
    const searched = await yt.searchVideos({
      niche, window, customAfter, contentType, regionCode, relevanceLanguage, deepScan,
    });
    hits = searched.hits;
    slices = searched.slices;
    if (!hits.length) {
      throw Object.assign(
        new Error(`No videos found for "${niche}" in this time range. Try a broader niche or a longer window.`),
        { status: 404, code: 'NO_RESULTS' }
      );
    }
  }

  // 2. Stats + channels, both batched at 50 ids per call.
  onProgress('stats', `Pulling stats for ${hits.length} videos`, 22);
  let videos = await yt.getVideoDetails(hits.map((h) => h.videoId));

  // Hits that videos.list did not return: deleted, private, or restricted since
  // the search. Without this they vanished between "found" and "scored".
  const resolvedIds = new Set(videos.map((v) => v.videoId));
  for (const h of hits) if (!resolvedIds.has(h.videoId)) ledger.add({ videoId: h.videoId }, 'unavailable');

  // search.list can only pre-filter to <4min; the real Shorts boundary is 180s,
  // so the precise cut has to happen here, after contentDetails.duration lands.
  const beforeFilter = videos.length;
  videos = videos.filter((v) => {
    if (contentType === 'shorts' && !v.isShort) { ledger.add(v, 'format-long', `${Math.round(v.durationSeconds / 60)} min`); return false; }
    if (contentType === 'long' && v.isShort) { ledger.add(v, 'format-short', `${v.durationSeconds}s`); return false; }
    if (minViews > 0 && v.views < minViews) { ledger.add(v, 'min-views', `${v.views.toLocaleString()} views, minimum ${minViews.toLocaleString()}`); return false; }
    return true;
  });
  const afterFormat = videos.length;

  if (!videos.length) {
    throw Object.assign(
      new Error(
        `Found ${beforeFilter} videos for "${subject}", but none matched the ${contentType} / ${minViews}+ views filter. Loosen the filters.`
      ),
      { status: 404, code: 'NO_RESULTS_AFTER_FILTER' }
    );
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
  let languageSummary = null;

  if (relevanceLanguage) {
    // Combines each video's declared/detected audio language (the primary
    // signal -- see lib/language.js) with script/common-word text evidence as
    // a second opinion. Works for any language code, not just the ones with a
    // script or word-list modeled here. Exclude only a CONFIRMED mismatch;
    // "cannot judge" (a video with no audio-language field and no rescuing
    // text evidence) stays in, same "unknown is not no" rule as the region
    // filter below.
    const before = videos.length;
    const decisions = videos.map((v) => languageDecision(relevanceLanguage, v));
    const kept = videos.filter((_, i) => decisions[i].verdict !== false);
    const confirmedCount = decisions.filter((d) => d.verdict === true).length;
    languageSummary = {
      requested: relevanceLanguage,
      confirmed: confirmedCount,
      excluded: before - kept.length,
      undecided: decisions.filter((d) => d.verdict === null).length,
      applied: kept.length > 0,
    };
    if (kept.length) {
      // Recorded with the signal that settled it: an audio-track mismatch and a
      // "Hindi Dubbed" title are different grounds, and which one it was is what
      // tells you whether dropping the filter would help.
      videos.forEach((v, i) => {
        if (decisions[i].verdict === false) ledger.add(v, `language-${decisions[i].signal}`, decisions[i].detail);
      });
      videos = kept;
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
      for (const v of videos) {
        if (!regionMatched.includes(v)) ledger.add(v, 'region', `channel country is ${channelMap.get(v.channelId)?.country}, wanted ${regionCode}`);
      }
      videos = regionMatched;
    } else {
      warnings.push(
        `None of ${videos.length} videos' channels report "${regionCode}" as their country -- most creators never set this field. Results follow YouTube's own relevance ranking instead.`
      );
    }
  }

  // 3. Deterministic scoring. The LLM never does arithmetic.
  const ranked = scoreVideos(videos, channelMap);
  for (const v of ranked) v.tier = heatTier(v, ranked);

  // 3b. Median-multiple outliers (youtube-agent-skill's yt-viral). The pool has
  // 1-2 videos per channel, which cannot give a median, so the top channels'
  // recent uploads are read as a baseline. Failure degrades to "not measured"
  // rather than failing a run that already has everything else it needs.
  let outlierSummary = null;
  if (!channelMode && config.outlier.channels > 0 && ranked.length) {
    onProgress('stats', 'Measuring each channel against its own median', 33);
    try {
      const topChannels = [...new Set(ranked.map((v) => v.channelId))].slice(0, config.outlier.channels);
      const baselines = await yt.getChannelBaselines(topChannels, { minAgeDays: config.outlier.minBaselineAgeDays });
      outlierSummary = annotateOutliers(ranked, baselines);
    } catch (err) {
      warnings.push(`Channel-median outliers were not measured: ${err.message}`);
    }
  }

  // Mark videos that matched the niche only through tags/hashtags. The LLM makes
  // the final call on these -- we just make sure it can see the signal. Skipped
  // in channel mode: every video demonstrably belongs to the channel being
  // analysed, so there is no hijack question to answer.
  if (!channelMode) {
    for (const v of ranked) v.tagOnlyMatch = checkTagHijack(niche, v).suspect;
    const tagOnlyCount = ranked.filter((v) => v.tagOnlyMatch).length;
    if (tagOnlyCount) {
      warnings.push(
        `${tagOnlyCount} of ${ranked.length} videos mention "${niche}" only in tags/hashtags, not in the title. They may be tag-hijacked.`
      );
    }
  }

  if (channelMode) {
    warnings.push(
      `Channel mode: every video here is ${channel.title}'s own, so niche-relevance and tag-hijack checks are switched off (there is nothing ambiguous to check), and a topic's "channels" breadth count is always 1.`
    );
  }

  log.logSearch(hits, beforeFilter, ranked, warnings, slices);
  if (!channelMode) log.logOutliers(outlierSummary, ranked);

  // 4. Comments for the top slice only. commentThreads.list is per-video, so
  // this is N round trips -- the cap is about latency as much as quota.
  const commentTargets = ranked.slice(0, config.youtube.maxCommentVideos);
  const commentsByVideo = {};
  const ownerByVideo = {};
  let withComments = 0;
  const unreadable = [];

  for (const [i, v] of commentTargets.entries()) {
    onProgress('comments', `Reading comments (${i + 1}/${commentTargets.length})`, 32 + Math.round((i / commentTargets.length) * 20));
    let list = [];
    try {
      list = await yt.getComments(v.videoId, config.youtube.commentsPerVideo);
    } catch (err) {
      if (err.code === 'QUOTA_EXHAUSTED') throw err;
      unreadable.push(v);
      continue;
    }
    if (list.length) {
      commentsByVideo[v.videoId] = list;
      ownerByVideo[v.videoId] = v.channelId;
      withComments++;
    }
  }
  // Scored but never read: either beyond the top-N videos whose comments are
  // fetched (a per-video call each), or read and found empty.
  const unreadableIds = new Set(unreadable.map((v) => v.videoId));
  for (const v of commentTargets) {
    if (unreadableIds.has(v.videoId)) ledger.add(v, 'comments-unreadable');
    else if (!commentsByVideo[v.videoId]) ledger.add(v, 'comments-disabled');
  }
  if (unreadable.length) {
    warnings.push(`Could not read comments on ${unreadable.length} of ${commentTargets.length} videos (YouTube errors, retried once). Gaps from this run may be missing demand those videos held.`);
  }
  ranked.slice(commentTargets.length).forEach((v, i) =>
    ledger.add(v, 'not-comment-read', `rank ${commentTargets.length + i + 1}; only the top ${commentTargets.length} are read`)
  );
  const totalFetched = Object.values(commentsByVideo).reduce((a, c) => a + c.length, 0);
  if (!withComments) warnings.push('No comments were available on any top video, so the gap list will be empty.');

  // 5. LLM pass A: clustering + avoid.
  const windowLabel = window === 'custom' ? `since ${customAfter.slice(0, 10)}` : `last ${window}`;
  const { topics: rawTopics, avoid: rawAvoid, usage: clusterUsage } = await clusterTopics({
    niche: subject, window: windowLabel, videos: ranked, channelMode, onProgress,
  });

  const byId = new Map(ranked.map((v) => [v.videoId, v]));
  const resolve = (ids) => (Array.isArray(ids) ? ids : []).map((id) => byId.get(id)).filter(Boolean);

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
  // In channel mode these are off (see channelMode above): a neutral verdict
  // keeps the audit log, the summary and the UI badges all working unchanged
  // rather than making every consumer handle a missing check.
  const neutral = { relevant: true, matched: [], matchedIn: 'n/a', score: 1, tagSuspect: false, skipped: true };
  const topicRelevance = channelMode ? topics.map(() => neutral) : topics.map((t) => checkTopicRelevance(niche, t));
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
      const verdict = avoidVerdict(members, ranked);
      if (verdict.drop) return null;
      return {
        label: a.label,
        reason: a.reason ?? '',
        counterEvidence: a.counter_evidence ?? '',
        videos: members.map(publicVideo),
        flaggedCount: verdict.flaggedCount,
        medianEngagementRate: verdict.medianEngagementRate,
        runMedianEngagementRate: verdict.runMedianEngagementRate,
        statsLevel: verdict.level,
        // "Confirmed" means our own numbers agree with the model's warning --
        // at least half the entry's videos, not any one of them.
        confirmedByStats: verdict.level === 'confirmed',
      };
    })
    .filter(Boolean)
    .sort((a, b) => AVOID_ORDER[a.statsLevel] - AVOID_ORDER[b.statsLevel] || b.flaggedCount - a.flaggedCount);

  // checkTopicRelevance is generic over {label, summary, whyHot, videos}, which
  // an avoid entry also has (reason/counterEvidence standing in for summary/whyHot).
  const avoidRelevance = channelMode
    ? avoid.map(() => neutral)
    : avoid.map((a) =>
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
  const untrusted = channelMode ? new Set() : untrustedVideoIds(ranked, confirmedRelevantVideoIds);
  // Untrusted videos are removed BEFORE the comment cap is applied, so their
  // comments cannot use up slots that trusted videos' comments would have had.
  const trustedByVideo = Object.fromEntries(Object.entries(commentsByVideo).filter(([id]) => !untrusted.has(id)));
  const gapComments = selectComments(trustedByVideo, { ownerByVideo });
  for (const id of untrusted) if (commentsByVideo[id]) ledger.add(byId.get(id), 'untrusted-tag-only');
  const droppedComments = [...untrusted].reduce((n, id) => n + (commentsByVideo[id]?.length ?? 0), 0);
  if (droppedComments) {
    warnings.push(
      `${droppedComments} comments excluded from gap mining -- they came from tag-hijacked videos clustering did not confirm as relevant.`
    );
  }

  // 7. LLM pass B: gap mining, grounded back to real comments.
  const { gaps: rawGaps, objections: rawObjections, usage: gapUsage } = await mineGaps({
    niche: subject, window: windowLabel, videos: ranked, comments: gapComments, topics, gapMode, channelMode, onProgress,
    formulaHint: outlierSummary ? formulaHint(outlierSummary.topFormulas) : '',
  });
  const gapsResolved = groundGaps(rawGaps, gapComments, { context: niche }).map((g) => ({
    ...g,
    coveringVideos: resolve(g.coveringVideoIds).map(publicVideo),
  }));

  const nicheVideoIds = channelMode ? null : nicheVideoIdSet(niche, ranked, confirmedRelevantVideoIds);
  const gapRelevance = channelMode ? gapsResolved.map(() => neutral) : gapsResolved.map((g) => checkGapRelevance(niche, g, { nicheVideoIds }));
  log.logGaps(gapsResolved, gapRelevance);

  // Objections: recurring complaints about the EXISTING videos rather than
  // requests for new ones. Same comments, same LLM call, same citation
  // grounding -- a distinct and directly actionable output for almost no extra
  // cost, since the comment payload was already in the prompt.
  const objections = groundObjections(rawObjections, gapComments);
  log.logObjections(objections);

  // Attach the verdict to each gap so the UI can warn on anything that still
  // slips through the filter above, instead of only the audit log seeing it.
  const flaggedGaps = gapsResolved.map((g, i) => ({
    ...g,
    nicheRelevant: gapRelevance[i].relevant,
    relevance: { verdict: gapRelevance[i].verdict ?? 'on-niche', matched: gapRelevance[i].matched ?? [] },
  }));

  // 8. Recurrence. Compare this run's gaps against every earlier run of the
  // same subject, so a gap that has been asked for four weeks running is
  // distinguishable from one that surfaced once. Failing to read history is not
  // worth failing a run over -- the report is still useful without it.
  let gaps = flaggedGaps;
  let resolvedGaps = [];
  let runsCompared = 0;
  const historyKey = channelMode ? `channel:${channel.channelId}` : niche;
  try {
    const history = store.readGapHistory(historyKey, { excludeRunId: runId });
    // Only runs mined under the same filters are comparable.
    // A 24h run compared against 90d runs reported 24 gaps "no longer showing
    // up": different windows read different comments.
    const historyFilters = {
      relevanceLanguage: relevanceLanguage ?? '', regionCode: regionCode ?? '', gapMode: gapMode ?? '',
      window: window === 'custom' ? 'custom' : window, contentType: contentType ?? 'both',
    };
    const classified = classifyRecurrence(flaggedGaps, history, { filters: historyFilters, noComments: gapComments.length === 0 });
    gaps = classified.gaps;
    resolvedGaps = classified.resolved;
    runsCompared = classified.runsCompared;
    if (runsCompared > 0) {
      const recurring = gaps.filter((g) => g.recurrence.status === 'recurring').length;
      warnings.push(
        `Compared against ${runsCompared} earlier run${runsCompared === 1 ? '' : 's'} of this ${channelMode ? 'channel' : 'niche'}: ${recurring} of ${gaps.length} gaps have been asked for before${resolvedGaps.length ? `, and ${resolvedGaps.length} previously-open gap${resolvedGaps.length === 1 ? ' is' : 's are'} no longer showing up` : ''}.`
      );
    }
    if (classified.recentSkipped) {
      warnings.push(`${classified.recentSkipped} run${classified.recentSkipped === 1 ? '' : 's'} of this subject from the last ${config.recurrence.minHours} hours ${classified.recentSkipped === 1 ? 'was' : 'were'} not compared: a re-run that soon reads the same comments, so it is not a second sighting of the demand.`);
    }
    store.appendGapHistory(historyKey, runId, new Date().toISOString(), flaggedGaps, { filters: historyFilters, comments: gapComments.length });
  } catch (err) {
    console.error(`[pipeline] recurrence comparison failed:`, err.message);
    warnings.push('Could not compare against earlier runs of this subject, so gaps are not marked new or recurring.');
  }
  log.logRecurrence(gaps, resolvedGaps, runsCompared);

  const relevanceSummary = {
    topicRelevance: summarizeRelevance(topicRelevance),
    gapRelevance: summarizeRelevance(gapRelevance),
    avoidRelevance: summarizeRelevance(avoidRelevance),
  };
  // The funnel: what each stage started with, so "weak evidence" can be traced to
  // the step that thinned it. The integrity flag is the arithmetic that must hold
  // (everything found is either scored or has a reason it is not); if it ever
  // fails the report says so instead of showing a funnel that does not add up.
  const exclusions = {
    funnel: [
      { key: 'found', label: channelMode ? 'Uploads in the window' : 'Videos found by search', count: hits.length },
      { key: 'resolved', label: 'Returned by YouTube', count: beforeFilter },
      { key: 'format', label: 'After format and view filters', count: afterFormat },
      { key: 'scored', label: 'Scored', count: ranked.length },
      { key: 'commentRead', label: 'Videos whose comments were read', count: withComments },
      { key: 'comments', label: 'Comments used for gaps', count: gapComments.length },
    ],
    byReason: ledger.summary(),
    items: ledger.items(),
    excluded: ledger.countKind('excluded'),
    language: languageSummary,
    integrity: ledger.countKind('excluded') === hits.length - ranked.length,
  };
  log.logExclusions(exclusions);

  // How much each output can be trusted, judged by what THAT output computes
  // (lib/confidence.js), not by one flat video count. Only a thin ranking earns
  // the banner; a channel's complete small week is "small", not "weak".
  const evidence = assessEvidence({
    channelMode,
    scored: ranked.length,
    distinctChannels: new Set(ranked.map((v) => v.channelId)).size,
    population: afterFormat,
    uploadsTruncated,
    topics,
    commentVideos: withComments,
    commentsAnalysed: gapComments.length,
    outlierChannels: outlierSummary ? outlierSummary.channelsMeasured : null,
    runsCompared,
  });
  topics.forEach((t) => { t.evidence = assessTopic(t, { channelMode }); });
  const shortfall = explainShortfall({ funnel: exclusions.funnel, byReason: exclusions.byReason, channelMode, uploadsTruncated });
  thinPool = thinPoolFrom(evidence, shortfall, { window, relevanceLanguage, regionCode, minViews, deepScan, contentType, channelMode }, exclusions.funnel);
  // Kept in `warnings` as well as in `thinPool`, because the audit log and any
  // non-UI consumer only read the warnings list. The UI filters this exact string
  // back out (by identity) so the callout doesn't say the same thing twice.
  if (thinPool) warnings.push(thinPool.warning);
  exclusions.shortfall = shortfall;
  log.logEvidence(evidence, shortfall);

  log.finish({ status: 'done', ...relevanceSummary });

  onProgress('done', 'Complete', 100);

  return {
    query: { niche, window, customAfter, contentType, regionCode, relevanceLanguage, minViews, gapMode, deepScan, channelId: channel?.channelId },
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
      objectionsFound: objections.length,
      llmUsage: {
        clustering: clusterUsage,
        gaps: gapUsage,
        totalTokens: (clusterUsage?.total_tokens ?? 0) + (gapUsage?.total_tokens ?? 0),
      },
      relevance: relevanceSummary,
      searchSlices: slices,
      runsCompared,
      recurringGaps: gaps.filter((g) => g.recurrence?.status === 'recurring').length,
      resolvedGaps: resolvedGaps.length,
    },
    warnings,
    thinPool,
    evidence,
    exclusions,
    outliers: outlierSummary,
    channelMode,
    channel: channel && {
      channelId: channel.channelId,
      title: channel.title,
      subscribers: channel.subscribers,
      totalViews: channel.totalViews,
      videoCount: channel.videoCount,
      url: `https://www.youtube.com/channel/${channel.channelId}`,
    },
    topics,
    gaps,
    resolvedGaps,
    objections,
    avoid,
    topVideos: ranked.slice(0, 20).map(publicVideo),
  };
  }
}
