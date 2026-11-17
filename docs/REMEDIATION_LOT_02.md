# DEPOTPRO PREMIUM V3 — Rapport de Remédiation LOT 2

**Lot :** LOT 2 — Calculs financiers exacts et fiabilisation du POS (Priorité P0)  
**Branche :** `arena/3e842633-ss-depot-rust`  
**Base (`main`) :** `c7c7db433e56ec8a732b49b43501ec34b278c4a5` (`0028d4c` sur `origin/main`)  
**Commits Lot 2 :** `dfbe1c6`, `9c1c1ba`  
**Date :** 2026-11-17

---

## 1. Résumé exécutif

Le Lot 2 unifie et durcit l'ensemble des calculs financiers exacts en FCFA (`i64` / `i128` / `BigInt`) et des quantités en milli-unités (`Quantity` / `*_milli`) entre Rust, Node.js et le POS React :

1. **Primitives exactes FCFA & milli-unités (2.1 & 2.2) :**
   - Rust (`money.rs`, `quantity.rs`) : constructeurs bornés (`from_i64`, `from_i128`), soustraction non négative contrôlée (`checked_sub_non_negative`), multiplication exacte via `i128`, parser ASCII strict `Quantity::parse_str` / `parse_positive_str` (3 décimales maximum, rejet de `.5`, `1.`, `1.2345`, `0`), arithmétique contrôlée (`checked_add`, `checked_sub`).
   - Node.js (`server/domain.ts`, `server/db.ts`) : `checkedSubMoney`, `checkedSubNonNegativeMoney`, `checkedMulMoney`, `checkedAddMilli`, `checkedSubMilli`, calcul SQL sécurisé dans `getTheoreticalCash` via `CAST(COALESCE(SUM(...), 0) AS TEXT)` et `BigInt`.
2. **Calcul exact des ventes & protection débordements (2.3) :**
   - Rust (`application/sales.rs`) et Node.js (`server/services/sales.ts`) : cumul par ligne/produit contrôlé (`checked_add` / `checkedAddMoney` / `checkedAddMilli`), vérification stricte `credit_limit` via `i128` / `BigInt`, bornes sur dépôts et mises à jour stock (`createSale`, `cancelSale`, `createSaleReturn`), `i64::try_from` sur les débits d'inventaire et réceptions d'achats.
3. **Fiabilisation complète du POS React (2.4) :**
   - Nouveau module dédié `src/features/sales/utils/saleCalculations.ts` utilisant exclusivement `BigInt` (aucun `Number()` / `Math.round()` / flottant JS) pour parser les quantités, calculer les lignes (`qtyMilli * unitPrice / 1000`), valider les remises ligne et globale, les consignes (quantités entières uniquement), les paiements mixtes, le reste / rendu et les limites entières sûres (`Number.MAX_SAFE_INTEGER`).
   - Mise à jour de `src/stores/uiStore.ts` (`addToCart` en milli-unités exactes) et `src/pages/SalesPage.tsx` : suppression de `Number()`/`Math.round()`, affichage d'erreurs explicites, désactivation de `Valider`/`F9` lorsque `!totals.isValid`, et conservation intégrale du panier après tout échec serveur.
   - Durcissement complémentaire sur `PurchasesPage.tsx`, `ConsignmentsPage.tsx` et `CashPage.tsx` (calculs `BigInt` et garde `Number.isSafeInteger`).
4. **Caisse & Consignations (2.5 & 2.6) :**
   - Contrôles de débordement sur `close_cash_session`, `pay_receivable`, `get_theoretical_cash`, `get_stock_overview` (CUMP `BigInt` arrondi demi-entier supérieur sans perte), `adjust_stock`, `adjust_returnable_stock` et `return_client_empties`.

---

## 2. Fichiers modifiés et créés

### Moteur métier Rust (`crates/depotpro-core`)
- `crates/depotpro-core/src/domain/money.rs` : `from_i64`, `from_i128`, `ensure_non_negative`, `ensure_positive`, `checked_sub_non_negative`, `checked_mul` (`i128`), tests unitaires étendus.
- `crates/depotpro-core/src/domain/quantity.rs` : `parse_str` & `parse_positive_str` (validation stricte ASCII, max 3 décimales), `checked_add`, `checked_sub`, tests unitaires étendus.
- `crates/depotpro-core/src/application/sales.rs` : `get_theoretical_cash_tx` contrôlé, cumuls `create_sale` / `create_sale_return`, plafond crédit `i128`, `next_stock` contrôlé.
- `crates/depotpro-core/src/application/cash.rs` : vérifications contrôlées sur clôture de caisse et encaissements de créances.
- `crates/depotpro-core/src/application/consignments.rs` : contrôles bornés sur stock d'emballages, retours client (remboursement, réduction créance, soldes client/stock).
- `crates/depotpro-core/src/application/purchases.rs` & `inventory.rs` : `checked_add` / `checked_sub` et conversions `i64::try_from` sécurisées.
- `crates/depotpro-core/tests/lot2_finance_pos.rs` : tests unitaires et d'intégration couvrant tous les invariants financiers, quantités, rejets et parités caisse/consignes.

