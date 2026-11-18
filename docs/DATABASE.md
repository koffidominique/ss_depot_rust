# SCHÉMA BASE DE DONNÉES V3 & MIGRATIONS (`migrations/sqlite/`)

## Migrations versionnées séquentielles (Node.js & Rust unifiés)

Les deux moteurs (`server/db.ts` et `crates/depotpro-core/src/infrastructure/db.rs`) appliquent exactement la même séquence de fichiers dans `migrations/sqlite/` :

1. `0001_initial_v3.sql` : schéma de base V3 complet (41 tables, 17 index).
2. `0002_app_settings_logo_path.sql` : ajout de `app_settings.logo_path`.
3. `0003_expense_receipt_path.sql` : ajout de `expenses.receipt_path`.
4. `0004_onboarding_setup_state.sql` : ajout de `app_settings.setup_completed` (assistant de première configuration).
5. `0005_security_roles_users.sql` : table `users` (RBAC 6 rôles), index `idx_users_role_active` et colonnes `audit_logs.actor_{user_id,name,role}` (schéma de référence `migrations/sqlite/expected_schema_v5.json`).

### Séquence obligatoire au démarrage

1. Ouverture SQLite avec `PRAGMA foreign_keys = ON`, `journal_mode = WAL`, `synchronous = FULL`, `busy_timeout = DEPOTPRO_BUSY_TIMEOUT_MS` (5000 ms par défaut).
2. Inspection de `schema_version` (si existante) et lecture des versions appliquées.
3. Application des migrations manquantes par ordre croissant de version, chacune dans sa propre transaction atomique `BEGIN IMMEDIATE ... COMMIT` (avec `ROLLBACK` intégral en cas d'erreur ou d'interruption).
4. **Compatibilité bases V3 existantes** : si `logo_path`, `receipt_path`, `setup_completed`, `users` ou `audit_logs.actor_user_id` existent déjà sans entrée `schema_version` correspondante, les éléments sont reconnus sans ré-exécuter `ALTER TABLE` et leur version est enregistrée proprement.
5. Vérification d'intégrité au démarrage (`PRAGMA integrity_check = 'ok'` et `PRAGMA foreign_key_check` vide).
6. Initialisation des paramètres neutres uniquement (`ensureNeutralDefaults` / `ensure_neutral_defaults`).

## Séparation initialisation production vs données de démonstration

- **Démarrage production (`getDb` / `DepotDb::connect`)** :
  - Initialise uniquement `app_settings` neutre (`company_name = 'Mon Dépôt'`, adresse/téléphone/ville/pays `NULL`, `setup_completed = 0`), les 5 `payment_methods`, les 6 `expense_categories` et les 4 catégories génériques (`Bières`, `Boissons gazeuses`, `Eaux minérales`, `Jus & Énergisants`).
  - **Aucune donnée commerciale fictive** : 0 fournisseur, 0 produit, 0 stock, 0 client, 0 emballage consigné.
  - Un assistant non bloquant de première configuration guide l'utilisateur sur le tableau de bord jusqu'à la personnalisation de son dépôt.
- **Données de démonstration (dev explicite uniquement)** :
  - Chargées exclusivement via `npm run seed:demo` (`scripts/seed_demo.ts` -> `server/seedDemo.ts`).
  - Refusé automatiquement lorsque `NODE_ENV=production` sans `--force`.

## Gestion Git des fichiers SQLite

- `.gitignore` exclut `data/`, `*.db`, `*.db-wal`, `*.db-shm` et `*.db-journal`. Aucun fichier SQLite d'exécution n'est suivi dans Git.

## Invariants de stockage

- **Montants FCFA** : Toutes les colonnes monétaires sont `INTEGER` (FCFA entiers). Aucun `REAL` ou `FLOAT` n'est utilisé pour de l'argent.
- **Quantités** : Toutes les quantités sont exprimées en `INTEGER` `*_milli` (`1 unité = 1000 milli-unités`, précision maximale de 3 décimales).
- **Transactions & Idempotence** :
  - Toute écriture multi-table passe par un verrou applicatif unique (`withWriteTx` / `begin_write`) sous `BEGIN IMMEDIATE`.
  - Les opérations critiques (`sales`, `payments`, `purchase_orders`, `purchase_receipts`, `cash_sessions`, `cash_movements`, `expenses`, `sales_cancellations`, `sales_returns`, `deposit_returns`) exigent un `request_key` unique.
- **Session de caisse** : Contrainte partielle unique `uq_cash_session_single_open` garantissant au plus une session `'open'`.
- **Immutabilité historique** : Aucun `ON DELETE CASCADE` sur les documents validés ; les annulations créent des contre-écritures (`sales_cancellations`, `sales_returns`, `stock_movements`).
