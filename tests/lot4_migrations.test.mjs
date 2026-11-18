import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depotpro-lot4-test-'));
process.env.DEPOTPRO_DB_PATH = path.join(testDir, 'lot4_main.db');
process.env.DEPOTPRO_BACKUP_DIR = path.join(testDir, 'backups');

const {
  applyMigrations,
  closeDb,
  configurePragmas,
  ensureNeutralDefaults,
  extractSchemaSnapshot,
  getDb,
  loadMigrations,
  verifyDbIntegrity,
} = await import('../server/db.ts');
const { seedDemoData } = await import('../server/seedDemo.ts');

function createLegacyV3SqlWithoutOptionalCols() {
  const initialSql = fs.readFileSync(path.resolve('migrations/sqlite/0001_initial_v3.sql'), 'utf8');
  return initialSql
    .replace(/\s*logo_path TEXT NULL,/g, '')
    .replace(/\s*receipt_path TEXT NULL,/g, '');
}

function normalizeSchemaByColumnName(snapshot) {
  return {
    tables: snapshot.tables.map((t) => ({
      name: t.name,
      columns: [...t.columns].sort((a, b) => a.name.localeCompare(b.name)),
    })),
    indexes: snapshot.indexes,
    schemaVersions: snapshot.schemaVersions,
  };
}

