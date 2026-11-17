# DEPOTPRO PREMIUM V3 — Rapport de Remédiation LOT 5

**Lot :** LOT 5 — Sauvegardes, vérification et restauration (Priorité P0)  
**Branche :** `arena/3e842633-ss-depot-rust`  
**Base (`main`) :** `c7c7db433e56ec8a732b49b43501ec34b278c4a5` (`0028d4c` sur `origin/main`)  
**Commits Lot 5 :** `6af8d95`, `25a00bb`  
**Date :** 2026-11-17

---

## 1. Résumé exécutif

Le Lot 5 élimine les mutations implicites lors de la vérification d'archives, verrouille l'accès au répertoire des sauvegardes, ajoute le contrôle strict de compatibilité avant restauration, sécurise le remplacement de base en 11 étapes atomiques avec récupération garantie du pool SQLite et livre la conception technique du chiffrement des sauvegardes :

1. **Vérification strictement en lecture seule (`open_backup_read_only` & `openBackupReadOnly`, 5.1) :**
   - En Rust (`crates/depotpro-core/src/infrastructure/backup.rs`), `verify_backup` et `create_consistent_backup` n'appellent plus jamais `DepotDb::connect()` (qui ouvrait le fichier en WAL lecture/écriture et appliquait migrations/defaults).
   - `open_backup_read_only` contrôle d'abord l'en-tête magique `SQLite format 3\0`, puis ouvre un pool `SqlitePool` (`max_connections(1)`) avec `read_only(true)`, `create_if_missing(false)` et `PRAGMA query_only = ON`.
   - En Node (`server/services/reports.ts`), `openBackupReadOnly` valide l'en-tête `SQLite format 3\0`, ouvre `DatabaseSync` avec `{ readOnly: true }` et active `PRAGMA query_only = ON`.
   - **Zéro sidecar `-wal`/`-shm` créé** et **empreinte SHA-256 strictement identique avant et après vérification**.

2. **Vérification complète de compatibilité (5.2) :**
   - `verify_backup_path_read_only` (Rust & Node) contrôle :
     - format binaire `sqlite3-depotpro-v3` (taille `>= 100` octets, magic `SQLite format 3\0`),
     - intégrité physique complète via `PRAGMA integrity_check` (`== "ok"`, multi-lignes géré),
     - intégrité référentielle via `PRAGMA foreign_key_check` (`0` erreur),
     - présence des 27 tables métier fondamentales (`REQUIRED_CORE_TABLES`),
     - bornes de version de schéma (`1 <= schema_version <= 4` ; rejet explicite de toute archive future `> 4` ou sans `schema_version`),
     - cohérence des colonnes de migrations (`logo_path` v2, `receipt_path` v3, `setup_completed` v4),
     - calcul d'empreinte SHA-256 et compteurs des 14 entités métier.
   - Toute archive corrompue ou incompatible est refusée avant toute modification ou fermeture de connexion.

3. **Sécurisation des chemins, liens symboliques et confinement canonique (5.3) :**
   - `resolve_safe_backup_path` (Rust) et `resolveSafeBackupPath` (Node) appliquent une liste blanche stricte (`^depotpro_backup_\d{14}_[a-zA-Z0-9_-]{1,32}\.db$`), rejettent `/`, `\`, `..`, octets nuls et espaces, refusent explicitement les liens symboliques (`symlink_metadata` / `lstatSync`) et vérifient la résolution canonique (`canonicalize` / `realpathSync`) à l'intérieur du dossier autorisé.
   - Appliqué à `verify`, `download` (`server/app.ts` + `backup.rs`) et `restore`, ainsi qu'au filtrage dans `list_backups` et `prune_old_backups`.

4. **Restauration atomique en 11 étapes, récupération du pool et contrôle des 14 entités (5.4 & 5.5) :**
   - `restore_and_reconnect` / `restore_and_reconnect_with_hook` (`backup.rs`) et `restoreBackup` (`server/services/reports.ts`) exécutent :
     1. Vérification en lecture seule de l'archive source.
     2. Création et vérification en lecture seule d'une sauvegarde de sécurité (`safetyBackup`, conservée dans `Sauvegardes/`).
     3. Copie vers `.depotpro_restore_tmp_*.db` sur le même système de fichiers que la base cible, `sync_all()` / `fsyncSync()` et vérification SHA-256 + lecture seule avant fermeture.
     4. `PRAGMA wal_checkpoint(TRUNCATE)` et fermeture propre de la connexion / du pool actif.
     5. Nettoyage des sidecars `-wal`/`-shm`/`-journal`, mise en repli de la base courante (`.depotpro_restore_prev_*.db`), remplacement atomique par `rename` et synchronisation fichier + répertoire parent (`#[cfg(unix)]`).
     6. Reconnexion SQLite (`DepotDb::connect` / `reloadDb`), vérification post-restauration (`integrity_check`, `foreign_key_check`, journal `RESTORE_BACKUP`) et collecte des compteurs des **14 entités métier** (`products`, `stockMovements`, `clients`, `suppliers`, `sales`, `salesReturns`, `customerReceivables`, `purchaseOrders`, `purchaseReceipts`, `supplierDebts`, `returnableStockMovements`, `cashMovements`, `expenses`, `auditLogs`).
     7. **Récupération sur échec** : en cas d'erreur après fermeture du pool (interruption avant remplacement, échec de reconnexion ou échec post-vérification), l'ancienne base est rétablie depuis `.depotpro_restore_prev_*.db` (ou la sauvegarde de sécurité) et le pool SQLite est immédiatement réouvert pour ne jamais laisser l'application inutilisable.

