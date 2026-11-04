import { Derived } from './ui/Derived.jsx';
import { useColorMode } from '../lib/colorMode.js';

/**
 * YouTube's branding guidelines: an app that depends entirely on YouTube data
 * shows "developed with YouTube" next to that data, clickable through to
 * YouTube, and never more prominent than the app's own name.
 *
 * The official artwork from YouTube's brand resources (https://brand.youtube), unaltered
 * except for being scaled down: full colour with the almost-black wordmark on light
 * backgrounds, with the white wordmark on dark ones. The guidelines forbid redrawing,
 * recolouring or cropping it, so never edit these files.
 */
const LOGO = { light: '/brand/youtube-logo-light.png', dark: '/brand/youtube-logo-dark.png' };

/** `onDark`: the surface is dark whatever the site theme is (the landing footer is always navy), so use the white wordmark. */
export function YouTubeAttribution({ className = '', onDark = false }) {
  const { mode } = useColorMode();
  return (
    <a
      href="https://www.youtube.com"
      target="_blank"
      rel="noreferrer noopener"
      className={`inline-flex items-center gap-1.5 text-fg-2 underline-offset-2 hover:text-fg hover:underline ${className}`}
    >
      <span>Developed with</span>
      <img src={LOGO[onDark || mode === 'dark' ? 'dark' : 'light']} alt="YouTube" width="60" height="20" className="h-5 w-auto" />
    </a>
  );
}

const asOf = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/**
 * Where a report's numbers come from and when they were read: a saved report
 * is historical data, which YouTube's policies (III.E.4.f) want shown in its
 * time context, and our own figures must be told apart from YouTube's.
 */
export function ReportProvenance({ generatedAt }) {
  const when = asOf(generatedAt);
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-fg-3">
      {when && <span className="nums">YouTube data as of {when}</span>}
      <span>
        <Derived /> marks figures Gapstronaut calculates. They are not YouTube metrics.
      </span>
      <YouTubeAttribution />
    </p>
  );
}
