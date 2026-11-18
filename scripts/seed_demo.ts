import { closeDb, getDb } from '../server/db.ts';
import { seedDemoData } from '../server/seedDemo.ts';

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const includeDemoCompany = args.has('--with-company');

try {
  const db = getDb();
  const result = seedDemoData(db, { force, includeDemoCompany });
  console.log(JSON.stringify({ status: 'ok', ...result }, null, 2));
} finally {
  closeDb();
}