5. **Conception technique du chiffrement des sauvegardes (5.6) :**
   - `docs/BACKUP_ENCRYPTION_DESIGN.md` spécifie le chiffrement authentifié multi-plateforme `AES-256-GCM` + `Argon2id` (compatible Windows MSVC, macOS Intel/Apple Silicon et Linux sans `openssl-sys`), l'enveloppe binaire versionnée `DPBKP01\0`, la gestion de clés KEK/DEK avec trousseau OS, la procédure de récupération par clé maître imprimable, la protection AEAD contre toute altération et la compatibilité ascendante des sauvegardes historiques non chiffrées.

---

## 2. Fichiers modifiés et créés

- `crates/depotpro-core/src/infrastructure/{backup.rs,db.rs}`
- `server/{app.ts,db.ts,services/reports.ts}`
- `src/{types/erp.ts,services/api/ApiClient.ts,pages/BackupsPage.tsx}`
- `docs/{BACKUP_RESTORE.md,BACKUP_ENCRYPTION_DESIGN.md}`
- `tests/lot5_backups.test.mjs`, `crates/depotpro-core/tests/lot5_backups.rs`, `tests/ui.test.mjs`

---

## 3. Résultats de vérification (sur code exact `25a00bb`)

### Environnement local (Node `v22.22.3`, Python `3.12`)
- `npm run typecheck` (`tsc --noEmit`) : **PASS** (0 erreur)
- `npm run lint` (`eslint . --max-warnings 0`) : **PASS** (0 warning)
- `npm run test` (`tsx --test tests/*.test.mjs`) : **PASS (83/83 tests, 8/8 suites)**
  - `tests/lot5_backups.test.mjs` : **6/6 PASS** (couvrant les 13 exigences : création, lecture seule, SHA-256 avant/après, archive corrompue header + B-tree, archive incompatible schéma futur v99 + base tierce, path traversal, lien symbolique, interruptions/échecs de reconnexion avec rollback et pool sain, restauration normale + 14 entités, sauvegarde de sécurité conservée, redémarrage complet dans un nouveau processus Node)
  - `tests/ui.test.mjs` : **33/33 PASS** (incluant `Lot 5 — BackupsPage affiche SHA-256, vérification lecture seule, incompatibilité et restauration sécurisée`)
  - `tests/api.test.mjs` (`24/24`), `contracts.test.mjs` (`6/6`), `lot1_sales_purchases.test.mjs` (`2/2`), `lot2_finance_pos.test.mjs` (`3/3`), `lot3_transactions.test.mjs` (`2/2`), `lot4_migrations.test.mjs` (`7/7`) : **PASS**
- `npm run build` (`vite build`) : **PASS** (983ms)
- `npm run benchmark` : **PASS** (`p95=12.64ms` / `p95=0.21ms` / `p95=1.75ms`)

### GitHub Actions CI — Run `44199519555` sur commit `25a00bb`
- **Web API, Frontend UI, Benchmark & Migration Python** (`134449681729`) : **PASS (`success`)**
- **Playwright E2E Navigateur** (`134450134830`) : **PASS (`success`)**
- **Rust Core & Axum Server** (`134449682007`) :
  - `clippy --all-targets -- -D warnings` : **PASS (`success`)**
  - `cargo test -p depotpro-core -p depotpro-server` : **PASS (`success`)** — dont `lot5_backups.rs` (`2/2` : `lot5_read_only_verify_sha256_compatibility_and_path_security`, `lot5_atomic_restore_failure_recovery_and_restart_persistence`), `lot1` (`2/2`), `lot2` (`2/2`), `lot3` (`4/4`), `lot4` (`3/3`), `scenarios` (`3/3`), `depotpro-core` unit tests (SHA-256 NIST vectors, filename allowlist, `Send`), `depotpro-server` (`2/2`)
  - `rustfmt` : **FAIL (préexistant depuis `c7c7db4`, traité au Lot 7)**

---

## 4. Critères de validation du Lot 5

- [x] Vérification strictement en lecture seule (`open_backup_read_only` / `openBackupReadOnly`) sans modification d'empreinte SHA-256 ni sidecars WAL/SHM.
- [x] Contrôle complet d'intégrité, de clés étrangères, de format, de version de schéma et de cohérence des migrations avec refus explicite des archives corrompues ou incompatibles.
- [x] Sécurisation des chemins, rejet des traversées et liens symboliques, confinement canonique.
- [x] Restauration atomique en 11 étapes avec sauvegarde de sécurité conservée, récupération garantie du pool SQLite après échec/interruption, vérification des 14 entités métier et conception technique de chiffrement multi-plateforme (`docs/BACKUP_ENCRYPTION_DESIGN.md`).
