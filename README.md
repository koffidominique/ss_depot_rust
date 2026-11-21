# DEPOTPRO PREMIUM V3 — ERP de Gestion de Dépôt de Boissons

Application de gestion commerciale, financière, stock multi-conditionnements et consignations conçue pour les dépôts de boissons (FCFA entiers, quantités exactes en milli-unités, caisse séparée espèces/digital, fonctionnement local hors ligne).

## Architecture

- **Frontend** : React 19 + TypeScript strict + Vite + Tailwind CSS + Radix UI + TanStack Query/Table + Recharts + Zustand.
- **Serveur Web local (runtime Node/Express sur port 3000)** : API REST `/api/*` adossée à SQLite WAL (`node:sqlite`) implémentant les règles V3 exactes (FCFA `INTEGER`, quantités `*_milli`, transactions `BEGIN IMMEDIATE`, idempotence `request_key`, sauvegardes `VACUUM INTO`).
- **Cœur métier Rust & Axum & Tauri 2 (workspace prêt à compiler sur poste équipé Rust)** :
  - `crates/depotpro-core` : Types métier exacts `Money(i64)` et `Quantity { milli_units: i64 }`, connexion SQLx (`WAL`, `FULL`, `foreign_keys`, sérialisation des écritures), services `auth`, `products`, `sales`, `purchases`, `cash`, `consignments`, `reports`, `backup`.
  - `crates/depotpro-server` : Serveur Axum lié exclusivement à `127.0.0.1` servant l'API et `dist/`.
  - `src-tauri` : Application desktop Tauri 2 avec capabilities minimales, verrou d'instance unique (`depotpro.lock`) et stockage dans le répertoire applicatif OS (`app_data_dir`).

## Prérequis

- Node.js `>= 22.0` (`node:sqlite` intégré) et `npm`
- Python 3 (uniquement pour exécuter `scripts/migrate_v2_to_v3.py` sur d'anciennes bases)
- Pour la compilation Rust / Tauri Desktop : Toolchain Rust (`rustc`, `cargo`) et dépendances système Tauri 2 (WebView2 + Build Tools C++ sous Windows, Xcode Command Line Tools sous macOS).

## Installation & Démarrage Web

```bash
npm install
npm run dev
```

L'application démarre sur `http://127.0.0.1:3000`. Au premier lancement, aucun code PIN par défaut n'existe : le propriétaire configure son code PIN à 6 chiffres.

## Démarrage Desktop (poste équipé Rust + Tauri 2)

```bash
npm install
npx tauri dev
```

Pour générer les installateurs (`.msi`/`.exe` Windows ou `.app`/`.dmg` macOS) : `npx tauri build`. Voir `docs/INSTALLATION_WINDOWS.md` et `docs/INSTALLATION_MACOS.md`.

## Tests, Benchmark et Build

```bash
# Contrôle TypeScript strict
npm run typecheck

# Lint ESLint (TypeScript + React Hooks)
npm run lint

# Build production frontend
npm run build

# Tests d'intégration API (A–X), contrats Rust/Tauri et composants React UI
npm run test

# Tests navigateur E2E Playwright (nécessite Chromium installé via `npx playwright install chromium`)
npm run test:e2e

# Benchmark SQLite (10k produits / 10k clients / 100k lignes de vente & stock)
npm run benchmark
```

## Sauvegarde et Migration (V2 -> V3)

- **Sauvegardes cohérentes** : exécutées depuis l'écran **Sauvegardes** via `PRAGMA wal_checkpoint(TRUNCATE)` + `VACUUM INTO` et vérifiées par `PRAGMA integrity_check` et `PRAGMA foreign_key_check` (`docs/BACKUP_RESTORE.md`).
- **Migration depuis DEPOTPRO Python** : toujours migrer sur une **copie** avec le script non destructif :

```bash
python3 scripts/migrate_v2_to_v3.py --source /chemin/ancien_depot.db --target ./data/depotpro_v3.db --strict
```

## Dépannage

Consulter `docs/TROUBLESHOOTING.md` (verrouillage PIN après 5 essais, verrou d'instance `depotpro.lock`, erreur `SQLITE_BUSY`, refus de vente à crédit, restauration de sauvegarde).

## Documentation complète (`/docs/`)

- `AUDIT_PHASE_0.md` — Audit technique du dépôt source et matrice de reprise
- `ARCHITECTURE_V3.md` — Architecture Web + Rust + Tauri 2
- `DATABASE.md` — Schéma SQLite V3, contraintes et invariants
- `DATA_MIGRATION.md` — Procédure de migration sans perte ni arrondi
- `BUSINESS_RULES.md` — Règles métier financières, stock et consignations
- `SECURITY.md` — Authentification bcrypt, sessions, capabilities Tauri
- `API.md` — Contrats HTTP et commandes Tauri
- `FRONTEND.md` — Architecture React, API client et documents imprimables
- `DESIGN_SYSTEM.md` — Thème clair/sombre, typographie et composants
- `TESTING.md` — Couverture des scénarios A–X et benchmark
- `USER_GUIDE.md` — Guide utilisateur quotidien du dépôt (caisse, POS, stock, consignations, sauvegardes)
- `BACKUP_RESTORE.md` — Sauvegarde `VACUUM INTO`, vérification et restauration
- `INSTALLATION_WEB.md` — Déploiement Web Node/Express et serveur Rust Axum
- `INSTALLATION_WINDOWS.md` — Build et installation Windows (MSI/NSIS)
- `INSTALLATION_MACOS.md` — Build et installation macOS (`.app`/`.dmg`)
- `TROUBLESHOOTING.md` — Résolution des incidents courants
- `CHANGELOG.md` — Journal des évolutions V3
- `PRODUCTION_READINESS_REPORT.md` — Rapport de validation finale (tests, benchmarks, plateformes, risques résiduels)

## État de production (novembre 2026)

- **Métier & intégrité** : 22 scénarios paritaires Node/Rust + parcours complet de la section 10.1 validés (`cargo test --workspace` : 17 binaires vertes, 0 échec).
- **Performance** : p95 sous les cibles avec marges > 7× sur 10k produits / 100k lignes (`npm run benchmark`).
- **Desktop** : compilation Rust/Tauri validée ; signature macOS et installateur Windows restent à produire sur les postes cibles (voir `docs/INSTALLATION_MACOS.md` et `docs/INSTALLATION_WINDOWS.md`).