describe('LOT 4 — Migrations versionnées, initialisation neutre et parité Node ↔ Rust', () => {
  after(() => {
    closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('Base vierge : applique les migrations séquentielles 1..4, vérifie intégrité et paramètres neutres sans données fictives', () => {
    const db = getDb();
    const integrity = verifyDbIntegrity(db);
    assert.equal(integrity.integrity, 'ok');
    assert.equal(integrity.foreignKeyErrors, 0);

    const versions = db.prepare('SELECT version, name FROM schema_version ORDER BY version ASC').all();
    assert.deepEqual(
      versions.map((r) => [Number(r.version), String(r.name)]),
      [
        [1, '0001_initial_v3'],
        [2, '0002_app_settings_logo_path'],
        [3, '0003_expense_receipt_path'],
        [4, '0004_onboarding_setup_state'],
        [5, '0005_security_roles_users'],
      ]
    );

    const settings = db.prepare('SELECT * FROM app_settings WHERE id = 1').get();
    assert.equal(settings.company_name, 'Mon Dépôt');
    assert.equal(settings.company_legal_name, null);
    assert.equal(settings.address, null);
    assert.equal(settings.phone, null);
    assert.equal(settings.email, null);
    assert.equal(settings.city, null);
    assert.equal(settings.country, null);
    assert.equal(settings.currency, 'FCFA');
    assert.equal(Number(settings.setup_completed), 0);
    assert.equal(settings.logo_path, null);

    // Aucune donnée commerciale fictive en production
    for (const tbl of [
      'suppliers',
      'products',
      'product_packagings',
      'clients',
      'client_credit_settings',
      'returnable_packaging_types',
      'returnable_stock_balances',
      'stock_movements',
      'document_sequences',
    ]) {
      const cnt = db.prepare(`SELECT COUNT(*) AS c FROM ${tbl}`).get().c;
      assert.equal(cnt, 0, `${tbl} doit être vide au démarrage production`);
    }

    // Paramètres par défaut génériques présents
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM payment_methods').get().c, 5);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM expense_categories').get().c, 6);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM categories').get().c, 4);
  });

  it('Base V3 existante & migration rejouée : idempotence stricte sans doublon ni altération des données', () => {
    const dbPath = path.join(testDir, 'existing_v3.db');
    const db = new DatabaseSync(dbPath);
    try {
      configurePragmas(db);
      const firstRun = applyMigrations(db);
      assert.deepEqual(firstRun.appliedVersions, [1, 2, 3, 4, 5]);
      ensureNeutralDefaults(db);

      db.prepare(
        "INSERT INTO suppliers (code, name, phone) VALUES ('SUP-TEST', 'Fournisseur Réel', '+22501020304')"
      ).run();

      const replay = applyMigrations(db);
      assert.deepEqual(replay.appliedVersions, []);
      assert.equal(replay.latestVersion, 5);
      ensureNeutralDefaults(db);

      const supCount = db.prepare('SELECT COUNT(*) AS c FROM suppliers').get().c;
      assert.equal(supCount, 1);
      const svCount = db.prepare('SELECT COUNT(*) AS c FROM schema_version').get().c;
      assert.equal(svCount, 5);
    } finally {
      db.close();
    }
  });

  it('Base avec colonnes déjà présentes (logo_path / receipt_path) sans entrée de migration : reconnaissance sans erreur', () => {
    const dbPath = path.join(testDir, 'cols_present_no_sv.db');
    const db = new DatabaseSync(dbPath);
    try {
      configurePragmas(db);
      const v1Sql = fs.readFileSync(path.resolve('migrations/sqlite/0001_initial_v3.sql'), 'utf8');
      db.exec(v1Sql);
      db.prepare("INSERT INTO schema_version (version, name) VALUES (1, '0001_initial_v3')").run();
      db.prepare(
        "INSERT INTO app_settings (id, company_name, logo_path) VALUES (1, 'Mon Dépôt Existant', 'data:image/png;base64,AAAA')"
      ).run();
      db.prepare("INSERT INTO payment_methods (code, label, is_cash, active) VALUES ('cash', 'Espèces', 1, 1)").run();
      db.prepare("INSERT INTO cash_sessions (reference, opening_key, status, opening_cash) VALUES ('CAI-1', 'k1', 'open', 1000)").run();
      db.prepare(
        "INSERT INTO expenses (reference, request_key, category, amount, method_code, session_id, receipt_path) VALUES ('DEP-1', 'rk-1', 'Divers', 500, 'cash', 1, 'data:image/png;base64,BBBB')"
      ).run();

      const run = applyMigrations(db);
      assert.deepEqual(run.appliedVersions, [2, 3, 4, 5]);
      assert.deepEqual(run.skippedLegacyColumnsFor, [2, 3]);

      const settings = db.prepare('SELECT company_name, logo_path, setup_completed FROM app_settings WHERE id = 1').get();
      assert.equal(settings.company_name, 'Mon Dépôt Existant');
      assert.equal(settings.logo_path, 'data:image/png;base64,AAAA');
      assert.equal(Number(settings.setup_completed), 0);

      const exp = db.prepare('SELECT receipt_path FROM expenses WHERE id = 1').get();
      assert.equal(exp.receipt_path, 'data:image/png;base64,BBBB');
    } finally {
      db.close();
    }
  });

  it('Base sans colonne requise (legacy pré-logo/pré-receipt) : ajoute les colonnes manquantes en conservant les données', () => {
    const dbPath = path.join(testDir, 'missing_cols_legacy.db');
    const db = new DatabaseSync(dbPath);
    try {
      configurePragmas(db);
      db.exec(createLegacyV3SqlWithoutOptionalCols());
      db.prepare("INSERT INTO schema_version (version, name) VALUES (1, '0001_initial_v3')").run();
      db.prepare(
        "INSERT INTO app_settings (id, company_name, phone) VALUES (1, 'Dépôt Ancien', '+22505050505')"
      ).run();
      db.prepare("INSERT INTO payment_methods (code, label, is_cash, active) VALUES ('cash', 'Espèces', 1, 1)").run();
      db.prepare("INSERT INTO cash_sessions (reference, opening_key, status, opening_cash) VALUES ('CAI-OLD', 'kold', 'open', 5000)").run();
      db.prepare(
        "INSERT INTO expenses (reference, request_key, category, amount, method_code, session_id) VALUES ('DEP-OLD', 'rk-old', 'Divers', 1500, 'cash', 1)"
      ).run();

      const run = applyMigrations(db);
      assert.deepEqual(run.appliedVersions, [2, 3, 4, 5]);
      assert.deepEqual(run.skippedLegacyColumnsFor, []);

      const settings = db.prepare('SELECT company_name, phone, logo_path, setup_completed FROM app_settings WHERE id = 1').get();
      assert.equal(settings.company_name, 'Dépôt Ancien');
      assert.equal(settings.phone, '+22505050505');
      assert.equal(settings.logo_path, null);
      assert.equal(Number(settings.setup_completed), 0);

      const exp = db.prepare('SELECT amount, receipt_path FROM expenses WHERE id = 1').get();
      assert.equal(exp.amount, 1500);
      assert.equal(exp.receipt_path, null);

      const expected = JSON.parse(
        fs.readFileSync(path.resolve('migrations/sqlite/expected_schema_v5.json'), 'utf8')
      );
      assert.deepEqual(
        normalizeSchemaByColumnName(extractSchemaSnapshot(db)),
        normalizeSchemaByColumnName(expected)
      );
    } finally {
      db.close();
    }
  });

  it('Migration interrompue et migration partiellement appliquée : rollback atomique complet et reprise propre', () => {
    const dbPath = path.join(testDir, 'interrupted_and_partial.db');
    const db = new DatabaseSync(dbPath);
    try {
      configurePragmas(db);
      const migrations = loadMigrations();
      const failingExtra = [
        ...migrations,
        {
          version: 99,
          name: '0099_interrupted_test',
          sql: `
            CREATE TABLE should_never_persist (id INTEGER PRIMARY KEY);
          `,
        },
      ];

      // Interruption simulée en cours de migration 99 (avant COMMIT)
      assert.throws(
        () =>
          applyMigrations(db, failingExtra, {
            onBeforeCommitMigration: (v) => {
              if (v === 99) throw new Error('INTERRUPTION_SIMULEE');
            },
          }),
        /INTERRUPTION_SIMULEE/
      );

      // Aucune trace partielle de la migration 99
      const tempTbl = db
        .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'should_never_persist'")
        .get().c;
      assert.equal(tempTbl, 0);
      const sv99 = db.prepare('SELECT COUNT(*) AS c FROM schema_version WHERE version = 99').get().c;
      assert.equal(sv99, 0);

      // Les migrations 1..5 déjà commitées sont intactes
      assert.equal(db.prepare('SELECT MAX(version) AS v FROM schema_version').get().v, 5);

      // Cas partiel : base avec seulement logo_path déjà posée manuellement sans entrée v2,
      // et sans receipt_path ni setup_completed -> reprise propre vers v5
      const partialPath = path.join(testDir, 'partial_legacy.db');
      const partialDb = new DatabaseSync(partialPath);
      try {
        configurePragmas(partialDb);
        partialDb.exec(createLegacyV3SqlWithoutOptionalCols());
        partialDb.exec('ALTER TABLE app_settings ADD COLUMN logo_path TEXT NULL;');
        partialDb.prepare("INSERT INTO schema_version (version, name) VALUES (1, '0001_initial_v3')").run();

        const recovery = applyMigrations(partialDb);
        assert.deepEqual(recovery.appliedVersions, [2, 3, 4, 5]);
        assert.deepEqual(recovery.skippedLegacyColumnsFor, [2]);
        assert.equal(verifyDbIntegrity(partialDb).integrity, 'ok');
      } finally {
        partialDb.close();
      }
    } finally {
      db.close();
    }
  });

  it('Comparaison des schémas Node ↔ Rust et couverture identique des fichiers migrations/sqlite', () => {
    const dbPath = path.join(testDir, 'schema_compare.db');
    const db = new DatabaseSync(dbPath);
    try {
      configurePragmas(db);
      applyMigrations(db);
      const snapshot = extractSchemaSnapshot(db);
      const expected = JSON.parse(
        fs.readFileSync(path.resolve('migrations/sqlite/expected_schema_v5.json'), 'utf8')
      );
      assert.deepEqual(snapshot, expected);

      // Vérifie que Rust embarque exactement les mêmes migrations dans le même ordre
      const rustDbSrc = fs.readFileSync(
        path.resolve('crates/depotpro-core/src/infrastructure/db.rs'),
        'utf8'
      );
      const migrations = loadMigrations();
      for (const m of migrations) {
        assert.ok(
          rustDbSrc.includes(`migrations/sqlite/${m.name}.sql`),
          `Rust db.rs doit embarquer migrations/sqlite/${m.name}.sql`
        );
        assert.ok(
          rustDbSrc.includes(`"${m.name}"`),
          `Rust db.rs doit déclarer la migration ${m.name}`
        );
      }
    } finally {
      db.close();
    }
  });

  it('Séparation données de démonstration : refus en production, chargement explicite idempotent et fichiers data/ non suivis', () => {
    const demoDbPath = path.join(testDir, 'demo_explicit.db');
    const db = new DatabaseSync(demoDbPath);
    const prevEnv = process.env.NODE_ENV;
    try {
      configurePragmas(db);
      applyMigrations(db);
      ensureNeutralDefaults(db);

      process.env.NODE_ENV = 'production';
      assert.throws(() => seedDemoData(db), /NODE_ENV=production/);

      process.env.NODE_ENV = 'development';
      const firstSeed = seedDemoData(db);
      assert.equal(firstSeed.seeded, true);
      assert.equal(firstSeed.suppliersAdded, 2);
      assert.equal(firstSeed.productsAdded, 5);
      assert.equal(firstSeed.clientsAdded, 3);

      const secondSeed = seedDemoData(db);
      assert.equal(secondSeed.seeded, false);
      assert.equal(db.prepare('SELECT COUNT(*) AS c FROM products').get().c, 5);
    } finally {
      process.env.NODE_ENV = prevEnv;
      db.close();
    }

    const gitignore = fs.readFileSync(path.resolve('.gitignore'), 'utf8');
    for (const pat of ['data/', '*.db', '*.db-wal', '*.db-shm']) {
      assert.ok(gitignore.includes(pat), `.gitignore doit inclure ${pat}`);
    }
    const trackedDbFiles = execSync("git ls-files 'data/*' '*.db*'", { encoding: 'utf8' }).trim();
    assert.equal(trackedDbFiles, '', 'Aucun fichier SQLite data/*.db* ne doit être suivi par Git');
  });
});
