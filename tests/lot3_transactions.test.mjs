import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depotpro-lot3-test-'));
process.env.DEPOTPRO_DB_PATH = path.join(testDir, 'depotpro_lot3.db');
process.env.DEPOTPRO_BACKUP_DIR = path.join(testDir, 'backups');

const { createApiApp } = await import('../server/app.ts');
const { closeDb, getDb, reloadDb, verifyDbIntegrity, withWriteTx } = await import('../server/db.ts');

let server;
let baseUrl = '';
let token = '';

async function api(method, urlPath, body) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-DepotPro-Token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

function spawnWorker(envVars) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', path.resolve('tests/helpers/lot3_child_worker.mjs')],
      {
        env: { ...process.env, ...envVars },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += String(d);
    });
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

function spawnLockHolder(holdMs, prodId) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', path.resolve('tests/helpers/lot3_child_worker.mjs')],
      {
        env: {
          ...process.env,
          DEPOTPRO_LOT3_WORKER_DB: process.env.DEPOTPRO_DB_PATH,
          DEPOTPRO_LOT3_MODE: 'hold_lock',
          DEPOTPRO_LOT3_HOLD_MS: String(holdMs),
          DEPOTPRO_LOT3_PROD_ID: String(prodId),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let stderr = '';
    let lockedSent = false;
    const done = new Promise((resDone) => {
      child.on('close', (code) => resDone({ code, stderr }));
    });
    child.stdout.on('data', (chunk) => {
      if (!lockedSent && String(chunk).includes('LOCKED')) {
        lockedSent = true;
        resolve({ done });
      }
    });
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (!lockedSent) {
        reject(new Error(`Lock holder exited prematurely (${code}): ${stderr}`));
      }
    });
  });
}

