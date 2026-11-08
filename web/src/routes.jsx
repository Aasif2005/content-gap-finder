import { lazyPage } from './lib/lazyPage.jsx';
import { setPreloader } from './lib/router.jsx';
import Home from './pages/Home.jsx';
// The legal pages are indexed on their own and are plain text: they ship in the entry, because a lazy chunk
// meant a skeleton first and the text jumping in after (layout shift).
import { PrivacyPage, TermsPage } from './pages/Legal.jsx';
// The guides are plain text too, and indexed on their own: same reason.
import Guide from './pages/Guide.jsx';

// Loaded on arrival, so a first visit to the homepage does not download the whole app. A page fetched early
// (`preloadRoute`, below) then draws at once, with no skeleton in between.
const Dashboard = lazyPage(() => import('./pages/Dashboard.jsx'));
const Profile = lazyPage(() => import('./pages/Profile.jsx'));
const Explorer = lazyPage(() => import('./pages/Explorer.jsx'));
// The homepage is the entry point for most visits, so the other public pages are fetched when wanted (or once
// the homepage has settled, see Home.jsx); their prerendered HTML is what crawlers read.
const SampleReportPage = lazyPage(() => import('./pages/SampleReportPage.jsx'));
const Login = lazyPage(() => import('./pages/Login.jsx'));
const Signup = lazyPage(() => import('./pages/Signup.jsx'));
const ResetPassword = lazyPage(() => import('./pages/ResetPassword.jsx'));
const AuthAction = lazyPage(() => import('./pages/AuthAction.jsx'));
const AcceptTerms = lazyPage(() => import('./pages/AcceptTerms.jsx'));
const NotFound = lazyPage(() => import('./pages/NotFound.jsx'));
// The signed-in frame (and the animation library it brings) is only fetched by people who have an account.
export const AppShell = lazyPage(() => import('./components/shell/AppShell.jsx'));

