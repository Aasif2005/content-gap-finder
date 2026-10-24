// A record of every video the pipeline set aside, and why.
//
// Before this, a run said "7 of 14 videos dropped by the format/view filters" and
// nothing more: not which ones, not which filter, and nothing at all about the
// videos that were scored but never had their comments read. A report that cannot
// show its working cannot be argued with, and "weak evidence" means little when
// you can't see what the evidence was thinned from.
//
// Two kinds of entry, kept apart because they are different facts:
//   excluded -- left out of scoring altogether (a filter, or YouTube didn't return it)
//   unread   -- scored and ranked, but its comments never reached the gap mining

export const REASONS = {
  unavailable: { kind: 'excluded', label: 'YouTube did not return it (deleted, private or restricted)', filter: null },
  'format-short': { kind: 'excluded', label: 'A Short, with long-form selected', filter: 'contentType' },
  'format-long': { kind: 'excluded', label: 'Long-form, with Shorts selected', filter: 'contentType' },
  'min-views': { kind: 'excluded', label: 'Under the minimum views', filter: 'minViews' },
  'language-audio': { kind: 'excluded', label: 'Audio track is a different language', filter: 'relevanceLanguage' },
  'language-latin-words': { kind: 'excluded', label: 'Title wording reads as a different language', filter: 'relevanceLanguage' },
  'language-named-language': { kind: 'excluded', label: 'Title names a different language (e.g. "Hindi Dubbed")', filter: 'relevanceLanguage' },
  region: { kind: 'excluded', label: 'Channel is in a different country', filter: 'regionCode' },
  'not-comment-read': { kind: 'unread', label: 'Scored, but outside the top videos whose comments are read', filter: null },
  'comments-disabled': { kind: 'unread', label: 'Comments disabled or empty', filter: null },
  'untrusted-tag-only': { kind: 'unread', label: 'Comments set aside: the niche appears only in its tags', filter: null },
};

const EXAMPLES_PER_REASON = 5;
const MAX_ITEMS = 300;

export class ExclusionLedger {
  #items = [];

  /** `video` needs only a videoId; the rest is shown when known. */
  add(video, code, detail = '') {
    if (!REASONS[code]) throw new Error(`Unknown exclusion reason "${code}"`);
    this.#items.push({
      videoId: video.videoId,
      title: video.title ?? '',
      channelTitle: video.channelTitle ?? '',
      views: Number.isFinite(video.views) ? video.views : null,
      code,
      detail,
    });
  }

  count(code) {
    return this.#items.filter((i) => i.code === code).length;
  }

  countKind(kind) {
    return this.#items.filter((i) => REASONS[i.code].kind === kind).length;
  }

  /** One row per reason that occurred: label, count, and the first few examples. */
  summary() {
    const byCode = new Map();
    for (const item of this.#items) {
      if (!byCode.has(item.code)) byCode.set(item.code, []);
      byCode.get(item.code).push(item);
    }
    return [...byCode.entries()]
      .map(([code, items]) => ({
        code,
        ...REASONS[code],
        count: items.length,
        examples: items.slice(0, EXAMPLES_PER_REASON).map(publicItem),
      }))
      .sort((a, b) => (a.kind === b.kind ? b.count - a.count : a.kind === 'excluded' ? -1 : 1));
  }

  /** Every entry, capped, for the report and the audit log. */
  items() {
    return this.#items.slice(0, MAX_ITEMS).map(publicItem);
  }

  get size() {
    return this.#items.length;
  }
}

const publicItem = (i) => ({
  ...i,
  label: REASONS[i.code].label,
  url: i.videoId ? `https://www.youtube.com/watch?v=${i.videoId}` : null,
});