describe('LOT 3 — Transactions SQLite BEGIN IMMEDIATE, concurrence et SQLITE_BUSY', () => {
  let categoryId = 0;
  let supplierId = 0;
  let clientId = 0;
  let prodId = 0;
  let pkgId = 0;

  before(async () => {
    const app = createApiApp();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const setup = await api('POST', '/api/auth/setup', { pin: '246810' });
    assert.equal(setup.status, 200);
    token = setup.data.token;

    const openCash = await api('POST', '/api/cash/open', {
      opening_cash: 20_000,
      request_key: 'lot3-open-cash',
    });
    assert.equal(openCash.status, 201);

    const catRes = await api('POST', '/api/categories', { name: 'Lot 3 Cat' });
    assert.equal(catRes.status, 201);
    categoryId = catRes.data.id;

    const supRes = await api('POST', '/api/suppliers', {
      name: 'Fournisseur Lot 3',
      phone: '+225 07 00 00 00 99',
      payment_terms_days: 30,
    });
    assert.equal(supRes.status, 201);
    supplierId = supRes.data.id;

    const cliRes = await api('POST', '/api/clients', {
      name: 'Client Lot 3',
      client_type: 'professionnel',
      credit_policy: 'limited',
      credit_limit: 500_000,
      payment_terms_days: 15,
    });
    assert.equal(cliRes.status, 201);
    clientId = cliRes.data.id;

    const prodRes = await api('POST', '/api/products', {
      name: 'Boisson Lot 3',
      category_id: categoryId,
      supplier_id: supplierId,
      base_unit: 'bouteille',
      initial_stock: '100',
      min_stock: '5',
      purchase_price: 250,
      wholesale_price: 300,
      semi_wholesale_price: 350,
      retail_price: 400,
      packagings: [
        {
          name: 'bouteille',
          coefficient: '1',
          purchase_price: 250,
          wholesale_price: 300,
          semi_wholesale_price: 350,
          retail_price: 400,
          allow_fraction: false,
          deposit_mode: 'none',
        },
      ],
    });
    assert.equal(prodRes.status, 201);
    prodId = prodRes.data.id;
    const prodList = await api('GET', `/api/products?search=${encodeURIComponent('Boisson Lot 3')}`);
    pkgId = prodList.data.items.find((p) => p.id === prodId).packagings[0].id;
  });

  after(async () => {
    closeDb();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('Ventes, réceptions, créances, clôture et mouvements stock concurrents sans corruption', async () => {
    // 1. Deux ventes simultanées (60 + 60 sur stock 100 -> 1 succès et 1 rejet)
    const [s1, s2] = await Promise.all([
      api('POST', '/api/sales', {
        request_key: 'lot3-node-sale-1',
        sale_type: 'cash',
        price_tier: 'retail',
        lines: [{ product_id: prodId, packaging_id: pkgId, quantity: '60' }],
        payments: [{ method_code: 'cash', amount: 24_000 }],
      }),
      api('POST', '/api/sales', {
        request_key: 'lot3-node-sale-2',
        sale_type: 'cash',
        price_tier: 'retail',
        lines: [{ product_id: prodId, packaging_id: pkgId, quantity: '60' }],
        payments: [{ method_code: 'cash', amount: 24_000 }],
      }),
    ]);
    assert.equal([s1.status, s2.status].filter((c) => c === 201).length, 1);
    assert.equal(
      (getDb().prepare('SELECT stock_milli FROM products WHERE id = ?').get(prodId)).stock_milli,
      40_000
    );

    // 2. Deux réceptions simultanées (8 + 8 sur BC de 10 -> 1 succès et 1 rejet)
    const poRes = await api('POST', '/api/purchases', {
      request_key: 'lot3-node-po-1',
      supplier_id: supplierId,
      lines: [{ product_id: prodId, packaging_id: pkgId, quantity: '10', unit_price: 250 }],
    });
    assert.equal(poRes.status, 201);
    const poId = poRes.data.id;
    const poLineId = poRes.data.lines[0].id;

    const [r1, r2] = await Promise.all([
      api('POST', `/api/purchases/${poId}/receive`, {
        request_key: 'lot3-node-rec-1',
        lines: [{ purchase_order_line_id: poLineId, received_quantity: '8' }],
      }),
      api('POST', `/api/purchases/${poId}/receive`, {
        request_key: 'lot3-node-rec-2',
        lines: [{ purchase_order_line_id: poLineId, received_quantity: '8' }],
      }),
    ]);
    assert.equal([r1.status, r2.status].filter((c) => c === 201).length, 1);
    assert.equal(
      (getDb().prepare('SELECT stock_milli FROM products WHERE id = ?').get(prodId)).stock_milli,
      48_000
    );

    // 3. Deux mouvements stock concurrents (+12 et -5 -> 55)
    const [m1, m2] = await Promise.all([
      api('POST', '/api/stock/adjust', {
        product_id: prodId,
        direction: 'in',
        quantity: '12',
        reason: 'Entrée concurrente Node Lot 3',
        request_key: 'lot3-node-adj-in',
      }),
      api('POST', '/api/stock/adjust', {
        product_id: prodId,
        direction: 'out',
        quantity: '5',
        reason: 'Sortie concurrente Node Lot 3',
        request_key: 'lot3-node-adj-out',
      }),
    ]);
    assert.equal(m1.status, 201);
    assert.equal(m2.status, 201);
    assert.equal(
      (getDb().prepare('SELECT stock_milli FROM products WHERE id = ?').get(prodId)).stock_milli,
      55_000
    );

    // 4. Vente et paiement de créance simultanés
    const creditSale = await api('POST', '/api/sales', {
      request_key: 'lot3-node-credit-sale',
      client_id: clientId,
      sale_type: 'credit',
      price_tier: 'retail',
      lines: [{ product_id: prodId, packaging_id: pkgId, quantity: '10' }],
      payments: [],
    });
    assert.equal(creditSale.status, 201);
    const recId = creditSale.data.receivable_id;

    const [saleRec, payRec] = await Promise.all([
      api('POST', '/api/sales', {
        request_key: 'lot3-node-sale-rec-concurrent',
        sale_type: 'cash',
        price_tier: 'retail',
        lines: [{ product_id: prodId, packaging_id: pkgId, quantity: '5' }],
        payments: [{ method_code: 'cash', amount: 2_000 }],
      }),
      api('POST', `/api/receivables/${recId}/pay`, {
        request_key: 'lot3-node-pay-rec-1',
        note: 'Paiement simultané Lot 3',
        parts: [{ method_code: 'cash', amount: 1_500 }],
      }),
    ]);
    assert.equal(saleRec.status, 201);
    assert.equal(payRec.status, 200);

    // 5. Vente et clôture de caisse simultanées
    const cashStatus = await api('GET', '/api/cash');
    const sessionId = cashStatus.data.activeSession.id;
    const [raceSale, raceClose] = await Promise.all([
      api('POST', '/api/sales', {
        request_key: 'lot3-node-sale-vs-close',
        sale_type: 'cash',
        price_tier: 'retail',
        lines: [{ product_id: prodId, packaging_id: pkgId, quantity: '2' }],
        payments: [{ method_code: 'cash', amount: 800 }],
      }),
      api('POST', '/api/cash/close', {
        session_id: sessionId,
        physical_cash: 48_300,
        closing_notes: 'Clôture concurrente Node Lot 3',
        request_key: 'lot3-node-close-vs-sale',
      }),
    ]);
    assert.equal(raceClose.status, 200);
    if (raceSale.status === 201) {
      assert.equal(raceClose.data.theoretical_cash, 48_300);
    } else {
      assert.equal(raceSale.status, 400);
      assert.equal(raceSale.data.code, 'SESSION_NOT_OPEN');
      assert.equal(raceClose.data.theoretical_cash, 47_500);
    }

    const integrity = verifyDbIntegrity();
    assert.equal(integrity.integrity, 'ok');
    assert.equal(integrity.foreignKeyErrors, 0);
  });

  it('Rollback après erreur, clés étrangères, multi-processus, blocage temporaire et expiration busy_timeout', async () => {
    const beforeStock = (
      getDb().prepare('SELECT stock_milli FROM products WHERE id = ?').get(prodId)
    ).stock_milli;

    // 1. Rollback après violation de clé étrangère (aucun effet partiel)
    await assert.rejects(
      () =>
        withWriteTx((db) => {
          db.prepare('UPDATE products SET stock_milli = stock_milli + 99000 WHERE id = ?').run(prodId);
          db.prepare(
            `INSERT INTO stock_movements (product_id, movement_type, quantity_milli, stock_before_milli, stock_after_milli, reason)
             VALUES (9999999, 'manual_adjust', 1000, 0, 1000, 'Test violation FK')`
          ).run();
        }),
      /FOREIGN KEY constraint failed/i
    );

    const afterRollbackStock = (
      getDb().prepare('SELECT stock_milli FROM products WHERE id = ?').get(prodId)
    ).stock_milli;
    assert.equal(afterRollbackStock, beforeStock);

    // 2. Deux processus Node distincts accédant simultanément au même fichier SQLite
    const w1 = spawnWorker({
      DEPOTPRO_LOT3_WORKER_DB: process.env.DEPOTPRO_DB_PATH,
      DEPOTPRO_LOT3_PROD_ID: String(prodId),
      DEPOTPRO_LOT3_TAG: 'p1',
    });
    const w2 = spawnWorker({
      DEPOTPRO_LOT3_WORKER_DB: process.env.DEPOTPRO_DB_PATH,
      DEPOTPRO_LOT3_PROD_ID: String(prodId),
      DEPOTPRO_LOT3_TAG: 'p2',
    });
    for (let i = 0; i < 5; i += 1) {
      const adj = await api('POST', '/api/stock/adjust', {
        product_id: prodId,
        direction: 'in',
        quantity: '1',
        reason: `Parent Node step ${i}`,
        request_key: `lot3-node-mp-parent-${i}`,
      });
      assert.equal(adj.status, 201);
    }
    const [r1, r2] = await Promise.all([w1, w2]);
    assert.equal(r1.code, 0, `Worker 1 stderr: ${r1.stderr}`);
    assert.equal(r2.code, 0, `Worker 2 stderr: ${r2.stderr}`);

    const afterMpStock = (
      getDb().prepare('SELECT stock_milli FROM products WHERE id = ?').get(prodId)
    ).stock_milli;
    // +5 (w1) + 5 (w2) + 5 (parent) = +15 bouteilles (+15000 milli)
    assert.equal(afterMpStock, beforeStock + 15_000);

    // 3. Blocage temporaire d'une connexion (140ms < busy_timeout 5000ms) -> attente puis succès
    const holder1 = await spawnLockHolder(140, prodId);
    const afterWaitAdj = await api('POST', '/api/stock/adjust', {
      product_id: prodId,
      direction: 'in',
      quantity: '1',
      reason: 'Après blocage temporaire 140ms',
      request_key: 'lot3-node-after-temp-block',
    });
    assert.equal(afterWaitAdj.status, 201);
    const holder1Result = await holder1.done;
    assert.equal(holder1Result.code, 0, `Holder 1 stderr: ${holder1Result.stderr}`);

    // 4. Expiration du délai busy_timeout (350ms verrou vs busy_timeout=60ms) -> HTTP 503 DATABASE_BUSY propre
    process.env.DEPOTPRO_BUSY_TIMEOUT_MS = '60';
    reloadDb();
    try {
      const holder2 = await spawnLockHolder(350, prodId);
      const busyRes = await api('POST', '/api/stock/adjust', {
        product_id: prodId,
        direction: 'in',
        quantity: '1',
        reason: 'Doit expirer SQLITE_BUSY',
        request_key: 'lot3-node-busy-expire',
      });
      assert.equal(busyRes.status, 503);
      assert.equal(busyRes.data.code, 'DATABASE_BUSY');
      const holder2Result = await holder2.done;
      assert.equal(holder2Result.code, 0, `Holder 2 stderr: ${holder2Result.stderr}`);

      // Reprise propre après libération du verrou
      const recoverRes = await api('POST', '/api/stock/adjust', {
        product_id: prodId,
        direction: 'in',
        quantity: '1',
        reason: 'Reprise après SQLITE_BUSY',
        request_key: 'lot3-node-busy-recover',
      });
      assert.equal(recoverRes.status, 201);
    } finally {
      delete process.env.DEPOTPRO_BUSY_TIMEOUT_MS;
      reloadDb();
    }

    // Contrôle strict d'une connexion SQLite directe sur PRAGMA integrity_check & foreign_key_check
    const check = verifyDbIntegrity();
    assert.equal(check.integrity, 'ok');
    assert.equal(check.foreignKeyErrors, 0);

    // Contrôle supplémentaire via nouvelle connexion brute
    const directDb = new DatabaseSync(process.env.DEPOTPRO_DB_PATH, { readOnly: true });
    const pragmaFk = directDb.prepare('PRAGMA foreign_key_check').all();
    assert.equal(pragmaFk.length, 0);
    directDb.close();
  });
});