// The same loaders, started early (idle time, link hover, a sign-in under way) so a page finds its code already here.
const appLoaders = {
  '/dashboard': Dashboard.preload,
  '/profile': Profile.preload,
  '/explore': Explorer.preload,
};
const publicLoaders = {
  '/sample-report': SampleReportPage.preload,
  '/login': Login.preload,
  '/signup': Signup.preload,
  '/reset-password': ResetPassword.preload,
  '/auth': AuthAction.preload,
  '/accept-terms': AcceptTerms.preload,
};
export const preloadRoute = (path) => {
  const base = '/' + String(path || '').split(/[?#]/)[0].split('/')[1];
  if (appLoaders[base]) { AppShell.preload().catch(() => {}); appLoaders[base]().catch(() => {}); }
  else publicLoaders[base]?.().catch(() => {});
};
export const preloadAppRoutes = () => Object.keys(appLoaders).forEach(preloadRoute);
setPreloader(preloadRoute);

/**
 * The route table. First match wins, so `*` stays last.
 *
 *  - `shell`: 'marketing' (public nav and footer), 'app' (signed-in frame), or
 *    'bare' (no frame: the page draws its own layout).
 *  - `auth`: 'required' sends a logged-out visitor to /login?next=...
 *  - `title`: the tab title is `title · Gapstronaut`; no title is just `Gapstronaut`.
 *  - `description`: the page's search-result text; without one, the site's default in index.html.
 *  - `indexable`: a page worth a search result. It gets a canonical link and og:url;
 *    every other route has them removed. A test keeps this equal to the sitemap.
 *  - `shellProps`: passed to the shell (MarketingShell takes `theme` and `anchors`).
 *  - `element`: a React element, or a function `({ params, query, path }) => element`
 *    for routes that read their params.
 *
 * The Explorer carries a `key` per mode so moving between the niche and channel
 * pages starts a fresh page, while /explore -> /r/:id keeps the same one.
 */
export const routes = [
  {
    path: '/',
    title: null,
    indexable: true,
    fullTitle: 'Gapstronaut: Find YouTube Content Gaps From Comments',
    shell: 'marketing',
    shellProps: {
      anchors: [
        { href: '#how', label: 'How it works' },
        { href: '#get', label: 'What you get' },
        { href: '#evidence', label: 'Evidence' },
        { href: '#pricing', label: 'Pricing' },
      ],
    },
    auth: 'public',
    element: <Home />,
  },
  { path: '/login', indexable: true, title: 'Log in', fullTitle: 'Log in to Gapstronaut · Your Saved Gap Reports', description: 'Log in to Gapstronaut to reopen your saved reports for free and see the viewer comments behind every content gap. Pick up where you left off.', shell: 'bare', auth: 'public', element: <Login /> },
  { path: '/signup', indexable: true, title: 'Sign up', fullTitle: 'Create a Free Gapstronaut Account · No Card Needed', description: 'Create a free Gapstronaut account and find the videos your audience is still asking for. No card needed. Free in beta, 3 gap reports a day.', shell: 'bare', auth: 'public', element: <Signup /> },
  { path: '/reset-password', indexable: true, title: 'Reset your password', fullTitle: 'Reset Your Gapstronaut Password · Get a Secure Link', description: 'Forgot your Gapstronaut password? Enter your email and we will send a secure link to choose a new one, so you can get back to your saved reports.', shell: 'bare', auth: 'public', element: <ResetPassword /> },
  { path: '/auth/action', title: 'Account link', description: 'Confirm your email or choose a new password for your Gapstronaut account.', shell: 'bare', auth: 'public', element: <AuthAction /> },
  { path: '/accept-terms', title: 'Agree to continue', description: 'Agree to the Gapstronaut Terms of Service and Privacy Policy to continue to your account.', shell: 'bare', auth: 'public', element: <AcceptTerms /> },
  { path: '/privacy', indexable: true, title: 'Privacy Policy', fullTitle: 'Privacy Policy: What Gapstronaut Collects and Keeps', description: 'What Gapstronaut collects, how long it keeps it, and how to have it deleted. A plain-language policy covering accounts, reports and YouTube data.', shell: 'marketing', auth: 'public', element: <PrivacyPage /> },
  { path: '/terms', indexable: true, title: 'Terms of Service', fullTitle: 'Terms of Service: Using Gapstronaut and YouTube Data', description: 'The terms for using Gapstronaut, including the YouTube Terms of Service they bind you to. Free in beta, with plain rules on accounts and your reports.', shell: 'marketing', auth: 'public', element: <TermsPage /> },
  { path: '/sample-report', indexable: true, title: 'Sample report', fullTitle: 'Sample YouTube Content Gap Report: What You Get', description: 'See what a Gapstronaut report looks like: the content gaps in a niche, each one linked to the viewer comment and video behind it.', shell: 'marketing', auth: 'public', element: <SampleReportPage /> },
  { path: '/guides/youtube-content-gap-analysis', indexable: true, title: 'YouTube content gap analysis', fullTitle: 'YouTube Content Gap Analysis: A Simple Guide', description: 'How to run a YouTube content gap analysis: find the questions viewers keep asking that no video in your niche answers well yet.', shell: 'marketing', auth: 'public', element: <Guide path="/guides/youtube-content-gap-analysis" /> },
  { path: '/guides/youtube-video-ideas-from-comments', indexable: true, title: 'YouTube video ideas from comments', fullTitle: 'Find YouTube Video Ideas in the Comments', description: 'How to mine YouTube comments for video ideas: what to look for, how to tell real demand from noise, and how to turn a question into a title.', shell: 'marketing', auth: 'public', element: <Guide path="/guides/youtube-video-ideas-from-comments" /> },
  { path: '/guides/youtube-competitor-analysis', indexable: true, title: 'YouTube competitor analysis', fullTitle: 'YouTube Competitor Analysis: How to Do It, Step by Step', description: 'How to do a YouTube competitor analysis: find the rival videos that beat their own average, what viewers still ask under them, and what to make next.', shell: 'marketing', auth: 'public', element: <Guide path="/guides/youtube-competitor-analysis" /> },
  { path: '/dashboard', title: 'Dashboard', description: 'Your saved Gapstronaut reports and daily analyses, all in one place.', shell: 'app', auth: 'required', element: <Dashboard /> },
  { path: '/explore', title: 'Explore a niche', description: 'Search a niche to see the questions viewers keep asking that no YouTube video has answered yet.', shell: 'app', auth: 'required', element: <Explorer key="niche" mode="niche" /> },
  { path: '/channel', title: 'Analyze a channel', description: 'Paste a YouTube channel to see which videos work and what its own viewers want next.', shell: 'app', auth: 'required', element: <Explorer key="channel" mode="channel" /> },
  // Shared report links are public. What a logged-out visitor sees is the Explorer's call.
  {
    path: '/r/:id',
    title: 'Report', description: 'A shared Gapstronaut report: the YouTube content gaps in a niche, each linked to the viewer comment behind it.',
    shell: 'app',
    auth: 'public',
    element: ({ params }) => <Explorer key="niche" mode="niche" routeRunId={params.id} />,
  },
  {
    path: '/channel/r/:id',
    title: 'Channel report', description: 'A shared Gapstronaut channel report: which videos work and what the channel\'s viewers want next.',
    shell: 'app',
    auth: 'public',
    element: ({ params }) => <Explorer key="channel" mode="channel" routeRunId={params.id} />,
  },
  { path: '/profile', title: 'Profile', description: 'Manage your Gapstronaut account, daily usage and saved data.', shell: 'app', auth: 'required', element: <Profile /> },
  { path: '*', title: 'Page not found', description: 'This page does not exist. Head back to Gapstronaut to find the YouTube video your audience is still asking for.', shell: 'marketing', auth: 'public', element: <NotFound /> },
];

export default routes;
