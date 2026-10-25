import { useEffect, useState } from 'react';
import App from './App.jsx';
import { Footer } from './components/Footer.jsx';
import { PrivacyPage, TermsPage } from './pages/Legal.jsx';
import { ConsentProvider } from './lib/consent.jsx';
import { legalPageFromPath } from './lib/urlState.js';

const LEGAL = { privacy: PrivacyPage, terms: TermsPage };

/**
 * The Privacy Policy and Terms sit over the explorer rather than replacing it:
 * the explorer stays mounted (hidden), so opening the policy mid-run and coming
 * back does not lose the run.
 */
export default function Shell() {
  const [legal, setLegal] = useState(() => legalPageFromPath());

  useEffect(() => {
    const onPop = () => setLegal(legalPageFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    document.title = legal ? `${legal === 'privacy' ? 'Privacy Policy' : 'Terms of Service'} · Content Gap Finder` : 'Content Gap Finder';
  }, [legal]);

  const Page = legal ? LEGAL[legal] : null;
  return (
    <ConsentProvider>
      <div hidden={Boolean(Page)}>
        <App />
      </div>
      {Page && (
        <div className="mx-auto min-h-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
          <Page />
          <Footer />
        </div>
      )}
    </ConsentProvider>
  );
}
