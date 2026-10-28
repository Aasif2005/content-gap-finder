import { ArrowRight } from 'lucide-react';
import { Button, GlyphPortal, Logo } from '../components/ui/index.js';
import { safeNext } from '../components/auth/helpers.js';
import { Link, navigate, useRoute } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';

// Paper and ink follow the theme; the field the camera flies into is the pinned night navy.
const STAGE = {
  '--gp-paper': 'var(--bg)',
  '--gp-ink': 'var(--fg)',
  '--gp-field': '#0A1220',
  '--gp-foreground': '#EEF2FA',
  fontFamily: 'var(--font-sans)',
};

const POINTS = [
  { n: '01', title: 'Explore a niche', body: 'Find what viewers keep asking for that nobody has made yet.' },
  { n: '02', title: 'Analyze a channel', body: 'See which videos work and what its own viewers want next.' },
  { n: '03', title: 'Watch what recurs', body: 'A watch re-runs a search so you can see which gaps keep coming back.' },
];

/** The earth behind the word: the zoom ends inside the same planet as the landing page. */
function Planet() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden" style={{ transform: 'scale(var(--gp-field-scale,1))' }}>
      <div className="absolute inset-0 bg-[#0A1220]" />
      <img src="/img/earth-blue-marble.jpg" alt="" className="absolute left-1/2 top-[-8%] h-[116%] w-auto max-w-none -translate-x-1/2 object-cover" />
      {/* lifts the oceans off a dark page while the word is still a word */}
      <div className="absolute inset-0 bg-[#3A4A72]" style={{ opacity: 'calc(0.6 * (1 - var(--gp-reveal, 0)))' }} />
      {/* a scrim that deepens as the camera lands, so the copy stays readable on the planet */}
      <div className="absolute inset-0 bg-[#0A1220]" style={{ opacity: 'calc(0.1 + 0.72 * var(--gp-reveal, 0))' }} />
    </div>
  );
}

/** Where everyone lands right after logging in or signing up, on the way to the dashboard. */
export default function Welcome() {
  const { user } = useAuth();
  const { query } = useRoute();
  const dest = safeNext(query.next);
  const first = (user?.name ?? '').trim().split(/\s+/)[0];
  const go = (href) => (e) => { e.preventDefault(); navigate(href, { replace: href === dest }); };

  return (
    <main className="min-h-screen bg-bg">
      <GlyphPortal
        word="GAPSTRONAUT"
        focusChar="O"
        fontWeight={800}
        fontFamily="'Schibsted Grotesk Variable', 'Schibsted Grotesk', system-ui, sans-serif"
        scrollLength={2.4}
        enterLabel="Step inside"
        style={STAGE}
        background={<Planet />}
        front={
          <>
            <div className="absolute inset-x-6 top-6 flex items-center justify-between sm:inset-x-12 sm:top-9">
              <Logo size={24} />
              <Link href={dest} onClick={go(dest)} className="inline-flex min-h-11 items-center text-sm font-semibold text-fg-2 hover:text-fg">
                Skip to dashboard
              </Link>
            </div>
            <p className="absolute inset-x-6 text-center text-sm text-fg-2" style={{ bottom: 'calc(100% - var(--gp-word-top, 35%) + 28px)' }}>
              {first ? `Welcome aboard, ${first}.` : 'Welcome aboard.'}
            </p>
            <p className="absolute inset-x-6 text-center text-base text-fg-2" style={{ top: 'calc(var(--gp-word-bottom, 50%) + 28px)' }}>
              Every gap starts as a comment.
            </p>
          </>
        }
      >
        <div className="theme-night mx-auto flex w-full max-w-5xl flex-col items-start gap-10 bg-transparent">
          <h2 className="max-w-[16ch] text-[length:clamp(2rem,1.2rem_+_3vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.03em] [text-wrap:balance]">
            Your workspace is ready.
          </h2>
          <ol className="grid w-full gap-8 md:grid-cols-3 md:gap-12">
            {POINTS.map((p) => (
              <li key={p.n} className="border-t border-white/20 pt-4">
                <h3 className="text-lg font-semibold"><span className="nums mr-3 text-xs tracking-widest text-white/60">{p.n}</span>{p.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-white/80">{p.body}</p>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-3">
            <Button href={dest} onClick={go(dest)}>Go to dashboard <ArrowRight aria-hidden className="h-4 w-4" /></Button>
            <Button href="/explore" variant="ghost">Explore a niche</Button>
          </div>
        </div>
      </GlyphPortal>
    </main>
  );
}
