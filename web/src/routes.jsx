import { lazy } from 'react';
import { loadPage } from './lib/loadPage.js';
import { setPreloader } from './lib/router.jsx';
import Home from './pages/Home.jsx';
// The legal pages are indexed on their own and are plain text: they ship in the entry, because a lazy chunk
// meant a skeleton first and the text jumping in after (layout shift).
import { PrivacyPage, TermsPage } from './pages/Legal.jsx';

// Loaded on arrival, so a first visit to the homepage does not download the whole app.
const Dashboard = lazy(() => loadPage(() => import('./pages/Dashboard.jsx')));
const Profile = lazy(() => loadPage(() => import('./pages/Profile.jsx')));
const Explorer = lazy(() => loadPage(() => import('./pages/Explorer.jsx')));
// The homepage is the entry point for most visits, so the other public pages are fetched when wanted (or once
// the homepage has settled, see Home.jsx); their prerendered HTML is what crawlers read.
const Login = lazy(() => loadPage(() => import('./pages/Login.jsx')));
const Signup = lazy(() => loadPage(() => import('./pages/Signup.jsx')));
const ResetPassword = lazy(() => loadPage(() => import('./pages/ResetPassword.jsx')));
const AuthAction = lazy(() => loadPage(() => import('./pages/AuthAction.jsx')));
const Logout = lazy(() => loadPage(() => import('./pages/Logout.jsx')));
const AcceptTerms = lazy(() => loadPage(() => import('./pages/AcceptTerms.jsx')));
const NotFound = lazy(() => loadPage(() => import('./pages/NotFound.jsx')));


// Same imports as above, started early (idle time, link hover) so a click finds the code already here.
const shell = () => import('./components/shell/AppShell.jsx');
const appLoaders = {
  '/dashboard': () => import('./pages/Dashboard.jsx'),
  '/profile': () => import('./pages/Profile.jsx'),
  '/explore': () => import('./pages/Explorer.jsx'),
};
const publicLoaders = {
  '/login': () => import('./pages/Login.jsx'),
  '/signup': () => import('./pages/Signup.jsx'),
  '/reset-password': () => import('./pages/ResetPassword.jsx'),
  '/auth': () => import('./pages/AuthAction.jsx'),
  '/accept-terms': () => import('./pages/AcceptTerms.jsx'),
  '/logout': () => import('./pages/Logout.jsx'),
};
export const preloadRoute = (path) => {
  const base = '/' + String(path || '').split(/[?#]/)[0].split('/')[1];
  if (appLoaders[base]) { shell().catch(() => {}); appLoaders[base]().catch(() => {}); }
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
  { path: '/signup', indexable: true, title: 'Sign up', fullTitle: 'Create a Free Gapstronaut Account · No Card Needed', description: 'Create a free Gapstronaut account and find the videos your audience is still asking for. No card needed.', shell: 'bare', auth: 'public', element: <Signup /> },
  { path: '/reset-password', indexable: true, title: 'Reset your password', fullTitle: 'Reset Your Gapstronaut Password · Get a Secure Link', description: 'Forgot your Gapstronaut password? Enter your email and we will send a secure link to choose a new one, so you can get back to your saved reports.', shell: 'bare', auth: 'public', element: <ResetPassword /> },
  { path: '/auth/action', title: 'Account link', shell: 'bare', auth: 'public', element: <AuthAction /> },
  { path: '/accept-terms', title: 'Agree to continue', shell: 'bare', auth: 'public', element: <AcceptTerms /> },
  { path: '/logout', title: 'Log out', shell: 'bare', auth: 'public', element: <Logout /> },
  { path: '/privacy', indexable: true, title: 'Privacy Policy', fullTitle: 'Privacy Policy: What Gapstronaut Collects and Keeps', description: 'What Gapstronaut collects, how long it keeps it, and how to have it deleted.', shell: 'marketing', auth: 'public', element: <PrivacyPage /> },
  { path: '/terms', indexable: true, title: 'Terms of Service', fullTitle: 'Terms of Service: Using Gapstronaut and YouTube Data', description: 'The terms for using Gapstronaut, including the YouTube Terms of Service they bind you to.', shell: 'marketing', auth: 'public', element: <TermsPage /> },
  { path: '/dashboard', title: 'Dashboard', shell: 'app', auth: 'required', element: <Dashboard /> },
  { path: '/explore', title: 'Explore a niche', shell: 'app', auth: 'required', element: <Explorer key="niche" mode="niche" /> },
  { path: '/channel', title: 'Analyze a channel', shell: 'app', auth: 'required', element: <Explorer key="channel" mode="channel" /> },
  // Shared report links are public. What a logged-out visitor sees is the Explorer's call.
  {
    path: '/r/:id',
    title: 'Report',
    shell: 'app',
    auth: 'public',
    element: ({ params }) => <Explorer key="niche" mode="niche" routeRunId={params.id} />,
  },
  {
    path: '/channel/r/:id',
    title: 'Channel report',
    shell: 'app',
    auth: 'public',
    element: ({ params }) => <Explorer key="channel" mode="channel" routeRunId={params.id} />,
  },
  { path: '/profile', title: 'Profile', shell: 'app', auth: 'required', element: <Profile /> },
  { path: '*', title: 'Page not found', shell: 'marketing', auth: 'public', element: <NotFound /> },
];

export default routes;
