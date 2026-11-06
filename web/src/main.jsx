import React from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts: the privacy policy promises no requests to Google Fonts.
import '@fontsource-variable/schibsted-grotesk';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/noto-sans-tamil';
import '@fontsource-variable/noto-sans-devanagari';
import './index.css';
import { AuthProvider } from './lib/auth.jsx';
import { MeProvider } from './lib/me.jsx';
import { RecentRunsProvider } from './lib/recentRuns.jsx';
import { ToastProvider } from './components/ui/index.js';
import { ConsentProvider } from './lib/consent.jsx';
import { LogoutProvider } from './lib/logout.jsx';
import { RemoveReportProvider } from './lib/removeReport.jsx';
import { RouterProvider } from './lib/router.jsx';
import AppFrame from './AppFrame.jsx';
import routes from './routes.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <MeProvider>
        <RecentRunsProvider>
          <ToastProvider>
            <ConsentProvider>
              <LogoutProvider>
                <RemoveReportProvider>
                  <RouterProvider routes={routes}>
                    <AppFrame />
                  </RouterProvider>
                </RemoveReportProvider>
              </LogoutProvider>
            </ConsentProvider>
          </ToastProvider>
        </RecentRunsProvider>
      </MeProvider>
    </AuthProvider>
  </React.StrictMode>
);
