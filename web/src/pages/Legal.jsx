import { useEffect, useRef, useState } from 'react';
import { getSite } from '../lib/api.js';
import { Link, goBackOr } from '../lib/router.jsx';

// Plain-language drafts written against what the app actually does. Review them
// (and have them reviewed) before publishing: they are not legal advice.
const EFFECTIVE = '27 October 2026';
const YT_TERMS = 'https://www.youtube.com/t/terms';
const GOOGLE_PRIVACY = 'https://policies.google.com/privacy';

const linkClass = 'font-medium text-fg underline underline-offset-2 hover:text-focus';

const A = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer noopener" className={linkClass}>
    {children}
  </a>
);

function useSite() {
  // The build's address stands in until the API answers (or when the frontend is hosted without one).
  const [site, setSite] = useState({ contactEmail: import.meta.env.VITE_CONTACT_EMAIL || null, dataMaxDays: 30 });
  useEffect(() => {
    let live = true;
    getSite().then((s) => { if (live) setSite((cur) => ({ ...s, contactEmail: s.contactEmail || cur.contactEmail })); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return site;
}

function Contact({ email }) {
  return email
    ? <a href={`mailto:${email}`} className={linkClass}>{email}</a>
    // Loud on purpose: a policy without a contact fails YouTube's audit.
    : <span className="font-medium text-warn-fg">[contact email not set: add CONTACT_EMAIL to .env]</span>;
}

/** Section headings found in the article, with a stable id each, and the one in view. */
function useOutline(ref) {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    const heads = [...(ref.current?.querySelectorAll('h2') ?? [])];
    heads.forEach((h, i) => { h.id = h.id || `section-${i + 1}`; h.classList.add('scroll-mt-28'); });
    setItems(heads.map((h) => ({ id: h.id, text: h.textContent })));
    setActive(heads[0]?.id ?? null);
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top)[0];
        if (seen) setActive(seen.target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' }
    );
    heads.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [ref]);

  return { items, active };
}

function LegalLayout({ title, children }) {
  const body = useRef(null);
  const { items, active } = useOutline(body);
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
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-accent">Legal</p>
        <h1 className="mt-3 text-[clamp(2.5rem,1.6rem+3vw,4rem)] font-semibold leading-[1.05] tracking-[-0.035em]">{title}</h1>
        <p className="mt-3 font-mono text-[13px] text-fg-3">Effective {EFFECTIVE}</p>
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-16">
        {items.length > 1 && (
          <nav aria-label="On this page" className="lg:sticky lg:top-8 lg:self-start">
            <div className="rounded-[1.5rem] bg-surface-2 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-3">On this page</p>
              <ol className="mt-3 grid list-none gap-0.5">
                {items.map((it) => (
                  <li key={it.id}>
                    <a
                      href={`#${it.id}`}
                      aria-current={active === it.id ? 'location' : undefined}
                      className={`flex min-h-10 items-center border-l-[3px] py-1 pl-3 text-[15px] leading-snug transition-colors ${
                        active === it.id ? 'border-focus font-semibold text-fg' : 'border-transparent text-fg-2 hover:text-fg'
                      }`}
                    >
                      {it.text}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        )}
        <article ref={body} className="min-w-0 max-w-[680px]">
          <div className="legal space-y-9 text-[17px] leading-[1.65] text-fg-2">{children}</div>
        </article>
      </div>
    </div>
  );
}

const H = ({ children }) => <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-fg">{children}</h2>;
const List = ({ children }) => <ul className="mt-2 list-disc space-y-1.5 pl-5">{children}</ul>;

export function PrivacyPage() {
  const { contactEmail, dataMaxDays } = useSite();
  return (
    <LegalLayout title="Privacy Policy">
      <section>
        <p>
          Gapstronaut helps creators see what is trending in a niche, what viewers are asking for that nobody
          has made, and what to avoid. This policy explains what the app reads, what it keeps, who it shares data with,
          and how to ask for something to be deleted.
        </p>
      </section>

      <section>
        <H>YouTube API Services</H>
        <p className="mt-2">
          Gapstronaut uses the <b>YouTube API Services</b> to read public YouTube data: search results, video
          titles, thumbnails, channel names, view, like, comment and subscriber counts, and public comments. It reads
          this data with the app's own API key. It never asks for access to your YouTube account, and it cannot see
          or change anything private in it. Google's handling of data is covered by the{' '}
          <A href={GOOGLE_PRIVACY}>Google Privacy Policy</A>.
        </p>
      </section>

      <section>
        <H>Your account</H>
        <p className="mt-2">
          You sign in with Google or with an email address and password, through Google's Firebase Authentication.
          We keep your sign-in provider, email address, name and profile photo (the one Google supplies, or the one you upload; we keep only a small resized copy of an upload), whether your
          email is verified, when you joined, when you accepted these terms, and how many analyses and drafts you have
          used today. Passwords are held by Firebase, never by us. You can delete your account from your profile page,
          which removes this record, your uploaded picture, your saved watches and the links that tie reports to you. You can remove an uploaded picture at any time from the same page.
        </p>
      </section>

      <section>
        <H>What we store, and for how long</H>
        <List>
          <li>
            <b>Reports.</b> When you run an analysis, the report is saved in our database (MongoDB Atlas) so it can be reopened and shared.
            It contains the YouTube data above, plus our own analysis of it. Reports, the drafts made from them
            (&ldquo;Make it&rdquo;), the short-lived result cache (kept for a few hours) and the run logs are <b>deleted after {dataMaxDays} days</b>.
          </li>
          <li>
            <b>Waitlist.</b> If you join the waitlist for a plan that is not on sale yet, we keep the email address you enter and the plan you asked about,
            until that plan opens or you ask us to remove them. We use them only to tell you about that plan.
          </li>
          <li>
            <b>Your searches.</b> The niche or channel you type, and the filters you choose, are saved with the report.
            Saved &ldquo;watches&rdquo; keep their search so they can re-run on a schedule until you delete them.
          </li>
          <li>
            <b>Demand history.</b> To tell recurring demand from a one-off, we keep the questions and scores our analysis
            produced for each subject, for up to 36 months. This history holds no comment text, titles or account data.
          </li>
          <li>
            <b>Your IP address</b> is held in memory for about an hour to enforce rate limits. It is not written to disk.
          </li>
        </List>
        <p className="mt-2">We do not collect payment details. Gapstronaut is free during the beta.</p>
      </section>

      <section>
        <H>Cookies and browser storage</H>
        <p className="mt-2">
          The app sets no cookies of its own and runs no analytics or advertising trackers. Firebase Authentication keeps
          your sign-in session in your browser's storage so you stay logged in, and the app stores your light or dark choice and
          that you have seen the storage notice. Video thumbnails are loaded
          from YouTube's servers, which receive your IP address and browser details when they do.
        </p>
      </section>

      <section>
        <H>Who we share data with</H>
        <List>
          <li><b>YouTube / Google</b> receives the API requests that fetch public data.</li>
          <li>
            <b>MongoDB Atlas</b> (MongoDB, Inc.) hosts our database, so it stores everything described above: account records,
            reports, drafts, watches and usage counts. It acts on our instructions and does not use the data for its own purposes.
          </li>
          <li><b>Google (Firebase Authentication)</b> handles sign-in, and so receives your email address, password or Google account details when you log in.</li>
          <li>
            <b>DeepSeek</b> (deepseek.com), an AI model provider, receives video titles, statistics and comment text from
            each run in order to cluster topics and find viewer requests. It does not receive your name or email address.
          </li>
          <li><b>Anyone you give a report link to</b> can open that report until it expires.</li>
        </List>
        <p className="mt-2">We do not sell data, and we do not show ads.</p>
      </section>

      <section>
        <H>Deleting data</H>
        <p className="mt-2">
          Everything except demand history deletes itself after {dataMaxDays} days. You can delete your account at any
          time from your profile page. To have a report or anything else removed sooner, contact <Contact email={contactEmail} /> with the report link or search. We act on
          deletion requests within 7 days.
        </p>
      </section>

      <section>
        <H>Children</H>
        <p className="mt-2">Gapstronaut is a tool for creators and is not directed at children under 13.</p>
      </section>

      <section>
        <H>Changes and contact</H>
        <p className="mt-2">
          If this policy changes, the effective date above changes, and you will be asked to accept it again before your
          next analysis. Questions: <Contact email={contactEmail} />.
        </p>
      </section>
    </LegalLayout>
  );
}

export function TermsPage() {
  const { contactEmail, dataMaxDays } = useSite();
  return (
    <LegalLayout title="Terms of Service">
      <section>
        <H>Agreement</H>
        <p className="mt-2">
          By using Gapstronaut you agree to these terms and to our{' '}
          <Link href="/privacy" className={linkClass}>Privacy Policy</Link>.
          Gapstronaut uses YouTube API Services, so by using it you also agree to be bound by the{' '}
          <A href={YT_TERMS}>YouTube Terms of Service</A>.
        </p>
      </section>

      <section>
        <H>Your account</H>
        <p className="mt-2">
          You need an account to run analyses, draft scripts and save watches. Keep your sign-in details private and give
          accurate information; you are responsible for what is done with your account. Each account has a daily
          allowance, and email accounts must verify their address before using it. You can delete your account at any
          time from your profile page.
        </p>
      </section>

      <section>
        <H>What the service is</H>
        <p className="mt-2">
          Gapstronaut analyses public YouTube videos and comments for a niche or channel you choose, and suggests
          topics, unanswered viewer requests and video outlines. It is an independent tool. It is not affiliated with,
          endorsed by or sponsored by YouTube or Google.
        </p>
      </section>

      <section>
        <H>Figures and AI output</H>
        <List>
          <li>
            Views, likes, comments and subscriber counts come from YouTube as of the time shown on each report. Figures
            marked ⓘ (buzz, demand score, engagement rate, channel-median multiples, title checks) are calculated by
            Gapstronaut. They are not YouTube metrics.
          </li>
          <li>
            Summaries, gaps, titles and scripts are written by an AI model and can be wrong. Check facts, figures and
            claims before you publish anything based on them. You are responsible for what you publish.
          </li>
        </List>
      </section>

      <section>
        <H>Fair use of the service</H>
        <List>
          <li>Usage limits apply, because the YouTube API quota is shared by everyone using the app.</li>
          <li>Do not automate requests to the app, try to get around its limits, or resell its data.</li>
          <li>Do not use the app to harass, target or impersonate creators or commenters.</li>
        </List>
      </section>

      <section>
        <H>Saved reports</H>
        <p className="mt-2">
          Reports are deleted after {dataMaxDays} days to comply with YouTube's data policies. A report link stops
          working after that. Run the search again for current numbers.
        </p>
      </section>

      <section>
        <H>No warranty</H>
        <p className="mt-2">
          The service is provided as is, without warranties of any kind. It may change, be limited or stop at any time,
          including if YouTube API access changes. To the extent the law allows, we are not liable for losses arising
          from its use.
        </p>
      </section>

      <section>
        <H>Changes and contact</H>
        <p className="mt-2">
          We may update these terms. The effective date above shows the current version, and you will be asked to accept
          material changes. Questions: <Contact email={contactEmail} />.
        </p>
      </section>
    </LegalLayout>
  );
}
