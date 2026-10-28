import { Button } from '../components/ui/index.js';

/** Anything the route table does not know. Calm, with one way out. */
export default function NotFound() {
  return (
    <div className="px-3 pt-8 sm:px-10 md:pt-14">
      <div className="theme-night relative isolate mx-auto flex max-w-[1200px] flex-col items-center overflow-hidden rounded-[1.75rem] bg-surface px-6 py-20 text-center text-fg md:rounded-[3rem] md:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: 'radial-gradient(60% 55% at 50% 0%, color-mix(in oklab, var(--focus) 26%, transparent), transparent 72%)' }}
        />
        <p className="rounded-full bg-surface-2 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.12em] text-fg-2">404</p>
        <h1 className="mt-6 max-w-2xl text-balance text-[clamp(2.25rem,1.2rem+3.6vw,4rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
          This page drifted out of orbit.
        </h1>
        <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-fg-2">
          The link may be mistyped, or the page may have moved. Reports are also removed after 30 days, so an old report link stops working.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Button href="/" size="lg" className="!px-8">Back to the homepage</Button>
          <Button href="/dashboard" variant="ghost" size="lg" className="!px-6">Go to your dashboard</Button>
        </div>
      </div>
    </div>
  );
}
