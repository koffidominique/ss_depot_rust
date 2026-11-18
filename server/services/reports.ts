import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BACKUP_DIR,
  CURRENT_SCHEMA_VERSION,
  DB_PATH,
  MIN_SUPPORTED_SCHEMA_VERSION,
  closeDb,
  getDb,
  getTheoreticalCash,
  reloadDb,
  runSerialized,
  withWriteTx,
  auditLog,
} from '../db.ts';
import { BusinessError } from '../domain.ts';
import { sanitizeImagePath } from './catalog.ts';
import { requireCurrentActorPermission } from './auth.ts';

export function getDashboardData() {
  requireCurrentActorPermission('catalog:read');
  const db = getDb();

  const salesAgg = db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(total_merchandise), 0) AS revenue_merchandise,
              COALESCE(SUM(total_deposit), 0) AS deposits_total,
              COALESCE(SUM(total_amount), 0) AS revenue_total
       FROM sales WHERE status != 'cancelled'`
    )
    .get() as { count: number; revenue_merchandise: number; deposits_total: number; revenue_total: number };

  const collectionsAgg = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total_in
       FROM cash_movements WHERE direction = 'in'`
    )
    .get() as { total_in: number };

  const receivablesAgg = db
    .prepare(
      "SELECT COALESCE(SUM(remaining_amount), 0) AS total, COUNT(*) AS count FROM customer_receivables WHERE status IN ('open', 'partial')"
    )
    .get() as { total: number; count: number };

  const overdueReceivablesAgg = db
    .prepare(
      `SELECT COALESCE(SUM(remaining_amount), 0) AS total, COUNT(*) AS count
       FROM customer_receivables
       WHERE status IN ('open', 'partial') AND remaining_amount > 0 AND due_date IS NOT NULL AND date(due_date) < date('now')`
    )
    .get() as { total: number; count: number };

  const supplierDebtsAgg = db
    .prepare(
      "SELECT COALESCE(SUM(remaining_amount), 0) AS total, COUNT(*) AS count FROM supplier_debts WHERE status IN ('open', 'partial')"
    )
    .get() as { total: number; count: number };

  const overdueSupplierDebtsAgg = db
    .prepare(
      `SELECT COALESCE(SUM(remaining_amount), 0) AS total, COUNT(*) AS count
       FROM supplier_debts
       WHERE status IN ('open', 'partial') AND remaining_amount > 0 AND due_date IS NOT NULL AND date(due_date) < date('now')`
    )
    .get() as { total: number; count: number };

  const expensesAgg = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses')
    .get() as { total: number };

  const openSession = db
    .prepare("SELECT id, reference, opened_at, opening_cash FROM cash_sessions WHERE status = 'open' LIMIT 1")
    .get() as { id: number; reference: string; opened_at: string; opening_cash: number } | undefined;

  let cashPhysicalTheoretical = 0;
  let digitalSessionTotal = 0;
  if (openSession) {
    cashPhysicalTheoretical = getTheoreticalCash(db, openSession.id, openSession.opening_cash);
    const digRow = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS net
         FROM cash_movements WHERE session_id = ? AND method_code != 'cash'`
      )
      .get(openSession.id) as { net: number };
    digitalSessionTotal = digRow.net;
  }

  const lowStockProducts = db
    .prepare(
      `SELECT id, reference, name, base_unit, stock_milli, min_stock_milli
       FROM products WHERE is_active = 1 AND stock_milli <= min_stock_milli
       ORDER BY stock_milli ASC LIMIT 10`
    )
    .all();

  const outOfStockCount = (
    db.prepare('SELECT COUNT(*) AS c FROM products WHERE is_active = 1 AND stock_milli <= 0').get() as {
      c: number;
    }
  ).c;

  const lowStockCount = (
    db
      .prepare(
        'SELECT COUNT(*) AS c FROM products WHERE is_active = 1 AND stock_milli > 0 AND stock_milli <= min_stock_milli'
      )
      .get() as { c: number }
  ).c;

  const topProducts = db
    .prepare(
      `SELECT sl.product_id, sl.product_name, sl.base_unit,
              SUM(sl.base_quantity_milli) AS total_base_milli,
              SUM(sl.line_total) AS total_revenue
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       WHERE s.status != 'cancelled'
       GROUP BY sl.product_id, sl.product_name, sl.base_unit
       ORDER BY total_revenue DESC
       LIMIT 6`
    )
    .all();

  const salesSeries = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day,
              COUNT(*) AS count,
              COALESCE(SUM(total_merchandise), 0) AS revenue,
              COALESCE(SUM(paid_amount), 0) AS collected
       FROM sales
       WHERE status != 'cancelled'
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day ASC
       LIMIT 30`
    )
    .all();

  const recentAudit = db
    .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 8')
    .all();

  return {
    kpis: {
      revenueMerchandise: salesAgg.revenue_merchandise,
      depositsTotal: salesAgg.deposits_total,
      salesCount: salesAgg.count,
      collectionsTotal: collectionsAgg.total_in,
      receivablesTotal: receivablesAgg.total,
      receivablesCount: receivablesAgg.count,
      overdueReceivablesTotal: overdueReceivablesAgg.total,
      overdueReceivablesCount: overdueReceivablesAgg.count,
      supplierDebtsTotal: supplierDebtsAgg.total,
      supplierDebtsCount: supplierDebtsAgg.count,
      overdueSupplierDebtsTotal: overdueSupplierDebtsAgg.total,
      overdueSupplierDebtsCount: overdueSupplierDebtsAgg.count,
      expensesTotal: expensesAgg.total,
      cashSessionOpen: Boolean(openSession),
      cashSessionReference: openSession?.reference || null,
      cashPhysicalTheoretical,
      digitalSessionTotal,
      lowStockCount,
      outOfStockCount,
    },
    lowStockProducts,
    topProducts,
    salesSeries,
    recentAudit,
  };
}

