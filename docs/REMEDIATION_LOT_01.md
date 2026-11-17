# DEPOTPRO PREMIUM V3 — Rapport de Remédiation LOT 1

**Lot :** LOT 1 — Correction critique des ventes et des réceptions d'achats (Priorité P0)  
**Branche :** `arena/3e842633-ss-depot-rust`  
**Base (`main`) :** `c7c7db433e56ec8a732b49b43501ec34b278c4a5` (`0028d4c` sur `origin/main`)  
**Commits Lot 1 :** `ab5fdab`, `2268487`, `c521223`, `148cc0f`, `6159ba4`, `c36c0db`, `1a924e3`  
**Date :** 2026-11-17

---

## 1. Résumé exécutif

Le Lot 1 corrige les failles critiques d'intégrité sur les retours de vente (`create_sale_return` / `createSaleReturn`) et les réceptions de commandes d'achat (`receive_purchase_order` / `receivePurchaseOrder`), tout en rendant exécutable la suite complète de tests Rust et Playwright E2E dans la CI GitHub Actions :

1. **Retours de vente (`1.1`) :** rejet déterministe des doublons de `sale_line_id` dans une même requête, vérification du reliquat retournable cumulé (`already_returned + new <= sold`), rejet des lignes déjà intégralement retournées et des ventes annulées, validation préalable du mode de remboursement (`refund_method_code`) avant toute écriture, contrôle d'idempotence `request_key` inter-ventes (`409 Conflict` si réutilisée sur une autre vente), et invariant `credit_reduction + refund_amount == total_return`.
2. **Réceptions d'achat (`1.2`) :** rejet déterministe des doublons de `purchase_order_line_id` dans une même requête, contrôle d'idempotence `request_key` inter-commandes (`409 Conflict` si réutilisée sur une autre commande), conversion exacte en milli-unités de base via `i128` / `BigInt`, mise à jour SQL conditionnelle gardée (`WHERE ... AND received_quantity_milli + ? <= ordered_quantity_milli`) vérifiant `changes === 1` (`rows_affected == 1`) au niveau base de données, mise à jour atomique du stock, du CUMP, de la dette fournisseur et du statut de commande.
3. **Interface utilisateur & Contrats API :** typage explicite des payloads dans `ApiClient.ts` / `HttpApiClient.ts` / `TauriApiClient.ts`, normalisation des quantités saisies (virgule -> point, milli-unités exactes), blocage UI des dépassements et des lignes soldées, réinitialisation complète des modales à la fermeture.
4. **Déblocage de la compilation et des tests Rust + E2E (préexistants de `c7c7db4`) :** correction des erreurs de compilation/clippy/tests qui empêchaient l'exécution réelle de `cargo clippy` et `cargo test` (`cash.rs`, `pdf.rs`, `consignments.rs`, `scenarios.rs`, etc.), et correction des sélecteurs stricts dans `tests/e2e/app.spec.ts`.

---

## 2. Fichiers modifiés et créés

### Moteur métier Rust (`crates/depotpro-core`) & Tests Rust
- `crates/depotpro-core/src/application/sales.rs` : normalisation et rejet des `sale_line_id` dupliqués, garde `sale_id <= 0` / `request_key` non vide, conflit 409 si `request_key` appartient à une autre vente, rejet ligne déjà totalement retournée, validation pré-mutation de `refund_method_code`, vérification stricte `credit_reduction + refund_amount == total_return`, alias `SaleProductRow`/`SalePackagingRow` (clippy) et `_rec_id`.
- `crates/depotpro-core/src/application/purchases.rs` : normalisation et rejet des `purchase_order_line_id` dupliqués, conflit 409 sur `request_key` cross-PO, rejet ligne déjà intégralement réceptionnée, `UPDATE purchase_order_lines` conditionnel borné par `ordered_quantity_milli`, alias `ExistingSupplierRow`/`PreparedPurchaseOrderLine`/`PreparedReceiptLine` (clippy).
- `crates/depotpro-core/tests/lot1_sales_purchases.rs` : nouveaux tests d'intégration Rust couvrant les scénarios obligatoires 1.1 et 1.2 (partiel, solde, dépassement, doublons, multi-lignes, vente annulée, idempotence et conflit cross-entité, atomicité après erreur, concurrence `tokio::join!`, CUMP et dette fournisseur).
- Corrections préexistantes pour compilation/lint/exécution Rust :
  - `crates/depotpro-core/src/application/cash.rs` (`client_code: string` -> `String`).
  - `crates/depotpro-core/src/application/pdf.rs` (`logo_path: None` dans le test unitaire, `1..=30` lignes -> `/Count 2`, `.is_multiple_of(3)`).
  - `crates/depotpro-core/src/application/consignments.rs` (`cpa.rowid AS id`, `rsm.date AS created_at`, `DepositIssueRow`).
  - `crates/depotpro-core/src/application/inventory.rs`, `products.rs`, `infrastructure/backup.rs` (`type` alias clippy `type_complexity` et `sort_by_key`).
  - `crates/depotpro-core/tests/scenarios.rs` (`sale.sale.id`, `cancelled.sale.status`, `sale.sale.reference`).

### Backend Node.js (`server/`)
- `server/services/sales.ts` : parité complète sur `createSaleReturn` (rejet `sale_line_id` dupliqués, normalisation, conflit `request_key` inter-ventes, validation `refund_method_code` avant mutation, contrôle `credit_reduction + refund_amount == total_return`, atomicité `withWriteTx`).
- `server/services/purchases.ts` : parité complète sur `receivePurchaseOrder` (rejet `purchase_order_line_id` dupliqués, conflit `request_key` inter-commandes, `UPDATE purchase_order_lines` conditionnel vérifiant `changes === 1`, calcul CUMP `BigInt`, mise à jour atomique dette/statut).
- `server/services/consignments.ts` : alignement `cpa.rowid AS id` et `rsm.date AS created_at` avec le schéma SQLite `0001_initial_v3.sql` et le frontend React.

