import { config } from '../config.js';
import { spend } from '../lib/quota.js';
import { languageQueryHint } from '../lib/language.js';
import { searchPlan } from '../lib/searchPlan.js';

export { searchPlan };

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
 * Builds the candidate pool. One search.list slice = 100 units and 50 results;
 * see searchPlan() for why a request needs the slices it does. Results are
 * merged and deduped by videoId, so overlapping slices cost quota but never
 * double-count a video.
 *
 * Returns `{ hits, slices }` -- `slices` is the per-call yield, which the audit
 * log prints so a thin pool can be traced to the slice that came back empty.
 */
export async function searchVideos({ niche, window, customAfter, contentType, regionCode, relevanceLanguage, deepScan = false }) {
  // relevanceLanguage as a search.list PARAMETER barely moves the ranking (see
  // lib/language.js) -- folding the language's name into the QUERY TEXT itself
  // does much more, because search.list is a full-text relevance search and
  // creators overwhelmingly write their audience language into an otherwise
  // English/romanized title or tags for reach. Confirmed live: niche "ghost
  // story" + regionCode=IN + relevanceLanguage=ta returned 1/50 verified-Tamil
  // candidates; "ghost story Tamil" returned 32/50. This doesn't replace the
  // relevanceLanguage param (still sent below) or the post-fetch hard filter --
  // it fixes the step before either of them gets a chance to work: too few
  // genuinely on-language candidates being fetched in the first place.
  const languageHint = languageQueryHint(relevanceLanguage);
  const q = languageHint ? `${niche} ${languageHint}` : niche;
  const publishedAfter = windowToPublishedAfter(window, customAfter);

  const plan = searchPlan({ contentType, deepScan });
  const byId = new Map();
  const slices = [];

  for (const slice of plan) {
    const data = await call('search', {
      part: 'snippet',
      q,
      type: 'video',
      order: slice.order,
      maxResults: 50,
      publishedAfter,
      videoDuration: slice.videoDuration,
      regionCode,
      relevanceLanguage,
    }, 'search');

    let found = 0;
    for (const i of data.items ?? []) {
      if (!i.id?.videoId) continue;
      found++;
      // First slice to surface a video wins; later slices only add new ones.
      if (!byId.has(i.id.videoId)) {
        byId.set(i.id.videoId, { videoId: i.id.videoId, channelId: i.snippet.channelId });
      }
    }
    slices.push({ ...slice, found, poolAfter: byId.size });
  }

  return { hits: [...byId.values()], slices };
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
        // The spoken/audio language -- creator-set or YouTube-detected, BCP-47
        // (e.g. "ta", "en-GB"). Free: part=snippet already fetched. Near-
        // universal coverage in practice (unlike channel country), and it's a
        // much stronger language signal than searching title/description text,
        // since it reflects the actual audio track rather than what script the
        // title happens to be written in. See lib/language.js for how this
        // gets combined with script/word-based text checks.
        defaultAudioLanguage: v.snippet.defaultAudioLanguage ?? null,
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
        // Self-reported by the creator, spotty coverage -- many leave it
        // unset. Real, but only when present; null means "unknown", not "no".
        country: c.snippet?.country ?? null,
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

// --------------------------------------------------------- channel mode ----

/**
 * Parses whatever a person pastes into a channel reference. Accepts a full URL
 * (/channel/UC..., /@handle, /c/name, /user/name), a bare @handle, or a raw
 * UC... id. Returns `{ kind, value }` for resolveChannel() to look up, or null
 * if it doesn't look like a channel reference at all.
 */
export function parseChannelInput(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  // A bare channel id. These are always UC + 22 chars.
  if (/^UC[\w-]{22}$/.test(s)) return { kind: 'id', value: s };
  if (/^@[\w.-]+$/.test(s)) return { kind: 'handle', value: s };

  let url;
  try {
    url = new URL(s.includes('://') ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$/.test(url.hostname) && !/(^|\.)youtu\.be$/.test(url.hostname)) return null;

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'channel' && parts[1]) return { kind: 'id', value: parts[1] };
  if (parts[0]?.startsWith('@')) return { kind: 'handle', value: parts[0] };
  // /c/Name and /user/Name are both legacy custom-URL forms; forHandle is the
  // modern lookup and generally still resolves them.
  if ((parts[0] === 'c' || parts[0] === 'user') && parts[1]) return { kind: 'handle', value: `@${parts[1]}` };
  return null;
}

/**
 * Resolves a channel reference to its id, title, stats and uploads playlist.
 * 1 unit -- channels.list, not search.list, which is the whole reason channel
 * mode costs ~29 units a run against a niche search's 127+.
 */
export async function resolveChannel(ref) {
  const params = { part: 'snippet,statistics,contentDetails', maxResults: 1 };
  if (ref.kind === 'id') params.id = ref.value;
  else params.forHandle = ref.value;

  const data = await call('channels', params, 'channels');
  const c = data.items?.[0];
  if (!c) {
    throw Object.assign(
      new Error(`No YouTube channel found for "${ref.value}". Paste the channel's URL, @handle, or UC... id.`),
      { status: 404, code: 'CHANNEL_NOT_FOUND' }
    );
  }

  const uploadsPlaylistId = c.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw Object.assign(
      new Error(`"${c.snippet?.title}" has no public uploads playlist to analyse.`),
      { status: 404, code: 'CHANNEL_NO_UPLOADS' }
    );
  }

  return {
    channelId: c.id,
    title: c.snippet?.title ?? '',
    description: c.snippet?.description ?? '',
    country: c.snippet?.country ?? null,
    subscribers: Number(c.statistics?.subscriberCount ?? 0),
    hiddenSubscribers: Boolean(c.statistics?.hiddenSubscriberCount),
    totalViews: Number(c.statistics?.viewCount ?? 0),
    videoCount: Number(c.statistics?.videoCount ?? 0),
    uploadsPlaylistId,
  };
}

/**
 * Recent uploads from a channel's uploads playlist, back to `publishedAfter`.
 *
 * playlistItems.list is 1 unit per page of 50 against search.list's 100 per
 * page -- so this walks pages freely where a niche search cannot. Uploads come
 * back newest-first, which is what lets it stop as soon as it crosses the
 * window boundary instead of paging the channel's whole history.
 *
 * `maxPages` bounds latency rather than quota: a channel with 5,000 uploads
 * inside a 90-day window is not a channel this tool can usefully analyse in one
 * request anyway.
 */
export async function getChannelUploads({ uploadsPlaylistId, publishedAfter, maxPages = 6 }) {
  const cutoff = new Date(publishedAfter).getTime();
  const hits = [];
  let pageToken;
  let pages = 0;
  let reachedCutoff = false;

  while (pages < maxPages) {
    const data = await call('playlistItems', {
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken,
    }, 'playlistItems');
    pages++;

    for (const item of data.items ?? []) {
      const videoId = item.contentDetails?.videoId;
      if (!videoId) continue;
      // contentDetails.videoPublishedAt is the video's own publish time;
      // snippet.publishedAt is when it was ADDED to the playlist, which for an
      // uploads playlist is usually but not always the same thing.
      const publishedAt = item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt;
      if (publishedAt && new Date(publishedAt).getTime() < cutoff) {
        reachedCutoff = true;
        continue;
      }
      hits.push({ videoId, channelId: item.snippet?.channelId });
    }

    pageToken = data.nextPageToken;
    if (!pageToken || reachedCutoff) break;
  }

  return { hits, pages, truncated: Boolean(pageToken) && !reachedCutoff };
}