export function getReportsOverview(fromDate?: string, toDate?: string) {
  requireCurrentActorPermission('reports:read');
  const db = getDb();
  const clauses = ["s.status != 'cancelled'"];
  const params: string[] = [];
  if (fromDate) {
    clauses.push('substr(s.created_at, 1, 10) >= ?');
    params.push(fromDate);
  }
  if (toDate) {
    clauses.push('substr(s.created_at, 1, 10) <= ?');
    params.push(toDate);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;

  const salesSummary = db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(s.total_merchandise), 0) AS merchandise_revenue,
              COALESCE(SUM(s.total_deposit), 0) AS deposit_billed,
              COALESCE(SUM(s.paid_amount), 0) AS paid_amount
       FROM sales s ${where}`
    )
    .get(...params) as {
    count: number;
    merchandise_revenue: number;
    deposit_billed: number;
    paid_amount: number;
  };

  // Marge & Coût des marchandises vendues : uniquement si coût historique connu sur toutes les lignes
  const lines = db
    .prepare(
      `SELECT sl.base_quantity_milli, sl.line_total, sl.cost_num, sl.cost_den
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       ${where}`
    )
    .all(...params) as Array<{
    base_quantity_milli: number;
    line_total: number;
    cost_num: string | null;
    cost_den: string | null;
  }>;

  let knownCostTotal = 0;
  let knownCostRevenue = 0;
  let unknownCostLines = 0;

  for (const l of lines) {
    if (l.cost_num && l.cost_den && Number(l.cost_den) > 0) {
      const unitCost = Number(l.cost_num) / Number(l.cost_den);
      const lineCost = Math.round((l.base_quantity_milli * unitCost) / 1000);
      knownCostTotal += lineCost;
      knownCostRevenue += l.line_total;
    } else {
      unknownCostLines++;
    }
  }

  const expClauses: string[] = [];
  const expParams: string[] = [];
  if (fromDate) {
    expClauses.push('substr(COALESCE(expense_date, created_at), 1, 10) >= ?');
    expParams.push(fromDate);
  }
  if (toDate) {
    expClauses.push('substr(COALESCE(expense_date, created_at), 1, 10) <= ?');
    expParams.push(toDate);
  }
  const expWhere = expClauses.length ? `WHERE ${expClauses.join(' AND ')}` : '';
  const expensesTotal = (
    db.prepare(`SELECT COALESCE(SUM(amount), 0) AS t FROM expenses ${expWhere}`).get(...expParams) as {
      t: number;
    }
  ).t;

  const cmJoinClauses = ['cm.method_code = pm.code'];
  const cmParams: string[] = [];
  if (fromDate) {
    cmJoinClauses.push('substr(cm.created_at, 1, 10) >= ?');
    cmParams.push(fromDate);
  }
  if (toDate) {
    cmJoinClauses.push('substr(cm.created_at, 1, 10) <= ?');
    cmParams.push(toDate);
  }
  const paymentBreakdown = db
    .prepare(
      `SELECT pm.code, pm.label, pm.is_cash,
              COALESCE(SUM(CASE WHEN cm.direction = 'in' THEN cm.amount ELSE 0 END), 0) AS total_in,
              COALESCE(SUM(CASE WHEN cm.direction = 'out' THEN cm.amount ELSE 0 END), 0) AS total_out
       FROM payment_methods pm
       LEFT JOIN cash_movements cm ON ${cmJoinClauses.join(' AND ')}
       GROUP BY pm.code, pm.label, pm.is_cash
       ORDER BY total_in DESC`
    )
    .all(...cmParams);

  const stockStats = db
    .prepare(
      `SELECT COUNT(*) AS product_count,
              SUM(CASE WHEN average_cost_num IS NULL OR average_cost_den IS NULL THEN 1 ELSE 0 END) AS unknown_cost_products
       FROM products WHERE is_active = 1`
    )
    .get() as { product_count: number; unknown_cost_products: number };

  const valuedStock = (
    db
      .prepare(
        `SELECT stock_milli, average_cost_num, average_cost_den FROM products
         WHERE is_active = 1 AND average_cost_num IS NOT NULL AND average_cost_den IS NOT NULL`
      )
      .all() as Array<{ stock_milli: number; average_cost_num: string; average_cost_den: string }>
  ).reduce((acc, p) => {
    const den = Number(p.average_cost_den);
    if (den <= 0) return acc;
    return acc + Math.round((p.stock_milli * (Number(p.average_cost_num) / den)) / 1000);
  }, 0);

  const dailySales = db
    .prepare(
      `SELECT substr(s.created_at, 1, 10) AS day,
              COUNT(*) AS count,
              COALESCE(SUM(s.total_merchandise), 0) AS revenue,
              COALESCE(SUM(s.total_deposit), 0) AS deposit,
              COALESCE(SUM(s.paid_amount), 0) AS collected
       FROM sales s
       ${where}
       GROUP BY substr(s.created_at, 1, 10)
       ORDER BY day ASC`
    )
    .all(...params) as Array<{
    day: string;
    count: number;
    revenue: number;
    deposit: number;
    collected: number;
  }>;

  return {
    commercial: salesSummary,
    profitability: {
      knownCostTotal,
      knownCostRevenue,
      knownGrossMargin: knownCostRevenue - knownCostTotal,
      unknownCostLines,
      expensesTotal,
      netKnownResult: knownCostRevenue - knownCostTotal - expensesTotal,
    },
    paymentBreakdown,
    stock: {
      ...stockStats,
      knownValuationFcfa: valuedStock,
    },
    dailySales,
  };
}

export function getSettings() {
  requireCurrentActorPermission('settings:read');
  const db = getDb();
  const settings = db.prepare('SELECT * FROM app_settings WHERE id = 1').get();
  const paymentMethods = db.prepare('SELECT * FROM payment_methods ORDER BY is_cash DESC, label ASC').all();
  return { settings, paymentMethods };
}

export async function updateSettings(input: {
  company_name?: string;
  company_legal_name?: string;
  address?: string;
  phone?: string;
  email?: string;
  city?: string;
  country?: string;
  allow_negative_stock?: boolean;
  invoice_prefix?: string;
  sale_prefix?: string;
  purchase_prefix?: string;
  order_prefix?: string;
  receipt_prefix?: string;
  credit_note_prefix?: string;
  theme?: 'light' | 'dark';
  logo_path?: string | null;
  setup_completed?: boolean | number;
}) {
  requireCurrentActorPermission('settings:write');
  return withWriteTx((db) => {
    const cur = db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as Record<string, string | number | null>;
    const nextLogoPath =
      input.logo_path !== undefined ? sanitizeImagePath(input.logo_path) : (cur.logo_path as string | null);
    const hasIdentityUpdate =
      input.company_name !== undefined ||
      input.company_legal_name !== undefined ||
      input.address !== undefined ||
      input.phone !== undefined ||
      input.email !== undefined ||
      input.city !== undefined ||
      input.country !== undefined ||
      input.logo_path !== undefined;
    const nextSetupCompleted =
      input.setup_completed !== undefined
        ? input.setup_completed
          ? 1
          : 0
        : hasIdentityUpdate
          ? 1
          : Number(cur.setup_completed ?? 0);
    db.prepare(
      `UPDATE app_settings
       SET company_name = ?, company_legal_name = ?, address = ?, phone = ?, email = ?, city = ?, country = ?,
           allow_negative_stock = ?, invoice_prefix = ?, sale_prefix = ?, purchase_prefix = ?, order_prefix = ?,
           receipt_prefix = ?, credit_note_prefix = ?, theme = ?, logo_path = ?, setup_completed = ?, updated_at = datetime('now')
       WHERE id = 1`
    ).run(
      input.company_name?.trim() || cur.company_name,
      input.company_legal_name !== undefined ? input.company_legal_name?.trim() || null : cur.company_legal_name,
      input.address !== undefined ? input.address?.trim() || null : cur.address,
      input.phone !== undefined ? input.phone?.trim() || null : cur.phone,
      input.email !== undefined ? input.email?.trim() || null : cur.email,
      input.city !== undefined ? input.city?.trim() || null : cur.city,
      input.country !== undefined ? input.country?.trim() || null : cur.country,
      input.allow_negative_stock !== undefined ? (input.allow_negative_stock ? 1 : 0) : cur.allow_negative_stock,
      input.invoice_prefix?.trim().toUpperCase() || cur.invoice_prefix,
      input.sale_prefix?.trim().toUpperCase() || cur.sale_prefix,
      input.purchase_prefix?.trim().toUpperCase() || cur.purchase_prefix,
      input.order_prefix?.trim().toUpperCase() || cur.order_prefix,
      input.receipt_prefix?.trim().toUpperCase() || cur.receipt_prefix,
      input.credit_note_prefix?.trim().toUpperCase() || cur.credit_note_prefix,
      input.theme === 'dark' ? 'dark' : input.theme === 'light' ? 'light' : cur.theme,
      nextLogoPath,
      nextSetupCompleted
    );
    auditLog(db, 'UPDATE_SETTINGS', 'app_settings', 1, 'Mise à jour des paramètres application');
    return getSettings();
  });
}

export async function addPaymentMethod(label: string) {
  requireCurrentActorPermission('settings:write');
  const clean = (label || '').trim();
  if (!clean) throw new BusinessError('VALIDATION_ERROR', 'Le libellé du moyen de paiement est requis.');
  const baseSlug = clean
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const code = `${baseSlug || 'moyen'}_${Date.now().toString(36)}`;
  return withWriteTx((db) => {
    db.prepare('INSERT INTO payment_methods (code, label, is_cash, active) VALUES (?, ?, 0, 1)').run(
      code,
      clean
    );
    auditLog(db, 'ADD_PAYMENT_METHOD', 'payment_methods', code, `Ajout moyen de paiement : ${clean}`);
    return db.prepare('SELECT * FROM payment_methods WHERE code = ?').get(code);
  });
}

export async function togglePaymentMethod(code: string, active: boolean) {
  requireCurrentActorPermission('settings:write');
  if (code === 'cash' && !active) {
    throw new BusinessError('VALIDATION_ERROR', 'Le moyen Espèces (cash) ne peut jamais être désactivé.');
  }
  return withWriteTx((db) => {
    db.prepare('UPDATE payment_methods SET active = ? WHERE code = ?').run(active ? 1 : 0, code);
    auditLog(db, 'TOGGLE_PAYMENT_METHOD', 'payment_methods', code, `Statut actif = ${active}`);
    return db.prepare('SELECT * FROM payment_methods WHERE code = ?').get(code);
  });
}

const MAX_RETAINED_BACKUPS = 30;
export const BACKUP_FORMAT_V3 = 'sqlite3-depotpro-v3';
export const MIN_APP_VERSION = '3.0.0';
const SQLITE_HEADER_MAGIC = Buffer.from('SQLite format 3\0', 'ascii');
const ENCRYPTED_BACKUP_MAGIC = Buffer.from('DPBKP01\0', 'ascii');
const ENCRYPTED_BACKUP_VERSION = 1;
const ENCRYPTED_PBKDF2_ITERATIONS = 100_000;
const MIN_BACKUP_PASSPHRASE_LEN = 8;
const BACKUP_FILENAME_RE = /^depotpro_backup_\d{14}_[a-zA-Z0-9_-]{1,32}\.(db|dpbkp)$/;

export const REQUIRED_CORE_TABLES = [
  'schema_version',
  'app_settings',
  'owner_security',
  'categories',
  'payment_methods',
  'suppliers',
  'products',
  'product_packagings',
  'clients',
  'sales',
  'sale_lines',
  'payments',
  'payment_parts',
  'sales_returns',
  'customer_receivables',
  'purchase_orders',
  'purchase_order_lines',
  'purchase_receipts',
  'supplier_debts',
  'stock_movements',
  'cash_sessions',
  'cash_movements',
  'expenses',
  'returnable_packaging_types',
  'returnable_stock_movements',
  'audit_logs',
  'document_sequences',
] as const;

export interface BackupEntityCounts {
  products: number;
  stockMovements: number;
  clients: number;
  suppliers: number;
  sales: number;
  salesReturns: number;
  customerReceivables: number;
  purchaseOrders: number;
  purchaseReceipts: number;
  supplierDebts: number;
  returnableStockMovements: number;
  cashMovements: number;
  expenses: number;
  auditLogs: number;
}

export type RestoreFailureHook =
  | 'before_atomic_replace'
  | 'before_reconnect'
  | 'after_reconnect_post_verify';

export function computeFileSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(65_536);
    while (true) {
      const read = fs.readSync(fd, buf, 0, buf.length, null);
      if (read === 0) break;
      hash.update(buf.subarray(0, read));
    }
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

function fsyncFileSync(filePath: string): void {
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function fsyncDirBestEffort(dirPath: string): void {
  if (process.platform === 'win32') return;
  try {
    const fd = fs.openSync(dirPath, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Non supporté sur certains FS
  }
}

export function isValidBackupFilename(filename: string): boolean {
  if (!filename || filename.length > 128) return false;
  if (
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('\0') ||
    filename.includes('..') ||
    /\s/.test(filename)
  ) {
    return false;
  }
  return BACKUP_FILENAME_RE.test(filename);
}

export function resolveSafeBackupPath(filename: string): { safeName: string; fullPath: string } {
  if (!isValidBackupFilename(filename)) {
    throw new BusinessError('BACKUP_ERROR', 'Nom de fichier de sauvegarde non autorisé.', 400);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const canonicalDir = fs.realpathSync(BACKUP_DIR);
  const candidate = path.join(canonicalDir, filename);

  let lstat: fs.Stats;
  try {
    lstat = fs.lstatSync(candidate);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new BusinessError('BACKUP_ERROR', 'Fichier de sauvegarde introuvable.', 404);
    }
    throw new BusinessError('BACKUP_ERROR', 'Accès sauvegarde refusé.', 400);
  }

  if (lstat.isSymbolicLink()) {
    throw new BusinessError(
      'BACKUP_ERROR',
      'Lien symbolique interdit dans le répertoire de sauvegarde.',
      400
    );
  }
  if (!lstat.isFile()) {
    throw new BusinessError(
      'BACKUP_ERROR',
      "L'entrée de sauvegarde ciblée n'est pas un fichier régulier.",
      400
    );
  }

  const canonicalFile = fs.realpathSync(candidate);
  if (path.dirname(canonicalFile) !== canonicalDir) {
    throw new BusinessError(
      'BACKUP_ERROR',
      'Accès à un fichier hors du répertoire de sauvegarde interdit.',
      400
    );
  }
  return { safeName: filename, fullPath: canonicalFile };
}

function validateSqliteArchiveHeader(filePath: string): void {
  const lstat = fs.lstatSync(filePath);
  if (lstat.isSymbolicLink() || !lstat.isFile()) {
    throw new BusinessError(
      'BACKUP_ERROR',
      "L'archive doit être un fichier régulier non symbolique.",
      400
    );
  }
  if (lstat.size < 100) {
    throw new BusinessError(
      'BACKUP_ERROR',
      'Archive SQLite invalide ou tronquée (taille insuffisante).',
      400
    );
  }
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, header, 0, 16, 0);
    if (bytesRead >= 8 && header.subarray(0, 8).equals(ENCRYPTED_BACKUP_MAGIC)) {
      throw new BusinessError(
        'BACKUP_ERROR',
        'Archive chiffrée (.dpbkp) : fournissez la clé de déchiffrement.',
        400
      );
    }
    if (bytesRead < 16 || !header.equals(SQLITE_HEADER_MAGIC)) {
      throw new BusinessError(
        'BACKUP_ERROR',
        'Archive invalide : en-tête SQLite format 3 absent ou fichier corrompu.',
        400
      );
    }
  } finally {
    fs.closeSync(fd);
  }
}

export function openBackupReadOnly(filePath: string): DatabaseSync {
  validateSqliteArchiveHeader(filePath);
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(filePath, { readOnly: true });
    db.exec('PRAGMA query_only = ON;');
    return db;
  } catch (err) {
    if (db) {
      try {
        db.close();
      } catch {
        // Ignore
      }
    }
    if (err instanceof BusinessError) throw err;
    throw new BusinessError(
      'BACKUP_ERROR',
      `Impossible d'ouvrir l'archive en lecture seule : ${err instanceof Error ? err.message : String(err)}`,
      400
    );
  }
}

function tableHasColumnRo(db: DatabaseSync, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

export function collectEntityCounts(db: DatabaseSync): BackupEntityCounts {
  const count = (table: string): number =>
    Number((db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c);
  return {
    products: count('products'),
    stockMovements: count('stock_movements'),
    clients: count('clients'),
    suppliers: count('suppliers'),
    sales: count('sales'),
    salesReturns: count('sales_returns'),
    customerReceivables: count('customer_receivables'),
    purchaseOrders: count('purchase_orders'),
    purchaseReceipts: count('purchase_receipts'),
    supplierDebts: count('supplier_debts'),
    returnableStockMovements: count('returnable_stock_movements'),
    cashMovements: count('cash_movements'),
    expenses: count('expenses'),
    auditLogs: count('audit_logs'),
  };
}

export function verifyBackupPathReadOnly(filePath: string, displayName: string) {
  const sha256 = computeFileSha256(filePath);
  const testDb = openBackupReadOnly(filePath);
  try {
    let integrityRows: Array<{ integrity_check: string }>;
    try {
      integrityRows = testDb.prepare('PRAGMA integrity_check').all() as Array<{
        integrity_check: string;
      }>;
    } catch (err) {
      throw new BusinessError(
        'BACKUP_ERROR',
        `Archive SQLite corrompue ou illisible : ${err instanceof Error ? err.message : String(err)}`,
        400
      );
    }

    const integrity =
      integrityRows.length === 0
        ? 'empty'
        : integrityRows.length === 1
          ? integrityRows[0].integrity_check
          : integrityRows.map((r) => r.integrity_check).join('; ');

    let foreignKeyErrors = 0;
    if (integrity === 'ok') {
      try {
        foreignKeyErrors = testDb.prepare('PRAGMA foreign_key_check').all().length;
      } catch (err) {
        throw new BusinessError(
          'BACKUP_ERROR',
          `Contrôle des clés étrangères impossible : ${err instanceof Error ? err.message : String(err)}`,
          400
        );
      }
    }

    const tables = (
      testDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    const tableSet = new Set(tables);
    const missingTables = REQUIRED_CORE_TABLES.filter((t) => !tableSet.has(t));

    let appliedVersions: number[] = [];
    if (integrity === 'ok' && tableSet.has('schema_version')) {
      appliedVersions = (
        testDb.prepare('SELECT version FROM schema_version ORDER BY version ASC').all() as Array<{
          version: number;
        }>
      ).map((r) => Number(r.version));
    }

    const schemaVersion = appliedVersions.length > 0 ? Math.max(...appliedVersions) : 0;

    let compatibilityReason: string | null = null;
    if (integrity !== 'ok') {
      compatibilityReason = `Échec du contrôle d'intégrité SQLite : ${integrity}`;
    } else if (foreignKeyErrors > 0) {
      compatibilityReason = `Violations de clés étrangères détectées (${foreignKeyErrors}).`;
    } else if (missingTables.length > 0) {
      compatibilityReason = `Format d'archive incompatible : table(s) DEPOTPRO manquante(s) (${missingTables.join(', ')}).`;
    } else if (appliedVersions.length === 0 || schemaVersion < MIN_SUPPORTED_SCHEMA_VERSION) {
      compatibilityReason = 'Version de schéma absente ou invalide dans schema_version.';
    } else if (schemaVersion > CURRENT_SCHEMA_VERSION) {
      compatibilityReason = `Version de schéma incompatible (v${schemaVersion} > v${CURRENT_SCHEMA_VERSION}) : mise à jour de l'application requise.`;
    } else if (appliedVersions.some((v) => v < 1)) {
      compatibilityReason = 'Entrée de migration invalide (< 1) dans schema_version.';
    } else if (appliedVersions.includes(2) && !tableHasColumnRo(testDb, 'app_settings', 'logo_path')) {
      compatibilityReason = 'Incohérence de migration v2 : colonne app_settings.logo_path absente.';
    } else if (appliedVersions.includes(3) && !tableHasColumnRo(testDb, 'expenses', 'receipt_path')) {
      compatibilityReason = 'Incohérence de migration v3 : colonne expenses.receipt_path absente.';
    } else if (
      appliedVersions.includes(4) &&
      !tableHasColumnRo(testDb, 'app_settings', 'setup_completed')
    ) {
      compatibilityReason =
        'Incohérence de migration v4 : colonne app_settings.setup_completed absente.';
    } else if (
      appliedVersions.includes(5) &&
      (!tableSet.has('users') || !tableHasColumnRo(testDb, 'audit_logs', 'actor_user_id'))
    ) {
      compatibilityReason =
        'Incohérence de migration v5 : table users ou colonne audit_logs.actor_user_id absente.';
    }

    const compatible = compatibilityReason === null;
    const counts = compatible ? collectEntityCounts(testDb) : null;

    return {
      name: displayName,
      integrity,
      foreignKeyErrors,
      schemaVersion,
      appliedVersions,
      backupFormat: BACKUP_FORMAT_V3,
      minAppVersion: MIN_APP_VERSION,
      compatible,
      compatibilityReason,
      sha256,
      counts,
    };
  } finally {
    testDb.close();
  }
}

