import { Button, Derived, EvidenceMark } from '../ui/index.js';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';

const SOFT = 'text-[#C9D2E4]';
const wrap = 'mx-auto max-w-[1200px] px-5 sm:px-10';
const gapTop = 'mt-[72px] md:mt-[120px] lg:mt-[160px]';
const h2 = 'text-[clamp(2rem,1.4rem+1.9vw,3rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-balance';
// The two display sizes: 84px on desktop, tracking never tighter than -0.04em.
export const DISPLAY = 'text-[clamp(2.875rem,1.57rem+5.35vw,5.25rem)] font-semibold leading-[1.03] tracking-[-0.035em] text-balance';

const STEPS = [
  { title: 'Search a niche or a channel', body: 'Pick a time window and a format. Add a region or language if your audience is regional.' },
  { title: 'We read what viewers said', body: 'Comments under the videos that are working, filtered down to the ones that sound like unmet demand. About a minute and a half.' },
  { title: 'You choose, then make it', body: 'Open the evidence, pick the gap, and get a plan and a script as long as the topic needs.' },
];

const ANSWERS = [
  { title: 'Trending now', body: 'Angles working in this niche right now, ranked against each channel’s own norm, not just raw views.' },
  { title: 'Content gaps', body: 'Questions viewers keep asking that no video answers well, quoted and linked.' },
  { title: 'Complaints', body: 'What viewers dislike about the videos that already exist, and what to do instead.' },
  { title: 'Avoid', body: 'Angles with plenty of views and little response, and when our numbers disagree with that advice.' },
  { title: 'Make it', body: 'A plan and a ready-to-film script for one gap, as long as the topic needs and no longer.' },
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-h" className={`${wrap} ${gapTop} scroll-mt-6`}>
      <h2 id="how-h" className={`${h2} max-w-[760px]`}>From a niche to one video worth making.</h2>
      <ol className="mt-8 grid list-none gap-7 md:mt-14 md:grid-cols-3 md:gap-10">
        {STEPS.map((s) => (
          <li key={s.title} className="border-t border-[#2F4170] pt-[18px] md:pt-6">
            <h3 className="text-[19px] font-semibold tracking-[-0.01em] md:text-[22px]">{s.title}</h3>
            <p className="mt-2 text-base leading-[1.5] text-fg-2 md:mt-3 md:text-[17px] md:leading-[1.55]">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function WhatYouGet() {
  return (
    <section id="get" aria-labelledby="get-h" className={`${wrap} ${gapTop} flex scroll-mt-6 flex-col gap-8 lg:flex-row lg:gap-16`}>
      <div className="lg:flex-1 lg:basis-80">
        <h2 id="get-h" className={h2}>Five answers, each with its evidence.</h2>
        <p className="mt-5 max-w-[420px] text-lg leading-[1.55] text-fg-2">
          Every claim opens to the videos, the numbers and the exact comments behind it.
        </p>
      </div>
      <ul className="min-w-0 list-none border-b border-line-strong lg:flex-[2] lg:basis-[520px]">
        {ANSWERS.map((a) => (
          <li key={a.title} className="border-t border-line-strong py-[18px] md:py-6">
            <h3 className="text-[19px] font-semibold md:text-[22px]">{a.title}</h3>
            <p className="mt-1 text-[15px] leading-[1.5] text-fg-2 md:mt-1.5 md:text-base">{a.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The one big quote is a labelled example: the real, linked ones are in the panel above. */
export function EvidenceStatement() {
  return (
    <section id="evidence" aria-labelledby="evidence-h" className={`${wrap} ${gapTop} scroll-mt-6`}>
      <h2 id="evidence-h" className="sr-only">Every claim shows its evidence</h2>
      <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
        <div className="lg:flex-[3] lg:basis-[480px]">
          <p className="text-[clamp(1.75rem,1rem+2.6vw,3rem)] font-medium leading-[1.25] tracking-[-0.025em]">
            <EvidenceMark className="!rounded-md !px-2.5">“Can I cook it?”</EvidenceMark>
          </p>
          <p className="mt-6 inline-flex flex-wrap items-center gap-x-1 text-[17px] text-fg-3">
            Example comment · on “Example video title”
            <ArrowUpRight aria-hidden className="h-4 w-4" />
          </p>
          <p className={`mt-7 max-w-[560px] text-lg leading-[1.55] md:text-xl ${SOFT}`}>
            Not “AI says people want this.” The comment itself, who liked it, and the video it was written under. Open it on YouTube and check.
          </p>
        </div>
        <div className="min-w-0 lg:flex-[2] lg:basis-[360px]">
          <div className="border-t border-line-strong py-5">
            <h3 className="text-lg font-semibold">From YouTube</h3>
            <p className="mt-1.5 text-[15px] leading-[1.5] text-fg-2">
              Views, likes, comment counts, subscribers, titles and thumbnails, shown as returned and dated.
            </p>
          </div>
          <div className="border-y border-line-strong py-5">
            <h3 className="text-lg font-semibold">Calculated by Gapstronaut <Derived /></h3>
            <p className="mt-1.5 text-[15px] leading-[1.5] text-fg-2">
              Heat, demand score, engagement rate and channel-median multiples. They carry this mark so you can always tell them from YouTube’s own numbers.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function BetaBand() {
  const { user, loading } = useAuth();
  const signedIn = !loading && Boolean(user);
  return (
    <section aria-labelledby="beta-h" className={`${gapTop} border-y border-line bg-surface`}>
      <div className={`${wrap} flex flex-col gap-6 py-11 md:flex-row md:items-center md:justify-between md:gap-10 md:py-[72px]`}>
        <div className="max-w-[640px]">
          <h2 id="beta-h" className="text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] md:text-[40px]">Free while we’re in beta.</h2>
          <p className="mt-3 text-base leading-[1.5] text-fg-2 md:mt-4 md:text-lg md:leading-[1.55]">
            Each account gets 3 fresh analyses and 20 Make it drafts a day. Opening a saved or cached report costs nothing. No card needed.
          </p>
        </div>
        <Button href={signedIn ? '/dashboard' : '/signup'} size="lg" className="w-full !rounded-xl md:w-auto md:!px-7 md:!text-[17px]">
          {signedIn ? 'Open your dashboard' : 'Create a free account'}
        </Button>
      </div>
    </section>
  );
}

export function Closing() {
  const { user, loading } = useAuth();
  const signedIn = !loading && Boolean(user);
  return (
    <section aria-labelledby="close-h" className={`${wrap} mt-[72px] pb-[72px] md:mt-[120px] md:pb-[120px] lg:mt-[140px]`}>
      <h2 id="close-h" className={`${DISPLAY} max-w-[900px]`}>Pick tonight’s video.</h2>
      <div className="mt-9 flex flex-wrap gap-4">
        {signedIn ? (
          <Button href="/explore" size="lg" className="!rounded-xl !px-[30px] !py-[18px] !text-lg">Explore a niche</Button>
        ) : (
          <>
            <Button href="/signup" size="lg" className="!rounded-xl !px-[30px] !py-[18px] !text-lg">Sign up free</Button>
            <Button href="/login" variant="ghost" size="lg" className="!rounded-xl border border-[#2F4170] !px-[30px] !py-[18px] !text-lg !font-medium text-fg">Log in</Button>
          </>
        )}
      </div>
    </section>
  );
}
