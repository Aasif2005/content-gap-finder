import { lazy } from 'react';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import AuthAction from './pages/AuthAction.jsx';
import NotFound from './pages/NotFound.jsx';

// Loaded on arrival, so a first visit to the homepage does not download the whole app.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Explorer = lazy(() => import('./pages/Explorer.jsx'));
const PrivacyPage = lazy(() => import('./pages/Legal.jsx').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('./pages/Legal.jsx').then((m) => ({ default: m.TermsPage })));

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
  { path: '/login', indexable: true, title: 'Log in', fullTitle: 'Log in to Gapstronaut · Your Saved Gap Reports', description: 'Log in to Gapstronaut to run analyses and open your saved reports.', shell: 'bare', auth: 'public', element: <Login /> },
  { path: '/signup', indexable: true, title: 'Sign up', fullTitle: 'Create a Free Gapstronaut Account · No Card Needed', description: 'Create a free Gapstronaut account and find the videos your audience is still asking for. No card needed.', shell: 'bare', auth: 'public', element: <Signup /> },
  { path: '/reset-password', title: 'Reset your password', description: 'Get a link to choose a new password for your Gapstronaut account.', shell: 'bare', auth: 'public', element: <ResetPassword /> },
  { path: '/auth/action', title: 'Account link', shell: 'bare', auth: 'public', element: <AuthAction /> },
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
