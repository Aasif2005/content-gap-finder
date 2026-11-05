import Pricing from './Pricing.jsx';
import SampleReport from './SampleReport.jsx';
import { CtaCard, EvidenceSplit, FloatingCards, GapSplit, HowItWorks, Lenses, NicheStrip, Statement, ViewerQuote } from './Sections.jsx';

/** Everything on the homepage below the hero. Its own chunk, fetched once the first screen has painted (see Home.jsx). */
export default function HomeBelow({ views }) {
  return (
    <>
      {/* The app-window demo needs the room; on phones the example cards below tell the same story. */}
      <div className="mx-auto mt-11 max-w-[1200px] px-5 max-md:hidden sm:px-10 md:mt-[72px]">
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
