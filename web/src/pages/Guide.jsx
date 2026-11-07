import { GUIDES } from '../../../server/src/lib/guides.js';
import { Button } from '../components/ui/index.js';
import { Link, goBackOr } from '../lib/router.jsx';

/**
 * A public how-to guide. The words come from server/src/lib/guides.js, the same file the crawler
 * snapshot is built from, so what search engines read is exactly what people read here.
 * Plain text on purpose: it ships in the entry bundle (like the legal pages) so nothing jumps in later.
 */
export default function Guide({ path }) {
  const guide = GUIDES[path];
  if (!guide) return null;
  const [primary, ...more] = guide.ctas;
  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-20 pt-12 sm:px-10 md:pt-20">
      <header>
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); goBackOr('/'); }}
          className="inline-flex min-h-11 items-center gap-1 text-sm text-fg-2 transition-colors hover:text-fg"
        >
          &larr; Back to Gapstronaut
        </a>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-accent">Guide</p>
        <h1 className="mt-3 max-w-[900px] text-[clamp(2.25rem,1.5rem+2.8vw,3.75rem)] font-semibold leading-[1.08] tracking-[-0.035em]">{guide.h1}</h1>
        <p className="mt-3 font-mono text-[13px] text-fg-3">Updated {guide.updated}</p>
      </header>

      <article className="mt-10 max-w-[680px] space-y-9 text-[17px] leading-[1.65] text-fg-2">
        <p className="text-[19px] leading-[1.6] text-fg">{guide.intro}</p>
        {guide.sections.map((s) => (
          <section key={s.h2}>
            <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-fg">{s.h2}</h2>
            {s.p.map((t) => <p key={t} className="mt-3">{t}</p>)}
          </section>
        ))}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
          <Button href={primary.href} size="lg" className="!rounded-full !px-8 !text-[17px]">{primary.label}</Button>
          {more.map((c) => (
            <Link key={c.href} href={c.href} className="font-medium text-fg underline underline-offset-2 hover:text-focus">{c.label}</Link>
          ))}
        </div>
      </article>
    </div>
  );
}
