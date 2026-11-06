import { ArrowLeft } from 'lucide-react';
import { Logo, SPOTS, StudioLights, ThemeToggle, coneClip, floodClip, useStudioFlicker } from '../ui/index.js';
import { Link } from '../../lib/router.jsx';

/**
 * Trial: true = the letters a beam falls on stay bright and everything else is lit only by
 * spill (dimmer), like light on a printed wall. false = the earlier behaviour: the beams flood
 * the text, a glint crosses it, and every word ends fully bright.
 */
const REALISTIC_LIGHT = true;
const SPILL = { eyebrow: 0.8, phrase: 0.85, line: 0.85 }; // base-layer brightness outside the beams

/** What the brand panel says over the lights. Phrases, not viewer quotes: nothing here pretends to be a comment. */
const BRANDS = {
  quote: {
    eyebrow: 'Welcome back',
    phrase: 'Stop guessing.\nYour viewers\nalready told you.',
    line: 'Pick up your reports where you left them.',
  },
  agree: {
    eyebrow: 'Almost in orbit',
    phrase: 'One tiny tick.\nOne giant leap\nfor your content.',
    line: 'Agree on the right and we’ll fire up your first report.',
  },
  paused: {
    eyebrow: 'Mission on hold',
    phrase: 'No agreement,\nno launch.\nThe lights stay on.',
    line: 'Come back any time and we’ll be ready.',
  },
  reset: {
    eyebrow: 'Lost in space?',
    phrase: 'Forgot it?\nHappens to\nthe best astronauts.',
    line: 'We’ll send a link, and you’re back in orbit in a minute.',
  },
  benefits: {
    eyebrow: 'Free during beta',
    phrase: 'Viewers are asking.\nNobody’s answering.\nBe first.',
    line: 'Three analyses a day. Free.',
  },
};

function StudioBrand({ brand, lamps, bright = false }) {
  const { eyebrow, phrase, line } = BRANDS[brand] ?? BRANDS.quote;
  const halo = '0 0 30px color-mix(in oklab, var(--sl-light) 55%, transparent), 0 0 4px color-mix(in oklab, var(--sl-light) 25%, transparent)';

  if (REALISTIC_LIGHT) {
    // Base layer: faint while the lamps blink, then it settles to a spill level; the bright
    // copies (BeamText) keep the letters under each beam at full strength.
    const level = (n) => (bright ? undefined : { opacity: lamps.settled ? n : 0.1, transition: lamps.settled ? 'opacity 900ms cubic-bezier(0.16, 1, 0.3, 1)' : 'none' });
    return (
      <div className="max-w-[440px]">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-fg-2" style={level(SPILL.eyebrow)}>{eyebrow}</p>
        <p
          className="mt-4 whitespace-pre-line text-balance text-[44px] font-semibold leading-[1.08] tracking-[-0.03em]"
          style={{ ...level(SPILL.phrase), ...(bright ? { textShadow: halo } : {}) }}
        >
          {phrase}
        </p>
        <p className="mt-5 text-[18px] leading-normal text-fg-2" style={level(SPILL.line)}>{line}</p>
      </div>
    );
  }

  // Base layer: faint until the beams have flooded the text, then full, with a glint crossing
  // it once (.sl-sheen) and the halo settling (.sl-bloom). A bright copy is full strength and
  // sits under the beams (BeamText).
  const live = !bright && lamps.flooded;
  const dim = !bright && !lamps.flooded ? { opacity: 0.1 } : undefined;
  return (
    <div className="max-w-[440px]">
      <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-fg-2" style={dim}>{eyebrow}</p>
      <p
        className={`mt-4 whitespace-pre-line text-balance text-[44px] font-semibold leading-[1.08] tracking-[-0.03em] ${live ? 'sl-sheen sl-bloom' : ''}`}
        style={{ ...dim, '--sh': 'var(--fg)', ...(bright ? { textShadow: halo } : {}) }}
      >
        {phrase}
      </p>
      <p
        className={`mt-5 text-[18px] leading-normal text-fg-2 ${live ? 'sl-sheen' : ''}`}
        style={{ ...dim, '--sh': 'var(--fg-2)' }}
      >
        {line}
      </p>
    </div>
  );
}

