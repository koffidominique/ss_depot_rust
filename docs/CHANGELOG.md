# CHANGELOG — DEPOTPRO PREMIUM V3

## [3.0.0] - 2026-11-17
- Phase 0 : Audit complet du dépôt source `depot_python` (`78d9555`), matrice de migration et schéma cible unifié.
- Schéma SQLite V3 unifié (`migrations/sqlite/0001_initial_v3.sql`) : FCFA entiers, quantités `*_milli`, transactions `BEGIN IMMEDIATE`, idempotence `request_key`, contre-écritures non destructives.
- Serveur API complet (`server/`) sur port 3000 + `node:sqlite` + Express + Vite.
- Frontend React 19 + TypeScript + Tailwind v4 + Radix UI + TanStack Query/Table + Recharts : 17 écrans complets Light/Dark.
- Workspace Rust (`crates/depotpro-core`, `crates/depotpro-server`) + squelette Tauri 2 (`src-tauri`) avec `Money(i64)`, `Quantity { milli_units: i64 }`, SQLx WAL et capabilities minimales.
- Script de migration non destructif `scripts/migrate_v2_to_v3.py` avec contrôle `Decimal`.
- Suite de tests d'intégration `tests/api.test.mjs` couvrant les scénarios A à L (12/12 réussis).
- Documents imprimables & export PDF (`DocumentPrintModal`) pour les 9 documents métier : Factures/Reçus, Avoirs (`AVO-*`), Bons de commande (`CMD-*`), Bons de réception (`REC-*`), Retours d'emballages, Rapports de caisse (`CAI-*`, sessions ouvertes et clôturées), État des créances clients et Rapport de stock & valorisation.
- Parité Rust complète à 100 % avec l'interface `ApiClient` dans `crates/depotpro-core` (`auth`, `products` + CSV/conditionnements, `sales`, `purchases`, `cash`, `inventory`, `consignments`, `reports`, `backup`), routes Axum (`crates/depotpro-server`), les 53 commandes IPC Tauri 2 (`src-tauri`), alignement de `TauriApiClient` et verrou d'instance unique (`depotpro.lock`).
- Benchmark de charge `scripts/benchmark_perf.ts` (`npm run benchmark`) validé sur 10k produits / 10k clients / 100k lignes de vente et mouvements.
- Tests d'intégration Rust (`crates/depotpro-core/tests/scenarios.rs`, scénarios A–L) et suite de tests contrats & précision (`tests/contracts.test.mjs`) intégrée à `npm run test` (17/17 tests réussis).
- Documentation complète dans `docs/` (architecture, base de données, migration, règles métier, sécurité, API, frontend, design system, tests, sauvegardes, installation Web/Windows/macOS et dépannage).
