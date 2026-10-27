const link = 'font-medium text-fg-2 underline underline-offset-2 hover:text-fg';

/** The three agreements, each in a new tab so nothing typed here is lost. */
export function LegalLinks({ terms = 'Terms of Service' }) {
  const tab = { target: '_blank', rel: 'noreferrer noopener' };
  return (
    <>
      <a href="/terms" {...tab} className={link}>{terms}</a>, the{' '}
      <a href="/privacy" {...tab} className={link}>Privacy Policy</a> and the{' '}
      <a href="https://www.youtube.com/t/terms" {...tab} className={link}>YouTube Terms of Service</a>
    </>
  );
}
