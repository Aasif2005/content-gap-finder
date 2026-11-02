import { useState } from 'react';
import { Button, Derived, EvidenceMark } from '../ui/index.js';
import { useAuth } from '../../lib/auth.jsx';
import { EXAMPLE_VIEW } from './exampleReport.js';
import { cx } from '../../lib/cx.js';

const SOFT = 'text-fg-2';
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
          <li key={s.title} className="border-t border-line-strong pt-[18px] md:pt-6">
            <h3 className="text-[19px] font-semibold tracking-[-0.01em] md:text-[22px]">{s.title}</h3>
            <p className="mt-2 text-base leading-[1.5] text-fg-2 md:mt-3 md:text-[17px] md:leading-[1.55]">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const NICHES = [
  'AI side hustles', 'Ghost story nights', 'Budget van life', 'Cozy gaming',
  'Mechanical keyboards', 'Street food tours', 'Minecraft redstone', 'Desk setup glow-ups',
  'Beginner investing', 'Retro handhelds', 'Skincare on a budget', 'Tamil comedy skits',
];

/** A band of example niches. It drifts slowly; under reduced motion it just wraps and sits still. */
export function NicheStrip() {
  const row = (hidden) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 list-none items-center gap-x-9 pr-9">
      {NICHES.map((n) => <li key={n} className="whitespace-nowrap">{n}</li>)}
    </ul>
  );
  return (
    <section aria-label="Example niches" className={`${gapTop} overflow-hidden bg-surface-2 py-7 text-[17px] text-fg-2`}>
      <div className="marquee flex w-max">{row(false)}{row(true)}</div>
    </section>
  );
}

const softCard = 'rounded-2xl bg-surface p-5 shadow-[0_24px_60px_-30px_rgba(15,30,46,0.22)]';

