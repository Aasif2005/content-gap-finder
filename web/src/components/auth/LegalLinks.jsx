import { Link } from '../../lib/router.jsx';

const link = 'font-medium text-fg-2 underline underline-offset-2 hover:text-fg';

/** The three agreements. Ours open in place, at the same screen size; YouTube's opens in a new tab. */
export function LegalLinks({ terms = 'Terms of Service' }) {
  const tab = { target: '_blank', rel: 'noreferrer noopener' };
  return (
    <>
      <Link href="/terms" className={link}>{terms}</Link>, the{' '}
      <Link href="/privacy" className={link}>Privacy Policy</Link> and the{' '}
      <a href="https://www.youtube.com/t/terms" {...tab} className={link}>YouTube Terms of Service</a>
    </>
  );
}
