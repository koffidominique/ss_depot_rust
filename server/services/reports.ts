import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {
  BACKUP_DIR,
  DB_PATH,
  getDb,
  getTheoreticalCash,
  reloadDb,
  runSerialized,
  withWriteTx,
  auditLog,
} from '../db.ts';
import { BusinessError } from '../domain.ts';

export function getDashboardData() {
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

  const supplierDebtsAgg = db
    .prepare(
      "SELECT COALESCE(SUM(remaining_amount), 0) AS total, COUNT(*) AS count FROM supplier_debts WHERE status IN ('open', 'partial')"
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
      supplierDebtsTotal: supplierDebtsAgg.total,
      supplierDebtsCount: supplierDebtsAgg.count,
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

  const expensesTotal = (
    db.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM expenses').get() as { t: number }
  ).t;

  const paymentBreakdown = db
    .prepare(
      `SELECT pm.code, pm.label, pm.is_cash,
              COALESCE(SUM(CASE WHEN cm.direction = 'in' THEN cm.amount ELSE 0 END), 0) AS total_in,
              COALESCE(SUM(CASE WHEN cm.direction = 'out' THEN cm.amount ELSE 0 END), 0) AS total_out
       FROM payment_methods pm
       LEFT JOIN cash_movements cm ON cm.method_code = pm.code
       GROUP BY pm.code, pm.label, pm.is_cash
       ORDER BY total_in DESC`
    )
    .all();

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
}) {
  return withWriteTx((db) => {
    const cur = db.prepare('SELECT * FROM app_settings WHERE id = 1').get() as Record<string, string | number | null>;
    db.prepare(
      `UPDATE app_settings
       SET company_name = ?, company_legal_name = ?, address = ?, phone = ?, email = ?, city = ?, country = ?,
           allow_negative_stock = ?, invoice_prefix = ?, sale_prefix = ?, purchase_prefix = ?, order_prefix = ?,
           receipt_prefix = ?, credit_note_prefix = ?, theme = ?, updated_at = datetime('now')
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
      input.theme === 'dark' ? 'dark' : input.theme === 'light' ? 'light' : cur.theme
    );
    auditLog(db, 'UPDATE_SETTINGS', 'app_settings', 1, 'Mise à jour des paramètres application');
    return getSettings();
  });
}

export async function addPaymentMethod(label: string) {
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
  if (code === 'cash' && !active) {
    throw new BusinessError('VALIDATION_ERROR', 'Le moyen Espèces (cash) ne peut jamais être désactivé.');
  }
  return withWriteTx((db) => {
    db.prepare('UPDATE payment_methods SET active = ? WHERE code = ?').run(active ? 1 : 0, code);
    auditLog(db, 'TOGGLE_PAYMENT_METHOD', 'payment_methods', code, `Statut actif = ${active}`);
    return db.prepare('SELECT * FROM payment_methods WHERE code = ?').get(code);
  });
}

export async function createBackup() {
  return runSerialized((db) => {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const filename = `depotpro_backup_${ts}_${Math.random().toString(36).slice(2, 8)}.db`;
    const dest = path.join(BACKUP_DIR, filename);

    // VACUUM INTO ne peut pas s'exécuter dans une transaction SQLite active,
    // il est sérialisé sur writeQueue et inclut toutes les écritures WAL validées.
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    const escapedDest = dest.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escapedDest}';`);

    const checkDb = new DatabaseSync(dest, { readOnly: true });
    try {
      const integrity = checkDb.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      if (integrity.integrity_check !== 'ok') {
        throw new BusinessError('BACKUP_ERROR', "La sauvegarde a échoué au contrôle d'intégrité.");
      }
    } finally {
      checkDb.close();
    }

    auditLog(db, 'CREATE_BACKUP', 'backups', filename, `Sauvegarde cohérente créée : ${filename}`);
    const stat = fs.statSync(dest);
    return {
      name: filename,
      size: stat.size,
      createdAt: stat.mtime.toISOString(),
      integrity: 'ok',
    };
  });
}

export function listBackups() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db') && f.startsWith('depotpro_backup_'))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return {
        name: f,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function verifyBackup(filename: string) {
  const safeName = path.basename(filename);
  const fullPath = path.join(BACKUP_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    throw new BusinessError('BACKUP_ERROR', 'Fichier de sauvegarde introuvable.', 404);
  }
  const testDb = new DatabaseSync(fullPath, { readOnly: true });
  try {
    const integrity = testDb.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    const fk = testDb.prepare('PRAGMA foreign_key_check').all();
    const version = testDb.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number };
    return {
      name: safeName,
      integrity: integrity.integrity_check,
      foreignKeyErrors: fk.length,
      schemaVersion: version.v,
    };
  } finally {
    testDb.close();
  }
}

export async function restoreBackup(filename: string) {
  const check = verifyBackup(filename);
  if (check.integrity !== 'ok' || check.foreignKeyErrors > 0) {
    throw new BusinessError('BACKUP_ERROR', 'Sauvegarde corrompue ou incohérente : restauration refusée.');
  }
  // Pré-sauvegarde automatique de la base courante avant remplacement
  await createBackup();
  const safeName = path.basename(filename);
  const srcPath = path.join(BACKUP_DIR, safeName);

  // Fermeture propre des accès SQLite avant remplacement fichier + WAL/SHM
  const { closeDb } = await import('../db.ts');
  closeDb();
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${DB_PATH}${suffix}`)) {
      fs.unlinkSync(`${DB_PATH}${suffix}`);
    }
  }
  fs.copyFileSync(srcPath, DB_PATH);
  reloadDb();
  return { restored: safeName };
}
