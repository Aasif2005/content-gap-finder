/**
 * What a crawler that does not run JavaScript should see on each public page.
 *
 * The app is a client-rendered SPA, so the raw HTML is an empty <div id="root">. Search
 * engines render JS, but many crawlers, link previews and audits do not. For every indexable
 * route this file holds the head tags and a plain-HTML snapshot (one h1, one h2, h3 sections, real
 * links) that is written into the page at build time (web/scripts/static-host.mjs) and by
 * the Express server (site.js renderIndex). React replaces the snapshot when it starts.
 *
 * Keep the copy in step with the real pages. Titles must equal `fullTitle` in
 * web/src/routes.jsx (a test checks it). Adding a public route? Add it here too.
 */

import { GUIDES } from './guides.js';
import { FAQ } from './faq.js';

export const SITE_NAME = 'Gapstronaut';

const nav = [
  { href: '/', label: 'Home' },
  { href: '/#how', label: 'How it works' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/sample-report', label: 'Sample report' },
  { href: '/guides/youtube-content-gap-analysis', label: 'Guides' },
  { href: '/login', label: 'Log in' },
  { href: '/signup', label: 'Sign up free' },
];
const footer = [
  { href: '/sample-report', label: 'Sample report' },
  { href: '/guides/youtube-content-gap-analysis', label: 'YouTube content gap analysis' },
  { href: '/guides/youtube-video-ideas-from-comments', label: 'Video ideas from comments' },
  { href: '/guides/youtube-competitor-analysis', label: 'YouTube competitor analysis' },
  { href: '/guides/youtube-video-ideas-to-get-subscribers', label: 'Video ideas to get subscribers' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/signup', label: 'Create a free account' },
  { href: '/login', label: 'Log in' },
];

/** Keyed by path. `h2` is the page's single h2; `sections` are { h3, p[] }; `ctas` are extra in-page links. */
export const SEO_PAGES = {
  '/': {
    file: null, // served as index.html itself (see web/scripts/static-host.mjs)
    title: 'Gapstronaut: Find YouTube Content Gaps From Comments',
    description: 'Gapstronaut reads the comments under a niche’s YouTube videos and shows the questions nobody has answered, with every comment linked to its video.',
    ogDescription: 'Find the video your audience is still asking for. Gapstronaut reads the comments under a niche’s YouTube videos and shows the questions nobody has answered.',
    h1: 'Make the video your audience keeps asking for.',
    intro: 'We read the comments across your niche’s YouTube videos and hand you the questions no video has answered yet, each one linked to the comment that asked it. Free in beta: 3 new reports a day, and reopening a report is always free.',
    h2: 'How Gapstronaut finds your next video',
    sections: [
      {
        h3: 'From a niche to your next upload in three steps.',
        p: [
          'Pick your niche: choose a time window and a format, and add a region or language if your audience is regional.',
          'We read the comments: comments under the videos that are working, filtered down to the ones that sound like unmet demand. It takes about a minute and a half.',
          'You film the gap: open the evidence, pick the gap, and get a plan and a script as long as the topic needs.',
        ],
      },
      {
        h3: 'One search. Four ways to win.',
        p: [
          'The same comments, read four ways. Open any answer to the videos, numbers and exact comments behind it.',
          'Trending now: angles working in this niche right now, ranked against each channel’s own norm, not just raw views.',
          'Content gaps: questions viewers keep asking that no video answers well, quoted and linked.',
          'Complaints: what viewers dislike about the videos that already exist, and what to do instead.',
          'Avoid: angles with plenty of views and little response, and when our numbers disagree with that advice.',
        ],
      },
      {
        h3: 'Every idea comes with a receipt.',
        p: [
          'Gapstronaut shows its evidence. Each claim sits beside the viewer comment and the video behind it, so you can check it yourself before you spend a weekend filming.',
          'Numbers that come from YouTube, such as views, likes, comment counts, subscribers, titles and thumbnails, are shown as returned and dated. Numbers we calculate, such as buzz, demand score, engagement rate and channel-median multiples, carry their own mark, so you can always tell them apart.',
        ],
      },
      {
        h3: 'Click any claim. See who said it.',
        p: ['Every gap links to the exact comments that asked for it and the videos they were left under. Nothing is summarised away from its source.'],
      },
      {
        h3: 'Free while we’re in beta.',
        p: [
          'Start free: 3 analyses and 20 Make it drafts a day. Reopening a saved report costs nothing, and no card is needed. Paid plans for heavier use are on the waitlist.',
        ],
      },
      {
        h3: 'Questions creators ask.',
        p: FAQ.map((f) => `${f.q} ${f.a}`),
      },
    ],
    ctas: [
      { href: '/signup', label: 'Start exploring' },
      { href: '/login', label: 'Log in to your reports' },
      { href: '/sample-report', label: 'See a sample report' },
      { href: '/guides/youtube-content-gap-analysis', label: 'Read: YouTube content gap analysis' },
    ],
  },

  '/sample-report': {
    file: 'sample-report',
    title: 'Sample YouTube Content Gap Report: What You Get',
    description: 'See what a Gapstronaut report looks like: the content gaps in a niche, each one linked to the viewer comment and video behind it.',
    h1: 'What a Gapstronaut report looks like',
    intro: 'This is a sample of what Gapstronaut gives you for a niche: the gaps found in it, and for each one the viewer comments that asked for it and the videos they were left under. Open any gap to see the evidence.',
    h2: 'What a Gapstronaut report shows',
    sections: [
      { h3: 'Content gaps', p: ['Questions viewers keep asking that no video in the niche answers well yet. Each gap comes with a suggested video title and the exact comments behind it, so you can check the demand yourself before you film.'] },
      { h3: 'Trending now', p: ['Angles that are working in the niche right now, ranked against each channel’s own norm rather than raw views, so a small channel with a breakout video is not hidden behind a giant one.'] },
      { h3: 'Complaints', p: ['What viewers dislike about the videos that already exist, and what to do instead. These are the missing steps and unclear explanations that make people leave a comment.'] },
      { h3: 'Topics to avoid', p: ['Angles with plenty of views and little response from viewers, so you can skip crowded ground and spend the week on something with a real audience.'] },
      { h3: 'Evidence on every claim', p: ['Every line in a report links back to the viewer comment and the YouTube video it came from. Numbers that come from YouTube are shown as returned. Numbers we calculate are marked so you can tell them apart.'] },
      { h3: 'Try it on your own niche', p: ['Create a free account, type a niche or paste a channel, and get a report of your own in about a minute and a half. It is free during the beta, with 3 new reports a day, and reopening a saved report is always free.'] },
    ],
    ctas: [
      { href: '/signup', label: 'Create a free account' },
      { href: '/guides/youtube-content-gap-analysis', label: 'Guide: YouTube content gap analysis' },
      { href: '/guides/youtube-video-ideas-from-comments', label: 'Guide: video ideas from comments' },
      { href: '/guides/youtube-competitor-analysis', label: 'Guide: YouTube competitor analysis' },
      { href: '/guides/youtube-video-ideas-to-get-subscribers', label: 'Guide: video ideas to get subscribers' },
    ],
  },

  '/login': {
    file: 'login',
    title: 'Log in to Gapstronaut · Your Saved Gap Reports',
    description: 'Log in to Gapstronaut to reopen your saved reports for free and see the viewer comments behind every content gap. Pick up where you left off.',
    h1: 'Welcome back',
    intro: 'Log in to run analyses and open your saved reports.',
    h2: 'Your reports are waiting',
    sections: [
      {
        h3: 'Pick up where you left off',
        p: [
          'Your saved reports are waiting. Gapstronaut keeps each analysis you run, so you can reopen a niche, review the viewer comments behind a gap and carry on writing the plan or script. Reopening a saved report is free and does not use your daily allowance.',
          'Log in with Google or with your email and password. If you have forgotten your password, use the reset link on the log-in page and we will email you a link to choose a new one.',
        ],
      },
      {
        h3: 'New here?',
        p: [
          'Create a free account in under a minute. During the beta you get 3 analyses and 20 Make it drafts a day, with every claim linked to the viewer comment and the video behind it. No card is needed.',
          'By continuing you agree to the Terms of Service, the Privacy Policy and the YouTube Terms of Service.',
        ],
      },
      {
        h3: 'Cannot log in?',
        p: ['Use the same sign-in method you signed up with: Google, or your email and password. If you have forgotten your password, ask for a reset link. Still stuck? Write to the contact address in our Privacy Policy and we will help.'],
      },
      {
        h3: 'What Gapstronaut does',
        p: [
          'Gapstronaut reads the comments under a niche’s YouTube videos and shows the questions nobody has answered yet, so you can film the video your audience is already asking for. Reports cover trending angles, content gaps, viewer complaints and crowded angles to avoid.',
        ],
      },
    ],
    ctas: [{ href: '/signup', label: 'Create a free account' }, { href: '/reset-password', label: 'Forgot your password?' }],
  },

  '/signup': {
    file: 'signup',
    title: 'Create a Free Gapstronaut Account · No Card Needed',
    description: 'Create a free Gapstronaut account and find the videos your audience is still asking for. No card needed. Free in beta, 3 gap reports a day.',
    h1: 'Create your free account',
    intro: 'Find the videos your audience is still asking for. No card needed.',
    h2: 'What a free account includes',
    sections: [
      {
        h3: 'What you get for free',
        p: [
          'Three analyses a day and 20 Make it drafts a day while Gapstronaut is in beta. Niche reports and channel reports, with every comment linked to its video. Reopening a saved report is free, always.',
          'Each analysis reads the comments under the videos that are working in your niche, keeps the ones that sound like unmet demand, and shows you the gaps with the exact comments behind them.',
        ],
      },
      {
        h3: 'How sign-up works',
        p: [
          'Sign up with Google, or with your email and a password of at least eight characters. If you use email we send a link to verify your address, and your account opens as soon as you click it.',
          'We ask you to agree to the Terms of Service, the Privacy Policy and the YouTube Terms of Service.',
        ],
      },
      {
        h3: 'Who it is for',
        p: ['Gapstronaut is for YouTube creators, and for the people who plan videos with them. Search a niche to see what viewers keep asking for that nobody has made yet, or paste a channel to see which of its videos work and what its own viewers want next.'],
      },
      {
        h3: 'Your data',
        p: [
          'You can delete your account and everything stored with it at any time from your profile. The Privacy Policy explains what is stored, for how long and who it is shared with.',
        ],
      },
    ],
    ctas: [{ href: '/login', label: 'Already have an account? Log in' }],
  },

  '/reset-password': {
    file: 'reset-password',
    title: 'Reset Your Gapstronaut Password · Get a Secure Link',
    description: 'Forgot your Gapstronaut password? Enter your email and we will send a secure link to choose a new one, so you can get back to your saved reports.',
    h1: 'Reset your password',
    intro: 'Forgot your Gapstronaut password? Enter the email you signed up with and we will send you a link to choose a new one. Your saved reports and your account stay exactly as they were.',
    h2: 'How password reset works',
    sections: [
      {
        h3: 'Ask for a reset link',
        p: [
          'Type the email address you signed up with and send the request. If a Gapstronaut account exists for that address, we email you a link from noreply@gapstronaut.com.',
          'The page says the same thing whether or not an account exists for the address, so nobody can use it to check which emails have accounts.',
        ],
      },
      {
        h3: 'Choose a new password',
        p: [
          'The link works once and expires after 1 hour. It opens a Gapstronaut page where you choose a new password of at least 8 characters, and then you log in with it.',
        ],
      },
      {
        h3: 'If the email does not arrive',
        p: [
          'Check your spam or junk folder if the email has not arrived within a minute or two. If the link has expired or has already been used, go back and ask for a new one.',
        ],
      },
      {
        h3: 'Keep your account safe',
        p: ['Choose a password you do not use anywhere else and keep it to yourself. Gapstronaut will never ask you for your password by email or message.'],
      },
      {
        h3: 'Signed up with Google?',
        p: [
          'Accounts created with Continue with Google have no Gapstronaut password. Sign in with Google instead, and manage that password at Google.',
          'If you did not ask for a reset, ignore the email and your password stays the same.',
        ],
      },
    ],
    ctas: [{ href: '/login', label: 'Back to log in' }, { href: '/signup', label: 'Create a free account' }],
  },

  '/privacy': {
    file: 'privacy',
    title: 'Privacy Policy: What Gapstronaut Collects and Keeps',
    description: 'What Gapstronaut collects, how long it keeps it, and how to have it deleted. A plain-language policy covering accounts, reports and YouTube data.',
    h1: 'Privacy Policy',
    intro: 'Gapstronaut helps creators see what is trending in a niche, what viewers are asking for that nobody has made, and what to avoid. This policy explains what the app reads, what it keeps, who it shares data with, and how to ask for something to be deleted.',
    h2: 'How Gapstronaut handles your data',
    sections: [
      { h3: 'YouTube API Services', p: ['Gapstronaut uses YouTube API Services to read public video, channel and comment data. By using it you also agree to the YouTube Terms of Service and the Google Privacy Policy.'] },
      { h3: 'Your account details', p: ['You sign in with Google or with an email address and password. We keep your name, email address, profile photo if you add one, and the agreement you gave to our terms.'] },
      { h3: 'What we store, and for how long', p: ['We store the reports you run and your daily usage. Data read from YouTube is kept for a limited time and then removed. The full list of what is stored and its retention period is in the policy.'] },
      { h3: 'Cookies and browser storage', p: ['We use browser storage for your sign-in, your theme and your cookie choice. Analytics only loads if you accept it in the cookie notice, and you can change your choice at any time from the footer.'] },
      { h3: 'Who we share data with', p: ['We use a small number of service providers to run Gapstronaut, such as hosting, sign-in and language-model processing. We do not sell your data.'] },
      { h3: 'Deleting data', p: ['You can delete your account and all data stored with it from your profile, or email us and we will do it for you.'] },
      { h3: 'Children and changes', p: ['Gapstronaut is not for children under 13. We will tell you about important changes to this policy, and you can contact us with any question at the support address in the footer.'] },
    ],
    ctas: [{ href: '/terms', label: 'Read the Terms of Service' }],
  },

  '/terms': {
    file: 'terms',
    title: 'Terms of Service: Using Gapstronaut and YouTube Data',
    description: 'The terms for using Gapstronaut, including the YouTube Terms of Service they bind you to. Free in beta, with plain rules on accounts and your reports.',
    h1: 'Terms of Service',
    intro: 'These terms apply when you use Gapstronaut. By creating an account or running an analysis you agree to them, and to the YouTube Terms of Service, which also bind you when you use data from YouTube.',
    h2: 'The rules for using Gapstronaut',
    sections: [
      { h3: 'Agreeing to these terms', p: ['Using Gapstronaut means you accept these terms and our Privacy Policy. If you do not agree, please do not use the service.'] },
      { h3: 'Your account and sign-in', p: ['Keep your sign-in details safe. You are responsible for what happens under your account, and each person should use their own.'] },
      { h3: 'What the service is', p: ['Gapstronaut analyses public YouTube comments and videos and suggests topics. It is a research aid, not a promise of views, income or results.'] },
      { h3: 'Figures and AI output', p: ['Some figures are calculated by us and some text is written by a language model from the comments it was given. Check the linked evidence before you rely on it.'] },
      { h3: 'Fair use of the service', p: ['Do not scrape the service, share accounts to get around allowances, or use it to harass anyone. Daily allowances exist to keep the service available to everyone.'] },
      { h3: 'Saved reports', p: ['Reports are kept for a limited period. Data from YouTube is removed on the schedule in the Privacy Policy.'] },
      { h3: 'No warranty, changes and contact', p: ['The service is provided as it is, without warranty. We may update these terms and will tell you about important changes. Contact us at the support address in the footer.'] },
    ],
    ctas: [{ href: '/privacy', label: 'Read the Privacy Policy' }],
  },
};

// The how-to guides come from guides.js; their sections are h2s, so the snapshot knows them by `guide`.
for (const [path, g] of Object.entries(GUIDES)) SEO_PAGES[path] = { ...g, guide: true, h2: g.sections[0].h2 };

export const seoPageFor = (path) => SEO_PAGES[path.length > 1 ? path.replace(/\/+$/, '') : path] ?? null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const links = (items) => items.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join(' ');

/** The plain-HTML body of a page: one h1, one h2, h3 sections, and links to the rest of the site. */
export function snapshotHtml(page) {
  // Guides give every section its own h2; other pages have one h2 and h3 sections under it.
  const heading = page.guide ? 'h2' : 'h3';
  const sections = page.sections.map((s) => `<section><${heading}>${esc(s.h2 ?? s.h3)}</${heading}>${s.p.map((t) => `<p>${esc(t)}</p>`).join('')}</section>`).join('');
  const lead = page.guide ? '' : `<h2>${esc(page.h2)}</h2>`;
  const updated = page.updated ? `<p>Updated ${esc(page.updated)}</p>` : '';
  return `<div class="seo-snap"><header><a href="/">${SITE_NAME}</a><nav>${links(nav)}</nav></header><main><h1>${esc(page.h1)}</h1>${updated}<p>${esc(page.intro)}</p>${lead}${sections}<p>${links(page.ctas ?? [])}</p></main><footer><nav>${links(footer)}</nav><p>© ${SITE_NAME}. Gapstronaut is not affiliated with or endorsed by YouTube.</p></footer></div>`;
}

const setMeta = (html, attr, name, value) => {
  const tag = `<meta ${attr}="${name}" content="${esc(value)}" />`;
  const re = new RegExp(`<meta ${attr}="${name.replace(/[:.]/g, '\\$&')}"[^>]*>`);
  return re.test(html) ? html.replace(re, () => tag) : html.replace('</head>', () => `    ${tag}\n  </head>`);
};

/** Page text with no tags, for tests and word counts. */
export const snapshotText = (page) => snapshotHtml(page).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Structured data for a page, as the JSON-LD blocks search engines and AI tools read. Only the homepage
 * carries any: who runs the site and what the product is. Nothing here may claim what is not true, so
 * there are no ratings, reviews or prices (pricing is a launch offer, and nothing has been reviewed).
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** '7 November 2026' -> '2026-11-07' (the format schema.org and sitemaps want). */
export function guideDate(text) {
  const [d, m, y] = String(text).split(' ');
  return `${y}-${String(MONTHS.indexOf(m) + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function structuredData(origin, path) {
  const guide = GUIDES[path];
  if (guide) {
    const org = { '@type': 'Organization', name: SITE_NAME, url: `${origin}/` };
    return [{
      '@context': 'https://schema.org', '@type': 'Article', headline: guide.h1, description: guide.description,
      mainEntityOfPage: `${origin}${path}`, dateModified: guideDate(guide.updated), author: org, publisher: org,
    }];
  }
  if (path !== '/') return [];
  const url = `${origin}/`;
  return [
    {
      '@context': 'https://schema.org', '@type': 'Organization', '@id': `${url}#organization`,
      name: SITE_NAME, url, logo: `${origin}/icon-512.png`,
      contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'mission@gapstronaut.com' },
    },
    { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${url}#website`, name: SITE_NAME, url, publisher: { '@id': `${url}#organization` } },
    {
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: SITE_NAME, url,
      applicationCategory: 'BusinessApplication', operatingSystem: 'Any (web browser)',
      description: seoPageFor('/')?.description ?? '',
      publisher: { '@id': `${url}#organization` },
    },
  ];
}

