import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Welcome from './pages/Welcome.jsx';
import Profile from './pages/Profile.jsx';
import Explorer from './pages/Explorer.jsx';
import NotFound from './pages/NotFound.jsx';
import { PrivacyPage, TermsPage } from './pages/Legal.jsx';

/**
 * The route table. First match wins, so `*` stays last.
 *
 *  - `shell`: 'marketing' (public nav and footer), 'app' (signed-in frame), or
 *    'bare' (no frame: the page draws its own layout).
 *  - `auth`: 'required' sends a logged-out visitor to /login?next=...
 *  - `title`: the tab title is `title · Gapstronaut`; no title is just `Gapstronaut`.
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
    shell: 'marketing',
    shellProps: {
      anchors: [
        { href: '#how', label: 'How it works' },
        { href: '#get', label: 'What you get' },
        { href: '#evidence', label: 'Evidence' },
      ],
    },
    auth: 'public',
    element: <Home />,
  },
  { path: '/login', title: 'Log in', shell: 'bare', auth: 'public', element: <Login /> },
  { path: '/signup', title: 'Sign up', shell: 'bare', auth: 'public', element: <Signup /> },
  { path: '/reset-password', title: 'Reset your password', shell: 'bare', auth: 'public', element: <ResetPassword /> },
  { path: '/privacy', title: 'Privacy Policy', shell: 'marketing', auth: 'public', element: <PrivacyPage /> },
  { path: '/terms', title: 'Terms of Service', shell: 'marketing', auth: 'public', element: <TermsPage /> },
  { path: '/welcome', title: 'Welcome', shell: 'bare', auth: 'required', element: <Welcome /> },
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