function pruneOldBackups(keepCount = MAX_RETAINED_BACKUPS) {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => isValidBackupFilename(f))
    .map((f) => {
      const fullPath = path.join(BACKUP_DIR, f);
      try {
        const lstat = fs.lstatSync(fullPath);
        if (lstat.isSymbolicLink() || !lstat.isFile()) return null;
        return { name: f, fullPath, mtime: lstat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((item): item is { name: string; fullPath: string; mtime: number } => item !== null)
    .sort((a, b) => b.mtime - a.mtime);

  for (const obsolete of files.slice(keepCount)) {
    try {
      fs.unlinkSync(obsolete.fullPath);
    } catch {
      // Ignorer si le fichier est verrouillé
    }
  }
}

export async function createBackup() {
  requireCurrentActorPermission('backups:create');
  return createPlainBackupInternal();
}

async function createPlainBackupInternal() {
  return runSerialized((db) => {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const uid = crypto.randomBytes(3).toString('hex');
    const filename = `depotpro_backup_${ts}_${uid}.db`;
    const dest = path.join(BACKUP_DIR, filename);

    // VACUUM INTO ne peut pas s'exécuter dans une transaction SQLite active,
    // il est sérialisé sur writeQueue et inclut toutes les écritures WAL validées.
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    const escapedDest = dest.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedDest}';`);
    fsyncFileSync(dest);

    let check;
    try {
      check = verifyBackupPathReadOnly(dest, filename);
      if (!check.compatible || check.integrity !== 'ok' || check.foreignKeyErrors > 0) {
        throw new BusinessError(
          'BACKUP_ERROR',
          check.compatibilityReason || "La sauvegarde a échoué au contrôle d'intégrité."
        );
      }
    } catch (err) {
      if (fs.existsSync(dest)) {
        try {
          fs.unlinkSync(dest);
        } catch {
          // Ignore
        }
      }
      throw err;
    }

    auditLog(
      db,
      'CREATE_BACKUP',
      'backups',
      filename,
      `Sauvegarde cohérente créée et vérifiée : ${filename} (sha256=${check.sha256.slice(0, 12)})`
    );
    pruneOldBackups();
    const stat = fs.statSync(dest);
    return {
      name: filename,
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
      integrity: 'ok',
      sha256: check.sha256,
      encrypted: false,
    };
  });
}

export function listBackups() {
  requireCurrentActorPermission('backups:read');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => isValidBackupFilename(f))
    .map((f) => {
      const fullPath = path.join(BACKUP_DIR, f);
      try {
        const lstat = fs.lstatSync(fullPath);
        if (lstat.isSymbolicLink() || !lstat.isFile()) return null;
        return {
          name: f,
          size: lstat.size,
          createdAt: lstat.mtime.toISOString(),
          sha256: computeFileSha256(fullPath),
          encrypted: f.endsWith('.dpbkp'),
        };
      } catch {
        return null;
      }
    })
    .filter(
      (item): item is { name: string; size: number; createdAt: string; sha256: string; encrypted: boolean } =>
        item !== null
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function readBackupFile(filename: string): { safeName: string; fullPath: string } {
  requireCurrentActorPermission('backups:read');
  return resolveSafeBackupPath(filename);
}

export function verifyBackup(filename: string) {
  requireCurrentActorPermission('backups:read');
  const { safeName, fullPath } = resolveSafeBackupPath(filename);
  return verifyBackupPathReadOnly(fullPath, safeName);
}

function removeSqliteSidecars(dbPath: string): void {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const sidecar = `${dbPath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      fs.unlinkSync(sidecar);
    }
  }
}

export async function restoreBackup(
  filename: string,
  options?: { testSimulateFailure?: RestoreFailureHook }
) {
  requireCurrentActorPermission('backups:restore');
  // 1. Validation chemin + vérification en lecture seule de la sauvegarde source
  const { safeName, fullPath: srcPath } = resolveSafeBackupPath(filename);
  return restoreFromPlainPath(srcPath, safeName, options);
}

async function restoreFromPlainPath(
  srcPath: string,
  displayName: string,
  options?: { testSimulateFailure?: RestoreFailureHook }
) {
  const safeName = displayName;
  const check = verifyBackupPathReadOnly(srcPath, safeName);
  if (!check.compatible || check.integrity !== 'ok' || check.foreignKeyErrors > 0) {
    throw new BusinessError(
      'BACKUP_ERROR',
      check.compatibilityReason || 'Sauvegarde corrompue ou incompatible : restauration refusée.',
      400
    );
  }

  // 2. Sauvegarde de sécurité de la base courante + 3. Vérification en lecture seule
  const safetyBackup = await createPlainBackupInternal();
  const { fullPath: safetyPath } = resolveSafeBackupPath(safetyBackup.name);
  const safetyCheck = verifyBackupPathReadOnly(safetyPath, safetyBackup.name);
  if (!safetyCheck.compatible || safetyCheck.integrity !== 'ok' || safetyCheck.foreignKeyErrors > 0) {
    throw new BusinessError(
      'BACKUP_ERROR',
      'La sauvegarde de sécurité préalable a échoué au contrôle d’intégrité.',
      500
    );
  }

  // 5. Copie dans un fichier temporaire sur le même système de fichiers + 6. Vérification + 7. Fsync
  const destDir = path.dirname(DB_PATH);
  fs.mkdirSync(destDir, { recursive: true });
  const uid = crypto.randomBytes(4).toString('hex');
  const stagingPath = path.join(destDir, `.depotpro_restore_tmp_${uid}.db`);
  const rollbackPath = path.join(destDir, `.depotpro_restore_prev_${uid}.db`);

  fs.copyFileSync(srcPath, stagingPath);
  fsyncFileSync(stagingPath);

  let stagedCheck;
  try {
    stagedCheck = verifyBackupPathReadOnly(stagingPath, safeName);
    if (
      !stagedCheck.compatible ||
      stagedCheck.integrity !== 'ok' ||
      stagedCheck.foreignKeyErrors > 0 ||
      stagedCheck.sha256 !== check.sha256
    ) {
      throw new BusinessError(
        'BACKUP_ERROR',
        'Le fichier temporaire restauré est incohérent ou corrompu.',
        500
      );
    }
  } catch (err) {
    if (fs.existsSync(stagingPath)) {
      try {
        fs.unlinkSync(stagingPath);
      } catch {
        // Ignore
      }
    }
    throw err;
  }

  // 4 -> 11 sérialisés sur writeQueue avec récupération automatique en cas d'échec
  return runSerialized((db) => {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {
      // Ignorer si déjà checkpointé
    }

    // 4. Fermeture propre de la connexion active
    closeDb();

    try {
      removeSqliteSidecars(DB_PATH);

      if (options?.testSimulateFailure === 'before_atomic_replace') {
        throw new BusinessError(
          'BACKUP_ERROR',
          'Interruption simulée avant remplacement atomique.',
          500
        );
      }

      if (fs.existsSync(DB_PATH)) {
        fs.renameSync(DB_PATH, rollbackPath);
      }

      // 8. Remplacement atomique sur le même système de fichiers + sync
      fs.renameSync(stagingPath, DB_PATH);
      fsyncFileSync(DB_PATH);
      fsyncDirBestEffort(destDir);

      if (options?.testSimulateFailure === 'before_reconnect') {
        throw new BusinessError(
          'BACKUP_ERROR',
          'Échec simulé de reconnexion SQLite après remplacement.',
          500
        );
      }

      // 9. Reconnecter SQLite (exécute les PRAGMA et migrations v1..v3 -> v4 si nécessaire)
      const restoredDb = reloadDb();

      // 10. Vérification complète post-restauration
      const integrityRows = restoredDb.prepare('PRAGMA integrity_check').all() as Array<{
        integrity_check: string;
      }>;
      const integrity =
        integrityRows.length === 1
          ? integrityRows[0].integrity_check
          : integrityRows.map((r) => r.integrity_check).join('; ');
      const fkErrors = restoredDb.prepare('PRAGMA foreign_key_check').all().length;
      if (integrity !== 'ok' || fkErrors > 0) {
        throw new BusinessError(
          'BACKUP_ERROR',
          `Vérification post-restauration échouée (integrity=${integrity}, fk=${fkErrors}).`,
          500
        );
      }

      if (options?.testSimulateFailure === 'after_reconnect_post_verify') {
        throw new BusinessError(
          'BACKUP_ERROR',
          'Échec simulé de vérification post-restauration.',
          500
        );
      }

      const schemaRow = restoredDb
        .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version')
        .get() as { v: number };

      restoredDb.exec('BEGIN IMMEDIATE;');
      try {
        auditLog(
          restoredDb,
          'RESTORE_BACKUP',
          'backups',
          safeName,
          `Base restaurée depuis ${safeName} (sauvegarde sécurité : ${safetyBackup.name})`
        );
        restoredDb.exec('COMMIT;');
      } catch (auditErr) {
        try {
          restoredDb.exec('ROLLBACK;');
        } catch {
          // Ignore
        }
        throw auditErr;
      }

      const counts = collectEntityCounts(restoredDb);

      if (fs.existsSync(rollbackPath)) {
        fs.unlinkSync(rollbackPath);
      }

      return {
        restored: safeName,
        safetyBackup: safetyBackup.name,
        restoredSha256: stagedCheck.sha256,
        integrity,
        foreignKeyErrors: fkErrors,
        schemaVersion: Number(schemaRow.v),
        counts,
      };
    } catch (err) {
      // Récupération garantie : rétablir l'ancienne base et rouvrir le pool SQLite
      try {
        closeDb();
      } catch {
        // Ignore
      }
      if (fs.existsSync(stagingPath)) {
        try {
          fs.unlinkSync(stagingPath);
        } catch {
          // Ignore
        }
      }
      removeSqliteSidecars(DB_PATH);
      if (fs.existsSync(rollbackPath)) {
        if (fs.existsSync(DB_PATH)) {
          try {
            fs.unlinkSync(DB_PATH);
          } catch {
            // Ignore
          }
        }
        fs.renameSync(rollbackPath, DB_PATH);
      } else if (!fs.existsSync(DB_PATH) && fs.existsSync(safetyPath)) {
        fs.copyFileSync(safetyPath, DB_PATH);
      }
      fsyncDirBestEffort(destDir);
      reloadDb();
      throw err;
    }
  });
}

function validateBackupPassphrase(passphrase: string): void {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_BACKUP_PASSPHRASE_LEN) {
    throw new BusinessError(
      'VALIDATION_ERROR',
      `La clé de chiffrement doit contenir au moins ${MIN_BACKUP_PASSPHRASE_LEN} caractères.`
    );
  }
}

export function encryptBackupBuffer(plaintext: Buffer, passphrase: string): Buffer {
  validateBackupPassphrase(passphrase);
  const salt = crypto.randomBytes(16);
  const nonce = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(passphrase, salt, ENCRYPTED_PBKDF2_ITERATIONS, 32, 'sha256');
  const plaintextSha256 = crypto.createHash('sha256').update(plaintext).digest('hex');

  const headerObj = {
    v: ENCRYPTED_BACKUP_VERSION,
    cipher: 'aes-256-gcm',
    kdf: 'pbkdf2-hmac-sha256',
    iterations: ENCRYPTED_PBKDF2_ITERATIONS,
    saltB64: salt.toString('base64'),
    nonceB64: nonce.toString('base64'),
    plaintextSha256,
  };
  const headerBuf = Buffer.from(JSON.stringify(headerObj), 'utf8');
  const verBuf = Buffer.allocUnsafe(2);
  verBuf.writeUInt16LE(ENCRYPTED_BACKUP_VERSION, 0);
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32LE(headerBuf.length, 0);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(headerBuf);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([ENCRYPTED_BACKUP_MAGIC, verBuf, lenBuf, headerBuf, ciphertext, tag]);
}

export function decryptBackupBuffer(
  blob: Buffer,
  passphrase: string
): { plaintext: Buffer; plaintextSha256: string } {
  validateBackupPassphrase(passphrase);
  if (blob.length < 14 + 16 || !blob.subarray(0, 8).equals(ENCRYPTED_BACKUP_MAGIC)) {
    throw new BusinessError(
      'BACKUP_ERROR',
      'Enveloppe de sauvegarde chiffrée invalide (magique DPBKP01 absent).',
      400
    );
  }
  const ver = blob.readUInt16LE(8);
  if (ver !== ENCRYPTED_BACKUP_VERSION) {
    throw new BusinessError('BACKUP_ERROR', `Version d'enveloppe chiffrée non supportée : ${ver}.`, 400);
  }
  const headerLen = blob.readUInt32LE(10);
  if (headerLen === 0 || 14 + headerLen + 16 > blob.length) {
    throw new BusinessError('BACKUP_ERROR', "En-tête d'enveloppe chiffrée corrompu ou tronqué.", 400);
  }
  const headerBuf = blob.subarray(14, 14 + headerLen);
  const ciphertextAndTag = blob.subarray(14 + headerLen);
  if (ciphertextAndTag.length < 16) {
    throw new BusinessError('BACKUP_ERROR', 'Charge utile chiffrée tronquée.', 400);
  }
  const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);
  const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);

  let header: {
    v: number;
    cipher: string;
    kdf: string;
    iterations: number;
    saltB64: string;
    nonceB64: string;
    plaintextSha256: string;
  };
  try {
    header = JSON.parse(headerBuf.toString('utf8'));
  } catch {
    throw new BusinessError('BACKUP_ERROR', 'Métadonnées de sauvegarde chiffrée invalides.', 400);
  }

  if (
    header.cipher !== 'aes-256-gcm' ||
    header.kdf !== 'pbkdf2-hmac-sha256' ||
    !Number.isInteger(header.iterations) ||
    header.iterations < 10_000
  ) {
    throw new BusinessError('BACKUP_ERROR', 'Algorithme de chiffrement non supporté.', 400);
  }

  const salt = Buffer.from(header.saltB64 || '', 'base64');
  const nonce = Buffer.from(header.nonceB64 || '', 'base64');
  if (nonce.length !== 12 || salt.length < 8) {
    throw new BusinessError('BACKUP_ERROR', 'Paramètres cryptographiques invalides.', 400);
  }

  const key = crypto.pbkdf2Sync(passphrase, salt, header.iterations, 32, 'sha256');
  let plaintext: Buffer;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(headerBuf);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new BusinessError(
      'UNAUTHORIZED',
      'Clé de déchiffrement invalide ou archive chiffrée altérée.',
      401
    );
  }

  const actualSha = crypto.createHash('sha256').update(plaintext).digest('hex');
  if (actualSha !== header.plaintextSha256) {
    throw new BusinessError('BACKUP_ERROR', 'Empreinte SHA-256 post-déchiffrement incohérente.', 400);
  }
  return { plaintext, plaintextSha256: actualSha };
}

