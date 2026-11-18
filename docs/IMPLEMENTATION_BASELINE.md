# Implémentation Baseline — DEPOTPRO PREMIUM V3 (syst_emballages.md)

> Livrable **LOT 0 — Audit et préparation** du plan `syst_emballages.md`.
> Ce document est un état des lieux **réel** (代码 source + commandes exécutées), pas une
> déclaration d'intention. Les résultats ci-dessous ont été produits sur la branche `main`.

- **Commit audité :** `cb78d3c` (HEAD de `main`, `Merge pull request #2`)
- **Date de l'audit :** 2026-11-18
- **Branche de travail recommandée pour les lots suivants :** `feat/depotpro-v3-emballages`

## 1. Versions des outils

| Outil | Version |
| ----- | ------- |
| Node.js | v26.7.0 |
| npm | 11.19.0 |
| rustc | 1.100.0 (0ef1bc386 2026-11-09) |
| cargo | 1.100.0 (3acc79c0 2026-11-05) |

## 2. Architecture réelle (avant LOT 1)

Le dépôt contient **deux serveurs métier** : le serveur Node.js historique et le serveur
Rust unifié. `depotpro-core` (Rust) est déjà l'autorité métier pour la partie Rust.

```
DEPOTPRO
├── Frontend React 19 + TS (src/)         → clients API (Http/Tauri)
├── depotpro-core   (Rust)                → cœur métier (ventes, achats, stock, caisse,
│                                            consignations, auth, pdf, reports, backup)
├── depotpro-server (Axum, main.rs)       → API REST (56 routes) → appelle depotpro-core
├── src-tauri (66 commandes #[tauri::command]) → utilise depotpro_core directement
└── server/ (Node/Express, app.ts 805 l.) → MÊME logique métier dupliquée en TypeScript
    server.ts (racine)                    → point d'entrée dev/prod (Express + Vite)
```

### Inventaire des composants

| Composant | Fichiers clés | Rôle | Cible V3 |
| --------- | ------------- | ---- | -------- |
| Cœur Rust | `crates/depotpro-core/src/{domain,application,infrastructure}` | Logique métier + SQLite | **Autorité unique** |
| Serveur Axum | `crates/depotpro-server/src/main.rs` (2292 l.) | API REST | **Serveur web unique** |
| Desktop | `src-tauri/src/{commands,state,lib}.rs` | 66 commandes IPC | Utilise `depotpro-core` ✅ |
| Serveur Node | `server/app.ts`, `server/services/*`, `server/db.ts`, `server/domain.ts` | Logique dupliquée | **À supprimer (LOT 1)** |
| Frontend | `src/` (17 pages), `src/services/api/*` | UI + clients API | Conserver / adapter |

### Clients API React

- `src/services/api/ApiClient.ts` — contrat d'interface commun.
- `src/services/api/HttpApiClient.ts` — `fetch('/api/...')` same-origin (Axum en prod, Vite en dev).
- `src/services/api/TauriApiClient.ts` — IPC Tauri.
- `src/services/api/createApiClient.ts` — fabrique (choisit Http ou Tauri).

## 3. Parité des routes Node ↔ Rust

**Résultat : parité complète.** 56 routes Node, 56 routes Rust (chemins identiques ;
les différences apparentes `comm` ne sont que la syntaxe `{param}` vs `:param`).

- Routes présentes dans Node et **absentes** de Rust : **0**.
- La logique Axum appelle bien `depotpro-core` (pas de stub).

> Note : les chaînes `"/api/.../{x}"` repérées après la ligne ~2100 de `main.rs` sont des
> fixtures de test (module `#[cfg(test)]`), pas des routes runtime.

## 4. Migrations SQLite

| Fichier | Objet |
| ------- | ----- |
| `0001_initial_v3.sql` | Schéma complet (products, ventes, achats, stock, caisse, consignations simplifiées, audit) |
| `0002_app_settings_logo_path.sql` | Ajout `logo_path` |
| `0003_expense_receipt_path.sql` | Ajout `receipt_path` |
| `0004_onboarding_setup_state.sql` | État d'onboarding |
| `0005_security_roles_users.sql` | Rôles, utilisateurs, permissions (RBAC) |
| `expected_schema_v4.json`, `expected_schema_v5.json` | Snapshots de schéma attendus (tests) |

Le système de migrations versionnées existe déjà (LOT 4 Remediation). Les migrations ne
doivent **jamais** être réécrites ; toute évolution passe par un nouveau fichier (LOT 2/3).

## 5. Écrans (src/pages)

17 écrans : `Login`, `Dashboard`, `Sales`, `SalesHistory`, `Clients`, `Debts`, `Products`,
`Stock`, `Inventory`, `Consignments`, `Suppliers`, `Purchases`, `Cash`, `Expenses`, `Reports`,
`Settings`, `Backups`. Organisation déjà modulaire (`src/features/<domaine>/{components,hooks,utils}`).

## 6. État de référence des tests (résultats réels exécutés)

