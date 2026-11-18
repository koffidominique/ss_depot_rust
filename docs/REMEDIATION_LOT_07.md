# Rapport de Remédiation — LOT 7 : CI/CD et Compilation Windows / macOS

**Statut :** Implémenté et vérifié (**12/12 jobs CI verts** + artefacts `.msi`/`.exe` et `.app`/`.dmg` générés et uploadés)  
**Branche :** `arena/3e842633-ss-depot-rust`  
**Date :** 2026-11-17

---

## 1. Synthèse des correctifs livrés

### 1.1. CLI Tauri déterministe et cible Desktop (`7.1`)
- **`package.json` & `package-lock.json`** : ajout explicite de `"@tauri-apps/cli": "^2.12.5"` (version verrouillée `2.12.5`) en `devDependencies`, remplaçant la résolution implicite de `npx tauri` qui échouait sur runners propres.
- **`src-tauri/Cargo.toml`** : déclaration explicite de la cible `[lib]` (`name = "depotpro_desktop_lib"`, `crate-type = ["staticlib", "cdylib", "rlib"]`) requise par `src-tauri/src/main.rs` et par la compilation `depotpro-desktop`.
- **`src-tauri/tauri.conf.json`** : configuration explicite de `"targets": ["msi", "nsis", "app", "dmg"]` compatible avec la génération multi-OS ; vérification des icônes RGBA (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, `icon.ico`, `icon.icns`).
- **`.github/workflows/ci.yml`** : exécution déterministe via `npm exec tauri -- --version` et `npm exec tauri -- build --ci --bundles ...`.

### 1.2. Conformité `rustfmt` et `clippy` sur tout le workspace Rust (`7.2`)
- Application complète du formatage `rustfmt` sur l'ensemble des crates et tests du workspace sans altération de la logique métier :
  - `crates/depotpro-core/src/{error.rs, domain/{money,quantity}.rs, infrastructure/{backup,db}.rs, application/{auth,cash,consignments,inventory,pdf,products,purchases,reports,sales}.rs}`
  - `crates/depotpro-core/tests/{lot1_sales_purchases,lot2_finance_pos,lot3_transactions,lot4_migrations,lot5_backups,lot6_security,scenarios}.rs`
  - `crates/depotpro-server/src/main.rs`
  - `src-tauri/src/{commands,lib,state}.rs`
- Validation par CI :
  - `cargo fmt --all -- --check` : **PASS** (0 divergence) ;
  - `cargo clippy -p depotpro-core -p depotpro-server --all-targets -- -D warnings` (Ubuntu) et `cargo clippy -p depotpro-desktop --all-targets -- -D warnings` (Windows & macOS) : **PASS** (`0 warning`).

### 1.3. Fiabilisation Playwright E2E & responsive Header `1280×720` (`7.3`)
- **`tests/e2e/app.spec.ts`** : séparation en **4 scénarios métier sérialisés** avec capture systématique de `pageerror` et `console.error` :
  1. Initialisation PIN propriétaire (`123456`), redirection vers le Tableau de bord et bascule thème Clair/Sombre ;
  2. Ouverture de session de caisse, création produit et apparition immédiate dans le catalogue POS ;
  3. Navigation sur l'ensemble des écrans protégés (validation des titres `<h1>` exacts), Paramètres RBAC et 6 onglets Rapports ;
  4. Création de sauvegarde SQLite (`.db`) et sauvegarde chiffrée AES-256-GCM (`.dpbkp`).