### Backend Node.js (`server/`)
- `server/domain.ts` & `server/db.ts` : helpers exacts (`checkedSubMoney`, `checkedSubNonNegativeMoney`, `checkedMulMoney`, `checkedAddMilli`, `checkedSubMilli`) et `getTheoreticalCash` `BigInt`.
- `server/services/sales.ts`, `server/services/finance.ts`, `server/services/consignments.ts`, `server/services/purchases.ts` : contrôles complets de parité sur ventes, retours, annulations, caisse, créances, valorisation stock `BigInt`, achats et consignations.

### Frontend React (`src/`) & Tests Node/UI
- `src/features/sales/utils/saleCalculations.ts` : calculateur `BigInt` exact POS (quantités, fractions, dépôts, remises, paiements, validation).
- `src/stores/uiStore.ts` : addition exacte des quantités en milli-unités dans `addToCart`.
- `src/pages/SalesPage.tsx`, `PurchasesPage.tsx`, `ConsignmentsPage.tsx`, `CashPage.tsx` : intégration complète du calcul exact `BigInt`, erreurs explicites et conservation du panier en cas d'erreur.
- `tests/lot2_finance_pos.test.mjs` : suite dédiée Node + module React `saleCalculations.ts` + API POS/Caisse/Consignes.
- `tests/ui.test.mjs` : test composant #31 vérifiant le POS React exact en `BigInt`, le rejet des fractions interdites/inexactes et la préservation du panier après erreur serveur.

---

## 3. Résultats de vérification (sur code exact `9c1c1ba`)

### Environnement local (Node `v22.22.3`, npm `10.9.8`)
- `npm run typecheck` (`tsc --noEmit`) : **PASS** (0 erreur)
- `npm run lint` (`eslint . --max-warnings 0`) : **PASS** (0 warning, 0 erreur)
- `npm run test` (`tsx --test tests/*.test.mjs`) : **PASS (66/66 tests, 5/5 suites)**
  - `tests/api.test.mjs` : 24/24 PASS
  - `tests/contracts.test.mjs` : 6/6 PASS
  - `tests/lot1_sales_purchases.test.mjs` : 2/2 PASS
  - `tests/lot2_finance_pos.test.mjs` : 3/3 PASS (invariants Node, module React `BigInt`, parité POS/caisse/consignes API)
  - `tests/ui.test.mjs` : 31/31 PASS
- `npm run build` (`vite build`) : **PASS** (`vite v8.3.8`, `dist/` généré en 987ms)
- `npm run benchmark` : **PASS** (`p50=9.59ms` recherche, `p50=0.14ms` détail, `p50=0.92ms` validation vente)

### GitHub Actions CI — Run `44189149821` sur commit `9c1c1ba`
- **Web API, Frontend UI, Benchmark & Migration Python** (`134413578401`) : **PASS (`success`)**
- **Playwright E2E Navigateur** (`134414215687`) : **PASS (`success`)**
- **Rust Core & Axum Server** (`134413578947`) :
  - `Analyse statique Rust (clippy --all-targets -- -D warnings)` : **PASS (`success`)**
  - `Tests unitaires et d'intégration Rust (cargo test -p depotpro-core -p depotpro-server)` : **PASS (`success`)** — y compris `depotpro-core` (`money.rs`, `quantity.rs`) et `--test lot2_finance_pos`
  - `Vérification formatage Rust (rustfmt)` : **FAIL (préexistant depuis `c7c7db4`, traité au Lot 7)**

---

## 4. Critères de validation du Lot 2

- [x] Arithmétique FCFA et milli-unités exactes (`i64`/`i128` en Rust, `BigInt`/entiers sûrs en Node.js et React) sans flottant ni arrondi silencieux.
- [x] `SalesPage.tsx` débarrassé de `Number()`/`Math.round()` via `src/features/sales/utils/saleCalculations.ts`, validation désactivée si panier invalide, panier conservé après échec.
- [x] Caisse et consignations protégées contre les dépassements entiers (y compris `SUM` SQL via `CAST(... AS TEXT)` -> `BigInt`).
- [x] Suite complète Node (66/66), Rust (`clippy` + `cargo test` incl. `lot2_finance_pos.rs`) et Playwright E2E verte sur `9c1c1ba`.
- [x] Base de données `data/depotpro_v3.db*` non modifiée.
