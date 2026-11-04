/**
 * Gapstronaut's account emails. One layout, so the reset and verification mails look
 * like the app: warm paper ground, white card, ink button, one highlighter-yellow bar.
 * Light palette only (mail clients can't read our CSS tokens, and a mail must not
 * depend on a theme). Table layout and inline styles, because that is what Outlook
 * and Gmail render reliably.
 */

const C = {
  bg: '#FBF8F3', card: '#FFFFFF', line: '#E6E2DE', fg: '#0F1E2E', fg2: '#516073', fg3: '#5F5E5C',
  ink: '#0F1E2E', onInk: '#FFFFFF', accent: '#2F5BEA', mark: '#F3DFAE', soft: '#F4F0EC',
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout({ preheader, title, intro, buttonLabel, link, note, siteUrl, support }) {
  const logo = `${siteUrl}/brand/email-logo.png`;
  const safeLink = escapeHtml(link);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${C.bg};">
<tr><td align="center" style="padding:40px 16px 32px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
    <tr><td style="padding:0 4px 20px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
        <td style="vertical-align:middle;"><img src="${logo}" width="44" height="44" alt="" style="display:block;border:0;"></td>
        <td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:20px;font-weight:600;letter-spacing:-0.02em;color:${C.fg};">Gapstronaut</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:36px 32px 32px;">
      <div style="width:36px;height:4px;border-radius:2px;background:${C.mark};line-height:4px;font-size:0;">&nbsp;</div>
      <h1 style="margin:20px 0 0;font-family:${FONT};font-size:28px;line-height:1.15;font-weight:600;letter-spacing:-0.03em;color:${C.fg};">${escapeHtml(title)}</h1>
      <p style="margin:14px 0 0;font-family:${FONT};font-size:16px;line-height:1.55;color:${C.fg2};">${intro}</p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 0;"><tr>
        <td style="border-radius:10px;background:${C.ink};">
          <a href="${safeLink}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:600;color:${C.onInk};text-decoration:none;border-radius:10px;">${escapeHtml(buttonLabel)}</a>
        </td>
      </tr></table>
      <p style="margin:24px 0 0;font-family:${FONT};font-size:14px;line-height:1.55;color:${C.fg2};">${note}</p>
      <div style="margin:28px 0 0;padding-top:20px;border-top:1px solid ${C.line};">
        <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.55;color:${C.fg3};">Button not working? Copy this link into your browser:</p>
        <p style="margin:6px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;word-break:break-all;"><a href="${safeLink}" style="color:${C.accent};text-decoration:underline;">${safeLink}</a></p>
      </div>
    </td></tr>
    <tr><td style="padding:24px 8px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.fg3};text-align:center;">
      Gapstronaut finds the videos your audience is still asking for.<br>
      <a href="${siteUrl}" style="color:${C.fg3};text-decoration:underline;">gapstronaut.com</a> &nbsp;·&nbsp; Questions? Reply to this email or write <a href="mailto:${escapeHtml(support)}" style="color:${C.fg3};text-decoration:underline;">${escapeHtml(support)}</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

const plain = ({ title, intro, link, note, siteUrl, support }) =>
  `${title}\n\n${intro.replace(/<[^>]+>/g, '')}\n\n${link}\n\n${note.replace(/<[^>]+>/g, '')}\n\nGapstronaut · ${siteUrl}\nQuestions? Reply to this email or write ${support}\n`;

/** `{ subject, html, text }` for a password reset. */
export function resetPasswordEmail({ link, email, siteUrl, support }) {
  const parts = {
    title: 'Reset your password',
    preheader: 'Choose a new password for your Gapstronaut account. The link works for one hour.',
    intro: `Someone asked to reset the password for <strong style="color:${C.fg};">${escapeHtml(email)}</strong>. Use the button below to choose a new one.`,
    buttonLabel: 'Choose a new password',
    note: 'This link works once and expires in 1 hour. If you didn’t ask for this, you can ignore this email: your password stays as it is.',
    link, siteUrl, support,
  };
  return { subject: 'Reset your Gapstronaut password', html: layout(parts), text: plain(parts) };
}

/** `{ subject, html, text }` for confirming an email address. */
export function verifyEmailEmail({ link, email, siteUrl, support }) {
  const parts = {
    title: 'Confirm your email',
    preheader: 'One click and your Gapstronaut account is ready.',
    intro: `Welcome aboard. Confirm that <strong style="color:${C.fg};">${escapeHtml(email)}</strong> is yours to finish setting up your account.`,
    buttonLabel: 'Confirm my email',
    note: 'If you didn’t create a Gapstronaut account, you can ignore this email and nothing will happen.',
    link, siteUrl, support,
  };
  return { subject: 'Confirm your email for Gapstronaut', html: layout(parts), text: plain(parts) };
}