- Remplacement des sélecteurs ambigus par des sélecteurs accessibles et stables (`getByRole('heading', { ..., level: 1 })`, `getByRole('tab', ...)`, `getByRole('button', { name: /thème/i })`, `getByLabel`, `getByText(/depotpro_backup_.*\.dpbkp$/i)`).
- **`src/layouts/Header.tsx`** : correction de la compression du conteneur titre en viewport `1280×720` (`min-w-[160px] flex-1` sur le bloc titre, espacement `gap-2` à droite, masquage de l'étiquette *Rechercher...* et du badge opérateur sous le breakpoint `2xl`), rétablissant la visibilité et l'accessibilité du titre `<h1>` (`Tableau de bord`) en largeur `1280px`.

### 1.4. Audit des dépendances npm (`7.4`)
Analyse menée avec `npm audit`, `npm audit --omit=dev` et `npm audit --json` :
- **Constat chiffré** : **11 vulnérabilités `high`** au total (`5` sous l'arbre `dependencies`, `6` uniquement en `devDependencies`), toutes ramenées à une **unique dépendance transitive** : `picomatch@4.0.7`.
  - **Avis** : `GHSA-fc5q-39xc-vjpf` (*ReDoS through single-branch repeated extglobs*, `CWE-1333`, score CVSS `7.5`).
  - **Plage vulnérable** : `<=4.0.7`.
  - **État amont npm** : `picomatch` a pour dernière version publiée `4.0.7` (`dist-tags.latest = 4.0.7`) — aucun correctif amont n'est encore publié.
  - **Chaînes concernées** :
    - `vite@8.3.8` / `@vitejs/plugin-react` → `fdir` / `tinyglobby` → `picomatch@4.0.7` (5 entrées, outillage de build/dev frontend uniquement) ;
    - `typescript-eslint@8.58.2` (`@typescript-eslint/{eslint-plugin,parser,type-utils,utils,typescript-estree}`) → `tinyglobby` → `fdir` → `picomatch@4.0.7` (6 entrées, analyse ESLint statique uniquement).
- **Évaluation d'exploitabilité & décision** :
  - Aucun de ces paquets n'est embarqué dans le bundle client (`dist/`), ni exposé au runtime du serveur HTTP ou de l'application Tauri, ni alimenté par des motifs glob fournis par des utilisateurs finaux.
  - Conformément aux exigences du Lot 7, `npm audit fix --force` n'a **pas** été appliqué : il effectuerait un déclassement majeur non maîtrisé (`vite@8.3.8` → `vite@6.2.7` et `typescript-eslint@8.47.0`) tout en laissant la dépendance `picomatch` vulnérable sans version corrigée disponible. Un suivi périodique (`npm outdated picomatch`) permettra d'appliquer un simple `npm update picomatch` dès publication d'une version `> 4.0.7`.

### 1.5. Durcissement de la CI/CD multi-OS & artefacts réels (`7.5`)
- **`.github/workflows/ci.yml`** : 12 jobs indépendants exécutant réellement toutes les étapes requises :
  1. `1. TypeScript (typecheck)` (`tsc --noEmit`) ;
  2. `2. ESLint (max-warnings 0)` (`eslint . --max-warnings 0`) ;
  3. `3. Tests Node, API, Contrats & UI` (`npm run test` — **89/89** tests) ;
  4. `4. Build production Vite` (`npm run build`) ;
  5. `5. Tests Playwright E2E` (4/4 scénarios headless Chromium) ;
  6. `6. Migration SQLite V2->V3 & Benchmark 10k/100k` (`npm run benchmark` + `scripts/migrate_v2_to_v3.py --strict`) ;
  7. `7. Tests Rust Core (depotpro-core)` (`cargo test -p depotpro-core`) ;
  8. `8. Tests Axum (depotpro-server)` (`cargo test -p depotpro-server`) ;
  9. `9. Clippy Rust (-D warnings)` ;
  10. `10. Formatage Rust (cargo fmt --check)` ;
  11. `11. Compilation Tauri Windows (.msi / .exe)` (`npm run build` + `tauri --version` + `cargo clippy -p depotpro-desktop -- -D warnings` + `tauri build --ci --bundles msi,nsis` + contrôle fichiers + upload artefact) ;
  12. `12. Compilation Tauri macOS (.app / .dmg)` (`npm run build` + `tauri --version` + `cargo clippy -p depotpro-desktop -- -D warnings` + `tauri build --ci --bundles app,dmg` + contrôle fichiers + upload artefact).
- Les vérifications post-build et l'upload (`actions/upload-artifact@v4`, `if-no-files-found: error`) couvrent le répertoire `target/release/bundle/...` à la racine du workspace Cargo ainsi que `src-tauri/target/release/bundle/...`.

---

## 2. Résultats de validation

- **Vérifications locales** :
  - `npm run typecheck` : **PASS**
  - `npm run lint` (`--max-warnings 0`) : **PASS**
  - `npm test` : **89/89 PASS** (9 suites)
  - `npm run build` : **PASS** (`dist/` généré en `1.25s`)
  - `npm exec tauri -- --version` : **`tauri-cli 2.12.5`**
  - `npm run benchmark` : **PASS** (`p95 = 12.30ms < 300ms`, `0.22ms < 150ms`, `2.43ms < 500ms`)
- **Pipeline GitHub Actions (run `44215448449` sur `dbb7dbd`)** : **12/12 jobs PASS** :
  - `7. Tests Rust Core` : intégralité des suites (`lot1`..`lot6`, `scenarios`, tests unitaires `pdf`/`money`/`quantity`/`backup`/`db`) **PASS**
  - `8. Tests Axum` : **3/3 PASS**
  - `5. Tests Playwright E2E` : **4/4 PASS**
  - `9. Clippy Rust` & `10. Formatage Rust` : **PASS**
  - `11. Compilation Tauri Windows (.msi / .exe)` : **PASS** — artefact `depotpro-desktop-windows` (`14 204 978` octets)
  - `12. Compilation Tauri macOS (.app / .dmg)` : **PASS** — artefact `depotpro-desktop-macos` (`12 378 146` octets)
