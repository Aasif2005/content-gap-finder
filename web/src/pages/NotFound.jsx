import { Button } from '../components/ui/index.js';

/** Anything the route table does not know. Calm, with one way out. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-[1200px] px-5 py-24 sm:px-10 sm:py-32">
      <p className="font-mono text-sm text-fg-3">404</p>
      <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">
        There is nothing at this address.
      </h1>
      <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-fg-2">
        The link may be mistyped, or the page may have moved. Reports are also removed after 30 days, so an old report link stops working.
      </p>
      <Button href="/" size="lg" className="mt-8">Back to the homepage</Button>
    </div>
  );
}