### Frontend React & Clients API (`src/`)
- `src/services/api/ApiClient.ts`, `HttpApiClient.ts`, `TauriApiClient.ts` : introduction des types `CreateSaleReturnPayload` et `ReceivePurchaseOrderPayload`.
- `src/pages/SalesHistoryPage.tsx` : validation stricte des quantités retournées (`parseQtyMilliInput` + normalisation virgule + borne milli-unités `<= sold - returned`), désactivation des lignes déjà soldées, réinitialisation état/erreur à la fermeture.
- `src/pages/PurchasesPage.tsx` : validation stricte des quantités réceptionnées (`parseQtyMilliInput` + normalisation virgule + borne milli-unités `<= ordered - received`), réinitialisation état/erreur à la fermeture.

### Tests Node, UI, E2E & CI
- `tests/lot1_sales_purchases.test.mjs` : suite dédiée Node.js couvrant 1.1 et 1.2 (dont concurrence `Promise.all`, atomicité et idempotence cross-entité).
- `tests/ui.test.mjs` : test composant #30 validant les contrôles UI `SalesHistoryPage` et `PurchasesPage`.
- `tests/e2e/app.spec.ts` : correction du sélecteur strict `getByRole('heading', { name: 'Tableau de bord' })` et du bouton `/Ouvrir une session de caisse/i`.
- `.github/workflows/ci.yml` : ajout de `if: ${{ !cancelled() }}` sur `clippy` et `cargo test` afin que l'analyse statique et les tests Rust s'exécutent malgré les écarts `rustfmt` préexistants, plus remontée des erreurs en annotations.

---

## 3. Résultats de vérification (sur code exact `1a924e3`)

### Environnement local (Node `v22.22.3`, npm `10.9.8`)
- `npm run typecheck` (`tsc --noEmit`) : **PASS** (0 erreur)
- `npm run lint` (`eslint . --max-warnings 0`) : **PASS** (0 warning, 0 erreur)
- `npm run test` (`tsx --test tests/*.test.mjs`) : **PASS (62/62 tests, 4/4 suites)**
  - `tests/api.test.mjs` : 24/24 PASS
  - `tests/contracts.test.mjs` : 6/6 PASS
  - `tests/lot1_sales_purchases.test.mjs` : 2/2 PASS (1.1 retours + 1.2 réceptions & concurrence)
  - `tests/ui.test.mjs` : 30/30 PASS
- `npm run build` (`vite build`) : **PASS** (`vite v8.3.8`, `dist/` généré en 1.09s)

### GitHub Actions CI — Run `44186252226` sur commit `1a924e3`
- **Web API, Frontend UI, Benchmark & Migration Python** (`134403452798`) : **PASS (`success`)** — typecheck, ESLint, 62/62 tests, build Vite, benchmark SQLite 10k/100k, migration V2→V3 `--strict`.
- **Playwright E2E Navigateur** (`134403988996`) : **PASS (`success`)** — parcours complet navigateur Chromium headless sur serveur production.
- **Rust Core & Axum Server** (`134403452209`) :
  - `Analyse statique Rust (clippy --all-targets -- -D warnings)` : **PASS (`success`)**
  - `Tests unitaires et d'intégration Rust (cargo test -p depotpro-core -p depotpro-server)` : **PASS (`success`) — 10/10 tests passés**
    - `depotpro-core` (`--lib`) : 3/3 PASS (`exact_fcfa_arithmetic`, `exact_milli_conversions`, `generates_valid_multipage_pdf_for_all_doc_types`)
    - `depotpro-core` (`--test lot1_sales_purchases`) : 2/2 PASS (`lot1_sale_returns_prevent_duplicates_and_preserve_atomicity`, `lot1_purchase_receipts_prevent_duplicates_concurrency_and_partial_writes`)
    - `depotpro-core` (`--test scenarios`) : 3/3 PASS (`rust_core_scenarios_a_through_l`, `scenario_t_company_logo_and_wave_refund`, `scenario_u_cancel_po_and_overdue_kpis`)
    - `depotpro-server` (`--bin depotpro-server`) : 2/2 PASS (`auth_rate_limiter_enforces_window_and_resets`, `origin_allowlist_blocks_foreign_domains_and_accepts_localhost`)
  - `Vérification formatage Rust (rustfmt)` : **FAIL (préexistant depuis `c7c7db4`, traité au Lot 7)**
- **Tauri 2 Desktop (`windows-latest` & `macos-latest`)** (`134403989184`, `134403989181`) : **FAIL (préexistant depuis `c7c7db4` — `@tauri-apps/cli` absent / configuration bundler, planifié au Lot 7)**.

---

## 4. Critères de validation du Lot 1

- [x] Rejet des `sale_line_id` dupliqués et vérification du reliquat cumulé dans Rust, Node.js et React.
- [x] Rejet des `purchase_order_line_id` dupliqués, garde SQL conditionnelle (`received_quantity_milli + ? <= ordered_quantity_milli`) et protection concurrence dans Rust, Node.js et React.
- [x] Invariants financiers et quantités milli-unités exactes (`i128` / `BigInt`) sans modification partielle en cas d'erreur.
- [x] Suite complète Node (62/62), Rust (10/10 + clippy 0 warning) et Playwright E2E (1/1) verte sur `1a924e3`.
- [x] Base de données `data/depotpro_v3.db*` non modifiée.
