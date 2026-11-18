# DEPOTPRO PREMIUM V3 — Rapport de Remédiation LOT 3

**Lot :** LOT 3 — Transactions SQLite et concurrence (Priorité P0)  
**Branche :** `arena/3e842633-ss-depot-rust`  
**Base (`main`) :** `c7c7db433e56ec8a732b49b43501ec34b278c4a5` (`0028d4c` sur `origin/main`)  
**Commits Lot 3 :** `888e1b2`, `4c7b0eb`  
**Date :** 2026-11-17

---

## 1. Résumé exécutif

Le Lot 3 garantit la sérialisation réelle des écritures SQLite (in-process et inter-processus) et la cohérence des gestions de verrous, timeouts et rollbacks dans les deux moteurs Rust et Node.js :

1. **Vérification SQLx et démarrage immédiat des transactions d'écriture (`BEGIN IMMEDIATE`) en Rust (3.1 & 3.2) :**
   - `Cargo.toml` épingle `sqlx = "0.8.6"` (vérifié dans `sqlx-core` / `sqlx-sqlite` : `Pool::begin_with` existe depuis `0.8.5`, acquiert une `PoolConnection` unique, exécute `worker.begin(Some("BEGIN IMMEDIATE"))`, contrôle `handle.in_transaction()` puis garantit le commit explicite ou le rollback automatique sur `Drop`).
   - `crates/depotpro-core/src/infrastructure/db.rs` :
     - `DepotDb::begin_write()` acquiert d'abord le verrou applicatif `write_lock` (`OwnedMutexGuard<()>`) puis démarre la transaction sur une connexion unique via `self.pool.begin_with("BEGIN IMMEDIATE").await?`.
     - `DepotDb::connect_with_busy_timeout()` accepte un `busy_timeout` configurable (`DEPOTPRO_BUSY_TIMEOUT_MS` borné `1..=60_000`, défaut `5000` ms), exécute l'initialisation schéma/paramètres atomiquement sous `BEGIN IMMEDIATE` uniquement si la base n'est pas encore initialisée (évitant tout verrou d'écriture inutile sur des bases existantes), et valide l'intégrité au démarrage via `verify_integrity()` (`PRAGMA integrity_check` + `PRAGMA foreign_key_check`).
     - Les instructions DDL initiales sont exécutées séquentiellement dans la transaction via `sqlx::query(...)`, avec des assertions de compilation `Send` sur `DepotDb::connect*` et `backup::*` garantissant la compatibilité des handlers `axum`.
   - `crates/depotpro-core/src/application/auth.rs` : `bcrypt::hash` (coût CPU élevé) est désormais calculé en dehors du verrou `begin_write()` dans `setup_owner_pin()`, suivi d'une double vérification transactionnelle de `owner_security`. (`verify_owner_pin` et `change_owner_pin` effectuaient déjà `bcrypt` avant `begin_write()`.)
2. **Détection et remontée HTTP 503 de `SQLITE_BUSY` :**
   - Rust (`crates/depotpro-core/src/error.rs`, `crates/depotpro-server/src/main.rs`) : nouveau variant `CoreError::DatabaseBusy` + détecteur `is_sqlite_busy_error` (codes étendus SQLite `5`, `261`, `517` et messages `"database is locked"` / `"sqlite_busy"`), mappé vers HTTP `503 Service Unavailable`.
   - Node.js (`server/domain.ts`, `server/db.ts`, `server/app.ts`) : ajout de `'DATABASE_BUSY'` dans `ErrorCode`, mappage `isSqliteBusyError` vers `BusinessError('DATABASE_BUSY', ..., 503)` dans `withWriteTx()`, `DEPOTPRO_BUSY_TIMEOUT_MS` configurable (`1..=60_000`), `verifyDbIntegrity()`, et garde-fous évitant toute transaction d'écriture inutile dans `applyMigrations()` et `seedIfEmpty()` quand la base est déjà prête.
3. **Tests de concurrence multi-tâches et multi-processus :**
   - Rust (`crates/depotpro-core/tests/lot3_transactions.rs`) et Node.js (`tests/lot3_transactions.test.mjs` + `tests/helpers/lot3_child_worker.mjs`) couvrent l'ensemble des 11 cas obligatoires sans dépendance externe.

---

## 2. Fichiers modifiés et créés

- `Cargo.toml` : `sqlx = "0.8.6"` explicite.
- `crates/depotpro-core/src/error.rs` : `CoreError::DatabaseBusy` et `is_sqlite_busy_error()`.
- `crates/depotpro-core/src/infrastructure/db.rs` : `DepotDb::connect_with_busy_timeout`, `ensure_schema_initialized`, `verify_integrity`, `begin_write()` (`BEGIN IMMEDIATE`), `DEPOTPRO_BUSY_TIMEOUT_MS`, test compile-time `depot_db_futures_are_send`.
- `crates/depotpro-core/src/infrastructure/backup.rs` : test compile-time `assert_backup_futures_are_send`.
- `crates/depotpro-core/src/application/auth.rs` : déplacement de `bcrypt::hash` hors de `begin_write()` dans `setup_owner_pin()`.
- `crates/depotpro-server/src/main.rs` : mapping `CoreError::DatabaseBusy(_) => StatusCode::SERVICE_UNAVAILABLE` (`503`).
- `crates/depotpro-core/tests/lot3_transactions.rs` : 4 tests Rust (concurrence intra-processus, multi-processus OS via ré-invocation du binaire de test, rollback explicite & `Drop` + violation FK, blocage temporaire réussi et expiration `busy_timeout` -> `CoreError::DatabaseBusy`).
- `server/domain.ts`, `server/db.ts`, `server/app.ts` : `DATABASE_BUSY`, `withWriteTx` avec `BEGIN IMMEDIATE` et détection `SQLITE_BUSY` -> HTTP `503`, `DEPOTPRO_BUSY_TIMEOUT_MS`, `verifyDbIntegrity()`, gardes de lecture seule au démarrage sur base déjà initialisée.
- `tests/lot3_transactions.test.mjs` & `tests/helpers/lot3_child_worker.mjs` : 2 suites complètes Node.js (concurrence API, rollback, violation FK, 2 processus concurrents `node --import tsx`, attente de verrou temporaire et expiration déterministe `503 DATABASE_BUSY`).

---

## 3. Résultats de vérification (sur code exact `4c7b0eb`)

### Environnement local (Node `v22.22.3`, npm `10.9.8`)
- `npm run typecheck` (`tsc --noEmit`) : **PASS** (0 erreur)
- `npm run lint` (`eslint . --max-warnings 0`) : **PASS** (0 warning, 0 erreur)
- `npm run test` (`tsx --test tests/*.test.mjs`) : **PASS (68/68 tests, 6/6 suites)**
  - `tests/api.test.mjs` : 24/24 PASS
  - `tests/contracts.test.mjs` : 6/6 PASS
  - `tests/lot1_sales_purchases.test.mjs` : 2/2 PASS
  - `tests/lot2_finance_pos.test.mjs` : 3/3 PASS
  - `tests/lot3_transactions.test.mjs` : 2/2 PASS (concurrence API, multi-processus OS, rollback/FK, verrou temporaire et `503 DATABASE_BUSY`)
  - `tests/ui.test.mjs` : 31/31 PASS
- `npm run build` (`vite build`) : **PASS** (`vite v8.3.8`, `dist/` généré en 1.11s)
- `npm run benchmark` : **PASS** (`p50=9.55ms` recherche, `p50=0.12ms` détail, `p50=0.77ms` validation vente)

### GitHub Actions CI — Run `44193784475` sur commit `4c7b0eb`
- **Web API, Frontend UI, Benchmark & Migration Python** (`134429739897`) : **PASS (`success`)**
- **Playwright E2E Navigateur** (`134430246684`) : **PASS (`success`)**
- **Rust Core & Axum Server** (`134429740340`) :
  - `Analyse statique Rust (clippy --all-targets -- -D warnings)` : **PASS (`success`)**
  - `Tests unitaires et d'intégration Rust (cargo test -p depotpro-core -p depotpro-server)` : **PASS (`success`)** — dont `lot3_transactions.rs` (`4/4` : `lot3_multi_process_child_entrypoint`, `lot3_two_processes_same_sqlite_file`, `lot3_concurrent_sales_receptions_receivables_cash_close_and_stock_moves`, `lot3_rollback_fk_violation_temp_block_and_busy_timeout_expiration`), `lot1_sales_purchases` (`2/2`), `lot2_finance_pos` (`2/2`), `scenarios` (`3/3`), `depotpro-server` (`2/2`) et tests unitaires lib (`depot_db_futures_are_send`, etc.)
  - `Vérification formatage Rust (rustfmt)` : **FAIL (préexistant depuis `c7c7db4`, traité au Lot 7)**

---

## 4. Critères de validation du Lot 3

- [x] `DepotDb::begin_write()` démarre réellement `BEGIN IMMEDIATE` sur une connexion unique via `sqlx::Pool::begin_with` (`sqlx 0.8.6`) avec libération garantie et rollback sur erreur/drop.
- [x] Aucune opération CPU longue (`bcrypt::hash`) maintenue dans une transaction d'écriture SQLite.
- [x] Gestion explicite des erreurs `SQLITE_BUSY` (`CoreError::DatabaseBusy` / `BusinessError('DATABASE_BUSY')` -> HTTP `503`) et `DEPOTPRO_BUSY_TIMEOUT_MS` configurable.
- [x] Tests de concurrence intra-processus, multi-processus OS, rollback, FK, intégrité, attente temporaire et expiration `busy_timeout` verts en Rust et en Node.js.
- [x] Base de données `data/depotpro_v3.db*` non modifiée (`git status` propre).
