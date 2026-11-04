/**
 * What a crawler that does not run JavaScript should see on each public page.
 *
 * The app is a client-rendered SPA, so the raw HTML is an empty <div id="root">. Search
 * engines render JS, but many crawlers, link previews and audits do not. For every indexable
 * route this file holds the head tags and a plain-HTML snapshot (one h1, h2 sections, real
 * links) that is written into the page at build time (web/scripts/static-host.mjs) and by
 * the Express server (site.js renderIndex). React replaces the snapshot when it starts.
 *
 * Keep the copy in step with the real pages. Titles must equal `fullTitle` in
 * web/src/routes.jsx (a test checks it). Adding a public route? Add it here too.
 */

export const SITE_NAME = 'Gapstronaut';

const nav = [
  { href: '/', label: 'Home' },
  { href: '/#how', label: 'How it works' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/login', label: 'Log in' },
  { href: '/signup', label: 'Sign up free' },
];
const footer = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/signup', label: 'Create a free account' },
  { href: '/login', label: 'Log in' },
];

/** Keyed by path. `sections` are { h2, p[] }; `ctas` are extra in-page links. */
export const SEO_PAGES = {
  '/': {
    file: 'home',
    title: 'Gapstronaut: Find YouTube Content Gaps From Comments',
    description: 'Gapstronaut reads the comments under a niche’s YouTube videos and shows the questions nobody has answered, with every comment linked to its video.',
    ogDescription: 'Find the video your audience is still asking for. Gapstronaut reads the comments under a niche’s YouTube videos and shows the questions nobody has answered.',
    h1: 'Make the video your audience keeps asking for.',
    intro: 'We read the comments across your niche’s YouTube videos and hand you the questions no video has answered yet, each one linked to the comment that asked it. Free in beta: 3 new reports a day, and reopening a report is always free.',
    sections: [
      {
        h2: 'From a niche to your next upload in three steps.',
        p: [
          'Pick your niche: choose a time window and a format, and add a region or language if your audience is regional.',
          'We read the comments: comments under the videos that are working, filtered down to the ones that sound like unmet demand. It takes about a minute and a half.',
          'You film the gap: open the evidence, pick the gap, and get a plan and a script as long as the topic needs.',
        ],
      },
      {
        h2: 'One search. Four ways to win.',
        p: [
          'The same comments, read four ways. Open any answer to the videos, numbers and exact comments behind it.',
          'Trending now: angles working in this niche right now, ranked against each channel’s own norm, not just raw views.',
          'Content gaps: questions viewers keep asking that no video answers well, quoted and linked.',
          'Complaints: what viewers dislike about the videos that already exist, and what to do instead.',
          'Avoid: angles with plenty of views and little response, and when our numbers disagree with that advice.',
        ],
      },
      {
        h2: 'Every idea comes with a receipt.',
        p: [
          'Gapstronaut shows its evidence. Each claim sits beside the viewer comment and the video behind it, so you can check it yourself before you spend a weekend filming.',
          'Numbers that come from YouTube, such as views, likes, comment counts, subscribers, titles and thumbnails, are shown as returned and dated. Numbers we calculate, such as buzz, demand score, engagement rate and channel-median multiples, carry their own mark, so you can always tell them apart.',
        ],
      },
      {
        h2: 'Click any claim. See who said it.',
        p: ['Every gap links to the exact comments that asked for it and the videos they were left under. Nothing is summarised away from its source.'],
      },
      {
        h2: 'Free while we’re in beta.',
        p: [
          'Start free: 3 fresh analyses and 20 Make it drafts a day. Opening a saved or cached report costs nothing, and no card is needed. Paid plans for heavier use are on the waitlist.',
        ],
      },
    ],
    ctas: [{ href: '/signup', label: 'Start exploring' }, { href: '/login', label: 'Log in to your reports' }],
  },

  '/login': {
    file: 'login',
    title: 'Log in to Gapstronaut · Your Saved Gap Reports',
    description: 'Log in to Gapstronaut to run analyses and open your saved reports.',
    h1: 'Welcome back',
    intro: 'Log in to run analyses and open your saved reports.',
    sections: [
      {
        h2: 'Pick up where you left off',
        p: [
          'Your saved reports are waiting. Gapstronaut keeps each analysis you run, so you can reopen a niche, review the viewer comments behind a gap and carry on writing the plan or script. Opening a saved or cached report is always free and does not use your daily allowance.',
          'Log in with Google or with your email and password. If you have forgotten your password, use the reset link on the log-in page and we will email you a link to choose a new one.',
        ],
      },
      {
        h2: 'New here?',
        p: [
          'Create a free account in under a minute. During the beta you get 3 fresh analyses and 20 Make it drafts a day, with every claim linked to the viewer comment and the video behind it. No card is needed.',
          'By continuing you agree to the Terms of Service and the Privacy Policy. Gapstronaut reads public YouTube data through the YouTube API Services, and you agree to the YouTube Terms of Service when you use it.',
        ],
      },
      {
        h2: 'What Gapstronaut does',
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
    description: 'Create a free Gapstronaut account and find the videos your audience is still asking for. No card needed.',
    h1: 'Create your free account',
    intro: 'Find the videos your audience is still asking for. No card needed.',
    sections: [
      {
        h2: 'What you get for free',
        p: [
          'Three fresh analyses a day and 20 Make it drafts a day while Gapstronaut is in beta. Niche reports and channel reports, with every comment linked to its video. Saved and cached reports are free to reopen, always.',
          'Each analysis reads the comments under the videos that are working in your niche, keeps the ones that sound like unmet demand, and shows you the gaps with the exact comments behind them.',
        ],
      },
      {
        h2: 'How sign-up works',
        p: [
          'Sign up with Google, or with your email and a password of at least eight characters. If you use email we send a link to verify your address, and your account opens as soon as you click it.',
          'We ask you to agree to the Terms of Service and the Privacy Policy. Gapstronaut reads public YouTube data through the YouTube API Services, and by using it you also agree to the YouTube Terms of Service.',
        ],
      },
      {
        h2: 'Your data',
        p: [
          'You can delete your account and everything stored with it at any time from your profile. Reports and the data read from YouTube delete themselves after 30 days, apart from anonymous demand history. The Privacy Policy explains what is stored, for how long and who it is shared with.',
        ],
      },
    ],
    ctas: [{ href: '/login', label: 'Already have an account? Log in' }],
  },

  '/privacy': {
    file: 'privacy',
    title: 'Privacy Policy: What Gapstronaut Collects and Keeps',
    description: 'What Gapstronaut collects, how long it keeps it, and how to have it deleted.',
    h1: 'Privacy Policy',
    intro: 'Gapstronaut helps creators see what is trending in a niche, what viewers are asking for that nobody has made, and what to avoid. This policy explains what the app reads, what it keeps, who it shares data with, and how to ask for something to be deleted.',
    sections: [
      { h2: 'YouTube API Services', p: ['Gapstronaut uses YouTube API Services to read public video, channel and comment data. By using it you also agree to the YouTube Terms of Service and the Google Privacy Policy.'] },
      { h2: 'Your account', p: ['You sign in with Google or with an email address and password. We keep your name, email address, profile photo if you add one, and the agreement you gave to our terms.'] },
      { h2: 'What we store, and for how long', p: ['We store the reports you run and your daily usage. Data read from YouTube is kept for a limited time and then removed. The full list of what is stored and its retention period is in the policy.'] },
      { h2: 'Cookies and browser storage', p: ['We use browser storage for your sign-in, your theme and your cookie choice. Analytics only loads if you accept it in the cookie notice, and you can change your choice at any time from the footer.'] },
      { h2: 'Who we share data with', p: ['We use a small number of service providers to run Gapstronaut, such as hosting, sign-in and language-model processing. We do not sell your data.'] },
      { h2: 'Deleting data', p: ['You can delete your account and all data stored with it from your profile, or email us and we will do it for you.'] },
      { h2: 'Children and changes', p: ['Gapstronaut is not for children under 13. We will tell you about important changes to this policy, and you can contact us with any question at the support address in the footer.'] },
    ],
    ctas: [{ href: '/terms', label: 'Read the Terms of Service' }],
  },

  '/terms': {
    file: 'terms',
    title: 'Terms of Service: Using Gapstronaut and YouTube Data',
    description: 'The terms for using Gapstronaut, including the YouTube Terms of Service they bind you to.',
    h1: 'Terms of Service',
    intro: 'These terms apply when you use Gapstronaut. By creating an account or running an analysis you agree to them, and to the YouTube Terms of Service, which also bind you when you use data from YouTube.',
    sections: [
      { h2: 'Agreement', p: ['Using Gapstronaut means you accept these terms and our Privacy Policy. If you do not agree, please do not use the service.'] },
      { h2: 'Your account', p: ['Keep your sign-in details safe. You are responsible for what happens under your account, and each person should use their own.'] },
      { h2: 'What the service is', p: ['Gapstronaut analyses public YouTube comments and videos and suggests topics. It is a research aid, not a promise of views, income or results.'] },
      { h2: 'Figures and AI output', p: ['Some figures are calculated by us and some text is written by a language model from the comments it was given. Check the linked evidence before you rely on it.'] },
      { h2: 'Fair use of the service', p: ['Do not scrape the service, share accounts to get around allowances, or use it to harass anyone. Daily allowances exist to keep the service available to everyone.'] },
      { h2: 'Saved reports', p: ['Reports are kept for a limited period. Data from YouTube is removed on the schedule in the Privacy Policy.'] },
      { h2: 'No warranty, changes and contact', p: ['The service is provided as it is, without warranty. We may update these terms and will tell you about important changes. Contact us at the support address in the footer.'] },
    ],
    ctas: [{ href: '/privacy', label: 'Read the Privacy Policy' }],
  },
};

export const seoPageFor = (path) => SEO_PAGES[path.length > 1 ? path.replace(/\/+$/, '') : path] ?? null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const links = (items) => items.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join(' ');

/** The plain-HTML body of a page: one h1, h2 sections, and links to the rest of the site. */
export function snapshotHtml(page) {
  const sections = page.sections.map((s) => `<section><h2>${esc(s.h2)}</h2>${s.p.map((t) => `<p>${esc(t)}</p>`).join('')}</section>`).join('');
  return `<div class="seo-snap"><header><a href="/">${SITE_NAME}</a><nav>${links(nav)}</nav></header><main><h1>${esc(page.h1)}</h1><p>${esc(page.intro)}</p>${sections}<p>${links(page.ctas ?? [])}</p></main><footer><nav>${links(footer)}</nav><p>© ${SITE_NAME}. Gapstronaut is not affiliated with or endorsed by YouTube.</p></footer></div>`;
}

const setMeta = (html, attr, name, value) => {
  const tag = `<meta ${attr}="${name}" content="${esc(value)}" />`;
  const re = new RegExp(`<meta ${attr}="${name.replace(/[:.]/g, '\\$&')}"[^>]*>`);
  return re.test(html) ? html.replace(re, () => tag) : html.replace('</head>', () => `    ${tag}\n  </head>`);
};

/** Page text with no tags, for tests and word counts. */
export const snapshotText = (page) => snapshotHtml(page).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

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
  out = out.replace('</head>', () => `    <link rel="canonical" href="${url}" />\n    <style>.seo-snap{position:absolute;left:-10000px;top:0;width:1px;height:1px;overflow:hidden}</style>\n  </head>`);
  return out.replace('<div id="root"></div>', () => `<div id="root">${snapshotHtml(page)}</div>`);
}
