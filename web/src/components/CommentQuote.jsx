import { createContext, useContext, useMemo } from 'react';
import { compact } from '../lib/format.js';

/**
 * Every quoted comment is YouTube content, and YouTube's branding rules want
 * attribution on each content element -- so each quote links back to the video
 * it was written under. Titles come from whatever videos the report carries;
 * a comment under a video the report didn't keep still links, just untitled.
 */
const VideoTitles = createContext(new Map());

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

/** One quoted comment: its text, its likes, and a link to the video it came from. */
export function CommentQuote({ comment, className }) {
  const titles = useContext(VideoTitles);
  const title = titles.get(comment.videoId);
  return (
    <li className={className}>
      <span className="italic">“{comment.text}”</span>
      {comment.likes != null && (
        <span className="nums ml-2 whitespace-nowrap text-xs text-ink-400">♥ {compact(comment.likes)}</span>
      )}
      {comment.videoId && (
        <a
          href={`https://www.youtube.com/watch?v=${encodeURIComponent(comment.videoId)}`}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-0.5 block truncate text-xs text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline dark:text-ink-400 dark:hover:text-ink-200"
          title="Open the YouTube video this comment was written under"
        >
          on {title ? <>“{title}”</> : 'a YouTube video'} ↗
        </a>
      )}
    </li>
  );
}
