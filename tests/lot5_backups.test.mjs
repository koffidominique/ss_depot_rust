import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depotpro-lot5-node-'));
const dbPath = path.join(tmpDir, 'depotpro_lot5.db');
const backupDir = path.join(tmpDir, 'Sauvegardes');
process.env.DEPOTPRO_DB_PATH = dbPath;
process.env.DEPOTPRO_BACKUP_DIR = backupDir;

const { createApiApp } = await import('../server/app.ts');
const { getDb, closeDb } = await import('../server/db.ts');
const {
  computeFileSha256,
  openBackupReadOnly,
  resolveSafeBackupPath,
  verifyBackup,
  restoreBackup,
} = await import('../server/services/reports.ts');

let server;
let baseUrl = '';
let authToken = '';
let backupT0Name = '';
let backupT0Sha256 = '';
let snapshotT0Counts;

async function api(method, urlPath, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['X-DepotPro-Token'] = authToken;
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

describe('LOT 5 — Sauvegardes, vérification en lecture seule, sécurité chemins et restauration atomique', () => {
  before(async () => {
    const app = createApiApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    const setup = await api('POST', '/api/auth/setup', { pin: '123456' });
    assert.equal(setup.status, 200);
    authToken = setup.data.token;

    // Créer des données métier couvrant les 14 entités (produits, stock, clients, fournisseurs,
    // ventes, retours, créances, achats, réceptions, dettes fournisseurs, consignations, caisse, dépenses, audit)
    const openCash = await api('POST', '/api/cash/open', {
      opening_cash: 100000,
      request_key: 'lot5-cash-open',
    });
    assert.equal(openCash.status, 201);

    const sup = await api('POST', '/api/suppliers', {
      name: 'Fournisseur Lot 5',
      phone: '+225 0102030405',
      payment_terms_days: 30,
    });
    assert.equal(sup.status, 201);

    const prod = await api('POST', '/api/products', {
      name: 'Bière Spéciale Lot 5',
      brand: 'SOLIBRA',
      category_id: 1,
      supplier_id: sup.data.id,
      base_unit: 'bouteille',
      initial_stock: 120,
      min_stock: 10,
      purchase_price: 500,
      retail_price: 700,
    });
    assert.equal(prod.status, 201);

    const prodList = await api('GET', '/api/products?search=Lot%205');
    const prodItem = prodList.data.items.find((p) => p.id === prod.data.id);
    assert.ok(prodItem);
    const pkgId = prodItem.packagings[0].id;

    const cli = await api('POST', '/api/clients', {
      name: 'Maquis Lot 5',
      client_type: 'professionnel',
      credit_policy: 'limited',
      credit_limit: 200000,
      payment_terms_days: 15,
    });
    assert.equal(cli.status, 201);

    // Achat + Réception + Règlement dette fournisseur
    const po = await api('POST', '/api/purchases', {
      request_key: 'lot5-po-1',
      supplier_id: sup.data.id,
      lines: [{ product_id: prod.data.id, packaging_id: pkgId, quantity: 20, unit_price: 500 }],
    });
    assert.equal(po.status, 201);
    const rec = await api('POST', `/api/purchases/${po.data.id}/receive`, {
      request_key: 'lot5-rec-1',
      lines: [{ purchase_order_line_id: po.data.lines[0].id, received_quantity: 20 }],
    });
    assert.equal(rec.status, 201);
    const debts = await api('GET', '/api/supplier-debts');
    const debt = debts.data.find((d) => d.supplier_id === sup.data.id);
    assert.ok(debt);
    const payDebt = await api('POST', `/api/supplier-debts/${debt.id}/pay`, {
      method_code: 'cash',
      amount: 5000,
      request_key: 'lot5-pay-debt-1',
    });
    assert.equal(payDebt.status, 200);

    // Consignations (type + mouvement stock)
    const retType = await api('POST', '/api/consignments/types', {
      code: 'CAS-LOT5',
      name: 'Casier Lot 5',
      producer: 'SOLIBRA',
      kind: 'crate',
      deposit_value: 3500,
      initial_stock: 15,
    });
    assert.equal(retType.status, 201);
    const consAdj = await api('POST', '/api/consignments/stock-movements', {
      packaging_id: retType.data.id,
      movement_type: 'entry',
      quantity: 5,
      reason: 'Approvisionnement test lot 5',
      request_key: 'lot5-cons-adj-1',
    });
    assert.equal(consAdj.status, 201);

    // Vente comptant + retour partiel
    const saleCash = await api('POST', '/api/sales', {
      request_key: 'lot5-sale-cash-1',
      sale_type: 'cash',
      price_tier: 'retail',
      lines: [{ product_id: prod.data.id, packaging_id: pkgId, quantity: 5 }],
      payments: [{ method_code: 'cash', amount: 3500 }],
    });
    assert.equal(saleCash.status, 201);
    const saleRet = await api('POST', `/api/sales/${saleCash.data.id}/returns`, {
      request_key: 'lot5-ret-1',
      reason: 'Retour test lot 5',
      restock_approved: true,
      refund_method_code: 'cash',
      lines: [{ sale_line_id: saleCash.data.lines[0].id, base_quantity: 1 }],
    });
    assert.equal(saleRet.status, 201);

    // Vente à crédit + encaissement créance
    const saleCredit = await api('POST', '/api/sales', {
      request_key: 'lot5-sale-credit-1',
      client_id: cli.data.id,
      sale_type: 'credit',
      price_tier: 'retail',
      lines: [{ product_id: prod.data.id, packaging_id: pkgId, quantity: 10 }],
      payments: [],
    });
    assert.equal(saleCredit.status, 201);
    const receivables = await api('GET', '/api/receivables');
    const cr = receivables.data.find((r) => r.sale_id === saleCredit.data.id);
    assert.ok(cr);
    const payRec = await api('POST', `/api/receivables/${cr.id}/pay`, {
      request_key: 'lot5-pay-rec-1',
      parts: [{ method_code: 'wave', amount: 2000 }],
    });
    assert.equal(payRec.status, 200);

    // Dépense
    const exp = await api('POST', '/api/expenses', {
      category: 'Carburant',
      notes: 'Transport Lot 5',
      amount: 1500,
      method_code: 'cash',
      request_key: 'lot5-exp-1',
    });
    assert.equal(exp.status, 201);
  });

  after(() => {
    try {
      closeDb();
    } catch {
      // Ignore
    }
    if (server) server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1, 2 & 3 — Création de sauvegarde, vérification strictement en lecture seule et empreinte SHA-256 inchangée', async () => {
    const createRes = await api('POST', '/api/backups');
    assert.equal(createRes.status, 201);
    assert.equal(createRes.data.integrity, 'ok');
    assert.match(createRes.data.sha256, /^[0-9a-f]{64}$/);
    backupT0Name = createRes.data.name;
    backupT0Sha256 = createRes.data.sha256;

    const { fullPath } = resolveSafeBackupPath(backupT0Name);
    const shaBefore = computeFileSha256(fullPath);
    assert.equal(shaBefore, backupT0Sha256);

    // Ouvrir directement via openBackupReadOnly et confirmer l'impossibilité d'écrire
    const roDb = openBackupReadOnly(fullPath);
    try {
      assert.throws(() => {
        roDb.exec("UPDATE app_settings SET company_name = 'MUTATION_INTERDITE' WHERE id = 1");
      });
    } finally {
      roDb.close();
    }

    // Aucun fichier -wal/-shm créé dans le répertoire Sauvegardes
    assert.equal(fs.existsSync(`${fullPath}-wal`), false);
    assert.equal(fs.existsSync(`${fullPath}-shm`), false);

    // Vérification complète via HTTP /api/backups/:name/verify
    const verifyRes = await api('GET', `/api/backups/${encodeURIComponent(backupT0Name)}/verify`);
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.data.integrity, 'ok');
    assert.equal(verifyRes.data.foreignKeyErrors, 0);
    assert.equal(verifyRes.data.compatible, true);
    assert.equal(verifyRes.data.compatibilityReason, null);
    assert.equal(verifyRes.data.backupFormat, 'sqlite3-depotpro-v3');
    assert.equal(verifyRes.data.sha256, shaBefore);

    // Vérifier les 14 entités métier présentes dans les compteurs
    snapshotT0Counts = verifyRes.data.counts;
    for (const key of [
      'products',
      'stockMovements',
      'clients',
      'suppliers',
      'sales',
      'salesReturns',
      'customerReceivables',
      'purchaseOrders',
      'purchaseReceipts',
      'supplierDebts',
      'returnableStockMovements',
      'cashMovements',
      'expenses',
      'auditLogs',
    ]) {
      assert.ok(snapshotT0Counts[key] >= 1, `Compteur ${key} doit être >= 1`);
    }

    // Empreinte SHA-256 strictement identique avant et après vérification
    const shaAfter = computeFileSha256(fullPath);
    assert.equal(shaAfter, shaBefore);
    assert.equal(fs.existsSync(`${fullPath}-wal`), false);
    assert.equal(fs.existsSync(`${fullPath}-shm`), false);
  });

  it('4 — Vérification et refus de restauration d’une archive corrompue (en-tête invalide et B-tree corrompu)', async () => {
    // a) Fichier texte / octets aléatoires avec nom autorisé
    const badHeaderName = 'depotpro_backup_20261117010101_badhdr.db';
    fs.writeFileSync(path.join(backupDir, badHeaderName), 'NOT_A_VALID_SQLITE_ARCHIVE_AT_ALL');

    const verifyBadHdr = await api('GET', `/api/backups/${badHeaderName}/verify`);
    assert.equal(verifyBadHdr.status, 400);
    assert.equal(verifyBadHdr.data.code, 'BACKUP_ERROR');

    const restoreBadHdr = await api('POST', `/api/backups/${badHeaderName}/restore`);
    assert.equal(restoreBadHdr.status, 400);
    assert.equal(restoreBadHdr.data.code, 'BACKUP_ERROR');

    // b) Archive SQLite dont des pages internes sont corrompues
    const { fullPath: goodPath } = resolveSafeBackupPath(backupT0Name);
    const corruptName = 'depotpro_backup_20261117010102_corrup.db';
    const corruptPath = path.join(backupDir, corruptName);
    const bytes = fs.readFileSync(goodPath);
    // Corrompre plusieurs pages après l'en-tête (offset >= 4096)
    bytes.fill(0xff, 4096, Math.min(bytes.length, 16384));
    fs.writeFileSync(corruptPath, bytes);

    const verifyCorrupt = await api('GET', `/api/backups/${corruptName}/verify`);
    assert.ok(
      verifyCorrupt.status === 400 ||
        (verifyCorrupt.status === 200 && verifyCorrupt.data.compatible === false)
    );
    const restoreCorrupt = await api('POST', `/api/backups/${corruptName}/restore`);
    assert.equal(restoreCorrupt.status, 400);

    fs.unlinkSync(path.join(backupDir, badHeaderName));
    fs.unlinkSync(corruptPath);
  });

  it('5 — Vérification et refus de restauration d’archives incompatibles (schéma futur & base tierce)', async () => {
    // a) Base avec schema_version futur (v99 > v4)
    const { fullPath: goodPath } = resolveSafeBackupPath(backupT0Name);
    const futureName = 'depotpro_backup_20261117010103_future.db';
    const futurePath = path.join(backupDir, futureName);
    fs.copyFileSync(goodPath, futurePath);
    const fdb = new DatabaseSync(futurePath);
    fdb.exec("INSERT INTO schema_version (version, name) VALUES (99, '9999_future_incompatible');");
    fdb.close();

    const verifyFuture = await api('GET', `/api/backups/${futureName}/verify`);
    assert.equal(verifyFuture.status, 200);
    assert.equal(verifyFuture.data.schemaVersion, 99);
    assert.equal(verifyFuture.data.compatible, false);
    assert.match(verifyFuture.data.compatibilityReason, /incompatible|v99/i);

    const restoreFuture = await api('POST', `/api/backups/${futureName}/restore`);
    assert.equal(restoreFuture.status, 400);
    assert.equal(restoreFuture.data.code, 'BACKUP_ERROR');

    // b) Base SQLite valide mais sans tables DEPOTPRO
    const foreignName = 'depotpro_backup_20261117010104_foreig.db';
    const foreignPath = path.join(backupDir, foreignName);
    const otherDb = new DatabaseSync(foreignPath);
    otherDb.exec('CREATE TABLE random_other_app (id INTEGER PRIMARY KEY, label TEXT);');
    otherDb.close();

    const verifyForeign = await api('GET', `/api/backups/${foreignName}/verify`);
    assert.equal(verifyForeign.status, 200);
    assert.equal(verifyForeign.data.compatible, false);
    assert.match(verifyForeign.data.compatibilityReason, /table\(s\) DEPOTPRO manquante/i);

    const restoreForeign = await api('POST', `/api/backups/${foreignName}/restore`);
    assert.equal(restoreForeign.status, 400);

    fs.unlinkSync(futurePath);
    fs.unlinkSync(foreignPath);
  });

  it('6 & 7 — Rejet des chemins non autorisés (path traversal) et des liens symboliques', async () => {
    const outsidePath = path.join(tmpDir, 'outside_secret.db');
    fs.copyFileSync(dbPath, outsidePath);

    const symlinkName = 'depotpro_backup_20261117010105_symlnk.db';
    const symlinkPath = path.join(backupDir, symlinkName);
    fs.symlinkSync(outsidePath, symlinkPath);

    // Liste doit ignorer le lien symbolique et les fichiers non conformes
    const listRes = await api('GET', '/api/backups');
    assert.equal(listRes.status, 200);
    assert.equal(
      listRes.data.some((b) => b.name === symlinkName),
      false
    );

    // Tentatives via chemin non autorisé
    for (const badName of [
      '../outside_secret.db',
      'sub/depotpro_backup_20261117010105_aaaaaa.db',
      'depotpro_v3.db',
      'arbitrary.txt',
    ]) {
      assert.throws(() => resolveSafeBackupPath(badName));
      assert.throws(() => verifyBackup(badName));
      const httpVerify = await api('GET', `/api/backups/${encodeURIComponent(badName)}/verify`);
      assert.equal(httpVerify.status, 400);
      const httpDl = await api('GET', `/api/backups/${encodeURIComponent(badName)}/download`);
      assert.equal(httpDl.status, 400);
      const httpRestore = await api('POST', `/api/backups/${encodeURIComponent(badName)}/restore`);
      assert.equal(httpRestore.status, 400);
    }

    // Tentatives via lien symbolique
    assert.throws(() => resolveSafeBackupPath(symlinkName));
    const symVerify = await api('GET', `/api/backups/${symlinkName}/verify`);
    assert.equal(symVerify.status, 400);
    const symDl = await api('GET', `/api/backups/${symlinkName}/download`);
    assert.equal(symDl.status, 400);
    const symRestore = await api('POST', `/api/backups/${symlinkName}/restore`);
    assert.equal(symRestore.status, 400);

    fs.unlinkSync(symlinkPath);
    fs.unlinkSync(outsidePath);
  });

  it('9 & 10 — Interruption de restauration et échec de reconnexion : rollback automatique, pool sain et sauvegarde de sécurité conservée', async () => {
    // Ajouter un produit post-sauvegarde T0
    const postProd = await api('POST', '/api/products', {
      name: 'Produit Post-T0 Résilience',
      category_id: 1,
      base_unit: 'bouteille',
      initial_stock: 25,
      purchase_price: 400,
      retail_price: 600,
    });
    assert.equal(postProd.status, 201);

    for (const failurePoint of [
      'before_atomic_replace',
      'before_reconnect',
      'after_reconnect_post_verify',
    ]) {
      await assert.rejects(
        restoreBackup(backupT0Name, { testSimulateFailure: failurePoint })
      );

      // L'application et le pool SQLite doivent rester pleinement utilisables après échec !
      const liveSearch = await api(
        'GET',
        `/api/products?search=${encodeURIComponent('Produit Post-T0 Résilience')}`
      );
      assert.equal(liveSearch.status, 200);
      assert.equal(
        liveSearch.data.items.length,
        1,
        `Après échec ${failurePoint}, les données avant restauration doivent être préservées`
      );

      // Aucun fichier temporaire résiduel dans DATA_DIR
      const leftover = fs
        .readdirSync(path.dirname(dbPath))
        .filter((f) => f.startsWith('.depotpro_restore_'));
      assert.deepEqual(leftover, []);
    }

    // Les sauvegardes de sécurité créées lors des tentatives échouées sont conservées
    const backupsAfterFailure = await api('GET', '/api/backups');
    assert.ok(backupsAfterFailure.data.length >= 4);
  });

  it('8, 11, 12 & 13 — Restauration normale, vérification 14 entités, sauvegarde de sécurité conservée et redémarrage', async () => {
    const restoreRes = await api('POST', `/api/backups/${encodeURIComponent(backupT0Name)}/restore`);
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.data.restored, backupT0Name);
    assert.equal(restoreRes.data.restoredSha256, backupT0Sha256);
    assert.equal(restoreRes.data.integrity, 'ok');
    assert.equal(restoreRes.data.foreignKeyErrors, 0);
    assert.ok(restoreRes.data.safetyBackup);

    // Vérifier que la sauvegarde de sécurité existe, contient le produit post-T0 et est saine en lecture seule
    const safetyVerify = await api(
      'GET',
      `/api/backups/${encodeURIComponent(restoreRes.data.safetyBackup)}/verify`
    );
    assert.equal(safetyVerify.status, 200);
    assert.equal(safetyVerify.data.compatible, true);
    assert.equal(safetyVerify.data.integrity, 'ok');
    assert.equal(safetyVerify.data.counts.products, snapshotT0Counts.products + 1);

    // Vérifier que le produit post-T0 a bien disparu de la base restaurée
    const afterSearch = await api(
      'GET',
      `/api/products?search=${encodeURIComponent('Produit Post-T0 Résilience')}`
    );
    assert.equal(afterSearch.status, 200);
    assert.equal(afterSearch.data.items.length, 0);

    // Vérifier les 14 entités métier après restauration
    for (const [k, v] of Object.entries(snapshotT0Counts)) {
      if (k === 'auditLogs') {
        assert.equal(restoreRes.data.counts[k], v + 1); // +1 RESTORE_BACKUP
      } else {
        assert.equal(restoreRes.data.counts[k], v, `Différence sur ${k} après restauration`);
      }
    }

    // Vérifier la persistance réelle après redémarrage complet dans un nouveau processus Node
    const probeScript = `
      import assert from 'node:assert/strict';
      const { getDb, verifyDbIntegrity, closeDb } = await import('./server/db.ts');
      const { collectEntityCounts } = await import('./server/services/reports.ts');
      const db = getDb();
      const integ = verifyDbIntegrity(db);
      assert.equal(integ.integrity, 'ok');
      assert.equal(integ.foreignKeyErrors, 0);
      const counts = collectEntityCounts(db);
      const postProd = db.prepare("SELECT COUNT(*) AS c FROM products WHERE name = 'Produit Post-T0 Résilience'").get();
      assert.equal(postProd.c, 0);
      const restoreAudit = db.prepare("SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'RESTORE_BACKUP'").get();
      assert.ok(restoreAudit.c >= 1);
      console.log(JSON.stringify(counts));
      closeDb();
    `;
    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', probeScript],
      {
        env: {
          ...process.env,
          DEPOTPRO_DB_PATH: dbPath,
          DEPOTPRO_BACKUP_DIR: backupDir,
        },
        encoding: 'utf8',
      }
    );
    const restartedCounts = JSON.parse(out.trim().split('\n').at(-1));
    assert.deepEqual(restartedCounts, restoreRes.data.counts);
  });
});
