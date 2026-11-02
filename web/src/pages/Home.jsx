import { useEffect, useMemo, useState } from 'react';
import { getFeatured } from '../lib/api.js';
import { navigate, useRoute } from '../lib/router.jsx';
import { useColorMode } from '../lib/colorMode.js';
import RotatingHeadline from '../components/home/RotatingHeadline.jsx';
import { EarthBlaze } from '../components/ui/EarthBlaze.jsx';
import SearchConsole from '../components/home/SearchConsole.jsx';
import Pricing from '../components/home/Pricing.jsx';
import SampleReport from '../components/home/SampleReport.jsx';
import { toView } from '../components/home/exampleReport.js';
import { CtaCard, EvidenceSplit, FloatingCards, GapSplit, HowItWorks, Lenses, NicheStrip, Statement, ViewerQuote } from '../components/home/Sections.jsx';

/**
 * The marketing homepage, on the Lunar Cream theme (the shell applies it).
 * The evidence panel is a real report from /api/featured; with none, or when it
 * cannot be fetched, the same panel shows a labelled example.
 */
export default function Home() {
  const { query, search } = useRoute();
  const dark = useColorMode().mode === 'dark';

  // Old query links (/?niche=...) belong to the Explorer now.
  const legacyNiche = query.niche;
  useEffect(() => {
    if (legacyNiche) navigate(`/explore${search}`, { replace: true });
  }, [legacyNiche, search]);

  // undefined = loading, null = nothing usable (show the labelled examples).
  const [featured, setFeatured] = useState(undefined);
  useEffect(() => {
    let off = false;
    getFeatured()
      .then((f) => { if (!off) setFeatured(f); })
      .catch(() => { if (!off) setFeatured(null); });
    return () => { off = true; };
  }, []);

  const views = useMemo(() => {
    if (featured === undefined) return undefined;
    return (featured ?? []).map(toView).filter(Boolean);
  }, [featured]);

  return (
    <>
      <section aria-labelledby="hero-h" className="fade-in mx-auto max-w-[1200px] px-5 pt-11 text-center sm:px-10 md:pt-[72px]">
        <p className="mx-auto inline-block rounded-full bg-surface-2 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-fg-2 max-[359px]:px-3 max-[359px]:text-[11px] max-[359px]:tracking-[0.06em]">
          Your viewers already told you
        </p>
        <RotatingHeadline id="hero-h" className="mx-auto mt-6 max-w-[1120px] text-[clamp(2.25rem,1.1rem+3.6vw,4rem)] font-semibold max-[389px]:text-[2rem] max-[359px]:text-[1.75rem] leading-[1.05] tracking-[-0.035em]" />
        <p className="mx-auto mt-5 max-w-[640px] text-[17px] leading-[1.5] text-fg-2 md:mt-7 md:text-[21px]">
          We read the comments across your niche’s YouTube videos and hand you the questions no video has answered yet, each one linked to the comment that asked it.
        </p>
        <div className="mx-auto max-w-[780px] text-left"><SearchConsole /></div>
        <p className="mt-3.5 text-[13px] leading-[1.5] text-fg-3 md:mt-4 md:text-sm">
          Free in beta · 3 new reports a day · reopening a report is always free
        </p>
      </section>

      <div className="mx-3 mt-11 sm:mx-6 md:mt-[72px] lg:mx-[4vw]">
        <EarthBlaze
          className="!rounded-[1.75rem] shadow-[0_40px_80px_-40px_rgba(15,30,46,0.35)] md:!rounded-[3rem]"
          style={{ aspectRatio: 'auto', height: 'clamp(340px, 42vw, 720px)' }}
          illumination={1.75}
          galaxyBrightness={3}
          surfaceBrightness={1.65}
          starCount={5400}
          auroraColor={dark ? '#050505' : '#0F1E2E'}
          backgroundColor={dark ? '#9A978F' : '#2F5BEA'}
        />
      </div>

      <div className="mx-auto mt-11 max-w-[1200px] px-5 sm:px-10 md:mt-[72px]">
        <SampleReport views={views} />
      </div>

      <NicheStrip />
      <FloatingCards />
      <Statement />
      <GapSplit />
      <EvidenceSplit />
      <HowItWorks />
      <Lenses />
      <ViewerQuote />
      <Pricing />
      <CtaCard />
    </>
  );
}
