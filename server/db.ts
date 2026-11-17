import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { BusinessError } from './domain.ts';

export const DB_PATH = process.env.DEPOTPRO_DB_PATH
  ? path.resolve(process.env.DEPOTPRO_DB_PATH)
  : path.resolve(process.cwd(), 'data', 'depotpro_v3.db');
export const DATA_DIR = path.dirname(DB_PATH);
export const BACKUP_DIR = process.env.DEPOTPRO_BACKUP_DIR
  ? path.resolve(process.env.DEPOTPRO_BACKUP_DIR)
  : path.join(DATA_DIR, 'Sauvegardes');

let dbInstance: DatabaseSync | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

function configurePragmas(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = FULL;');
  db.exec('PRAGMA busy_timeout = 5000;');
}

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    dbInstance = new DatabaseSync(DB_PATH);
    configurePragmas(dbInstance);
    applyMigrations(dbInstance);
    seedIfEmpty(dbInstance);
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function reloadDb(): DatabaseSync {
  closeDb();
  return getDb();
}

function applyMigrations(db: DatabaseSync): void {
  const sqlPath = path.resolve(process.cwd(), 'migrations/sqlite/0001_initial_v3.sql');
  const schemaSql = fs.readFileSync(sqlPath, 'utf-8');
  db.exec(schemaSql);

  const settingsCols = db.prepare('PRAGMA table_info(app_settings)').all() as Array<{ name: string }>;
  if (!settingsCols.some((c) => c.name === 'logo_path')) {
    db.exec('ALTER TABLE app_settings ADD COLUMN logo_path TEXT NULL;');
  }

  const expenseCols = db.prepare('PRAGMA table_info(expenses)').all() as Array<{ name: string }>;
  if (!expenseCols.some((c) => c.name === 'receipt_path')) {
    db.exec('ALTER TABLE expenses ADD COLUMN receipt_path TEXT NULL;');
  }

  const row = db.prepare('SELECT version FROM schema_version WHERE version = 1').get() as
    | { version: number }
    | undefined;
  if (!row) {
    db.prepare('INSERT INTO schema_version (version, name) VALUES (1, ?)').run(
      '0001_initial_v3'
    );
  }
}

/**
 * Exécute une opération d'écriture atomique sérialisée (SQLite single-writer).
 */
export async function withWriteTx<T>(fn: (db: DatabaseSync) => T): Promise<T> {
  const task = writeQueue.then(() => {
    const db = getDb();
    db.exec('BEGIN IMMEDIATE;');
    try {
      const result = fn(db);
      db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback failure if connection rolled back automatically
      }
      throw err;
    }
  });
  writeQueue = task.catch(() => undefined);
  return task;
}

export async function runSerialized<T>(fn: (db: DatabaseSync) => T): Promise<T> {
  const task = writeQueue.then(() => {
    const db = getDb();
    return fn(db);
  });
  writeQueue = task.catch(() => undefined);
  return task;
}

export function nextSequence(db: DatabaseSync, prefix: string): string {
  const year = new Date().getFullYear();
  const row = db
    .prepare('SELECT last_number FROM document_sequences WHERE prefix = ? AND year = ?')
    .get(prefix, year) as { last_number: number } | undefined;
  const next = row ? row.last_number + 1 : 1;
  if (row) {
    db.prepare('UPDATE document_sequences SET last_number = ? WHERE prefix = ? AND year = ?').run(
      next,
      prefix,
      year
    );
  } else {
    db.prepare('INSERT INTO document_sequences (prefix, year, last_number) VALUES (?, ?, ?)').run(
      prefix,
      year,
      next
    );
  }
  return `${prefix}-${year}-${String(next).padStart(5, '0')}`;
}

export function auditLog(
  db: DatabaseSync,
  action: string,
  entityType: string,
  entityId: string | number | null,
  details: string
): void {
  db.prepare(
    'INSERT INTO audit_logs (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)'
  ).run(action, entityType, entityId !== null ? String(entityId) : null, details);
}

export function requireOpenSession(db: DatabaseSync): { id: number; reference: string; opening_cash: number } {
  const session = db
    .prepare("SELECT id, reference, opening_cash FROM cash_sessions WHERE status = 'open' LIMIT 1")
    .get() as { id: number; reference: string; opening_cash: number } | undefined;
  if (!session) {
    throw new BusinessError(
      'SESSION_NOT_OPEN',
      'Une session de caisse ouverte est obligatoire pour cette opération.'
    );
  }
  return session;
}