export async function createEncryptedBackup(passphrase: string) {
  requireCurrentActorPermission('backups:create');
  validateBackupPassphrase(passphrase);
  return runSerialized((db) => {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const uid = crypto.randomBytes(3).toString('hex');
    const encFilename = `depotpro_backup_${ts}_${uid}.dpbkp`;
    const encDest = path.join(BACKUP_DIR, encFilename);
    const tempPlain = path.join(BACKUP_DIR, `.depotpro_enc_stage_${crypto.randomBytes(6).toString('hex')}.db`);

    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      const escapedTemp = tempPlain.replace(/'/g, "''");
      db.exec(`VACUUM INTO '${escapedTemp}';`);
      fsyncFileSync(tempPlain);

      const check = verifyBackupPathReadOnly(tempPlain, encFilename);
      if (!check.compatible || check.integrity !== 'ok' || check.foreignKeyErrors > 0) {
        throw new BusinessError(
          'BACKUP_ERROR',
          check.compatibilityReason || "La sauvegarde a échoué au contrôle d'intégrité."
        );
      }

      const plainBytes = fs.readFileSync(tempPlain);
      const encryptedBlob = encryptBackupBuffer(plainBytes, passphrase);
      fs.writeFileSync(encDest, encryptedBlob, { mode: 0o600 });
      fsyncFileSync(encDest);
      fsyncDirBestEffort(BACKUP_DIR);

      const archiveSha = computeFileSha256(encDest);
      auditLog(
        db,
        'CREATE_ENCRYPTED_BACKUP',
        'backups',
        encFilename,
        `Sauvegarde chiffrée AES-256-GCM créée : ${encFilename} (sha256=${archiveSha.slice(0, 12)})`
      );
      pruneOldBackups();
      const stat = fs.statSync(encDest);
      return {
        name: encFilename,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
        integrity: 'ok',
        sha256: archiveSha,
        encrypted: true,
      };
    } finally {
      if (fs.existsSync(tempPlain)) {
        try {
          fs.unlinkSync(tempPlain);
        } catch {
          // Ignore
        }
      }
      removeSqliteSidecars(tempPlain);
    }
  });
}

