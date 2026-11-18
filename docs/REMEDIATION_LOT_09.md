# Rapport de Remédiation — LOT 9 : Parité métier Node.js / Rust

**Statut :** Implémenté et intégré en CI (matrice paritaire 22 scénarios + suite Node **117/117** PASS, tests unitaires `depotpro-core`, tests Axum `depotpro-server` et job CI `cross-engine-parity` exécutant les deux serveurs en parallèle)  
**Branche :** `arena/3e842633-ss-depot-rust`  
**Date :** 2026-11-17

---

## 1. Objectif et architecture cible

L'objectif du Lot 9 est de garantir que le backend **Node.js (`server/services/`)** et le cœur **Rust (`crates/depotpro-core/` + `crates/depotpro-server/` + `src-tauri/`)** interprètent à l'identique les règles métier, validations, calculs de montants/quantités, mouvements de stock, mouvements de caisse, dettes/créances, clés d'idempotence et codes d'erreur.

Conformément à la section **9.3** du plan de remédiation :
- Le cœur Rust **`crates/depotpro-core`** constitue la référence métier cible ;
- Le backend Node.js reste maintenu en parité stricte comme couche Web compatible, sans ajout de règles métier divergentes ;
- Aucune suppression prématurée du backend Node.js n'est introduite dans ce lot.

---

## 2. Écarts de parité corrigés

### 2.1. Côté Rust (`crates/depotpro-core`, `crates/depotpro-server`, `src-tauri`)

1. **Désérialisation des entrées JSON (`products.rs`, `sales.rs`, `purchases.rs`, `inventory.rs`, `reports.rs`)** :
   - Prise en charge homogène des quantités numériques ou chaînes (`"10"` ou `10`) via `deserialize_qty_str` / `deserialize_opt_qty_str` ;
   - Prise en charge des indicateurs booléens au format booléen ou entier SQLite (`true`/`false` ou `1`/`0`) via `deserialize_opt_bool_or_int` sur `allow_fraction`, `is_active`, `allow_negative_stock`.
2. **Alignement des validations & gardes métier** :
   - Rejet explicite des prix négatifs lors de la création/mise à jour produit et conditionnement (`products.rs`) ;
   - Vérification d'existence des clés étrangères `returnable_id` sur les composants de conditionnement (`products.rs`) ;
   - Mise à jour complète des attributs produit sur `update_product` (incluant catégorie, fournisseur, code-barres, image) ;
   - Détection des `product_id` dupliqués dans les lignes de réception et d'inventaire (`purchases.rs`, `inventory.rs`) ;
   - Exigence de session de caisse ouverte sur `return_client_empties` même si le remboursement espèces vaut `0` (`consignments.rs`) ;
   - Détection homogène des collisions de `request_key` inter-entités (annulations/retours de ventes, paiements créances/fournisseurs, mouvements et retours de consignations) avec erreur `CoreError::DuplicateOperation` (`409 DUPLICATE_OPERATION`) ;
   - Calcul des échéances `due_date` en UTC (`chrono::Utc::now()`) identique à Node.js (`sales.rs`, `purchases.rs`).
3. **Parité des DTO et colonnes SQL (`sales.rs`, `purchases.rs`, `cash.rs`, `consignments.rs`, `reports.rs`, `commands.rs`)** :
   - Alignement de `rsm.date AS created_at` sur `returnable_stock_movements` (conforme au schéma SQLite v5) ;
   - Retour complet des DTO attendus par les contrats API : `ClientCreditSettingsDto` (`PUT /api/clients/:id/credit`), `PurchaseOrderDto.debts` triées `ORDER BY sd.id DESC`, `SupplierDebtDto` (`POST /api/supplier-debts/:id/pay`), `ExpenseItemDto` (`POST /api/expenses`), `SaleCancellationDto.refund_method_code`, `PaymentBreakdown` trié `ORDER BY total_in DESC, pm.code ASC` ;
   - Mapping systématique de chaque variante `CoreError` vers son code JSON `UPPER_SNAKE_CASE` (`VALIDATION_ERROR`, `INSUFFICIENT_STOCK`, `SESSION_NOT_OPEN`, `SESSION_ALREADY_OPEN`, `INVALID_PAYMENT`, `CREDIT_POLICY_VIOLATION`, `DUPLICATE_OPERATION`, `HISTORICAL_IMMUTABLE`, `BACKUP_ERROR`, etc.) dans `crates/depotpro-server/src/main.rs`.

### 2.2. Côté Node.js (`server/services/`)

1. **Précision arithmétique `BigInt` (`catalog.ts`, `purchases.ts`, `finance.ts`, `reports.ts`)** :
   - Passage des calculs de CUMP (`average_cost_num` / `average_cost_den`) et de valorisation des stocks en arithmétique rationnelle `BigInt` avec arrondi half-up identique au domaine `depotpro-core`.
