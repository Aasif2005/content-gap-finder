import { useEffect, useMemo, useState } from 'react';
import { getFeatured } from '../lib/api.js';
import { navigate, useRoute } from '../lib/router.jsx';
import SearchConsole from '../components/home/SearchConsole.jsx';
import SampleReport from '../components/home/SampleReport.jsx';
import { EXAMPLE_VIEW, toView } from '../components/home/exampleReport.js';
import { BetaBand, Closing, DISPLAY, EvidenceStatement, HowItWorks, WhatYouGet } from '../components/home/Sections.jsx';

/**
 * The marketing homepage, on the night ground (the shell applies the theme).
 * The evidence panel is a real report from /api/featured; with none, or when it
 * cannot be fetched, the same panel shows a labelled example.
 */
export default function Home() {
  const { query, search } = useRoute();

  // Old query links (/?niche=...) belong to the Explorer now.
  const legacyNiche = query.niche;
  useEffect(() => {
    if (legacyNiche) navigate(`/explore${search}`, { replace: true });
  }, [legacyNiche, search]);

  // undefined = loading, null = nothing usable (show the labelled example).
  const [featured, setFeatured] = useState(undefined);
  useEffect(() => {
    let off = false;
    getFeatured()
      .then((f) => { if (!off) setFeatured(f); })
      .catch(() => { if (!off) setFeatured(null); });
    return () => { off = true; };
  }, []);

  const view = useMemo(() => {
    if (featured === undefined) return undefined;
    return toView(featured) ?? EXAMPLE_VIEW;
  }, [featured]);

  return (
    <>
      <section aria-labelledby="hero-h" className="fade-in mx-auto max-w-[1200px] px-5 pt-11 sm:px-10 md:pt-[88px]">
        <h1 id="hero-h" className={`${DISPLAY} max-w-[980px]`}>Film the video your audience is already asking for.</h1>
        <p className="mt-5 max-w-[640px] text-[17px] leading-[1.5] text-fg-2 md:mt-7 md:text-[21px]">
          Gapstronaut reads the comments under a niche’s YouTube videos and shows the questions nobody has answered, with every comment linked back to its video.
        </p>
        <SearchConsole />
        <p className="mt-3.5 text-[13px] leading-[1.5] text-fg-3 md:mt-4 md:text-sm">
          Free during beta · 3 fresh analyses a day · cached and saved reports cost nothing
        </p>
      </section>

      <div className="mx-auto mt-11 max-w-[1200px] px-5 sm:px-10 md:mt-[72px]">
        <SampleReport view={view} />
      </div>

      <HowItWorks />
      <WhatYouGet />
      <EvidenceStatement />
      <BetaBand />
      <Closing />
    </>
  );
}
