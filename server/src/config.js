// " " is Number(" ") === 0, which made a blank DEEPSEEK_TIMEOUT_MS time every call out at once.
export const num = (v, d) => {
  const t = typeof v === 'string' ? v.trim() : v;
  return t === undefined || t === null || t === '' || Number.isNaN(Number(t)) ? d : Number(t);
};

export const config = {
  port: num(process.env.PORT, 8787),
  isProd: process.env.NODE_ENV === 'production',

  youtube: {
    timeoutMs: num(process.env.YOUTUBE_TIMEOUT_MS, 30000),
    // Pages of 50 walked from a channel's uploads playlist (services/youtube.js).
    channelUploadPages: 6,
    apiKey: process.env.YOUTUBE_API_KEY,
    base: 'https://www.googleapis.com/youtube/v3',
    // Documented unit costs. Since 2026-06-01 search.list is charged to its own
    // bucket (1 unit per call, 100 calls a day by default) rather than 100 units
    // of the shared 10,000 -- lib/quota.js keeps the two apart. Search calls are
    // still the scarce resource, which is why a run makes as few as the request
    // allows (see lib/searchPlan.js) and channel mode, which never searches, is cheap.
    cost: { search: 1, videos: 1, channels: 1, commentThreads: 1, playlistItems: 1 },
    dailyUnitBudget: num(process.env.YOUTUBE_DAILY_UNIT_BUDGET, 9000),
    // Under the default 100, leaving headroom for calls made outside this app.
    searchDailyCalls: num(process.env.YOUTUBE_SEARCH_DAILY_CALLS, 95),
    maxCommentVideos: num(process.env.MAX_COMMENT_VIDEOS, 25),
    commentsPerVideo: num(process.env.COMMENTS_PER_VIDEO, 50),
  },

  // How much evidence each OUTPUT needs before it is called solid (lib/confidence.js).
  // These replace one flat "12 videos" rule, which was the same number whether the
  // thing being computed was a ranking, a gap list or a recurrence streak, and which
  // flagged a channel's complete 7-video week as weak. They are judgement defaults
  // with a stated reason, not statistical laws -- tune them against your own niches.
  evidence: {
    // Heat is a rank within the set: one video moves a score by 100/(n-1) points.
    // At 8 videos that is ~14 points, at 5 it is 25 -- a ranking that moves a
    // quarter of the scale when one video is added or removed is not a ranking.
    // THIN_POOL_THRESHOLD is the old name for the first of these.
    heatMinVideos: num(process.env.EVIDENCE_HEAT_MIN_VIDEOS ?? process.env.THIN_POOL_THRESHOLD, 8),
    heatFloor: num(process.env.EVIDENCE_HEAT_FLOOR, 5),
    // A topic's breadth bonus counts distinct channels; under this there is nothing to count.
    heatMinChannels: num(process.env.EVIDENCE_HEAT_MIN_CHANNELS, 4),
    // Gaps come from comments, not from the number of videos: how many videos had
    // comments read, and how many comments reached gap mining.
    gapMinVideos: num(process.env.EVIDENCE_GAP_MIN_VIDEOS, 5),
    gapMinComments: num(process.env.EVIDENCE_GAP_MIN_COMMENTS, 100),
    gapFloorVideos: num(process.env.EVIDENCE_GAP_FLOOR_VIDEOS, 3),
    gapFloorComments: num(process.env.EVIDENCE_GAP_FLOOR_COMMENTS, 40),
    outlierMinChannels: num(process.env.EVIDENCE_OUTLIER_MIN_CHANNELS, 5),
    // Share of what was found that filters removed before the shortfall is blamed on them.
    filterBlameShare: num(process.env.EVIDENCE_FILTER_BLAME_SHARE, 0.3),
  },

  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    base: 'https://api.deepseek.com',
    analysisModel: process.env.DEEPSEEK_MODEL_ANALYSIS || 'deepseek-flash',
    fastModel: process.env.DEEPSEEK_MODEL_FAST || 'deepseek-flash',
    timeoutMs: num(process.env.DEEPSEEK_TIMEOUT_MS, 120_000),
  },

  cache: { ttlSeconds: num(process.env.CACHE_TTL_SECONDS, 3 * 60 * 60) },

  // Durable report + gap-history storage (lib/store.js). Reports are what make
  // a run linkable after the 3h cache expires; the per-niche gap history is what
  // recurrence detection compares against, and is kept far longer because a long
  // baseline is the entire point of it.
  // Shown on the Privacy Policy and Terms. YouTube's policies want a contact
  // method there; without one, YouTube may give users the developer email from
  // the Cloud console instead.
  site: { contactEmail: (process.env.CONTACT_EMAIL ?? '').trim() },

  store: {
    maxRuns: num(process.env.STORE_MAX_RUNS, 500),
    // YouTube API data may be kept 30 days at most (Developer Policies III.E.4),
    // so this can be lowered but never raised past 30.
    maxDataDays: Math.min(30, Math.max(1, num(process.env.YOUTUBE_DATA_MAX_DAYS, 30))),
  },

  // Fuzzy matching for gap recurrence (lib/recurrence.js). Gaps are re-phrased
  // by the model every run, so the same demand never comes back as the same
  // string -- exact matching would report everything as new forever, which is
  // indistinguishable from the feature being broken.
  recurrence: {
    minSimilarity: num(process.env.RECURRENCE_MIN_SIMILARITY, 0.4),
    // Runs closer together than this re-read the same comments, so they count
    // as one sighting, and a run this recent is not compared against at all.
    minHours: num(process.env.RECURRENCE_MIN_HOURS, 24),
    // One coincidentally shared word ("shorts", "beginner") is not evidence
    // that two questions are the same question, however short they are.
    minSharedTokens: num(process.env.RECURRENCE_MIN_SHARED_TOKENS, 2),
  },
  // Off unless set: with it always on, a forged X-Forwarded-For header gave
  // every request a fresh IP and walked straight past the rate limiter.
  // Set to the number of proxies in front of the server (e.g. 1 behind nginx).
  trustProxy: num(process.env.TRUST_PROXY, 0),
  // Origins allowed to call the API from a browser. Empty = same origin only;
  // the built app and the Vite dev proxy are both same-origin.
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  rateLimit: {
    perHour: num(process.env.RATE_LIMIT_PER_HOUR, 10),
    // "Make it" briefs cost one DeepSeek call and no YouTube quota.
    briefsPerHour: num(process.env.BRIEF_RATE_LIMIT_PER_HOUR, 30),
  },

  // Saved-watch scheduler (services/scheduler.js). Single-instance, like
  // lib/jobs.js -- two servers running it would double every watch.
  scheduler: {
    enabled: process.env.SCHEDULER_ENABLED !== 'false',
    checkIntervalMs: num(process.env.SCHEDULER_CHECK_INTERVAL_MS, 5 * 60 * 1000),
    // A floor on how often a watch may re-run. Below this, watches become a way
    // to drain the day's YouTube quota by accident.
    minIntervalHours: num(process.env.SCHEDULER_MIN_INTERVAL_HOURS, 6),
    maxWatches: num(process.env.SCHEDULER_MAX_WATCHES, 20),
    // A watch interval past a year overflowed the next-run date and crashed the process.
    maxIntervalHours: 24 * 365,
    runTimeoutMinutes: num(process.env.SCHEDULER_RUN_TIMEOUT_MINUTES, 20),
  },

  // --- Heat score weights (open design decision #1) ----------------------
  // Tunable without touching scoring logic. See lib/heat.js for the formula.
  heat: {
    wVelocity: 0.45,      // views/day  -> rewards "right now", not all-time
    wOutperformance: 0.35, // views/subscriber -> normalizes channel size (#2)
    wEngagement: 0.20,     // (likes + k*comments)/views -> audience intensity
    commentWeight: 5,      // a comment is worth this many likes
    minSubsFloor: 500,     // avoids divide-by-zero blowups on tiny channels
  },

  // "Make it" briefs (services/brief.js).
  brief: {
    // There is no target length: a brief runs as long as the things viewers asked
    // for take to teach (see assessLength). This is only the ceiling past which a
    // request is too broad for one video. A Short is always under a minute.
    maxMinutes: num(process.env.BRIEF_MAX_MINUTES, 15),
    // A gap resting on this few comments or likes is an early signal: the brief
    // still drafts, and suggests testing with a Short before a long video.
    thinComments: num(process.env.BRIEF_THIN_COMMENTS, 3),
    thinLikes: num(process.env.BRIEF_THIN_LIKES, 5),
    // DeepSeek models think by default, and then ignore temperature. 'disabled'
    // makes temperature take effect; '' leaves the model default. Chosen by a
    // measured comparison (README, "Make it" variance).
    thinking: process.env.BRIEF_THINKING ?? '',
    temperature: num(process.env.BRIEF_TEMPERATURE, 0.2),
  },

  // Median-multiple outliers (lib/outlier.js, from youtube-agent-skill's yt-viral).
  // A niche search returns 1-2 videos per channel, which is not enough for a
  // median, so the top channels' recent uploads are fetched as a baseline:
  // 1 playlistItems unit + ~1 videos.list unit per channel. 0 switches it off.
  outlier: {
    channels: num(process.env.OUTLIER_CHANNELS, 20),
    minBaseline: num(process.env.OUTLIER_MIN_BASELINE, 4),
    // Uploads younger than this have not finished accumulating views, so they
    // would drag a channel's median down and inflate every multiple.
    minBaselineAgeDays: num(process.env.OUTLIER_MIN_AGE_DAYS, 3),
    threshold: num(process.env.OUTLIER_THRESHOLD, 2),
  },
};

export function assertConfig() {
  const missing = [];
  if (!config.youtube.apiKey) missing.push('YOUTUBE_API_KEY');
  if (!config.deepseek.apiKey) missing.push('DEEPSEEK_API_KEY');
  if (missing.length) {
    throw new Error(
      `Missing required env var(s): ${missing.join(', ')}. Copy .env.example to .env and fill them in.`
    );
  }
}