Commandes exécutées **séparément** (les résultats sont réels, même en cas d'échec) :

| Commande | Résultat |
| -------- | -------- |
| `cargo fmt --all -- --check` | ✅ exit 0 |
| `cargo clippy -p depotpro-core -p depotpro-server --all-targets -- -D warnings` | ✅ exit 0 |
| `cargo test --workspace` | ✅ 36 passed / 0 failed |
| `npm run typecheck` | ✅ exit 0 (après correctif §8) |
| `npm run lint` | ✅ exit 0 (après correctif §8) |

Tests Rust par fichier : `unittests(lib)=7`, `lot1=2`, `lot2=2`, `lot3=1`, `lot4=3`, `lot5=2`,
`lot6=4`, `lot9_parity=1`, `scenarios=3`, `wip_cleanup_regression=2` (+1 filtré).

> **Différé** (hors périmètre LOT 0, traités aux LOT 7/11) : `npm run build`, `npm run test:e2e`
> (Playwright), `npm run benchmark`, compilation Tauri Windows/macOS. Ces étapes ne sont pas
> marquées « réussies » : elles n'ont pas été exécutées ici.

## 7. Tests Node.js (à traiter au LOT 1)

`npm test` exécute `tsx --test tests/*.test.mjs` (10 fichiers) qui testent les **services Node**.
Après suppression du serveur Node (LOT 1), ces tests devront être :
- migrés pour cibler l'API Axum (via HTTP), ou
- remplacés par les tests Rust équivalents (`depotpro-core/tests/*`), déjà existants pour lot1→lot9.

Fichiers concernés : `tests/api.test.mjs`, `contracts.test.mjs`, `lot1..lot6`, `lot9_parity`, `ui`.

## 8. Problèmes détectés pendant la mise en place de la baseline (corrigés)

1. **WIP cassé (corrige)** : `import_products_csv` (`products.rs`) contenait un `}` parasite
   **dans** la chaîne SQL → INSERT invalide à l'exécution (aucune erreur de compilation).
   - Fichiers `crates/depotpro-server/src/{handlers,state,lib}.rs` supprimés (stubs orphelins
     renvoyant de fausses données, non utilisés par `main.rs`).
   - `Cargo.toml` serveur : revert des deps `sqlx`/`thiserror` ajoutées pour ces stubs.
   - `scripts/debug_auth.mjs` supprimé ; `package-lock.json` revert (churn `"dev": true`).
   - Ajout de `crates/depotpro-core/tests/wip_cleanup_regression.rs` (2 tests) couvrant l'import CSV.
2. **`tsc` et `eslint` scannaient `target/`** (artefacts de build générés) → échecs `typecheck`/`lint`.
   - `tsconfig.json` : `exclude` += `node_modules`, `target`, `src-tauri/gen`.
   - `eslint.config.mjs` : `ignores` += `target/**`, `src-tauri/gen/**`.
   - `.gitignore` : ajout `target/`, `src-tauri/gen/`.

## 9. Avertissement connu (bénin)

`unused field license in workspace.package` (Cargo.toml workspace, `license = "Proprietary"`).
N'empêche pas clippy (`-D warnings` sur le code Rust : exit 0). Laissé tel quel pour ne pas
modifier les métadonnées de packaging Tauri sans justification.

## 10. Responsabilités Node.js à migrer / supprimer (périmètre LOT 1)

| Responsabilité Node | Couverture Rust existante | Action LOT 1 |
| ------------------- | ------------------------- | ------------ |
| `server/services/{auth,catalog,sales,purchases,consignments,finance,reports,pdf}.ts` | `depotpro-core` (mêmes domaines) | Vérifier parité puis supprimer |
| `server/db.ts`, `server/domain.ts` | `depotpro-core::infrastructure::db`, `domain` | Supprimer |
| `server/app.ts` (Express) | `depotpro-server` (Axum) | Supprimer |
| `server.ts` (dev/prod Node) | Axum sert SPA + API ; Vite proxy `/api` | Remplacer par Axum + `vite` (proxy) |
| Dists `express`, `@types/express` | — | Retirer (garder `tsx` pour scripts/tests) |

## 11. Plan des lots suivants (rappel syst_emballages.md)

- **LOT 1** — Architecture Rust unique : brancher le dev web sur Axum (proxy Vite `/api`),
  adapter Playwright (`webServer` Axum), migrer/supprimer les tests Node, supprimer `server/` +
  `server.ts` + deps Node, mettre à jour `package.json`/CI/docs. **Validation : aucun serveur
  Node métier lancé ; mêmes 56 routes ; tests verts.**
- **LOT 2** — Modèle catalogue : `product_categories`, `brands`, `products`, `product_variants`,
  `bottle_profiles`, `crate_types`, `crate_compatibility_groups`, `product_packaging_options`,
  `disposable_packaging_types`, tarifs.
- **LOT 3** — Emballages : supports plastiques vs bouteilles (mouvements), comptes clients/fournisseurs.
- **LOT 4** — Commandes mélangées (`mixed_case_groups`, `mixed_case_lines`, capacités, demi-casiers).
- **LOT 5→12** — Achats/fournisseurs, tarifs/liquidité/caisse, ventes/facturation, stock/inventaires,
  UI, sécurité/sauvegardes/migrations, CI/release, validation métier finale.

## 12. Réserve

Cette baseline est un **audit** : elle ne modifie aucune donnée de production et ne lance aucune
migration sur une base réelle. Les builds Desktop (Windows/macOS), E2E et benchmarks sont
volontairement **non exécutés** ici et restent à valider aux LOT 7/11.