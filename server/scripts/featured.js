// Refreshes the homepage app's real reports: npm run featured
// Runs each of FEATURED_NICHES, prints exactly what would go public, then the line
// to publish them with. Nothing shows on the homepage until FEATURED_RUN_IDS is set.
import { connectMongo, closeMongo } from '../src/lib/mongo.js';
import { config } from '../src/config.js';
import { validate } from '../src/routes/api.js';
import { startAnalysis } from '../src/services/runner.js';
import { trimFeatured } from '../src/lib/store.js';
import { quotaStatus } from '../src/lib/quota.js';

const analyse = (niche) => new Promise((resolve, reject) => {
  startAnalysis(validate({ niche, window: '30d' }), {
    force: true,
    onFinish: (err, result) => (err ? reject(err) : resolve(result)),
  }).catch(reject);
});

function print(run) {
  const r = trimFeatured(run);
  console.log(`\n=== ${r.query.niche} (${run.runId}): ${r.stats.videosAnalyzed} videos, ${r.stats.commentsAnalyzed} comments, ${r.stats.gapsFound} gaps`);
  for (const g of r.gaps) {
    console.log(`GAP  ${g.question} [${g.coverage}, score ${g.demandScore}]`);
    console.log(`     title: ${g.suggestedTitle}`);
    for (const e of g.evidence) console.log(`     quote: ${e.text.replace(/\s+/g, ' ')}`);
  }
  for (const t of r.topics) console.log(`TOPIC ${t.label}: ${t.summary}`);
  for (const o of r.objections) console.log(`COMPLAINT ${o.label}: ${o.detail} | fix: ${o.fix}`);
  for (const a of r.avoid) console.log(`AVOID ${a.label}: ${a.reason}`);
}

await connectMongo();
const ids = [];
for (const niche of config.featured.niches) {
  try {
    const run = await analyse(niche);
    ids.push(run.runId);
    print(run);
  } catch (err) {
    console.log(`\n=== ${niche}: FAILED: ${err.message}`);
  }
}
console.log(`\nQuota now: ${JSON.stringify(await quotaStatus())}`);
console.log(`\nRead every quote above, then publish with:\nFEATURED_RUN_IDS=${ids.join(',')}`);
await closeMongo();
process.exit(0);
