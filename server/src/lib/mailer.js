import nodemailer from 'nodemailer';
import { config } from '../config.js';

/**
 * Sends Gapstronaut's own account emails over SMTP (Spacemail). The sender is an
 * alias of the mailbox (noreply@), the mailbox itself signs in.
 */

/** Whether SMTP is set up on this server. */
export const mailConfigured = (m = config.mail) => Boolean(m.resendKey || (m.host && m.user && m.pass));

let transport;
const getTransport = () => (transport ??= nodemailer.createTransport({
  host: config.mail.host,
  port: config.mail.port,
  // 465 is implicit TLS; 587 upgrades with STARTTLS.
  secure: config.mail.port === 465,
  auth: { user: config.mail.user, pass: config.mail.pass },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
}));

/** Resend's HTTPS API: port 443, so a host that blocks SMTP cannot stop it. */
export async function sendViaResend({ to, subject, html, text }, fetchFn = fetch) {
  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.mail.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: config.mail.from,
      to: [to],
      subject,
      html,
      text,
      ...(config.mail.replyTo ? { reply_to: config.mail.replyTo } : {}),
      headers: { 'X-Auto-Response-Suppress': 'All', 'Auto-Submitted': 'auto-generated' },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Resend failed (${res.status}) ${body?.message ?? ''}`.trim());
  }
}

/** `{ to, subject, html, text }` -> resolves when the provider has accepted it. */
export async function sendMail(message, send) {
  if (!mailConfigured()) throw Object.assign(new Error('Email is not set up on this server.'), { status: 503, code: 'MAIL_NOT_CONFIGURED' });
  if (send) return send(message);
  if (config.mail.resendKey) return sendViaResend(message);
  await getTransport().sendMail({
    from: config.mail.from,
    replyTo: config.mail.replyTo || undefined,
    ...message,
    headers: { 'X-Auto-Response-Suppress': 'All', 'Auto-Submitted': 'auto-generated' },
  });
}
