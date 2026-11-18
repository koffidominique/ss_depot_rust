import { DatabaseSync } from 'node:sqlite';
import { reloadDb, closeDb, verifyDbIntegrity } from '../../server/db.ts';
import { adjustStock } from '../../server/services/finance.ts';

const dbPath = process.env.DEPOTPRO_LOT3_WORKER_DB;
const prodId = Number(process.env.DEPOTPRO_LOT3_PROD_ID);
const tag = process.env.DEPOTPRO_LOT3_TAG || 'worker';
const mode = process.env.DEPOTPRO_LOT3_MODE || 'concurrent_adjust';

if (!dbPath) {
  process.exit(0);
}

process.env.DEPOTPRO_DB_PATH = dbPath;

if (mode === 'hold_lock') {
  // Ouvre une connexion SQLite indépendante et bloque en BEGIN IMMEDIATE pendant holdMs
  const holdMs = Number(process.env.DEPOTPRO_LOT3_HOLD_MS || '180');
  const rawDb = new DatabaseSync(dbPath);
  rawDb.exec('PRAGMA journal_mode = WAL;');
  rawDb.exec('PRAGMA busy_timeout = 5000;');
  rawDb.exec('BEGIN IMMEDIATE;');
  if (Number.isInteger(prodId) && prodId > 0) {
    rawDb.prepare('UPDATE products SET stock_milli = stock_milli + 1000 WHERE id = ?').run(prodId);
  }
  // Signale au parent que le verrou BEGIN IMMEDIATE est acquis
  process.stdout.write('LOCKED\n');
  await new Promise((resolve) => setTimeout(resolve, holdMs));
  rawDb.exec('COMMIT;');
  rawDb.close();
  process.exit(0);
}

reloadDb();
for (let i = 0; i < 5; i += 1) {
  await adjustStock({
    product_id: prodId,
    direction: 'in',
    quantity: '1',
    reason: `Process ${tag} step ${i}`,
    request_key: `lot3-node-mp-${tag}-${i}`,
  });
}

const check = verifyDbIntegrity();
if (check.integrity !== 'ok' || check.foreignKeyErrors !== 0) {
  throw new Error(`Integrity check failed in worker ${tag}: ${JSON.stringify(check)}`);
}
closeDb();
