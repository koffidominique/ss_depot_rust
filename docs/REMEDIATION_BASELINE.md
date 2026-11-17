# DEPOTPRO PREMIUM V3 — Rapport de Référence Technique (LOT 0)

## 1. Contexte Git et périmètre

- **Branche de travail active :** `arena/3e842633-ss-depot-rust` (branche suivie par la session Arena ; la création de la branche `fix/depotpro-audit-remediation` mentionnée dans `Remediation.md` n'est pas effectuée afin de respecter la contrainte de branche unique de la session).
- **Commit de référence testé :** `c7c7db433e56ec8a732b49b43501ec34b278c4a5` (`Merge pull request #1 from koffidominique/arena/11c5a254-ss-depot-rust`).
- **Commit `origin/main` intégrant `Remediation.md` :** `0028d4c12b82c25c60864c3ea5456ca73edd45cf` (diff vérifié : ajout unique de `Remediation.md` par rapport à `c7c7db4`).
- **Date d'établissement de la référence :** 2026-11-17.

---

## 2. Versions des outils et environnement d'exécution

### Environnement local (sandbox)

| Outil / Composant | Version / État | Notes |
| --- | --- | --- |
| Node.js | `v22.22.3` | Support natif de `node:sqlite` |
| npm | `10.9.8` | 438 paquets installés via `npm ci` (`npm audit`: 11 vulnérabilités `high`, 0 `critical`) |
| Python | `3.11.2` | Utilisé pour `scripts/migrate_v2_to_v3.py` |
| TypeScript (`tsc`) | `6.0.3` | Dépendance locale dev |
| ESLint | `10.15.0` | Dépendance locale dev (`--max-warnings 0`) |
| Vite | `8.3.8` (`linux-x64`) | Bundler frontend |
| Playwright | `1.65.1` | Binaire Chromium absent du cache local (`/home/user/.cache/ms-playwright`) |
| Rust (`rustc` / `cargo`) | **Non installé localement** | Exécution vérifiée via GitHub Actions (`dtolnay/rust-toolchain@stable`) |
| Tauri CLI (`npx tauri`) | **Non disponible** | `@tauri-apps/cli` absent de `package.json` |

### Dépendances clés du workspace

- **Frontend / Node (`package.json`) :** `react` `^19.0.1`, `react-dom` `^19.0.1`, `express` `^4.21.2`, `bcryptjs` `^3.0.3`, `zod` `^4.6.7`, `react-hook-form` `^7.92.0`, `@tanstack/react-query` `^5.108.0`, `@tanstack/react-table` `^8.21.2`, `recharts` `^3.10.1`, `zustand` `^5.1.0`, `tsx` `^4.21.0`.
- **Workspace Rust (`Cargo.toml`, édition `2021`, version `3.0.0`) :**
  - Membres : `crates/depotpro-core`, `crates/depotpro-server`, `src-tauri` (`depotpro-desktop`).
  - Dépendances workspace : `sqlx 0.8` (`runtime-tokio`, `sqlite`, `macros`), `tokio 1.41`, `axum 0.7`, `tower-http 0.6`, `bcrypt 0.16`, `thiserror 2.0`, `chrono 0.4`, `uuid 1.11`, `tauri 2`, `tauri-build 2`.

---

## 3. Commandes exécutées et résultats obtenus (référence locale)

Toutes les commandes ont été exécutées **indépendamment** après `npm ci` sur le commit `c7c7db433e56ec8a732b49b43501ec34b278c4a5` :

| Commande | Statut | Code sortie | Détails factuels |
| --- | --- | --- | --- |
| `npm ci` | **PASSÉ** | `0` | 438 paquets ajoutés, 445 audités |
| `npm run typecheck` | **PASSÉ** | `0` | `tsc --noEmit` sans erreur |
| `npm run lint` | **PASSÉ** | `0` | `eslint . --max-warnings 0` sans erreur ni warning |
| `npm run test` | **PASSÉ** | `0` | `tsx --test tests/*.test.mjs` — 3 suites, 59/59 tests passés (24 scénarios API, 6 contrats, 29 tests UI) |
| `npm run build` | **PASSÉ** | `0` | Build production Vite (`3521 modules transformed`, `dist/` généré) |
| `npm run benchmark` | **PASSÉ** | `0` | Base injectée en 4.44s (10k produits, 10k clients, 100k lignes vente, 100k mvts stock) ; p95 recherche=96.78ms (<300ms), détail=0.51ms (<150ms), vente atomique=13.02ms (<500ms) |
| `npm run test:e2e` | **ÉCHOUÉ** | `1` | `browserType.launch`: exécutable Chromium headless absent localement |
| Vérification migration Python (`migrate_v2_to_v3.py --strict`) | **PASSÉ** | `0` | Exécutée sur base temporaire synthétique : `integrity_check: ok`, `foreign_key_errors: 0`, `anomalies: []` |
| `cargo fmt --all -- --check` | **NON EXÉCUTÉ LOCALEMENT** | — | `cargo` / `rustc` absents du conteneur ; échoué en CI (voir §4) |
| `cargo test -p depotpro-core` | **NON EXÉCUTÉ LOCALEMENT** | — | `cargo` / `rustc` absents du conteneur ; skippé en CI après l'échec `cargo fmt` |
| `cargo test -p depotpro-server` | **NON EXÉCUTÉ LOCALEMENT** | — | `cargo` / `rustc` absents du conteneur ; skippé en CI après l'échec `cargo fmt` |
| `cargo clippy -p depotpro-core -p depotpro-server --all-targets -- -D warnings` | **NON EXÉCUTÉ LOCALEMENT** | — | `cargo` / `rustc` absents du conteneur ; skippé en CI après l'échec `cargo fmt` |

---

## 4. État de référence GitHub Actions CI

Dernières exécutions observées sur `main` :
- Run `44157175751` (commit `c7c7db433e56ec8a732b49b43501ec34b278c4a5`) : **ÉCHEC**
- Run `44180421835` (commit `0028d4c12b82c25c60864c3ea5456ca73edd45cf`) : **ÉCHEC**

Détail par job sur ces runs de référence :

| Job CI | Statut | Étape en échec / Observation |
| --- | --- | --- |
| `Web API, Frontend UI, Benchmark & Migration Python` | **PASSÉ** | Toutes les étapes (`typecheck`, `lint`, `test`, `build`, `benchmark`, `migrate_v2_to_v3 --strict`) passées |
| `Rust Core & Axum Server (fmt, clippy, test)` | **ÉCHEC** | Échec à l'étape `cargo fmt --all -- --check` ; étapes `cargo clippy` et `cargo test` **non exécutées (skippées)** |
| `Playwright E2E Navigateur` | **ÉCHEC** | Échec à l'étape `npm run test:e2e` (Chromium bien installé en CI, mais échec du scénario E2E) |
| `Tauri 2 Desktop (windows-latest)` | **ÉCHEC** | Échec à l'étape `npx tauri build` (`@tauri-apps/cli` absent des dépendances du projet) |
| `Tauri 2 Desktop (macos-latest)` | **ÉCHEC** | Échec à l'étape `npx tauri build` (`@tauri-apps/cli` absent des dépendances du projet) |

---

## 5. Fichiers SQLite, données sensibles et anomalies identifiées avant correction

### Fichiers SQLite et configuration présents dans le dépôt Git
- **Bases SQLite suivies par Git (`git ls-files`) :**
  - `data/depotpro_v3.db` (4 Ko)
  - `data/depotpro_v3.db-shm` (32 Ko)
  - `data/depotpro_v3.db-wal` (1,2 Mo)
  - État inspecté en lecture seule : 42 tables, `schema_version = [(1, '0001_initial_v3', '2026-11-17 15:23:22')]`, 5 produits, 0 vente. **Aucune opération de modification ou de migration ne sera appliquée directement sur ces fichiers.**
- **Fichier `.env.example` :** Contient des variables héritées d'un modèle externe (`GEMINI_API_KEY`, `APP_URL`) sans lien avec l'ERP DEPOTPRO. Aucun fichier `.env` secret n'est suivi dans Git.
- **Dépendance résiduelle :** `@google/genai` (`^2.4.0`) est déclarée dans `package.json` mais n'est importée nulle part dans `src/`, `server/`, `crates/` ou `tests/`.

### Synthèse des problèmes déjà présents à traiter dans les Lots 1 à 10
1. **CI / Compilation & E2E (Lots 0, 7, 10) :**
   - `cargo fmt --all -- --check` échoue en CI et masque `cargo clippy` et `cargo test`.
   - `@tauri-apps/cli` est absent, faisant échouer `npx tauri build` sur Windows et macOS.
   - `npm run test:e2e` échoue en CI (et localement faute de Chromium).
2. **Intégrité métier, finance, transactions, migrations, sauvegardes, sécurité et architecture (Lots 1 à 9) :**
   - Doublons possibles de `sale_line_id` dans les retours de vente (`server/services/sales.ts`, `crates/depotpro-core/src/application/sales.rs`) et de `purchase_order_line_id` dans les réceptions d'achat (`server/services/purchases.ts`, `crates/depotpro-core/src/application/purchases.rs`).
   - Calculs financiers/POS dupliqués côté frontend et couverture à sécuriser sur les remises/totaux/rendus/clôtures.
   - Transactions Rust SQLite via pool multi-connexions au lieu d'une transaction dédiée `BEGIN IMMEDIATE` / `acquire()`.
   - Initialisation SQLite et migrations à structurer de façon versionnée et séparation des seeds de démo hors mode production.
   - Vérification de sauvegarde et restauration atomique à sécuriser (sans écriture durant `verify_backup`, politique de restauration sûre).
   - Expiration des sessions, atomicité du compteur d'échecs PIN, politique CORS/Origin stricte, sécurité Axum/Tauri.
   - Modularisation des pages React volumineuses (`ProductsPage.tsx`, `SalesPage.tsx`, `ClientsPage.tsx`, `ConsignmentsPage.tsx`, `ReportsPage.tsx`) et harmonisation Node/Rust.

---

## 6. Conclusion du LOT 0

La référence technique est établie et documentée. Le répertoire de travail reste propre (les fichiers `data/depotpro_v3.db*` n'ont subi aucune modification). Les corrections peuvent démarrer séquentiellement à partir du **LOT 1**.
