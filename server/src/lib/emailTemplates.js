/**
 * Gapstronaut's account emails. One layout, built like the app: a warm paper ground, a single
 * white panel, a pill button in ink, one blue link colour. No images (nothing to block, nothing
 * to invert in dark mode) and no web fonts (the privacy policy promises none).
 *
 * The strict palette rule applies here too: the amber highlighter is reserved for real viewer
 * evidence, so it never appears in a mail. Light is the default; clients that honour
 * prefers-color-scheme (Apple Mail, Gmail apps) get the app's dark palette.
 *
 * Table layout and inline styles, because that is what Outlook and Gmail render reliably.
 */

const C = {
  bg: '#FBF8F3', card: '#FFFFFF', chip: '#F4F0EC', line: '#E6E2DE', fg: '#0F1E2E', fg2: '#516073', fg3: '#5F5E5C',
  ink: '#0F1E2E', onInk: '#FFFFFF', accent: '#2F5BEA',
};
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The app's dark palette, applied by class so inline light styles can be overridden.
const DARK_CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .bg { background: #050505 !important; }
  .panel { background: #1C1B1B !important; border-color: #313030 !important; }
  .chip { background: #313030 !important; }
  .rule { border-color: #313030 !important; }
  .fg { color: #F4F6FA !important; }
  .fg2 { color: #CAC6C5 !important; }
  .fg3 { color: #ADABAA !important; }
  .btn { background: #E8E8E4 !important; }
  .btn a { color: #050505 !important; }
  .link { color: #A9BEFF !important; }
}
@media (max-width: 480px) {
  .pad { padding: 32px 24px 28px !important; }
  .h1 { font-size: 28px !important; }
}`;

function layout({ preheader, eyebrow, title, intro, email, buttonLabel, link, facts, note, siteUrl, support }) {
  const safeLink = escapeHtml(link);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
<style>${DARK_CSS}</style>
</head>
<body class="bg" style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" class="bg" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.bg};">
<tr><td align="center" style="padding:48px 16px 40px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
    <tr><td class="fg" style="padding:0 6px 22px;font-family:${SANS};font-size:19px;line-height:1;font-weight:600;letter-spacing:-0.02em;color:${C.fg};">Gapstronaut</td></tr>
    <tr><td class="panel pad" style="background:${C.card};border:1px solid ${C.line};border-radius:20px;padding:44px 40px 36px;">
      <p class="fg3" style="margin:0;font-family:${SANS};font-size:12px;line-height:1;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.fg3};">${escapeHtml(eyebrow)}</p>
      <h1 class="fg h1" style="margin:18px 0 0;font-family:${SANS};font-size:32px;line-height:1.1;font-weight:600;letter-spacing:-0.03em;color:${C.fg};">${escapeHtml(title)}</h1>
      <p class="fg2" style="margin:16px 0 0;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.fg2};">${intro}</p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 0;"><tr>
        <td class="chip fg" style="background:${C.chip};border-radius:999px;padding:8px 14px;font-family:${MONO};font-size:13px;line-height:1.3;color:${C.fg};word-break:break-all;">${escapeHtml(email)}</td>
      </tr></table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:32px 0 0;"><tr>
        <td class="btn" align="center" style="border-radius:999px;background:${C.ink};">
          <a href="${safeLink}" style="display:block;padding:16px 28px;font-family:${SANS};font-size:16px;line-height:20px;font-weight:600;color:${C.onInk};text-decoration:none;border-radius:999px;">${escapeHtml(buttonLabel)}</a>
        </td>
      </tr></table>
      <p class="fg3" style="margin:16px 0 0;font-family:${SANS};font-size:13px;line-height:1.5;text-align:center;color:${C.fg3};">${facts.map(escapeHtml).join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</p>
      <div class="rule" style="margin:32px 0 0;border-top:1px solid ${C.line};font-size:0;line-height:0;">&nbsp;</div>
      <p class="fg2" style="margin:24px 0 0;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.fg2};">${note}</p>
      <p class="fg3" style="margin:20px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${C.fg3};">Button not working? Paste this link into your browser:</p>
      <p style="margin:4px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;word-break:break-all;"><a class="link" href="${safeLink}" style="color:${C.accent};text-decoration:underline;">${safeLink}</a></p>
    </td></tr>
    <tr><td class="fg3" style="padding:26px 12px 0;font-family:${SANS};font-size:12px;line-height:1.7;color:${C.fg3};text-align:center;">
      Gapstronaut finds the videos your audience is still asking for.<br>
      <a class="fg3" href="${siteUrl}" style="color:${C.fg3};text-decoration:underline;">gapstronaut.com</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a class="fg3" href="mailto:${escapeHtml(support)}" style="color:${C.fg3};text-decoration:underline;">${escapeHtml(support)}</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

const strip = (html) => html.replace(/<[^>]+>/g, '');
const plain = ({ title, intro, email, link, facts, note, siteUrl, support }) =>
  `${title}\n\n${strip(intro)}\n${email}\n\n${link}\n\n${facts.join(' · ')}\n\n${strip(note)}\n\nGapstronaut · ${siteUrl}\nQuestions? Reply to this email or write ${support}\n`;

/** `{ subject, html, text }` for a password reset. */
export function resetPasswordEmail({ link, email, siteUrl, support }) {
  const parts = {
    eyebrow: 'Password reset',
    title: 'Reset your password',
    preheader: 'Choose a new password for your Gapstronaut account. The link works once and lasts an hour.',
    intro: 'We got a request to reset the password for this account. Use the button to choose a new one.',
    email,
    buttonLabel: 'Choose a new password',
    facts: ['Works once', 'Expires in 1 hour'],
    note: 'Didn’t ask for this? Ignore this email and nothing changes: your password stays as it is.',
    link, siteUrl, support,
  };
  return { subject: 'Reset your Gapstronaut password', html: layout(parts), text: plain(parts) };
}

/** `{ subject, html, text }` for confirming an email address. */
export function verifyEmailEmail({ link, email, siteUrl, support }) {
  const parts = {
    eyebrow: 'Email confirmation',
    title: 'Confirm your email',
    preheader: 'One click and your Gapstronaut account is ready.',
    intro: 'Welcome aboard. Confirm that this address is yours to finish setting up your account.',
    email,
    buttonLabel: 'Confirm my email',
    facts: ['Works once', 'Valid for 3 days'],
    note: 'Didn’t create a Gapstronaut account? Ignore this email and nothing will happen.',
    link, siteUrl, support,
  };
  return { subject: 'Confirm your email for Gapstronaut', html: layout(parts), text: plain(parts) };
}
