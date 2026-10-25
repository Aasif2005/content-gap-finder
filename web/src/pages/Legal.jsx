import { useEffect, useState } from 'react';
import { getSite } from '../lib/api.js';
import { navigate } from '../lib/urlState.js';

// Plain-language drafts written against what the app actually does. Review them
// (and have them reviewed) before publishing: they are not legal advice.
const EFFECTIVE = '26 October 2026';
const YT_TERMS = 'https://www.youtube.com/t/terms';
const GOOGLE_PRIVACY = 'https://policies.google.com/privacy';

const A = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium text-ink-900 underline underline-offset-2 dark:text-white">
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
    ? <a href={`mailto:${email}`} className="font-medium text-ink-900 underline underline-offset-2 dark:text-white">{email}</a>
    // Loud on purpose: a policy without a contact fails YouTube's audit.
    : <span className="font-medium text-amber-700 dark:text-amber-400">[contact email not set: add CONTACT_EMAIL to .env]</span>;
}

function LegalLayout({ title, children }) {
  return (
    <article className="max-w-2xl">
      <a
        href="/"
        onClick={(e) => { e.preventDefault(); if (window.history.state?.inApp) window.history.back(); else navigate('/'); }}
        className="text-sm text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200"
      >
        ← Back to Content Gap Finder
      </a>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-900 dark:text-white">{title}</h1>
      <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Effective {EFFECTIVE}</p>
      <div className="legal mt-6 space-y-6 text-sm leading-relaxed text-ink-700 dark:text-ink-200">{children}</div>
    </article>
  );
}

const H = ({ children }) => <h2 className="text-base font-semibold text-ink-900 dark:text-white">{children}</h2>;
const List = ({ children }) => <ul className="mt-2 list-disc space-y-1.5 pl-5">{children}</ul>;

export function PrivacyPage() {
  const { contactEmail, dataMaxDays } = useSite();
  return (
    <LegalLayout title="Privacy Policy">
      <section>
        <p>
          Content Gap Finder helps creators see what is trending in a niche, what viewers are asking for that nobody
          has made, and what to avoid. This policy explains what the app reads, what it keeps, who it shares data with,
          and how to ask for something to be deleted.
        </p>
      </section>

      <section>
        <H>YouTube API Services</H>
        <p className="mt-2">
          Content Gap Finder uses the <b>YouTube API Services</b> to read public YouTube data: search results, video
          titles, thumbnails, channel names, view, like, comment and subscriber counts, and public comments. It reads
          this data with the app's own API key. It never asks you to sign in with a Google account, and it cannot see
          or change anything private in your YouTube account. Google's handling of data is covered by the{' '}
          <A href={GOOGLE_PRIVACY}>Google Privacy Policy</A>.
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
        <p className="mt-2">We do not collect your name, email address or payment details, and there are no accounts.</p>
      </section>

      <section>
        <H>Cookies and browser storage</H>
        <p className="mt-2">
          The app sets no cookies and runs no analytics or advertising trackers. It stores one item in your browser's
          local storage: a record that you accepted these terms, so you are not asked again. Video thumbnails are loaded
          from YouTube's servers, which receive your IP address and browser details when they do.
        </p>
      </section>

      <section>
        <H>Who we share data with</H>
        <List>
          <li><b>YouTube / Google</b> receives the API requests that fetch public data.</li>
          <li>
            <b>DeepSeek</b> (deepseek.com), an AI model provider, receives video titles, statistics and comment text from
            each run in order to cluster topics and find viewer requests. It does not receive anything about you.
          </li>
          <li><b>Anyone you give a report link to</b> can open that report until it expires.</li>
        </List>
        <p className="mt-2">We do not sell data, and we do not show ads.</p>
      </section>

      <section>
        <H>Deleting data</H>
        <p className="mt-2">
          Everything except demand history deletes itself after {dataMaxDays} days. To have a report, a watch or
          anything else removed sooner, contact <Contact email={contactEmail} /> with the report link or search. We act on
          deletion requests within 7 days.
        </p>
      </section>

      <section>
        <H>Children</H>
        <p className="mt-2">Content Gap Finder is a tool for creators and is not directed at children under 13.</p>
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
          By using Content Gap Finder you agree to these terms and to our{' '}
          <a href="/privacy" onClick={(e) => { e.preventDefault(); navigate('/privacy'); }} className="font-medium text-ink-900 underline underline-offset-2 dark:text-white">Privacy Policy</a>.
          Content Gap Finder uses YouTube API Services, so by using it you also agree to be bound by the{' '}
          <A href={YT_TERMS}>YouTube Terms of Service</A>.
        </p>
      </section>

      <section>
        <H>What the service is</H>
        <p className="mt-2">
          Content Gap Finder analyses public YouTube videos and comments for a niche or channel you choose, and suggests
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
            Content Gap Finder. They are not YouTube metrics.
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
