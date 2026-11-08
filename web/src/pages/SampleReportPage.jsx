import { useEffect, useMemo, useState } from 'react';
import SampleReport from '../components/home/SampleReport.jsx';
import { toView } from '../components/home/exampleReport.js';
import { Button } from '../components/ui/index.js';
import { getFeatured } from '../lib/api.js';
import { Link, goBackOr } from '../lib/router.jsx';

/**
 * A public, indexable page that shows the real featured reports, loaded live from /api/featured the way the
 * homepage does. Viewer comments are never baked into the build: they stay inside the data-retention rules and
 * refresh whenever the featured reports do (about once a month). The crawler snapshot (seoPages.js) carries our
 * own explanation of what a report shows.
 */
export default function SampleReportPage() {
  // undefined = loading, null = nothing usable (the panel then shows its labelled examples).
  const [featured, setFeatured] = useState(undefined);
  useEffect(() => {
    let off = false;
    getFeatured().then((f) => { if (!off) setFeatured(f); }).catch(() => { if (!off) setFeatured(null); });
    return () => { off = true; };
  }, []);
  const views = useMemo(() => (featured === undefined ? undefined : (featured ?? []).map(toView).filter(Boolean)), [featured]);

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
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-accent">Sample report</p>
        <h1 className="mt-3 max-w-[900px] text-[clamp(2.25rem,1.5rem+2.8vw,3.75rem)] font-semibold leading-[1.08] tracking-[-0.035em]">What a Gapstronaut report looks like</h1>
        <p className="mt-4 max-w-[680px] text-[19px] leading-[1.6] text-fg-2">
          This is a sample of what Gapstronaut gives you for a niche: the gaps found in it, and for each one the viewer comments that
          asked for it and the videos they were left under. Open any gap to see the evidence.
          {views?.length > 0 && ' These are real reports from real niches, refreshed about once a month.'}
        </p>
      </header>

      <div className="mt-10"><SampleReport views={views} /></div>

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button href="/signup" size="lg" className="!rounded-full !px-8 !text-[17px]">Try it on your niche, free</Button>
        <Link href="/guides/youtube-content-gap-analysis" className="font-medium text-fg underline underline-offset-2 hover:text-focus">Guide: YouTube content gap analysis</Link>
        <Link href="/guides/youtube-video-ideas-from-comments" className="font-medium text-fg underline underline-offset-2 hover:text-focus">Guide: video ideas from comments</Link>
        <Link href="/guides/youtube-competitor-analysis" className="font-medium text-fg underline underline-offset-2 hover:text-focus">Guide: YouTube competitor analysis</Link>
      </div>
    </div>
  );
}