/**
 * While the lamps stutter, only the letters a beam falls on light up. Each lamp
 * gets a full-size copy of the brand text (same padding and layout, so every glyph
 * lands on the same pixels as the base) clipped to that lamp's own cone, and shown
 * only while that lamp is on. A beam can cut a letter in half; that is the point.
 * When all three are steady the beams open out into wide fans, merge, and light every
 * letter; then the copies hand over to the base layer.
 */
function BeamText({ brand, lamps }) {
  return SPOTS.map((x, i) => (
    <div
      key={x}
      aria-hidden
      ref={(el) => el && el.setAttribute('inert', '')}
      className={`pointer-events-none absolute inset-0 flex flex-col justify-between px-14 py-12 ${REALISTIC_LIGHT && lamps.settled ? 'sl-copy-breathe' : ''}`}
      style={REALISTIC_LIGHT
        ? { clipPath: coneClip(x), opacity: lamps.on[i] ? 1 : 0 }
        : {
            clipPath: lamps.settled ? floodClip(x) : coneClip(x),
            opacity: lamps.flooded ? 0 : lamps.settled || lamps.on[i] ? 1 : 0,
            transition: lamps.settled ? 'clip-path 700ms cubic-bezier(0.16, 1, 0.3, 1), opacity 120ms linear' : 'none',
          }}
    >
      <Logo href="/" size={26} className="invisible self-start" />
      <StudioBrand brand={brand} lamps={lamps} bright />
      <p className="invisible mt-8 text-sm">Free during beta</p>
    </div>
  ));
}

/**
 * The two-panel frame for log in, sign up and reset. The brand side is a rounded
 * panel on a pinned night ground; the form side follows the theme. Under 1024px the brand side
 * gives way to the site's usual pill header (logo, theme switch) above the form. The page's one `<h1>` belongs to
 * the form (passed as children), so the brand side uses no heading.
 *
 * `brand`: 'quote' (welcome back, for log in and reset), 'benefits' (sign up), 'agree' / 'paused' (the terms step) or 'reset' (forgot password).
 * `onBack` replaces the "Back to overview" link with a "Back" button for that step.
 * The brand side is a dark studio whose ceiling lights flicker on (StudioLights);
 * its words light up with them.
 */
export default function AuthLayout({ brand = 'quote', onBack, children }) {
  const lamps = useStudioFlicker();
  return (
    <div className="min-h-dvh bg-bg text-fg lg:grid lg:grid-cols-[480fr_560fr]">
      <a
        href="#auth-form"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-line-strong focus:bg-surface focus:px-4 focus:py-2.5 focus:text-fg"
      >
        Skip to the form
      </a>

      {/* Narrow screens: the same floating pill as every other page, not a slice of the studio. */}
      <div className="px-3 pt-3 lg:hidden">
        <header className="nav-pill relative flex [--p:0] items-center justify-between gap-4 rounded-full pl-5 pr-2">
          <Logo href="/" size={24} />
          <ThemeToggle />
        </header>
      </div>

      {/* The brand panel floats inside the page margin: the Primary scale in light mode, Neutral in dark. */}
      <div className="theme-night hidden p-3 lg:block">
        <aside className="relative isolate flex h-[calc(100dvh-1.5rem)] min-h-[560px] flex-col justify-between overflow-hidden rounded-[3rem] bg-surface px-14 py-12 text-fg">
          <StudioLights state={lamps} className="-z-10" />
          <Logo href="/" size={26} className="self-start" />
          <StudioBrand brand={brand} lamps={lamps} />
          <p className="mt-8 text-sm text-fg-3">Free during beta</p>
          <BeamText brand={brand} lamps={lamps} />
        </aside>
      </div>

      <main id="auth-form" tabIndex={-1} className="flex flex-col items-center px-4 pb-14 pt-6 focus:outline-none sm:px-6 lg:min-h-dvh lg:pb-12">
        <div className="flex w-full max-w-[400px] items-center justify-between lg:max-w-[460px]">
          {onBack ? (
            <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-1 text-sm text-fg-2 transition-colors hover:text-fg">
              <ArrowLeft aria-hidden className="h-4 w-4" /> Back
            </button>
          ) : (
            <Link href="/" className="inline-flex min-h-11 items-center gap-1 text-sm text-fg-2 transition-colors hover:text-fg">
              <ArrowLeft aria-hidden className="h-4 w-4" /> Back to overview
            </Link>
          )}
          <ThemeToggle className="-mr-2 max-lg:hidden" />
        </div>
        <div className="fade-in mt-4 w-full max-w-[400px] lg:mt-16">{children}</div>
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