/** A JSON-LD block that cannot close its own script tag. */
const ldScript = (data) => `    <script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n`;

/**
 * The built index.html turned into one public page: its own title, description, canonical,
 * og:* and twitter:* tags, plus the plain-HTML snapshot inside #root (hidden off-screen until
 * React takes over, never display:none).
 */
export function renderSeoPage(html, origin, path) {
  const page = seoPageFor(path);
  if (!page) return html;
  const url = `${origin}${path.length > 1 ? path.replace(/\/+$/, '') : ''}${path === '/' ? '/' : ''}`;
  let out = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(page.title)}</title>`);
  out = setMeta(out, 'name', 'description', page.description);
  out = setMeta(out, 'property', 'og:title', page.title);
  out = setMeta(out, 'property', 'og:description', page.ogDescription ?? page.description);
  out = setMeta(out, 'property', 'og:url', url);
  out = setMeta(out, 'name', 'twitter:title', page.title);
  out = setMeta(out, 'name', 'twitter:description', page.ogDescription ?? page.description);
  const ld = structuredData(origin, path).map(ldScript).join('');
  out = out.replace('</head>', () => `${ld}    <link rel="canonical" href="${url}" />\n    <style>.seo-snap{position:absolute;left:-10000px;top:0;width:1px;height:1px;overflow:hidden}</style>\n  </head>`);
  return out.replace('<div id="root"></div>', () => `<div id="root">${snapshotHtml(page)}</div>`);
}
