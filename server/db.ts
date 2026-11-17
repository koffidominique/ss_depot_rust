import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BusinessError,
  checkedAddMoney,
  checkedSubMoney,
  fcfa,
} from './domain.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations', 'sqlite');
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;
export const CURRENT_SCHEMA_VERSION = 4;

export const DB_PATH = process.env.DEPOTPRO_DB_PATH
  ? path.resolve(process.env.DEPOTPRO_DB_PATH)
  : path.resolve(process.cwd(), 'data', 'depotpro_v3.db');
export const DATA_DIR = path.dirname(DB_PATH);
export const BACKUP_DIR = process.env.DEPOTPRO_BACKUP_DIR
  ? path.resolve(process.env.DEPOTPRO_BACKUP_DIR)
  : path.join(DATA_DIR, 'Sauvegardes');

export interface SqlMigrationDef {
  version: number;
  name: string;
  sql: string;
}

export interface MigrationRunResult {
  appliedVersions: number[];
  latestVersion: number;
  skippedLegacyColumnsFor: number[];
}

export interface SchemaColumnSnapshot {
  name: string;
  colType: string;
  notnull: number;
  pk: number;
}

export interface SchemaTableSnapshot {
  name: string;
  columns: SchemaColumnSnapshot[];
}

export interface SchemaIndexSnapshot {
  name: string;
  tableName: string;
}

export interface SchemaSnapshot {
  tables: SchemaTableSnapshot[];
  indexes: SchemaIndexSnapshot[];
  schemaVersions: Array<{ version: number; name: string }>;
}

let dbInstance: DatabaseSync | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

function getBusyTimeoutMs(): number {
  const raw = Number(process.env.DEPOTPRO_BUSY_TIMEOUT_MS);
  if (Number.isInteger(raw) && raw >= 1 && raw <= 60_000) {
    return raw;
  }
  return 5000;
}

export function isSqliteBusyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const rec = err as { code?: unknown; errcode?: unknown; message?: unknown };
  if (
    rec.code === 'SQLITE_BUSY' ||
    rec.errcode === 5 ||
    rec.errcode === 261 ||
    rec.errcode === 517
  ) {
    return true;
  }
  const msg = typeof rec.message === 'string' ? rec.message.toLowerCase() : '';
  return (
    msg.includes('database is locked') ||
    msg.includes('database table is locked') ||
    msg.includes('sqlite_busy')
  );
}

export function configurePragmas(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = FULL;');
  db.exec(`PRAGMA busy_timeout = ${getBusyTimeoutMs()};`);
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : '';

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        current += ch;
      }
      continue;
    }

    if (inSingleQuote) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i += 1;
      } else if (ch === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (ch === '-' && next === '-') {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      continue;
    }

    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0 && !trimmed.toUpperCase().startsWith('PRAGMA ')) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += ch;
  }

  const trailing = current.trim();
  if (trailing.length > 0 && !trailing.toUpperCase().startsWith('PRAGMA ')) {
    statements.push(trailing);
  }
  return statements;
}

