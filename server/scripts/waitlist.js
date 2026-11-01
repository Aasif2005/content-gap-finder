// Prints the waitlist as CSV: npm run waitlist --workspace server > waitlist.csv
import { connectMongo, closeMongo, col } from '../src/lib/mongo.js';

await connectMongo();
const rows = await col('waitlist').find({}).sort({ createdAt: 1 }).toArray();
console.log('email,plan,createdAt');
for (const r of rows) console.log(`${r.email},${r.plan},${r.createdAt.toISOString()}`);
await closeMongo();