export function getTheoreticalCash(db: DatabaseSync, sessionId: number, openingCash: number): number {
  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END), 0) AS total_out
       FROM cash_movements
       WHERE session_id = ? AND method_code = 'cash'`
    )
    .get(sessionId) as { total_in: number; total_out: number };
  return openingCash + row.total_in - row.total_out;
}

function seedIfEmpty(db: DatabaseSync): void {
  const settingsCount = (db.prepare('SELECT COUNT(*) as c FROM app_settings').get() as { c: number }).c;
  if (settingsCount === 0) {
    db.prepare(
      `INSERT INTO app_settings (id, company_name, company_legal_name, address, phone, city, country, currency)
       VALUES (1, 'DEPOTPRO Distribution', 'Dépôt Central Boissons & Consignes SARL', 'Zone Industrielle Koumassi', '+225 07 00 00 00 00', 'Abidjan', 'Côte d''Ivoire', 'FCFA')`
    ).run();
  }

  const methodsCount = (db.prepare('SELECT COUNT(*) as c FROM payment_methods').get() as { c: number }).c;
  if (methodsCount === 0) {
    const insertMethod = db.prepare(
      'INSERT INTO payment_methods (code, label, is_cash, active) VALUES (?, ?, ?, 1)'
    );
    insertMethod.run('cash', 'Espèces', 1);
    insertMethod.run('wave', 'Wave Mobile Money', 0);
    insertMethod.run('orange_money', 'Orange Money', 0);
    insertMethod.run('mtn_money', 'MTN MoMo', 0);
    insertMethod.run('transfer', 'Virement bancaire', 0);
  }

  const expCatCount = (db.prepare('SELECT COUNT(*) as c FROM expense_categories').get() as { c: number }).c;
  if (expCatCount === 0) {
    const insertExp = db.prepare('INSERT INTO expense_categories (name) VALUES (?)');
    for (const c of ['Carburant & Livraison', 'Électricité & Eau', 'Maintenance & Réparation', 'Manutention', 'Fournitures', 'Divers']) {
      insertExp.run(c);
    }
  }

  const catCount = (db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number }).c;
  if (catCount > 0) return;

  db.exec('BEGIN IMMEDIATE;');
  try {
    const insertCat = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)');
    const cBiere = Number(insertCat.run('Bières', 'Bières locales et importées en casier et bouteille').lastInsertRowid);
    const cSoda = Number(insertCat.run('Boissons gazeuses', 'Sodas et boissons sucrées').lastInsertRowid);
    const cEau = Number(insertCat.run('Eaux minérales', 'Eaux plates et gazeuses en packs').lastInsertRowid);
    const cJus = Number(insertCat.run('Jus & Énergisants', 'Nectars, jus de fruits et boissons énergisantes').lastInsertRowid);

    const insertSup = db.prepare(
      'INSERT INTO suppliers (code, name, company_name, phone, address, payment_terms_days) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const sSolibra = Number(insertSup.run('FRN-001', 'Brasserie Centrale (SOLIBRA)', 'SOLIBRA SA', '+225 27 21 21 00 00', 'Treichville Zone 3', 30).lastInsertRowid);
    const sCeleste = Number(insertSup.run('FRN-002', 'Sources Minérales Réunies', 'SMR Distribution', '+225 27 22 44 10 00', 'Bonoua Route Principale', 15).lastInsertRowid);

    // Emballages consignés physiques (catalogue distinct des conditionnements)
    const insertRet = db.prepare(
      'INSERT INTO returnable_packaging_types (code, name, producer, kind, description, deposit_value) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const rCasier24 = Number(insertRet.run('EMB-CAS24', 'Casier plastique 24 trous', 'SOLIBRA', 'crate', 'Casier standard 24 emplacements', 2500).lastInsertRowid);
    const rBtl65 = Number(insertRet.run('EMB-BTL65', 'Bouteille verre 65cl', 'SOLIBRA', 'bottle', 'Bouteille verre consignée 65cl', 150).lastInsertRowid);
    const rCasier12 = Number(insertRet.run('EMB-CAS12', 'Casier plastique 12 trous', 'SOLIBRA', 'crate', 'Casier standard 12 grandes bouteilles', 2000).lastInsertRowid);

    const initRetStock = db.prepare('INSERT INTO returnable_stock_balances (packaging_id, quantity) VALUES (?, ?)');
    const initRetMov = db.prepare(
      "INSERT INTO returnable_stock_movements (request_key, packaging_id, movement_type, quantity, stock_before, stock_after, reason, reference_document) VALUES (?, ?, 'initial', ?, 0, ?, ?, 'INIT-V3')"
    );
    initRetStock.run(rCasier24, 180);
    initRetMov.run('init-ret-cas24', rCasier24, 180, 180, 'Stock initial de vides déclaré');
    initRetStock.run(rBtl65, 4320);
    initRetMov.run('init-ret-btl65', rBtl65, 4320, 4320, 'Stock initial de bouteilles vides déclaré');
    initRetStock.run(rCasier12, 95);
    initRetMov.run('init-ret-cas12', rCasier12, 95, 95, 'Stock initial casiers 12 trous');

    // Produits + conditionnements
    const insertProd = db.prepare(
      `INSERT INTO products (reference, barcode, name, brand, category_id, supplier_id, base_unit, stock_milli, min_stock_milli, max_stock_milli, average_cost_num, average_cost_den, purchase_price, wholesale_price, semi_wholesale_price, retail_price)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertPkg = db.prepare(
      `INSERT INTO product_packagings (product_id, name, base_unit, coefficient_milli, purchase_price, wholesale_price, semi_wholesale_price, retail_price, barcode, allow_fraction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertDepProf = db.prepare('INSERT INTO deposit_packaging_profiles (packaging_id, mode) VALUES (?, ?)');
    const insertDepComp = db.prepare('INSERT INTO deposit_packaging_components (packaging_id, returnable_id, pieces_per_pack) VALUES (?, ?, ?)');

    // 1. Flag Spéciale 65cl (consigné: 1 casier 24 + 24 bouteilles 65cl)
    const pFlag = Number(insertProd.run(
      'PROD-2026-00001', '3250001001011', 'Bière Flag Spéciale 65cl', 'Flag', cBiere, sSolibra,
      'bouteille', 480000, 120000, 1200000, '450', '1', 450, 500, 550, 600
    ).lastInsertRowid);
    const pkgFlagBtl = Number(insertPkg.run(pFlag, 'bouteille', 'bouteille', 1000, 450, 500, 550, 600, '3250001001011-B', 0).lastInsertRowid);
    const pkgFlagCas = Number(insertPkg.run(pFlag, 'casier', 'bouteille', 24000, 10800, 11800, 12500, 13500, '3250001001011-C', 0).lastInsertRowid);
    insertDepProf.run(pkgFlagBtl, 'deposit');
    insertDepComp.run(pkgFlagBtl, rBtl65, 1);
    insertDepProf.run(pkgFlagCas, 'deposit');
    insertDepComp.run(pkgFlagCas, rCasier24, 1);
    insertDepComp.run(pkgFlagCas, rBtl65, 24);

    // 2. Bock Solibra 65cl (consigné: 1 casier 12 + 12 bouteilles)
    const pBock = Number(insertProd.run(
      'PROD-2026-00002', '3250001001028', 'Bock Solibra 65cl', 'Solibra', cBiere, sSolibra,
      'bouteille', 288000, 72000, 960000, '400', '1', 400, 450, 475, 500
    ).lastInsertRowid);
    const pkgBockBtl = Number(insertPkg.run(pBock, 'bouteille', 'bouteille', 1000, 400, 450, 475, 500, '3250001001028-B', 0).lastInsertRowid);
    const pkgBockCas = Number(insertPkg.run(pBock, 'casier', 'bouteille', 12000, 4800, 5200, 5500, 6000, '3250001001028-C', 0).lastInsertRowid);
    insertDepProf.run(pkgBockBtl, 'deposit');
    insertDepComp.run(pkgBockBtl, rBtl65, 1);
    insertDepProf.run(pkgBockCas, 'deposit');
    insertDepComp.run(pkgBockCas, rCasier12, 1);
    insertDepComp.run(pkgBockCas, rBtl65, 12);

    // 3. Coca-Cola 33cl Canette (sans consigne)
    const pCoca = Number(insertProd.run(
      'PROD-2026-00003', '5449000000996', 'Coca-Cola Original 33cl', 'Coca-Cola', cSoda, sSolibra,
      'canette', 720000, 144000, 2400000, '320', '1', 320, 375, 400, 450
    ).lastInsertRowid);
    const pkgCocaCan = Number(insertPkg.run(pCoca, 'canette', 'canette', 1000, 320, 375, 400, 450, '5449000000996-U', 0).lastInsertRowid);
    const pkgCocaCart = Number(insertPkg.run(pCoca, 'carton', 'canette', 24000, 7680, 8800, 9200, 10000, '5449000000996-K', 0).lastInsertRowid);
    insertDepProf.run(pkgCocaCan, 'none');
    insertDepProf.run(pkgCocaCart, 'none');

    // 4. Eau Minérale Céleste 1.5L (pack de 6, sans consigne)
    const pEau = Number(insertProd.run(
      'PROD-2026-00004', '6181100400015', 'Eau Minérale Céleste 1.5L', 'Céleste', cEau, sCeleste,
      'bouteille', 600000, 120000, 1800000, '225', '1', 225, 250, 275, 300
    ).lastInsertRowid);
    const pkgEauBtl = Number(insertPkg.run(pEau, 'bouteille', 'bouteille', 1000, 225, 250, 275, 300, '6181100400015-B', 0).lastInsertRowid);
    const pkgEauPack = Number(insertPkg.run(pEau, 'pack', 'bouteille', 6000, 1350, 1500, 1600, 1800, '6181100400015-P', 0).lastInsertRowid);
    insertDepProf.run(pkgEauBtl, 'none');
    insertDepProf.run(pkgEauPack, 'none');

    // 5. Malta Guinness 33cl (pack de 6 et carton de 24, sans consigne, stock faible pour alerte réelle)
    const pMalta = Number(insertProd.run(
      'PROD-2026-00005', '6181100800129', 'Malta Guinness 33cl', 'Guinness', cJus, sSolibra,
      'canette', 48000, 72000, 720000, '380', '1', 380, 425, 450, 500
    ).lastInsertRowid);
    const pkgMaltaCan = Number(insertPkg.run(pMalta, 'canette', 'canette', 1000, 380, 425, 450, 500, '6181100800129-U', 0).lastInsertRowid);
    const pkgMaltaPack = Number(insertPkg.run(pMalta, 'pack', 'canette', 6000, 2280, 2500, 2650, 2900, '6181100800129-P', 0).lastInsertRowid);
    const pkgMaltaCart = Number(insertPkg.run(pMalta, 'carton', 'canette', 24000, 9120, 9800, 10400, 11500, '6181100800129-K', 0).lastInsertRowid);
    insertDepProf.run(pkgMaltaCan, 'none');
    insertDepProf.run(pkgMaltaPack, 'none');
    insertDepProf.run(pkgMaltaCart, 'none');

    db.prepare('INSERT INTO document_sequences (prefix, year, last_number) VALUES (?, ?, ?)').run(
      'PROD',
      new Date().getFullYear(),
      5
    );

    // Clients avec politiques de crédit explicites
    const insertCli = db.prepare(
      'INSERT INTO clients (code, name, client_type, phone, address, city) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertCredit = db.prepare(
      'INSERT INTO client_credit_settings (client_id, policy, credit_limit, payment_terms_days) VALUES (?, ?, ?, ?)'
    );

    const clComptoir = Number(insertCli.run('CLI-001', 'Client Comptoir', 'particulier', '', 'Vente directe au dépôt', 'Abidjan').lastInsertRowid);
    insertCredit.run(clComptoir, 'forbidden', null, 0);

    const clMaquis = Number(insertCli.run('CLI-002', 'Maquis Le Prestige', 'professionnel', '+225 05 44 12 88 90', 'Rue des Jardins, Cocody', 'Abidjan').lastInsertRowid);
    insertCredit.run(clMaquis, 'limited', 500000, 15);

    const clHotel = Number(insertCli.run('CLI-003', 'Hôtel La Lagune', 'professionnel', '+225 01 02 33 44 55', 'Boulevard de Marseille', 'Abidjan').lastInsertRowid);
    insertCredit.run(clHotel, 'unlimited', null, 30);

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}
