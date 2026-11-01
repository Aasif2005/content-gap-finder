import { Resolver } from 'node:dns/promises';

const shared = new Resolver({ timeout: 1500, tries: 2 });

/**
 * Whether a domain can receive email at all. Firebase accepts any well-formed
 * address, so `someone@hdhdhdhhj.com` would otherwise become an account whose
 * verification email goes nowhere.
 *
 * It answers "no" only when DNS says so. A timeout or a DNS fault answers "yes":
 * a hiccup here must never stop a real person signing up. It proves the domain,
 * not the mailbox; only the verification link does that.
 */
export async function domainAcceptsMail(domain, resolver = shared) {
  try {
    const records = await resolver.resolveMx(domain);
    // A "null MX" (RFC 7505) is a domain stating that it takes no mail.
    if (records.length) return records.some((r) => r.exchange && r.exchange !== '.');
  } catch (err) {
    if (err.code === 'ENOTFOUND') return false;
    if (err.code !== 'ENODATA') return true;
  }
  // No MX records: mail falls back to the domain's own address (RFC 5321).
  for (const lookup of ['resolve4', 'resolve6']) {
    try {
      if ((await resolver[lookup](domain)).length) return true;
    } catch (err) {
      if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') return true;
    }
  }
  return false;
}
