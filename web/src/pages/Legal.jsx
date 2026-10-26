import { useEffect, useState } from 'react';
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
  const [site, setSite] = useState({ contactEmail: null, dataMaxDays: 30 });
  useEffect(() => {
    let live = true;
    getSite().then((s) => { if (live) setSite(s); }).catch(() => {});
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

function LegalLayout({ title, children }) {
  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-16 pt-6 sm:px-10 sm:pb-24 sm:pt-10">
      <article className="max-w-2xl">
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); goBackOr('/'); }}
          className="inline-flex min-h-11 items-center text-sm text-fg-2 hover:text-fg"
        >
          &larr; Back to Gapstronaut
        </a>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 font-mono text-[13px] text-fg-3">Effective {EFFECTIVE}</p>
        <div className="legal mt-8 space-y-7 text-[15px] leading-relaxed text-fg-2">{children}</div>
      </article>
    </div>
  );
}

const H = ({ children }) => <h2 className="text-lg font-semibold tracking-[-0.01em] text-fg">{children}</h2>;
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
          We keep your sign-in provider, email address, name and profile photo (if Google supplies one), whether your
          email is verified, when you joined, when you accepted these terms, and how many analyses and drafts you have
          used today. Passwords are held by Firebase, never by us. You can delete your account from your profile page,
          which removes this record, your saved watches and the links that tie reports to you.
        </p>
      </section>

      <section>
        <H>What we store, and for how long</H>
        <List>
          <li>
            <b>Reports.</b> When you run an analysis, the report is saved on our server so it can be reopened and shared.
            It contains the YouTube data above, plus our own analysis of it. Reports, the drafts made from them
            (&ldquo;Make it&rdquo;), the short-lived result cache and the run logs are <b>deleted after {dataMaxDays} days</b>.
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
          your sign-in session in your browser's storage so you stay logged in. Video thumbnails are loaded
          from YouTube's servers, which receive your IP address and browser details when they do.
        </p>
      </section>

      <section>
        <H>Who we share data with</H>
        <List>
          <li><b>YouTube / Google</b> receives the API requests that fetch public data.</li>
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
            marked ⓘ (heat, demand score, engagement rate, channel-median multiples, title checks) are calculated by
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
