import { ArrowUpRight } from 'lucide-react';
import { EvidenceMark, Logo } from '../ui/index.js';

const BENEFITS = [
  'Every gap quotes the real comments and links to the video.',
  'Our own scores are marked, so you can tell them from YouTube’s numbers.',
  'Saved reports stay for 30 days. Opening one costs nothing.',
];

/** The example comment. Clearly labelled as an example: it is not a real viewer. */
function QuoteBrand() {
  return (
    <>
      <figure className="max-w-[460px]">
        <blockquote className="text-[40px] font-medium leading-[1.25] tracking-[-0.025em]">
          <EvidenceMark sweep>“can i cook it?”</EvidenceMark>
        </blockquote>
        <figcaption className="mt-[18px] flex flex-wrap items-center gap-x-1 text-[15px] text-fg-3">
          Example comment · on “Example video title”
          <ArrowUpRight aria-hidden className="h-4 w-4" />
        </figcaption>
      </figure>
      <p className="mt-8 max-w-[460px] text-xl leading-normal text-fg-2">
        Every video worth making starts as something a viewer already said.
      </p>
    </>
  );
}

function BenefitsBrand() {
  return (
    <div className="max-w-[460px]">
      <p className="text-[40px] font-semibold leading-[1.1] tracking-[-0.03em]">Three fresh analyses a day. Free.</p>
      <ul className="mt-9 flex list-none flex-col p-0">
        {BENEFITS.map((text, i) => (
          <li
            key={text}
            className={`border-t border-line-strong py-[18px] text-[17px] leading-snug text-fg-2 ${i === BENEFITS.length - 1 ? 'border-b' : ''}`}
          >
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The two-panel frame for log in, sign up and reset. The brand side is pinned
 * to night; the form side follows the OS theme. Under 1024px the brand side
 * collapses to a slim strip above the form. The page's one `<h1>` belongs to
 * the form (passed as children), so the brand side uses no heading.
 *
 * `brand`: 'quote' (the example comment) or 'benefits' (what you get).
 */
export default function AuthLayout({ brand = 'quote', children }) {
  return (
    <div className="min-h-dvh bg-bg text-fg lg:grid lg:grid-cols-[480fr_560fr]">
      <a
        href="#auth-form"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-line-strong focus:bg-surface focus:px-4 focus:py-2.5 focus:text-fg"
      >
        Skip to the form
      </a>

      {/* Narrow screens: a strip, not a second screen. */}
      <header className="theme-night flex items-center justify-between gap-4 bg-bg px-4 py-2 text-fg sm:px-6 lg:hidden">
        <Logo href="/" size={24} />
        <span className="text-sm text-fg-3">Free during beta</span>
      </header>

      <aside className="theme-night hidden min-h-dvh flex-col justify-between bg-bg px-14 py-12 text-fg lg:flex">
        <Logo href="/" size={26} className="self-start" />
        <div>{brand === 'benefits' ? <BenefitsBrand /> : <QuoteBrand />}</div>
        <p className="text-sm text-fg-3">Free during beta</p>
      </aside>

      <main id="auth-form" tabIndex={-1} className="flex items-start justify-center px-4 pb-14 pt-10 focus:outline-none sm:px-6 lg:min-h-dvh lg:items-start lg:pb-12 lg:pt-28">
        <div className="fade-in w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}

/** The page heading and its one sentence. */
export function AuthHeading({ title, children }) {
  return (
    <>
      <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.03em]">{title}</h1>
      {children && <p className="mt-3 text-base leading-normal text-fg-2">{children}</p>}
    </>
  );
}

/** The "or with email" rule between the Google button and the form. */
export function OrDivider({ children = 'or with email' }) {
  return (
    <div className="my-6 flex items-center gap-3.5 text-sm text-fg-3" role="separator" aria-label={children}>
      <span aria-hidden className="h-px flex-1 bg-line-strong" />
      <span aria-hidden>{children}</span>
      <span aria-hidden className="h-px flex-1 bg-line-strong" />
    </div>
  );
}
