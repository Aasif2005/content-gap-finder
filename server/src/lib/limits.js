import { config } from '../config.js';

/** Daily allowances for this account: the standard ones, or the larger ones for a listed tester email. */
export function limitsFor(user) {
  const u = config.users;
  const tester = Boolean(user?.email) && u.testerEmails.includes(String(user.email).toLowerCase());
  return {
    analyses: tester ? u.testerDailyAnalyses : u.dailyAnalyses,
    briefs: tester ? u.testerDailyBriefs : u.dailyBriefs,
    watches: u.maxWatches,
  };
}