2. **Parité des contrôles, dates et écritures (`catalog.ts`, `sales.ts`, `purchases.ts`, `finance.ts`, `consignments.ts`, `reports.ts`)** :
   - Normalisation UTC de `due_date` (`toISOString().slice(0, 10)`) ;
   - Alignement de `importProductsCsv` sur `nonNegativeMilli` (rejet des stocks initiaux négatifs) et vérification des codes-barres dupliqués à la fois sur `products` et `product_packagings` ;
   - Alignement de `cancelSale`, `paySupplierDebt`, `adjustReturnableStock`, `returnClientEmpties` (validation `request_key`, rejet collision cross-entity `409 DUPLICATE_OPERATION`, vérification session de caisse active et clés étrangères) ;
   - Blocage des `product_id` dupliqués dans `validateInventory` ;
   - Tri identique de `PurchaseOrder.debts` (`ORDER BY sd.id DESC`) et `paymentBreakdown` (`ORDER BY total_in DESC, pm.code ASC`).

### 2.3. Équivalence fonctionnelle et divergence HTTP héritée documentée

- **Références et compteurs techniques** : les deux moteurs utilisent `PREFIX-YYYY-00001` (`document_sequences`) et produisent exactement les mêmes références documentaires lorsqu'ils exécutent la même séquence d'opérations.
- **Code d'erreur `CREDIT_POLICY_VIOLATION` vs `CREDIT_FORBIDDEN` / `CREDIT_LIMIT_EXCEEDED`** : dans les deux moteurs, les ventes à crédit non autorisées ou hors plafond sont rejetées en HTTP `400` sans mutation de base ; les tests vérifient l'équivalence sémantique des rejets.
- **Statut HTTP sur doublon de conditionnement (`POST /api/products/:id/packagings`)** : les deux moteurs renvoient le même code métier **`DUPLICATE_OPERATION`**, avec statut `400` côté Node (verrouillé par le test historique `tests/api.test.mjs`) et `409` côté Axum (`CoreError::DuplicateOperation`).

---

## 3. Matrice de parité des 22 scénarios canoniques

| # | Scénario | Validations / Rejets vérifiés | Invariants comparés entre Node.js et Rust |
|---:|---|---|---|
| 0 | Initialisation authentification PIN | `/api/auth/status` (`needsSetup: true`), `/api/auth/setup` PIN 6 chiffres | Jeton Bearer actif, blocage sans jeton |
| 1 | Création client & politique crédit | Nom vide (`400`), délai négatif (`400`), politique invalide (`400`) | Codes `CLI-*`, `credit_policy`, `credit_limit`, `payment_terms_days`, `ClientCreditSettingsDto` |
| 2 | Création fournisseur | Téléphone manquant (`400`) | Code `FRN-*`, `payment_terms_days: 30`, soldes initiaux `0` |
| 3 | Création produit & catégorie | Nom vide (`400`), prix négatif (`400`) | Référence `PROD-*`, `stock_milli: 10000`, `average_cost_fcfa: 450` |
| 4 | Création conditionnements | Doublon (`DUPLICATE_OPERATION`), prix négatif (`400`), `returnable_id` inconnu (`400`) | Pack (`coefficient_milli: 6000`), Casier consigné (`24000`, `deposit_mode: deposit`, `components`) |
| 5 | Ajustement stock | Sortie impossible (`INSUFFICIENT_STOCK`), motif court (`400`) | `+100` unités -> `stock_after_milli: 110000`, rejeu idempotent identique |
| 6 | Ouverture caisse | Vente sans session (`SESSION_NOT_OPEN`), clé vide (`400`), 2e session (`SESSION_ALREADY_OPEN`) | Session `open`, `opening_cash: 50000`, rejeu idempotent |
| 7 | Vente comptant | Fraction interdite (`400`), sous-paiement (`INVALID_PAYMENT`) | 1 casier + 3 btl (`17 550` + `2 500` consigne = `20 050`), stock `83 000` milli |
| 8 | Vente à crédit | Crédit interdit (`400`), plafond dépassé (`400`) | 2 casiers gros (`26 400` + `5 000` consigne), acompte `1 400` -> créance `30 000` (`due_date` UTC J+15) + consigne 2 pièces |
| 9 | Paiement mixte | Ventilation multi-canal | `13 000` FCFA (`3 000` espèces + `4 000` Wave + `6 000` OM), caisse théorique exacte |
| 10 | Retour de vente | Doublon `sale_line_id` (`400`), dépassement quantité (`400`), collision clé (`409`) | Retour 4 btl -> avoir `AVO-*`, `partially_returned`, `+4` en stock, `-2 600` caisse |
| 11 | Annulation de vente | Annulation après retour (`HISTORICAL_IMMUTABLE`), moyen inconnu (`400`), collision (`409`), double annulation (`400`) | Remboursement Wave `1 300`, `refund_method_code: wave`, stock restauré (`19 000` milli) |
| 12 | Paiement de créance | Surpaiement (`INVALID_PAYMENT`) | Paiement mixte `10 000` espèces + `5 000` Wave -> reste `15 000`, rejeu idempotent |
| 13 | Commande d'achat | Création sans impact stock | 10 casiers @ `10 800` = `108 000`, `status: confirmed`, `debts: []`, stock inchangé |
| 14 | Réception partielle | Doublon ligne (`400`), annulation PO partiel (`HISTORICAL_IMMUTABLE`) | 4 casiers -> `+96` btl (`115 000` milli), dette `43 200` (`due_date` UTC J+30) |
| 15 | Réception totale | Dépassement commandé (`400`), réception sur PO soldé (`HISTORICAL_IMMUTABLE`) | 6 casiers -> `+144` btl (`259 000` milli), `CUMP: 450`, valorisation `116 550` FCFA, 2 dettes |
| 16 | Règlement fournisseur | Collision clé cross-kind (`409`), surpaiement (`400`) | Paiement `23 200` espèces -> reste `20 000` (`partial`), mouvement caisse `supplier_payment` |
| 17 | Retour consignation & stock vides | Contrepartie > valeur (`400`) | Retour 1 casier (`1 000` espèces + `1 500` déduction créance -> reste `13 500`), `+5` vides -> stock `26` |
| 18 | Inventaire physique | Écart sans motif (`400`), produit dupliqué (`400`), revalidation (`HISTORICAL_IMMUTABLE`) | Comptage `257` -> mouvement `inventory_adjust` `-2 000` milli |
| 19 | Dépense | Dépense > solde espèces (`INVALID_PAYMENT`) | `5 000` FCFA espèces (`Carburant`), mouvement caisse, rejeu idempotent |
| 20 | Clôture de caisse | Écart sans motif (`400`), collision `closing_key` inter-session (`409`) | Écart `-500` FCFA motivé, `difference: -500`, caisse théorique exacte |
| 21 | Sauvegarde & rapports | Vérification lecture seule SHA-256 / FK | Parité exacte `commercial`, `profitability`, `stock`, `paymentBreakdown`, `dashboard.kpis`, `verify` |
| 22 | Restauration contrôlée | Mutation post-backup effacée + audit `RESTORE_BACKUP` (`+1` audit log) | Parité des compteurs, rapports restaurés, et égalité stricte des tables SQLite entre les deux moteurs |

