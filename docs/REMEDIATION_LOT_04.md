# DEPOTPRO PREMIUM V3 — Rapport de Remédiation LOT 4

**Lot :** LOT 4 — Migrations versionnées et initialisation des données (Priorité P0)  
**Branche :** `arena/3e842633-ss-depot-rust`  
**Base (`main`) :** `c7c7db433e56ec8a732b49b43501ec34b278c4a5` (`0028d4c` sur `origin/main`)  
**Commit Lot 4 :** `e4cc6cb`  
**Date :** 2026-11-17

---

## 1. Résumé exécutif

Le Lot 4 unifie le moteur de migrations séquentielles SQLite entre Node.js et Rust, sépare strictement l'initialisation de production du jeu de démonstration, ajoute un assistant non bloquant de première configuration et retire les bases SQLite locales du suivi Git :

1. **Système de migrations versionnées séquentielles unifié (4.1 & 4.2) :**
   - `migrations/sqlite/` contient désormais la séquence ordonnée :
     - `0001_initial_v3.sql` (v1, inchangée et reproductible)
     - `0002_app_settings_logo_path.sql` (v2 : `app_settings.logo_path`)
     - `0003_expense_receipt_path.sql` (v3 : `expenses.receipt_path`)
     - `0004_onboarding_setup_state.sql` (v4 : `app_settings.setup_completed`)
   - `server/db.ts` (`loadMigrations`, `applyMigrations`, `splitSqlStatements`) et `crates/depotpro-core/src/infrastructure/db.rs` (`MIGRATIONS`, `DepotDb::apply_migrations`, `DepotDb::apply_migrations_list`, `split_sql_statements`) appliquent exactement la même séquence dans l'ordre :
     1. Lecture de `schema_version` et des versions déjà appliquées.
     2. Exécution de chaque migration manquante dans sa propre transaction atomique `BEGIN IMMEDIATE ... COMMIT` (avec `ROLLBACK` intégral en cas d'erreur/interruption).
     3. **Compatibilité bases existantes :** détection préalable via `PRAGMA table_info` pour `logo_path`, `receipt_path` et `setup_completed` lorsqu'une colonne existe déjà sans entrée dans `schema_version`, évitant toute erreur `duplicate column name` tout en enregistrant la version.
     4. Contrôle d'intégrité (`PRAGMA integrity_check` = `'ok'` + `PRAGMA foreign_key_check` vide) avant initialisation des paramètres neutres.
   - `migrations/sqlite/expected_schema_v4.json` fixe le contrat canonique complet (41 tables, 17 index, `schema_version` 1..4) vérifié par les deux moteurs (`extractSchemaSnapshot` / `DepotDb::extract_schema_snapshot`).
   - `scripts/migrate_v2_to_v3.py` applique également les migrations séquentielles `0002..0004` et conserve `setup_completed = 1` lorsqu'une configuration société existait en V2.

2. **Séparation initialisation neutre vs données de démonstration & assistant de configuration (4.3) :**
   - `ensureNeutralDefaults` (`server/db.ts`) et `DepotDb::ensure_neutral_defaults` (`db.rs`) initialisent uniquement :
     - `app_settings` neutre (`company_name = 'Mon Dépôt'`, `company_legal_name = NULL`, `address = NULL`, `phone = NULL`, `email = NULL`, `city = NULL`, `country = NULL`, `currency = 'FCFA'`, `setup_completed = 0`),
     - les 5 `payment_methods`, les 6 `expense_categories` et les 4 catégories génériques (`Bières`, `Boissons gazeuses`, `Eaux minérales`, `Jus & Énergisants`).
     - **0 fournisseur, 0 produit, 0 stock, 0 client, 0 emballage consigné** au démarrage production.
   - Les données de démonstration ont été extraites dans `server/seedDemo.ts` et `scripts/seed_demo.ts` (`npm run seed:demo`), jamais appelées au démarrage normal et refusées si `NODE_ENV=production` sans `--force`.
   - `DashboardPage.tsx` et `SettingsPage.tsx` proposent un **Assistant de première configuration** non bloquant lorsque `setup_completed === 0`, passant automatiquement `setup_completed = 1` lors de la sauvegarde (`server/services/reports.ts`, `crates/depotpro-core/src/application/reports.rs`).

3. **Gestion Git des fichiers SQLite (4.4) :**
   - `.gitignore` exclut `data/`, `*.db`, `*.db-wal`, `*.db-shm` et `*.db-journal`.
   - Après vérification que `data/depotpro_v3.db*` correspond à une base locale d'exécution (non utilisée comme fixture de test), ces 3 fichiers ont été déréférencés de l'index Git via `git rm --cached` sans suppression du disque local.

---

## 2. Fichiers modifiés et créés

- `migrations/sqlite/0002_app_settings_logo_path.sql`, `0003_expense_receipt_path.sql`, `0004_onboarding_setup_state.sql`, `expected_schema_v4.json`
- `server/db.ts`, `server/seedDemo.ts`, `scripts/seed_demo.ts`, `package.json`, `scripts/migrate_v2_to_v3.py`
- `crates/depotpro-core/src/infrastructure/db.rs`, `crates/depotpro-core/src/application/{reports.rs,pdf.rs}`
- `server/services/reports.ts`, `src/types/erp.ts`, `src/services/api/ApiClient.ts`, `src/pages/{DashboardPage.tsx,SettingsPage.tsx}`
- `.gitignore` (+ `git rm --cached data/depotpro_v3.db*`)
- `docs/{DATABASE.md,DATA_MIGRATION.md}`
- `tests/lot4_migrations.test.mjs`, `crates/depotpro-core/tests/lot4_migrations.rs`, `tests/ui.test.mjs`

---

## 3. Résultats de vérification (sur code exact `e4cc6cb`)

### Environnement local (Node `v22.22.3`, Python `3.12`)
- `npm run typecheck` (`tsc --noEmit`) : **PASS** (0 erreur)
- `npm run lint` (`eslint . --max-warnings 0`) : **PASS** (0 warning)
- `npm run test` (`tsx --test tests/*.test.mjs`) : **PASS (76/76 tests, 7/7 suites)**
  - `tests/lot4_migrations.test.mjs` : **7/7 PASS** (base vierge sans données fictives, base V3 existante & rejouée, base avec colonnes déjà présentes, base sans colonne requise, migration interrompue & partiellement appliquée, parité schéma `expected_schema_v4.json` & embarquement Rust, `seedDemoData` refusé en prod & idempotent en dev + `.gitignore`/`git ls-files`)
  - `tests/ui.test.mjs` : **32/32 PASS** (incluant `Lot 4 — DashboardPage affiche l’assistant de première configuration`)
  - `tests/api.test.mjs` (`24/24`), `contracts.test.mjs` (`6/6`), `lot1_sales_purchases.test.mjs` (`2/2`), `lot2_finance_pos.test.mjs` (`3/3`), `lot3_transactions.test.mjs` (`2/2`) : **PASS**
- `npm run build` (`vite build`) : **PASS** (1.05s)
- `npm run benchmark` : **PASS** (`p95=10.74ms` recherche / `p95=0.22ms` détail / `p95=1.70ms` validation vente)
- `scripts/migrate_v2_to_v3.py --strict` : **PASS** (`anomalies: []`, `integrity_check: "ok"`, `foreign_key_errors: 0`)
- `npm run seed:demo` (sur base temporaire isolée) : **PASS** (`seeded: true`, `suppliersAdded: 2`, `productsAdded: 5`, `clientsAdded: 3`)

### GitHub Actions CI — Run `44196583677` sur commit `e4cc6cb`
- **Web API, Frontend UI, Benchmark & Migration Python** (`134439525896`) : **PASS (`success`)**
- **Playwright E2E Navigateur** (`134440236418`) : **PASS (`success`)**
- **Rust Core & Axum Server** (`134439526387`) :
  - `clippy --all-targets -- -D warnings` : **PASS (`success`)**
  - `cargo test -p depotpro-core -p depotpro-server` : **PASS (`success`)** — dont `lot4_migrations.rs` (`3/3` : `lot4_fresh_db_neutral_defaults_and_schema_parity_with_node`, `lot4_existing_columns_and_missing_columns_upgrade_cleanly`, `lot4_interrupted_migration_rolls_back_and_partial_migration_recovers`), `lot1` (`2/2`), `lot2` (`2/2`), `lot3` (`4/4`), `scenarios` (`3/3`), `depotpro-server` (`2/2`)
  - `rustfmt` : **FAIL (préexistant depuis `c7c7db4`, traité au Lot 7)**

---

## 4. Critères de validation du Lot 4

- [x] Migrations séquentielles versionnées (`0001`..`0004`) partagées et atomiques entre Node.js et Rust, avec reconnaissance des colonnes préexistantes.
- [x] Parité exacte des schémas Node ↔ Rust vérifiée sur `migrations/sqlite/expected_schema_v4.json`.
- [x] Démarrage production neutre sans aucune donnée commerciale fictive, avec assistant de première configuration et commande `npm run seed:demo` séparée.
- [x] `data/*.db*` déréférencés de Git sans perte des fichiers locaux et protégés par `.gitignore`.
