import { Derived } from './Bits.jsx';

/**
 * YouTube's branding guidelines: an app that depends entirely on YouTube data
 * shows "developed with YouTube" next to that data, clickable through to
 * YouTube, and never more prominent than the app's own name.
 *
 * Text for now. To use the official artwork, download it from YouTube's brand
 * resources (https://brand.youtube) into web/public/brand/ and set LOGO_SRC;
 * the guidelines forbid redrawing or recolouring the logo, so it is not drawn here.
 */
const LOGO_SRC = null;

export function YouTubeAttribution({ className = '' }) {
  return (
    <a
      href="https://www.youtube.com"
      target="_blank"
      rel="noreferrer noopener"
      className={`inline-flex items-center gap-1.5 text-ink-500 underline-offset-2 hover:text-ink-800 hover:underline dark:text-ink-400 dark:hover:text-ink-200 ${className}`}
    >
      {LOGO_SRC ? <img src={LOGO_SRC} alt="Developed with YouTube" className="h-4 w-auto" /> : 'Developed with YouTube'}
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
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-ink-500 dark:text-ink-400">
      {when && <span className="nums">YouTube data as of {when}</span>}
      <span>
        <Derived /> marks figures Content Gap Finder calculates. They are not YouTube metrics.
      </span>
      <YouTubeAttribution />
    </p>
  );
}
