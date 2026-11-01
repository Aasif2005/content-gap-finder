import { Component } from 'react';
import { Button } from './ui/index.js';

/**
 * Without this, one failed render blanks the whole site, with nothing to press.
 * `resetKey` is the path: moving to another page tries again.
 */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('[page crashed]', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center text-fg">
        <h1 className="max-w-xl text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.03em]">
          Something went wrong on this page.
        </h1>
        <p className="mt-4 max-w-md text-[17px] leading-relaxed text-fg-2">
          Your account and saved reports are safe. Reloading usually fixes it.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={() => window.location.reload()}>Reload the page</Button>
          <Button variant="ghost" size="lg" onClick={() => window.location.assign('/')}>Back to the homepage</Button>
        </div>
      </main>
    );
  }
}
