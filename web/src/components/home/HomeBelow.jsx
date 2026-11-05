import { useEffect, useState } from 'react';
import Pricing from './Pricing.jsx';
import SampleReport from './SampleReport.jsx';
import { CtaCard, EvidenceSplit, FloatingCards, GapSplit, HowItWorks, Lenses, NicheStrip, Statement, ViewerQuote } from './Sections.jsx';

/**
 * Everything on the homepage below the hero. Its own chunk, fetched once the first screen has painted (see Home.jsx).
 * It mounts in four slices, each in its own task, so the browser is never handed the whole page to build at once;
 * a link to a section lower down (#pricing) shows everything straight away.
 */
const SLICES = 4;

export default function HomeBelow({ views }) {
  const [slice, setSlice] = useState(() => (typeof window !== 'undefined' && window.location.hash ? SLICES : 1));

  useEffect(() => {
    if (slice >= SLICES) return undefined;
    const id = setTimeout(() => setSlice((n) => n + 1), 60);
    return () => clearTimeout(id);
  }, [slice]);

  // A jump to a section needs real section heights (see .cv in index.css): turn the skipping off for the visit.
  useEffect(() => {
    const off = () => { document.documentElement.dataset.cv = 'off'; };
    if (window.location.hash) off();
    const onClick = (e) => { const a = e.target instanceof Element ? e.target.closest('a[href]') : null; if (a && /^(\/)?#/.test(a.getAttribute('href'))) off(); };
    document.addEventListener('click', onClick, true);
    window.addEventListener('hashchange', off);
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('hashchange', off); delete document.documentElement.dataset.cv; };
  }, []);

  // Opened on a section link: now that it exists, go to it.
  useEffect(() => {
    const target = window.location.hash.slice(1);
    if (slice >= SLICES && target) requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView());
  }, [slice]);

  return (
    <>
      <div className="cv">
        {/* The app-window demo needs the room; on phones the example cards below tell the same story. */}
        <div className="mx-auto mt-11 max-w-[1200px] px-5 max-md:hidden sm:px-10 md:mt-[72px]">
          <SampleReport views={views} />
        </div>
      </div>
      {slice >= 2 && (
        <>
          <div className="cv"><NicheStrip /></div>
          <div className="cv"><FloatingCards /></div>
          <div className="cv"><Statement /></div>
        </>
      )}
      {slice >= 3 && (
        <>
          <div className="cv"><GapSplit /></div>
          <div className="cv"><EvidenceSplit /></div>
          <div className="cv"><HowItWorks /></div>
        </>
      )}
      {slice >= 4 && (
        <>
          <div className="cv"><Lenses /></div>
          <div className="cv"><ViewerQuote /></div>
          <div className="cv"><Pricing /></div>
          <div className="cv"><CtaCard /></div>
        </>
      )}
    </>
  );
}
