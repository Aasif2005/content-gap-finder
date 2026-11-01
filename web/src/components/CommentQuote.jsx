import { createContext, useContext, useMemo, useState } from 'react';
import { ArrowUpRight, Heart } from 'lucide-react';
import { compact } from '../lib/format.js';
import { cx } from '../lib/cx.js';
import { EvidenceMark } from './ui/EvidenceMark.jsx';

/**
 * Every quoted comment is YouTube content, and YouTube's branding rules want
 * attribution on each content element -- so each quote links back to the video
 * it was written under. Titles come from whatever videos the report carries;
 * a comment under a video the report didn't keep still links, just untitled.
 */
const VideoTitles = createContext(new Map());

const LONG_QUOTE = 220;
const CUT_AT = 180;

export function videoTitleMap(result) {
  const map = new Map();
  const add = (v) => { if (v?.videoId && v.title && !map.has(v.videoId)) map.set(v.videoId, v.title); };
  (result?.topVideos ?? []).forEach(add);
  for (const t of result?.topics ?? []) (t.videos ?? []).forEach(add);
  for (const a of result?.avoid ?? []) (a.videos ?? []).forEach(add);
  for (const g of result?.gaps ?? []) (g.coveringVideos ?? []).forEach(add);
  return map;
}

export function VideoTitlesProvider({ result, children }) {
  const map = useMemo(() => videoTitleMap(result), [result]);
  return <VideoTitles.Provider value={map}>{children}</VideoTitles.Provider>;
}

/**
 * One quoted comment: its text, its likes, and a link to the video it came from.
 *
 * The amber highlighter marks what a viewer wrote. `marked` (default on) paints
 * it behind the quote; `sweep` draws it left to right once when it scrolls into
 * view (reserve that for the first quote on a card); `lead` sets the quote a
 * step larger, for the card's strongest comment.
 */
export function CommentQuote({ comment, className, marked = true, sweep = false, lead = false, block = false }) {
  const titles = useContext(VideoTitles);
  const title = titles.get(comment.videoId);
  const [open, setOpen] = useState(false);
  // A 60-word comment highlighted in full is a slab of amber. Long ones show
  // their opening and expand on request (cut by code point, so an emoji or a
  // Tamil conjunct is never split).
  const text = comment.text ?? '';
  const points = [...text];
  const long = points.length > LONG_QUOTE;
  const shown = long && !open ? `${points.slice(0, CUT_AT).join('').replace(/\s+\S*$/, '')}…` : text;
  const quote = <>&ldquo;{shown}&rdquo;</>;
  const likes = comment.likes != null && (
    <span
      className="nums inline-flex items-center gap-1 whitespace-nowrap font-mono text-xs"
      title={`${comment.likes.toLocaleString()} like${comment.likes === 1 ? '' : 's'} on this comment`}
    >
      <Heart aria-hidden className="h-3 w-3" />
      <span className="sr-only">Likes: </span>
      {compact(comment.likes)}
    </span>
  );
  const source = comment.videoId && (
    <a
      href={`https://www.youtube.com/watch?v=${encodeURIComponent(comment.videoId)}`}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex max-w-full items-center gap-1 py-1 underline-offset-2 hover:underline"
      title="Open the YouTube video this comment was written under"
    >
      <span className="truncate">on {title ? <>&ldquo;{title}&rdquo;</> : 'a YouTube video'}</span>
      <ArrowUpRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
    </a>
  );

  // The block form: the comment as a gold panel, the viewer's own words on the
  // highlighter ground (tokens keep it legible in both themes).
  if (block) {
    return (
      <li className={cx('min-w-0 rounded-xl bg-mark p-4 text-on-mark', className)}>
        <p className={cx('leading-[1.55] italic', lead ? 'text-[17px]' : 'text-[16px]')}>{quote}</p>
        {long && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-1 flex items-center py-1.5 text-[13px] font-medium underline-offset-2 hover:underline"
          >
            {open ? 'Show less' : 'Read full comment'}
          </button>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-xs opacity-80">
          {likes}
          {source}
        </div>
      </li>
    );
  }

  return (
    <li className={cx('min-w-0', className)}>
      <p className={cx('leading-[1.55] text-fg', lead ? 'text-[19px] font-medium' : 'text-[17px]')}>
        {marked ? <EvidenceMark sweep={sweep}>{quote}</EvidenceMark> : quote}
        {comment.likes != null && (
          <span
            className="nums ml-2.5 inline-flex items-center gap-1 whitespace-nowrap align-baseline font-mono text-xs font-normal text-fg-3"
            title={`${comment.likes.toLocaleString()} like${comment.likes === 1 ? '' : 's'} on this comment`}
          >
            <Heart aria-hidden className="h-3 w-3 self-center" />
            <span className="sr-only">Likes: </span>
            {compact(comment.likes)}
          </span>
        )}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1 flex items-center py-1.5 text-[13px] font-medium text-fg-2 underline-offset-2 hover:text-fg hover:underline"
        >
          {open ? 'Show less' : 'Read full comment'}
        </button>
      )}
      {comment.videoId && (
        <a
          href={`https://www.youtube.com/watch?v=${encodeURIComponent(comment.videoId)}`}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-0.5 inline-flex max-w-full items-center gap-1 py-1 text-[13px] text-fg-3 underline-offset-2 transition-colors hover:text-fg hover:underline"
          title="Open the YouTube video this comment was written under"
        >
          <span className="truncate">on {title ? <>&ldquo;{title}&rdquo;</> : 'a YouTube video'}</span>
          <ArrowUpRight aria-hidden className="h-3.5 w-3.5 shrink-0" />
        </a>
      )}
    </li>
  );
}

/**
 * Which videos the quoted comments were written under, as small tonal cards.
 * Counts are of the comments the report quotes, not of every comment on the
 * video. Shown only when the demand spans more than one video.
 */
export function AskedUnder({ evidence = [] }) {
  const titles = useContext(VideoTitles);
  const counts = new Map();
  for (const e of evidence) if (e.videoId) counts.set(e.videoId, (counts.get(e.videoId) ?? 0) + 1);
  if (counts.size < 2) return null;
  const rows = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <div className="mt-6">
      <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-fg-3">
        Asked under {counts.size} {counts.size === 1 ? 'video' : 'videos'}
      </h4>
      <ul className="mt-2 grid gap-3 sm:grid-cols-3">
        {rows.map(([id, n]) => (
          <li key={id} className="flex min-w-0 flex-col justify-between rounded-xl bg-surface-2 p-3">
            <a
              href={`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`}
              target="_blank"
              rel="noreferrer noopener"
              className="line-clamp-2 text-[14px] font-semibold leading-snug text-fg underline-offset-2 hover:underline"
              title="Open the YouTube video"
            >
              {titles.get(id) ?? 'A YouTube video'}
            </a>
            <span className="nums mt-2 font-mono text-[11px] text-fg-3">{n} quoted {n === 1 ? 'comment' : 'comments'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