---

## 4. Suites de tests et intégration continue

### 4.1. Tests créés et mis à jour
- **`tests/lot9_parity.test.mjs`** : suite HTTP + SQLite exécutant les 22 scénarios canoniques (+ initialisation PIN) :
  - En mode autonome (inclus dans `npm test`) contre le backend Express ;
  - En mode bi-moteur (`DEPOTPRO_PARITY_RUST_URL` + `DEPOTPRO_PARITY_RUST_DB`) comparant simultanément les réponses HTTP, les codes erreur, les rapports et l'état final des tables SQLite entre Node.js et Axum (`depotpro-server`).
- **`crates/depotpro-core/tests/lot9_parity.rs`** : test d'intégration Rust (`lot9_22_scenarios_business_parity`) rejouant les 22 scénarios directement sur `depotpro_core` avec vérification de tous les soldes, mouvements, CUMP, idempotences, erreurs métier et restauration SQLite.
- **`crates/depotpro-server/src/main.rs`** (`axum_lot9_http_json_and_error_code_parity`) : test HTTP Axum vérifiant statuts, codes `UPPER_SNAKE_CASE`, désérialisation numérique/booléenne et restauration JSON camelCase.
- **`.github/workflows/ci.yml`** : ajout du job **`13. Parité métier Node.js / Rust (22 scénarios)`** (`cross-engine-parity`) qui compile `depotpro-server`, le lance sur une base temporaire isolée et exécute `tests/lot9_parity.test.mjs` en mode bi-moteur complet.

### 4.2. Vérifications locales exécutées
- `npm run typecheck` (`tsc --noEmit`) : **PASS** (`0` erreur)
- `npm run lint` (`eslint . --max-warnings 0`) : **PASS** (`0` erreur, `0` avertissement)
- `npm test` (`tsx --test tests/*.test.mjs`) : **117/117 PASS** sur **10 suites** (`25.19s`), incluant **23/23** sous-tests dans `tests/lot9_parity.test.mjs`
- `npm run build` (`vite build`) : **PASS** (`1.55s`)

Les jobs Rust (`rust-core-tests`, `rust-server-tests`, `rust-clippy`, `rustfmt`, `cross-engine-parity`, `tauri-windows`, `tauri-macos`) valident le code Rust et l'exécution bi-moteur complète dans GitHub Actions CI.
