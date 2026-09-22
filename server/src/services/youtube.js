import { config } from '../config.js';
import { spend } from '../lib/quota.js';

const { base, apiKey } = config.youtube;

async function call(endpoint, params, quotaKind, quotaTimes = 1) {
  spend(quotaKind, quotaTimes); // reserve first: never fire a call we can't afford
  const url = new URL(`${base}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  url.searchParams.set('key', apiKey);

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text();
    let reason = '';
    try { reason = JSON.parse(body).error?.errors?.[0]?.reason ?? ''; } catch {}
    const err = new Error(
      `YouTube ${endpoint} failed (${res.status}${reason ? ` ${reason}` : ''}): ${body.slice(0, 300)}`
    );
    err.status = res.status;
    err.code = reason === 'quotaExceeded' ? 'QUOTA_EXHAUSTED' : 'YOUTUBE_ERROR';
    throw err;
  }
  return res.json();
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** ISO-8601 duration (PT1M30S) -> seconds. */
export function parseDuration(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

export const MAX_CUSTOM_WINDOW_DAYS = 365;

export function windowToPublishedAfter(window, customAfter) {
  if (window === 'custom') {
    const at = new Date(customAfter ?? '');
    if (Number.isNaN(at.getTime())) {
      throw Object.assign(new Error('A custom range needs a valid start date.'), { status: 400, code: 'VALIDATION' });
    }
    return at.toISOString();
  }
  const hours = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30, '90d': 24 * 90 }[window];
  if (!hours) throw Object.assign(new Error(`Unknown time window: ${window}`), { status: 400 });
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

/**
 * One search.list call = 100 units. We over-fetch (up to 50) because the
 * duration filter below will discard some, and search.list cannot filter on
 * the <=180s Shorts boundary itself.
 */
export async function searchVideos({ niche, window, customAfter, contentType, regionCode, relevanceLanguage, order = 'viewCount' }) {
  // videoDuration buckets are short(<4m) / medium(4-20m) / long(>20m). Shorts are
  // <=3m, so "short" is a superset we refine after videos.list returns durations.
  const videoDuration = contentType === 'shorts' ? 'short' : contentType === 'long' ? 'medium' : 'any';

  const data = await call('search', {
    part: 'snippet',
    q: niche,
    type: 'video',
    order,
    maxResults: 50,
    publishedAfter: windowToPublishedAfter(window, customAfter),
    videoDuration,
    regionCode,
    relevanceLanguage,
  }, 'search');

  return (data.items ?? [])
    .filter((i) => i.id?.videoId)
    .map((i) => ({ videoId: i.id.videoId, channelId: i.snippet.channelId }));
}

/** videos.list, batched 50 ids per call at 1 unit each. */
export async function getVideoDetails(videoIds) {
  const out = [];
  for (const batch of chunk(videoIds, 50)) {
    const data = await call('videos', {
      part: 'snippet,statistics,contentDetails',
      id: batch.join(','),
      maxResults: 50,
    }, 'videos');

    for (const v of data.items ?? []) {
      const durationSeconds = parseDuration(v.contentDetails?.duration);
      out.push({
        videoId: v.id,
        title: v.snippet.title,
        description: v.snippet.description ?? '',
        tags: v.snippet.tags ?? [],
        channelId: v.snippet.channelId,
        channelTitle: v.snippet.channelTitle,
        publishedAt: v.snippet.publishedAt,
        thumbnail: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? null,
        durationSeconds,
        isShort: durationSeconds > 0 && durationSeconds <= 180,
        views: Number(v.statistics?.viewCount ?? 0),
        likes: Number(v.statistics?.likeCount ?? 0),       // 0 when the channel hides likes
        comments: Number(v.statistics?.commentCount ?? 0), // 0 when comments are disabled
      });
    }
  }
  return out;
}

/** channels.list, batched 50 ids per call. Subscriber counts drive size normalization. */
export async function getChannels(channelIds) {
  const unique = [...new Set(channelIds)];
  const map = new Map();
  for (const batch of chunk(unique, 50)) {
    const data = await call('channels', {
      part: 'snippet,statistics',
      id: batch.join(','),
      maxResults: 50,
    }, 'channels');

    for (const c of data.items ?? []) {
      map.set(c.id, {
        channelId: c.id,
        title: c.snippet?.title ?? '',
        subscribers: Number(c.statistics?.subscriberCount ?? 0),
        hiddenSubscribers: Boolean(c.statistics?.hiddenSubscriberCount),
        totalViews: Number(c.statistics?.viewCount ?? 0),
        videoCount: Number(c.statistics?.videoCount ?? 0),
      });
    }
  }
  return map;
}

/**
 * commentThreads.list is per-video -- it takes a single videoId, so it cannot be
 * batched the way videos.list can. 1 unit each, but each is a round trip, so the
 * caller caps how many videos get this treatment.
 * order=relevance is YouTube's own engagement ranking; it is the closest proxy
 * we get to "top comments" since the API won't sort by like count.
 */
export async function getComments(videoId, maxResults = 50) {
  try {
    const data = await call('commentThreads', {
      part: 'snippet,replies',
      videoId,
      order: 'relevance',
      maxResults: Math.min(maxResults, 100),
      textFormat: 'plainText',
    }, 'commentThreads');

    return (data.items ?? []).map((t) => {
      const top = t.snippet.topLevelComment.snippet;
      return {
        text: top.textDisplay,
        likes: Number(top.likeCount ?? 0),
        author: top.authorDisplayName,
        authorChannelId: top.authorChannelId?.value ?? null,
        replyCount: Number(t.snippet.totalReplyCount ?? 0),
        replies: (t.replies?.comments ?? []).slice(0, 3).map((r) => ({
          text: r.snippet.textDisplay,
          likes: Number(r.snippet.likeCount ?? 0),
          authorChannelId: r.snippet.authorChannelId?.value ?? null,
        })),
      };
    });
  } catch (err) {
    // Comments disabled is a 403 on an otherwise fine video -- skip, don't fail
    // the whole run. A hard quota error still propagates.
    if (err.code === 'QUOTA_EXHAUSTED') throw err;
    return [];
  }
}
