/**
 * Which search.list slices a given request needs. Each slice is one 100-unit
 * call, so this function IS the cost model of a run -- lib/quota.js prices a
 * request by calling it (before spending anything), and services/youtube.js
 * executes it (spending as it goes). Kept in lib/ rather than services/
 * because both of those need it and services/youtube.js -> lib/quota.js is
 * already an import edge; putting this in services/ would make it circular.
 *
 * `videoDuration` buckets are short(<4m) / medium(4-20m) / long(>20m), and a
 * single call takes exactly one of them. That matters more than it looks:
 *
 * - "shorts" (<=180s) sits inside `short`, so one slice covers it and the exact
 *   180s cut happens after videos.list returns real durations.
 * - "long" means "not a Short", i.e. everything over 180s -- which spans BOTH
 *   `medium` and `long`. There is no single bucket for it. Asking for `medium`
 *   alone (the original bug here) silently capped long-form analysis at 20
 *   minutes: verified live on "home lab server tutorial"/90d, contentType=long
 *   returned 0 videos over 20 minutes while the same query under `any` surfaced
 *   11, up to 45 minutes. For tutorial/podcast/review niches that removes the
 *   deepest and most relevant half of the corpus. Asking for `any` instead
 *   would restore the range but dilute the pool with Shorts that the post-
 *   filter then throws away -- and since Shorts carry outsized view counts, an
 *   order=viewCount pool could come back almost entirely Shorts, leaving a
 *   handful of long-form videos to analyse. So long-form spends two slices and
 *   keeps all 100 candidates genuinely long-form.
 *
 * Deep scan adds a second pass ordered by date over the same buckets. The
 * default `viewCount` order makes the pool the top N by ABSOLUTE views, which
 * quietly pre-selects against the very thing views-per-subscriber scoring is
 * meant to find -- a small channel breaking out with 8k views in a niche whose
 * ceiling is 2M is never in the pool to be scored at all.
 */
export function searchPlan({ contentType = 'both', deepScan = false } = {}) {
  const durations = contentType === 'shorts' ? ['short'] : contentType === 'long' ? ['medium', 'long'] : ['any'];
  const orders = deepScan ? ['viewCount', 'date'] : ['viewCount'];
  return orders.flatMap((order) => durations.map((videoDuration) => ({ order, videoDuration })));
}
