/** Where people write for help. The build's VITE_CONTACT_EMAIL wins; this is the fallback so it is never blank. */
export const SUPPORT_EMAIL = (import.meta.env.VITE_CONTACT_EMAIL || '').trim() || 'mission@gapstronaut.com';
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;
