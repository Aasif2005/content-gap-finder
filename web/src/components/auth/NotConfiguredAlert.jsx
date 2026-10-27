import { Alert } from '../ui/index.js';

/** Shown on the sign-in pages when this server has no Firebase config. Calm, not an error. */
export function NotConfiguredAlert({ className }) {
  return (
    <Alert tone="info" title="Sign-in isn’t set up on this server yet." className={className}>
      You can still read the home page and any shared report link.
    </Alert>
  );
}
