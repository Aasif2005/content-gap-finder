import nodemailer from 'nodemailer';
import { config } from '../config.js';

/**
 * Sends Gapstronaut's own account emails over SMTP (Spacemail). The sender is an
 * alias of the mailbox (noreply@), the mailbox itself signs in.
 */

/** Whether SMTP is set up on this server. */
export const mailConfigured = (m = config.mail) => Boolean(m.host && m.user && m.pass);

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

/** `{ to, subject, html, text }` -> resolves when the server has accepted it. */
export async function sendMail({ to, subject, html, text }, send = (m) => getTransport().sendMail(m)) {
  if (!mailConfigured()) throw Object.assign(new Error('Email is not set up on this server.'), { status: 503, code: 'MAIL_NOT_CONFIGURED' });
  await send({
    from: config.mail.from,
    replyTo: config.mail.replyTo || undefined,
    to,
    subject,
    html,
    text,
    // Account mail: no list headers, but say so, which keeps auto-replies from looping back.
    headers: { 'X-Auto-Response-Suppress': 'All', 'Auto-Submitted': 'auto-generated' },
  });
}
