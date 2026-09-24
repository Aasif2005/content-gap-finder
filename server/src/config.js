const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const config = {
  port: num(process.env.PORT, 8787),
  isProd: process.env.NODE_ENV === 'production',

  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
    base: 'https://www.googleapis.com/youtube/v3',
    // Documented unit costs. search.list is the expensive one by 100x, which is
    // why a run spends as few of them as the request allows (see lib/searchPlan.js)
    // and batches everything else. playlistItems is what makes channel mode cheap:
    // walking a channel's uploads costs 1 unit where searching costs 100.
    cost: { search: 100, videos: 1, channels: 1, commentThreads: 1, playlistItems: 1 },
    dailyUnitBudget: num(process.env.YOUTUBE_DAILY_UNIT_BUDGET, 9000),
    maxCommentVideos: num(process.env.MAX_COMMENT_VIDEOS, 25),
    commentsPerVideo: num(process.env.COMMENTS_PER_VIDEO, 50),
    // Below this many scored videos, the relative scoring the whole report rests
    // on stops meaning anything: min-max normalization over 3 videos makes heat
    // a rank in disguise, and scoreTopic's breadth bonus has nothing to measure.
    // The pipeline warns instead of pretending. A real run ("what if hypothesis"
    // + language ta) came back with 3 candidates and was presented with exactly
    // the same confidence as a 50-video run.
    thinPoolThreshold: num(process.env.THIN_POOL_THRESHOLD, 12),
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
  store: { maxRuns: num(process.env.STORE_MAX_RUNS, 500) },
  rateLimit: { perHour: num(process.env.RATE_LIMIT_PER_HOUR, 10) },

  // --- Heat score weights (open design decision #1) ----------------------
  // Tunable without touching scoring logic. See lib/heat.js for the formula.
  heat: {
    wVelocity: 0.45,      // views/day  -> rewards "right now", not all-time
    wOutperformance: 0.35, // views/subscriber -> normalizes channel size (#2)
    wEngagement: 0.20,     // (likes + k*comments)/views -> audience intensity
    commentWeight: 5,      // a comment is worth this many likes
    minSubsFloor: 500,     // avoids divide-by-zero blowups on tiny channels
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