export function loadMigrations(migrationsDir = DEFAULT_MIGRATIONS_DIR): SqlMigrationDef[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Répertoire des migrations SQLite introuvable : ${migrationsDir}`);
  }
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const parsed: SqlMigrationDef[] = [];
  const seenVersions = new Set<number>();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.sql')) continue;
    const match = /^(\d+)_([a-zA-Z0-9_]+)\.sql$/.exec(entry.name);
    if (!match) {
      throw new Error(`Nom de fichier de migration invalide : ${entry.name}`);
    }
    const version = Number(match[1]);
    if (!Number.isInteger(version) || version <= 0) {
      throw new Error(`Numéro de version de migration invalide : ${entry.name}`);
    }
    if (seenVersions.has(version)) {
      throw new Error(`Version de migration en doublon détectée : ${version}`);
    }
    seenVersions.add(version);
    const name = entry.name.replace(/\.sql$/, '');
    const sql = fs.readFileSync(path.join(migrationsDir, entry.name), 'utf8');
    parsed.push({ version, name, sql });
  }

  parsed.sort((a, b) => a.version - b.version);
  return parsed;
}

function tableExists(db: DatabaseSync, tableName: string): boolean {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { c: number };
  return row.c > 0;
}

function columnExists(db: DatabaseSync, tableName: string, columnName: string): boolean {
  if (!tableExists(db, tableName)) return false;
  const cols = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === columnName);
}

/**
 * Compatibilité avec les bases V3 existantes :
 * Certaines bases peuvent déjà disposer de `logo_path`, `receipt_path` ou `setup_completed`
 * sans entrée correspondante dans `schema_version`. On reconnaît la colonne existante sans
 * rejouer l'ALTER TABLE, tout en enregistrant proprement la version de migration.
 */
function shouldSkipSqlBecauseColumnAlreadyExists(db: DatabaseSync, migration: SqlMigrationDef): boolean {
  if (migration.version === 2 || migration.name === '0002_app_settings_logo_path') {
    return columnExists(db, 'app_settings', 'logo_path');
  }
  if (migration.version === 3 || migration.name === '0003_expense_receipt_path') {
    return columnExists(db, 'expenses', 'receipt_path');
  }
  if (migration.version === 4 || migration.name === '0004_onboarding_setup_state') {
    return columnExists(db, 'app_settings', 'setup_completed');
  }
  return false;
}

export function applyMigrations(
  db: DatabaseSync,
  migrations: SqlMigrationDef[] = loadMigrations(),
  options?: { onBeforeCommitMigration?: (version: number) => void }
): MigrationRunResult {
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const appliedSet = new Set<number>();

  if (tableExists(db, 'schema_version')) {
    const rows = db.prepare('SELECT version FROM schema_version ORDER BY version ASC').all() as Array<{
      version: number;
    }>;
    for (const r of rows) {
      appliedSet.add(Number(r.version));
    }
  }

  const pending = ordered.filter((m) => !appliedSet.has(m.version));
  if (pending.length === 0) {
    const latestVersion = appliedSet.size > 0 ? Math.max(...appliedSet) : 0;
    return {
      appliedVersions: [],
      latestVersion,
      skippedLegacyColumnsFor: [],
    };
  }

  const newlyApplied: number[] = [];
  const skippedLegacyColumnsFor: number[] = [];

  for (const migration of pending) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      const skipSql = shouldSkipSqlBecauseColumnAlreadyExists(db, migration);
      if (skipSql) {
        skippedLegacyColumnsFor.push(migration.version);
      } else {
        const statements = splitSqlStatements(migration.sql);
        for (const stmt of statements) {
          db.exec(stmt);
        }
      }

      options?.onBeforeCommitMigration?.(migration.version);

      db.prepare(
        'INSERT INTO schema_version (version, name) VALUES (?, ?) ON CONFLICT(version) DO NOTHING'
      ).run(migration.version, migration.name);

      db.exec('COMMIT;');
      newlyApplied.push(migration.version);
      appliedSet.add(migration.version);
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback failure
      }
      throw err;
    }
  }

  const latestVersion = appliedSet.size > 0 ? Math.max(...appliedSet) : 0;
  return {
    appliedVersions: newlyApplied,
    latestVersion,
    skippedLegacyColumnsFor,
  };
}

export function verifyDbIntegrity(targetDb?: DatabaseSync): {
  integrity: string;
  foreignKeyErrors: number;
} {
  const db = targetDb ?? getDb();
  const integrityRow = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
  const fkRows = db.prepare('PRAGMA foreign_key_check').all();
  return {
    integrity: integrityRow.integrity_check,
    foreignKeyErrors: fkRows.length,
  };
}

function assertDbIntegrity(db: DatabaseSync): void {
  const check = verifyDbIntegrity(db);
  if (check.integrity !== 'ok') {
    throw new Error(`Échec contrôle intégrité SQLite : ${check.integrity}`);
  }
  if (check.foreignKeyErrors > 0) {
    throw new Error(
      `Violations de clés étrangères détectées au démarrage (${check.foreignKeyErrors} erreur(s)).`
    );
  }
}

/**
 * Initialise uniquement les paramètres applicatifs neutres nécessaires au premier démarrage
 * (sans aucune donnée commerciale fictive : aucun fournisseur, produit, stock ni client).
 */
export function ensureNeutralDefaults(db: DatabaseSync): void {
  const settingsCountPre = (db.prepare('SELECT COUNT(*) as c FROM app_settings').get() as { c: number }).c;
  const methodsCountPre = (db.prepare('SELECT COUNT(*) as c FROM payment_methods').get() as { c: number }).c;
  const expCatCountPre = (db.prepare('SELECT COUNT(*) as c FROM expense_categories').get() as { c: number }).c;
  const catCountPre = (db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number }).c;

  if (settingsCountPre > 0 && methodsCountPre > 0 && expCatCountPre > 0 && catCountPre > 0) {
    return;
  }

  db.exec('BEGIN IMMEDIATE;');
  try {
    const settingsCount = (db.prepare('SELECT COUNT(*) as c FROM app_settings').get() as { c: number }).c;
    if (settingsCount === 0) {
      db.prepare(
        `INSERT OR IGNORE INTO app_settings (
           id, company_name, company_legal_name, address, phone, email, city, country, currency, setup_completed
         ) VALUES (1, 'Mon Dépôt', NULL, NULL, NULL, NULL, NULL, NULL, 'FCFA', 0)`
      ).run();
    }

    const methodsCount = (db.prepare('SELECT COUNT(*) as c FROM payment_methods').get() as { c: number }).c;
    if (methodsCount === 0) {
      const insertMethod = db.prepare(
        'INSERT OR IGNORE INTO payment_methods (code, label, is_cash, active) VALUES (?, ?, ?, 1)'
      );
      insertMethod.run('cash', 'Espèces', 1);
      insertMethod.run('wave', 'Wave Mobile Money', 0);
      insertMethod.run('orange_money', 'Orange Money', 0);
      insertMethod.run('mtn_money', 'MTN MoMo', 0);
      insertMethod.run('transfer', 'Virement bancaire', 0);
    }

    const expCatCount = (db.prepare('SELECT COUNT(*) as c FROM expense_categories').get() as { c: number }).c;
    if (expCatCount === 0) {
      const insertExp = db.prepare('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)');
      for (const c of [
        'Carburant & Livraison',
        'Électricité & Eau',
        'Maintenance & Réparation',
        'Manutention',
        'Fournitures',
        'Divers',
      ]) {
        insertExp.run(c);
      }
    }

    const catCount = (db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number }).c;
    if (catCount === 0) {
      const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)');
      insertCat.run('Bières', 'Bières en bouteille, canette ou casier');
      insertCat.run('Boissons gazeuses', 'Sodas et boissons gazeuses');
      insertCat.run('Eaux minérales', 'Eaux plates et gazeuses');
      insertCat.run('Jus & Énergisants', 'Jus de fruits, nectars et boissons énergisantes');
    }

    db.exec('COMMIT;');
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore rollback failure
    }
    throw err;
  }
}

export function extractSchemaSnapshot(db: DatabaseSync): SchemaSnapshot {
  const tableRows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
    )
    .all() as Array<{ name: string }>;

  const tables: SchemaTableSnapshot[] = tableRows.map((t) => {
    const cols = db.prepare(`PRAGMA table_info(${t.name})`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    return {
      name: t.name,
      columns: cols.map((c) => ({
        name: c.name,
        colType: String(c.type || '').toUpperCase(),
        notnull: Number(c.notnull),
        pk: Number(c.pk),
      })),
    };
  });

  const indexRows = db
    .prepare(
      "SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name ASC"
    )
    .all() as Array<{ name: string; tbl_name: string }>;

  const schemaVersions = tableExists(db, 'schema_version')
    ? ((db
        .prepare('SELECT version, name FROM schema_version ORDER BY version ASC')
        .all() as Array<{ version: number; name: string }>).map((r) => ({
        version: Number(r.version),
        name: String(r.name),
      })))
    : [];

  return {
    tables,
    indexes: indexRows.map((r) => ({ name: r.name, tableName: r.tbl_name })),
    schemaVersions,
  };
}

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    dbInstance = new DatabaseSync(DB_PATH);
    configurePragmas(dbInstance);
    applyMigrations(dbInstance);
    assertDbIntegrity(dbInstance);
    ensureNeutralDefaults(dbInstance);
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

/**
 * Exécute une opération d'écriture atomique sérialisée (SQLite single-writer)
 * via BEGIN IMMEDIATE et gestion explicite des verrous SQLITE_BUSY.
 */
export async function withWriteTx<T>(fn: (db: DatabaseSync) => T): Promise<T> {
  const task = writeQueue.then(() => {
    const db = getDb();
    try {
      db.exec('BEGIN IMMEDIATE;');
    } catch (err) {
      if (isSqliteBusyError(err)) {
        throw new BusinessError(
          'DATABASE_BUSY',
          'Base de données temporairement occupée par une autre opération (SQLITE_BUSY). Réessayez dans un instant.',
          503
        );
      }
      throw err;
    }
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
      if (isSqliteBusyError(err)) {
        throw new BusinessError(
          'DATABASE_BUSY',
          'Base de données temporairement occupée par une autre opération (SQLITE_BUSY). Réessayez dans un instant.',
          503
        );
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
        CAST(COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END), 0) AS TEXT) AS total_in,
        CAST(COALESCE(SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END), 0) AS TEXT) AS total_out
       FROM cash_movements
       WHERE session_id = ? AND method_code = 'cash'`
    )
    .get(sessionId) as { total_in: string; total_out: string };
  const netIn = fcfa(row.total_in, 'Entrées espèces');
  const netOut = fcfa(row.total_out, 'Sorties espèces');
  return checkedSubMoney(checkedAddMoney(openingCash, netIn, 'Solde théorique'), netOut, 'Solde théorique');
}