/** Soft text cards around a giant faint word. Example content only: nothing here is a measured number. */
export function FloatingCards() {
  const [on, setOn] = useState(true);
  const gap = EXAMPLE_VIEW.gaps[0];
  return (
    <section aria-labelledby="float-h" className={`${wrap} ${gapTop} relative`}>
      <h2 id="float-h" className="sr-only">What a report looks like</h2>
      <p aria-hidden className="pointer-events-none absolute inset-x-0 max-md:hidden top-1/2 -translate-y-1/2 select-none overflow-x-clip text-center text-[clamp(4rem,2rem+11vw,10rem)] font-semibold leading-[0.9] tracking-[-0.05em] text-fg/[0.05]">
        Content<br />Intelligence
      </p>
      <div className="relative grid items-start gap-5 md:grid-cols-2 md:gap-x-10 md:gap-y-24">
        <div className={softCard}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-3">Content gap · example</p>
          <p className="mt-3 text-xl font-medium leading-snug tracking-[-0.01em]">{gap.question}</p>
          <p className="mt-2 text-sm text-fg-2">{gap.evidenceCount} comments · {gap.distinctVideos} videos · nobody covers this</p>
        </div>
        <div className={`${softCard} md:mt-20`}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-3">Watch this niche</p>
          <div className="mt-3 flex items-center justify-between gap-4">
            <p className="text-xl font-medium tracking-[-0.01em]">Recurring gaps</p>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label="Recurring gaps"
              onClick={() => setOn((v) => !v)}
              className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150', on ? 'bg-ink' : 'bg-line-strong')}
            >
              <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-surface transition-[left] duration-150', on ? 'left-6' : 'left-1')} />
            </button>
          </div>
          <p className="mt-2 text-sm text-fg-2">Re-run it on a schedule and see what is new.</p>
        </div>
        <div className="rounded-2xl bg-surface-2 p-5 md:mb-8">
          <p className="flex items-center gap-2.5 text-lg font-medium"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-good-fg" />Reads real comments</p>
          <p className="mt-1 text-sm text-fg-2">Every question links back to the video it was asked under.</p>
        </div>
        <div className={`${softCard} flex items-center justify-between gap-4 !py-4`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-info-fg">New</p>
            <p className="mt-1 text-lg font-medium">A gap nobody has covered</p>
          </div>
          <span className="whitespace-nowrap rounded-full bg-mark-soft px-3 py-1 text-xs font-semibold text-on-mark">Example</span>
        </div>
      </div>
    </section>
  );
}

export function Statement() {
  return (
    <section aria-labelledby="statement-h" className={`${wrap} ${gapTop}`}>
      <h2 id="statement-h" className="mx-auto max-w-[900px] text-balance text-center text-[clamp(1.75rem,1rem+2.8vw,3.25rem)] font-semibold leading-[1.15] tracking-[-0.03em]">
        Most creators guess what to make next. Gapstronaut shows you the questions viewers already asked, and the videos that still don’t answer them.
      </h2>
    </section>
  );
}

const FEATURES = [
  { title: 'Recurring gaps', body: 'The same question, asked again and again under different videos, grouped into one topic you can make a video about.' },
  { title: 'Complaints', body: 'What viewers dislike about the videos that already exist, and what to do instead.' },
  { title: 'Make-it briefs', body: 'A plan and a ready-to-film script for one gap, as long as the topic needs and no longer.' },
];

/** A soft panel with a small example list beside an accent-bar feature list. */
export function GapSplit() {
  const [active, setActive] = useState(0);
  return (
    <section id="get" aria-labelledby="get-h" className={`${wrap} ${gapTop} grid scroll-mt-6 items-center gap-10 lg:grid-cols-2 lg:gap-16`}>
      <div className="rounded-[1.75rem] bg-surface-2 p-5 md:rounded-[2.5rem] md:p-9">
        <div className="flex items-center justify-between gap-3 border-b border-line-strong pb-4 text-xs font-semibold uppercase tracking-[0.12em] text-fg-2">
          <span>Unanswered questions</span>
          <span className="font-normal normal-case tracking-normal text-fg-3">Example · {EXAMPLE_VIEW.niche}</span>
        </div>
        <ul className="mt-5 grid list-none gap-3">
          {EXAMPLE_VIEW.gaps.map((g) => (
            <li key={g.question} className="rounded-xl bg-surface p-4 shadow-[0_12px_30px_-20px_rgba(15,30,46,0.2)]">
              <p className="text-[15px] font-medium leading-snug">{g.question}</p>
              <p className="mt-1 text-[13px] text-fg-2">{g.evidenceCount} comments · {g.distinctVideos} videos</p>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-info-fg">Evidence behind every answer</p>
        <h2 id="get-h" className={`${h2} mt-3`}>Every claim, with the viewer behind it.</h2>
        <ul className="mt-8 grid list-none gap-2">
          {FEATURES.map((f, i) => (
            <li key={f.title}>
              <button
                type="button"
                aria-pressed={i === active}
                onClick={() => setActive(i)}
                className={cx(
                  'min-h-11 w-full border-l-[3px] py-2 pl-5 text-left transition-colors duration-200',
                  i === active ? 'border-focus text-fg' : 'border-transparent text-fg-2 hover:text-fg'
                )}
              >
                <span className="block text-[22px] font-medium tracking-[-0.01em]">{f.title}</span>
                <span className={cx('mt-1 block text-[15px] leading-[1.5]', i === active ? 'text-fg-2' : 'text-fg-3')}>{f.body}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The one example comment, and the line between YouTube's numbers and ours. */
export function EvidenceSplit() {
  const quote = EXAMPLE_VIEW.gaps[0].evidence[1];
  return (
    <section id="evidence" aria-labelledby="evidence-h" className={`${wrap} ${gapTop} grid scroll-mt-6 items-center gap-10 lg:grid-cols-2 lg:gap-16`}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-info-fg">Evidence</p>
        <h2 id="evidence-h" className={`${h2} mt-3`}>Evidence you can trace.</h2>
        <p className={`mt-5 max-w-[520px] text-lg leading-[1.55] ${SOFT}`}>
          Not “AI says people want this.” The comment itself, who liked it, and the video it was written under. Open it on YouTube and check.
        </p>
        <dl className="mt-7 grid max-w-[520px] gap-4 text-[15px] leading-[1.5]">
          <div>
            <dt className="font-semibold">From YouTube</dt>
            <dd className="text-fg-2">Views, likes, comment counts, subscribers, titles and thumbnails, shown as returned and dated.</dd>
          </div>
          <div>
            <dt className="font-semibold">Calculated by Gapstronaut <Derived /></dt>
            <dd className="text-fg-2">Buzz, demand score, engagement rate and channel-median multiples carry this mark, so you can always tell them from YouTube’s own numbers.</dd>
          </div>
        </dl>
      </div>
      <div className="rounded-[1.75rem] bg-surface p-6 shadow-[0_40px_80px_-40px_rgba(15,30,46,0.25)] md:rounded-[2.5rem] md:p-9">
        <p className="border-b border-line pb-4 text-xs font-semibold uppercase tracking-[0.12em] text-fg-3">Example comment</p>
        <p className="mt-5 text-xl font-medium leading-snug tracking-[-0.01em]">“{EXAMPLE_VIEW.gaps[0].question}”</p>
        <p className="mt-5 rounded-2xl bg-mark-soft p-5 text-[17px] leading-[1.5] text-on-mark">
          <EvidenceMark className="!bg-transparent !px-0">“{quote.text}”</EvidenceMark>
          <span className="mt-3 block text-sm opacity-75">Under “{quote.videoTitle}” · {quote.likes} likes</span>
        </p>
      </div>
    </section>
  );
}

const LENSES = [
  { n: '01', title: 'Trending now', body: 'Angles working in this niche right now, ranked against each channel’s own norm, not just raw views.', foot: 'Ranked against each channel’s norm' },
  { n: '02', title: 'Content gaps', body: 'Questions viewers keep asking that no video answers well, quoted and linked.', foot: 'Quoted and linked' },
  { n: '03', title: 'Complaints', body: 'What viewers dislike about the videos that already exist, and what to do instead.', foot: 'What viewers dislike' },
  { n: '04', title: 'Avoid', body: 'Angles with plenty of views and little response, and when our numbers disagree with that advice.', foot: 'Crowded angles to skip' },
];

export function Lenses() {
  return (
    <section id="how-lenses" aria-labelledby="lens-h" className={`${wrap} ${gapTop}`}>
      <h2 id="lens-h" className={`${h2} text-center`}>One report, four lenses.</h2>
      <p className="mx-auto mt-4 max-w-[560px] text-center text-lg leading-[1.5] text-fg-2">The same comments, read four ways. Open any answer to the videos, numbers and exact comments behind it.</p>
      <ul className="mt-10 grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {LENSES.map((l) => (
          <li key={l.n} className="flex flex-col rounded-3xl bg-surface p-6 shadow-[0_24px_60px_-34px_rgba(15,30,46,0.25)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-info-fg">{l.n} / Lens</p>
            <h3 className="mt-3 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{l.title}</h3>
            <p className="mt-2 flex-1 text-[15px] leading-[1.55] text-fg-2">{l.body}</p>
            <p className="mt-6 border-t border-line pt-4 text-sm text-fg-3">{l.foot}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A labelled example comment on the highlighter ground. Never a testimonial. */
export function ViewerQuote() {
  const quote = EXAMPLE_VIEW.gaps[0].evidence[0];
  return (
    <section aria-label="An example viewer comment" className={`${wrap} ${gapTop}`}>
      <figure className="mx-auto max-w-[860px] rounded-[1.75rem] bg-mark-soft px-6 py-10 text-center text-on-mark md:rounded-[2.5rem] md:px-14 md:py-14">
        <blockquote className="text-[clamp(1.5rem,1rem+1.8vw,2.5rem)] font-medium leading-[1.25] tracking-[-0.02em]">“{quote.text}”</blockquote>
        <figcaption className="mt-6 text-[15px] opacity-80">Example comment · under “{quote.videoTitle}”</figcaption>
      </figure>
    </section>
  );
}

/** The closing card. It also carries the beta terms, which are the product's actual limits. */
export function CtaCard() {
  const { user, loading } = useAuth();
  const signedIn = !loading && Boolean(user);
  return (
    <section aria-labelledby="close-h" className={`${wrap} ${gapTop} pb-[72px] md:pb-[120px]`}>
      <div className="mx-auto max-w-[1000px] rounded-[1.75rem] bg-surface-2 px-6 py-12 text-center md:rounded-[3rem] md:px-16 md:py-20">
        <h2 id="close-h" className={`${h2} mx-auto max-w-[640px]`}>Find your next video before anyone else.</h2>
        <p className="mx-auto mt-4 max-w-[560px] text-base leading-[1.55] text-fg-2 md:text-lg">
          Free while we’re in beta: 3 fresh analyses and 20 Make it drafts a day. Opening a saved or cached report costs nothing. No card needed.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href={signedIn ? '/explore' : '/signup'} size="lg" className="!rounded-full !px-8 !text-[17px]">
            {signedIn ? 'Explore a niche' : 'Start exploring'}
          </Button>
          {!signedIn && <Button href="/login" variant="ghost" size="lg" className="!rounded-full !px-8 !text-[17px] !font-medium text-fg">Log in</Button>}
        </div>
      </div>
    </section>
  );
}
