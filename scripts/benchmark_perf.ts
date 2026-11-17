import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depotpro-v3-bench-'));
process.env.DEPOTPRO_DB_PATH = path.join(tmpDir, 'bench_depot.db');
process.env.DEPOTPRO_BACKUP_DIR = path.join(tmpDir, 'Sauvegardes');

const { getDb, closeDb } = await import('../server/db.ts');
const { listProducts } = await import('../server/services/catalog.ts');
const { createSale, getSaleDetail } = await import('../server/services/sales.ts');

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function measure(label: string, targetMs: number, fn: (iter: number) => void, iterations = 50) {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn(i);
    times.push(performance.now() - t0);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const max = sorted[sorted.length - 1];
  const pass = p95 < targetMs;
  console.log(
    `[BENCH] ${label.padEnd(40)} | p50=${p50.toFixed(2)}ms | p95=${p95.toFixed(2)}ms | max=${max.toFixed(2)}ms | cible <${targetMs}ms -> ${pass ? 'PASS' : 'FAIL'}`
  );
  return { label, p50, p95, max, targetMs, pass };
}

async function measureAsync(
  label: string,
  targetMs: number,
  fn: (iter: number) => Promise<void>,
  iterations = 50
) {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn(i);
    times.push(performance.now() - t0);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const max = sorted[sorted.length - 1];
  const pass = p95 < targetMs;
  console.log(
    `[BENCH] ${label.padEnd(40)} | p50=${p50.toFixed(2)}ms | p95=${p95.toFixed(2)}ms | max=${max.toFixed(2)}ms | cible <${targetMs}ms -> ${pass ? 'PASS' : 'FAIL'}`
  );
  return { label, p50, p95, max, targetMs, pass };
}

try {
  console.log('=== DEPOTPRO V3 — Benchmark Charge & Latence (Partie 17.4) ===');
  const db = getDb();
  const tSeedStart = performance.now();

  db.exec('BEGIN IMMEDIATE;');
  const catRow = db.prepare('SELECT id FROM categories LIMIT 1').get() as { id: number };
  const categoryId = catRow.id;

  const insertProd = db.prepare(
    `INSERT INTO products (reference, name, brand, category_id, base_unit, stock_milli, min_stock_milli, average_cost_num, average_cost_den, purchase_price, wholesale_price, semi_wholesale_price, retail_price)
     VALUES (?, ?, ?, ?, 'bouteille', 500000, 24000, '500', '1', 500, 580, 600, 650)`
  );
  const insertPkg = db.prepare(
    `INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, allow_fraction)
     VALUES (?, 'bouteille', 'bouteille', 1000, 500, 580, 600, 650, 0)`
  );
  const insertProfile = db.prepare("INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, 'none')");

  const sampleProductIds: number[] = [];
  const samplePkgIds: number[] = [];

  for (let i = 1; i <= 10_000; i++) {
    const ref = `PRD-B-${String(i).padStart(5, '0')}`;
    const name = i % 250 === 0 ? `Flag Spéciale Lot ${i}` : `Boisson Référence ${i}`;
    const prodId = Number(insertProd.run(ref, name, 'SOLIBRA', categoryId).lastInsertRowid);
    const pkgId = Number(insertPkg.run(prodId).lastInsertRowid);
    insertProfile.run(pkgId);
    if (i <= 100) {
      sampleProductIds.push(prodId);
      samplePkgIds.push(pkgId);
    }
  }

  const insertCli = db.prepare(
    `INSERT INTO clients (code, name, client_type, phone) VALUES (?, ?, 'particulier', ?)`
  );
  const insertCred = db.prepare(
    `INSERT INTO client_credit_settings (client_id, policy, credit_limit, payment_terms_days) VALUES (?, 'limited', 500000, 15)`
  );
  for (let i = 1; i <= 10_000; i++) {
    const cid = Number(
      insertCli.run(`CLI-B-${String(i).padStart(5, '0')}`, `Client Dépôt ${i}`, `+22507${String(i).padStart(8, '0')}`)
        .lastInsertRowid
    );
    insertCred.run(cid);
  }

  db.prepare(
    "INSERT INTO cash_sessions (reference, opening_key, status, opening_cash) VALUES ('CAI-BENCH-01', 'bench-open-1', 'open', 100000)"
  ).run();

  const insertSale = db.prepare(
    `INSERT INTO sales (reference, request_key, sale_type, price_tier, subtotal_merchandise, discount_amount, total_merchandise, total_deposit, total_amount, paid_amount, status)
     VALUES (?, ?, 'cash', 'retail', 6500, 0, 6500, 0, 6500, 6500, 'validated')`
  );
  const insertSaleLine = db.prepare(
    `INSERT INTO sale_lines (sale_id, product_id, packaging_id, product_name, packaging_name, base_unit, coefficient_milli, quantity_milli, base_quantity_milli, unit_price, discount_amount, line_total, cost_num, cost_den)
     VALUES (?, ?, ?, 'Boisson Bench', 'bouteille', 'bouteille', 1000, 10000, 10000, 650, 0, 6500, '500', '1')`
  );
  const insertMove = db.prepare(
    `INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason, reference_document)
     VALUES (?, 'sale_out', -10000, 500000, 490000, 'Bench seed', ?)`
  );

  // 20 000 ventes x 5 lignes = 100 000 lignes de vente + 100 000 mouvements de stock
  const saleIds: number[] = [];
  for (let s = 1; s <= 20_000; s++) {
    const ref = `VTE-B-${String(s).padStart(6, '0')}`;
    const sid = Number(insertSale.run(ref, `bench-seed-sale-${s}`).lastInsertRowid);
    if (s <= 100 || s > 19_900) saleIds.push(sid);
    for (let l = 0; l < 5; l++) {
      const idx = (s + l) % sampleProductIds.length;
      insertSaleLine.run(sid, sampleProductIds[idx], samplePkgIds[idx]);
      insertMove.run(sampleProductIds[idx], ref);
    }
  }
  db.exec('COMMIT;');
  db.exec('ANALYZE;');

  const seedSec = ((performance.now() - tSeedStart) / 1000).toFixed(2);
  console.log(
    `Base injectée en ${seedSec}s : 10 000 produits, 10 000 clients, 100 000 lignes de vente, 100 000 mouvements stock.`
  );

  const r1 = measure('Recherche produit paginée (10k prods)', 300, (i) => {
    listProducts({ search: i % 2 === 0 ? 'Flag Spéciale' : 'Boisson Référence 99', page: 1, pageSize: 25 });
  });

  const r2 = measure('Détail vente complet (100k lignes)', 150, (i) => {
    getSaleDetail(saleIds[i % saleIds.length]);
  });

  const r3 = await measureAsync('Validation vente atomique (TX + stock)', 500, async (i) => {
    const idx = i % sampleProductIds.length;
    await createSale({
      request_key: `bench-live-sale-${i}`,
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [{ product_id: sampleProductIds[idx], packaging_id: samplePkgIds[idx], quantity: 2 }],
      payments: [{ method_code: 'cash', amount: 1300 }],
    });
  });

  const allPassed = r1.pass && r2.pass && r3.pass;
  if (!allPassed) {
    process.exitCode = 1;
  }
} finally {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