export function verifyEncryptedBackup(filename: string, passphrase: string) {
  requireCurrentActorPermission('backups:read');
  const { safeName, fullPath } = resolveSafeBackupPath(filename);
  const blob = fs.readFileSync(fullPath);
  const { plaintext } = decryptBackupBuffer(blob, passphrase);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depotpro-dec-verify-'));
  const tempPlain = path.join(tempDir, 'archive.db');
  try {
    fs.writeFileSync(tempPlain, plaintext, { mode: 0o600 });
    return verifyBackupPathReadOnly(tempPlain, safeName);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function restoreEncryptedBackup(
  filename: string,
  passphrase: string,
  options?: { testSimulateFailure?: RestoreFailureHook }
) {
  requireCurrentActorPermission('backups:restore');
  const { safeName, fullPath } = resolveSafeBackupPath(filename);
  const blob = fs.readFileSync(fullPath);
  const { plaintext } = decryptBackupBuffer(blob, passphrase);

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const tempPlain = path.join(
    BACKUP_DIR,
    `.depotpro_restore_dec_${crypto.randomBytes(6).toString('hex')}.db`
  );
  try {
    fs.writeFileSync(tempPlain, plaintext, { mode: 0o600 });
    fsyncFileSync(tempPlain);
    return await restoreFromPlainPath(tempPlain, safeName, options);
  } finally {
    if (fs.existsSync(tempPlain)) {
      try {
        fs.unlinkSync(tempPlain);
      } catch {
        // Ignore
      }
    }
    removeSqliteSidecars(tempPlain);
  }
}
