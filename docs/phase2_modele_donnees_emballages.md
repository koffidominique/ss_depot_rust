# PHASE 2 — Conception des données : créances d'emballages (migration 0015)

Conformité au modèle du `MAJ.md` : une obligation physique de restitution d'emballages
n'est **pas** une dette financière exigible avant échéance ou perte/destruction validée.

## Migration 0015_packaging_obligations_conversions.sql

### 1. `packaging_policies` — politique de restitution configurable
- `returnable_id`, `client_id` NULLables : périmètre (client > emballage > défaut global).
- `return_delay_days` : délai de restitution.
- `auto_convert_on_due` : conversion automatique à l'échéance (1) ou validation manuelle (0).
- `allow_late_return` : autorise la restitution après échéance / après conversion.
- Une politique par défaut globale est créée (30 jours, conversion automatique).

### 2. Extension de `deposit_issues` (obligations d'emballages)
Nouvelles colonnes :
- `lost_pieces`, `destroyed_pieces`, `converted_pieces` (quantités-traçage, ≤ pieces)
- `due_date` : échéance de restitution
- `policy_id` : politique applicable au moment de la vente (photographie historique)
- `status` : `pending` / `partially_returned` / `settled` / `converted` / `cancelled`
- `converted_at`, `updated_at`

Règle de non-rétroactivité : les obligations antérieures à la migration sont
initialisées à `pending`/`partially_returned`/`settled` (jamais `converted`) et
reçoivent une `due_date` = created_at + 30 jours (politique par défaut).

`unit_value` existant = valeur photographiée à la vente (règle 13.2 du MAJ.md,
déjà respectée par le code de `create_sale`).

### 3. `packaging_conversions` — conversion en créance financière
- Une ligne par opération de conversion ; `request_key UNIQUE` + `converted_pieces`
  garantissent l'**idempotence** (Test 10 du MAJ.md).
- `reason` : `due_date`, `loss`, `destruction`, `damaged`, `other`.
- `unit_value_snapshot` : valeur applicable au moment de la vente.
- `reversal_of_conversion_id` / `reversed` : régularisation par retour tardif (règle 7.5).
- `validated_by_user_id` : traçabilité de la validation managériale.

### 4. `customer_packaging_financial_ledger` — journal financier d'emballages
Registre **distinct** du compte commercial (`customer_receivables`) :
- `entry_type` : `conversion_charge` (dette créée) / `late_return_credit` (avoir) /
  `payment` / `adjustment`.
- `direction` (`debit`/`credit`) + `balance_after` : solde cumulé auditable.

### 5. `packaging_valuations` — historique des valeurs d'emballages
Photographie par période (`effective_from` / `effective_to`) — une modification de
valeur ne recalcule jamais les créances historiques (Test 9).

### 6. `packaging_loss_declarations` — perte/destruction avant échéance
Statut `declared` → `validated`/`rejected`, motif obligatoire, validation par un
utilisateur habilité, lien vers la conversion générée.

### 7. `packaging_policy_audit_logs`
Journal d'audit des modifications du référentiel et des politiques.

## Correspondance avec les tables du MAJ.md

| Table MAJ.md | Implémentation |
|---|---|
| `packaging_policies` | `packaging_policies` |
| `packaging_valuations` | `packaging_valuations` |
| `customer_packaging_obligations` | `deposit_issues` (étendue) |
| `customer_packaging_returns` | `deposit_returns` (existant) |
| `packaging_conversions` | `packaging_conversions` |
| `customer_packaging_financial_ledger` | `customer_packaging_financial_ledger` |
| `packaging_adjustments` | entrées `adjustment` du ledger (les mouvements physiques restent dans `returnable_stock_movements`) |

## Formule de conversion (règle 7.2)

```
créance = (pieces - returned_pieces - converted_pieces) × unit_value_snapshot
```
calculée dans une transaction SQLite unique, avec mise à jour du statut et écriture
dans le journal financier (implémentation : PHASE 4).

## Tests mis à jour
- `expected_schema_v15.json` régénéré (outil `gen_schema`).
- `CURRENT_SCHEMA_VERSION` porté à 15.
- `cargo test --workspace` : 100 % vert.

---

# PHASE 5 — Fournisseurs et réapprovisionnement (bilan)

## Audit
Le workflow `create_purchase_order` / `receive_purchase_order` (purchases.rs) implémentait déjà :
- création fournisseur indépendant des brasseries ;
- livraisons partielles avec `received_quantity_milli` cumulé et plafond à `ordered_quantity_milli` ;
- **échange d'emballages vides par type exact** (`deposit_packaging_components` → `returnable_id` × `pieces_per_pack`), mouvement `supplier_exchange`, contrôle de stock insuffisant bloquant, tout en une transaction idempotente (request_key) ;
- aucune dette financière d'emballages automatique côté fournisseur (règle 9.4).

## Tests ajoutés — `lot11_supplier_packaging_exchange.rs`
- **Test 7 MAJ.md** : commande 20 casiers Bock 33 + 10 casiers Bock 50 → 20×24 000 + 10×12 000 milli ajoutés au stock boissons, 20 casiers 33 cl et 10 casiers 50 cl déduits (par type exact), mouvements `supplier_exchange` tracés, **zéro** écriture dans `customer_packaging_financial_ledger` / `packaging_conversions`.
- **Test 7b** : stock d'emballages vides insuffisant (5 < 10) → `InsufficientStock`, transaction annulée, aucun mouvement partiel.

## Validation
`cargo test --workspace` : 19 suites OK, 0 échec · `cargo clippy --workspace` : 0 warning.

---

# PHASE 6 — Clients, ventes et paiements (bilan)

## Backend (`packaging_obligations.rs`)
- **`pay_packaging_financial_debt`** : règlement d'une créance financière d'emballages,
  écriture `payment` (crédit) dans `customer_packaging_financial_ledger`, idempotent
  (request_key UNIQUE), refus de trop-perçu, **ne touche jamais** au registre commercial.
- **`get_client_packaging_dashboard`** : tableau de bord client à soldes strictement séparés :
  - `commercial_debt` (dette marchandise, registre `customer_receivables`) ;
  - `packaging_financial_debt` (créances d'emballages exigibles, après conversion) ;
  - `pending_pieces` + `pending_reference_value` (valeur indicative, **jamais exigible**) ;
  - `total_financial_due = commercial_debt + packaging_financial_debt`.

## API (`depotpro-server`)
- `GET  /api/packaging-obligations?client_id=` — liste des obligations (statut d'exigibilité).
- `GET  /api/packaging-obligations/dashboard/:client_id` — dashboard séparé.
- `POST /api/packaging-obligations/pay` — règlement de créance d'emballages (perm. ReceivablesPay).

## Tests (lot10 — 6 tests verts)
Nouveau test de règlement + dashboard :
- avant conversion : valeur indicative 18 000 affichée mais `total_financial_due` inchangé ;
- après échéance : créance 18 000, pièces converties sorties du physique ;
- règlement partiel 10 000 → solde 8 000, rejeu idempotent, dette commerciale intacte ;
- trop-perçu refusé ; 2 écritures au ledger (charge + paiement).

---

# PHASE 7 — Interface et expérience utilisateur (bilan)

## Nouveau panneau « Créances d'emballages » (frontend)
`src/features/consignments/components/PackagingFinancialPanel.tsx`, intégré en onglet
« Créances d'emballages » de la page Emballages (`ConsignmentsPage`) :
- filtre par client ;
- **4 cartes de soldes séparés** : dette commerciale / emballages en attente
  (indicatif, « non exigible avant échéance ») / créance d'emballages exigible /
  total financièrement dû ;
- tableau des obligations : reste à restituer, valeur indicative, déjà converti,
  échéance, statut (badge « Échu ») ;
- formulaire de règlement de créance (plafonné au solde, bouton désactivé pendant
  l'envoi, invalidation du cache après succès).

## Couche API
- `ApiClient` (contrat) + `HttpApiClient` (REST) + `TauriApiClient` (desktop) :
  `listPackagingObligations`, `getPackagingDashboard`, `payPackagingDebt`.
- Commandes Tauri ajoutées : `list_packaging_obligations`, `get_packaging_dashboard`,
  `pay_packaging_debt` (permissions `ConsignmentsRead` / `ReceivablesPay`).

## Vocabulaire — interdiction du mot « consigne » (règle 14)
Libellés UI corrigés : « Emballage consigné » → « Emballage réutilisable »,
« Valeur consignée restante » → « Valeur d'emballage restante »,
« ÉTAT DES CONSIGNATIONS » → « ÉTAT DES CRÉANCES CLIENTS »,
« Dépôts de garantie retenus » → « Valeurs d'emballages en attente », etc.

Au passage : 2 erreurs ESLint préexistantes corrigées (`PinKeypad.tsx` : import
`stagger` inutilisé, paramètre `index` inutilisé).

## Validation
- `npm run typecheck` : 0 erreur · `npm run lint` : OK
- `cargo build --workspace` OK (inclut src-tauri) · `cargo test --workspace` : 19 suites OK

---

# PHASE 8 — Tests et validation finale (bilan)

## Nouveaux tests (lot10 → 8 tests au total)

### `test_echeance_traitee_apres_redemarrage_application`
Simule 3 « sessions » applicatives (fermeture/réouverture = nouvelle connexion SQLite) :
- session 1 : obligation échue créée, **aucun traitement** (l'app se ferme) ;
- session 2 : la conversion à l'échéance fonctionne après redémarrage (18 000 FCFA), rappel idempotent ;
- session 3 : toujours idempotent — 1 seule ligne de conversion, jamais de double dette.

### `test_concurrence_double_conversion_simultanee`
Deux traitements d'échéance lancés **en parallèle** (`tokio::join!`) sur la même base :
- exactement **1 conversion** et **18 000 FCFA** (jamais 36 000) ;
- 1 seule écriture `conversion_charge` au journal financier ;
- solde client = 18 000 FCFA.

La couverture **restauration de sauvegarde** existait déjà (suite `lot5_backups`).

## Recensement des tests métier du MAJ.md

| Test MAJ.md | Statut | Suite |
|---|---|---|
| T2 Restitution avant échéance → 0 dette, stock + | ✅ | lot10 |
| T3 Non-restitution à échéance → créance | ✅ | lot10 |
| T5 Perte validée → conversion unique | ✅ | lot10 |
| T6 Retour tardif → régularisation, historique intact | ✅ | lot10 |
| T7 Échange fournisseur par type exact, zéro dette auto | ✅ | lot11 (+7b stock insuffisant) |
| T10 Idempotence des conversions | ✅ | lot10 (+ test concurrence) |
| Dashboard à soldes séparés (§11.2) | ✅ | lot10 |
| Valeur indicative jamais exigible (§6.2) | ✅ | lot10 + lot10/dashboard |
| Échéances après fermeture de l'app | ✅ | lot10/restart |
| Transactions concurrentes | ✅ | lot10/concurrence |
| Restaurations | ✅ | lot5 (préexistant) |

## Résultats finaux

| Vérification | Résultat |
|---|---|
| `cargo test --workspace` | **19 suites OK, 0 échec** (incl. 8 tests emballages, 2 tests fournisseur) |
| `cargo clippy --workspace --tests` | **0 warning** |
| `npm run typecheck` | **0 erreur** |
| `npm run lint` | **OK** |

## Projet conforme au MASTER PROMPT (MAJ.md)
- Séparation stricte : dette commerciale / obligation physique / créance financière d'emballages.
- Valorisation photographiée à la vente, non-rétroactivité, conversions idempotentes et transactionnelles.
- Retours tardifs régularisés par contre-écriture, historique intact.
- Catalogue SOLIBRA préchargé, administrable, prix à configurer par l'owner.
- API REST + Tauri desktop + écran UI avec vocabulaire conforme (jamais « consigne »).

---

# Catalogue central — seed `catalog_seed.json` (bilan complémentaire)

## Fichiers créés
- **`catalog_seed.json`** : catalogue de référence complet et versionné —
  **4 producteurs, 34 marques, 89 variantes**, avec statuts de vérification,
  sources, volumes, contenants et conditionnements confirmés uniquement.
- **`scripts/seed_catalog.py`** : chargeur idempotent JSON → SQLite, exposé via
  `npm run seed:catalog -- --db <chemin>` (ou `DEPOTPRO_DB`).

## Couverture
| Producteur | Marques | Variantes |
|---|---|---|
| SOLIBRA | 21 (Bock, Beaufort, Castel, Doppel, Guinness, Malta, Chill, Racines, Racines Fort, Sombreros, Ferox, XXL, Valpierre, Orangina, World Cola, Youki, Youzou, Budweiser, Corona…) | 60 |
| BRASSIVOIRE | 7 (Ivoire Classic/Black, Heineken, Desperados, Rhino, réf. historiques : Mix, Spéciale, Class, Mützig, Amstel, Sol) | 15 |
| NBCI | 7 (American Cola, Planet, Bubble Up, Reaktor, Assinie, Jiri, Vimto) | 7 |
| SIPROCOM | 2 (Joyce + 6 parfums, Sangria, Vin Akwaba) | 8 |

## Règles respectées
- Prix **à 0** partout : les tarifs restent configurés par l'OWNER.
- Conditionnements non confirmés → **jamais inventés** : variante créée sans
  `crate_type`/`bottle_profile`, marquée `to_verify` ou `historical` avec le suffixe
  « — À vérifier ».
- Provenance (`manufacturer_official`, `official_shop`, `secondary_source`…) conservée
  dans la description et les statuts.
- Références historiques Brassivoire (Mützig, Amstel, Sol…) isolées dans une marque dédiée.
- `is_sellable = 0` à l'import : les références ne sont vendables qu'après activation
  par l'OWNER (catalogue opérationnel du dépôt).

## Idempotence vérifiée
Double exécution du seed → aucun doublon (réutilisation par code métier et par nom),
sans écrasement des données existantes.

## Validation
- Seed exécuté avec succès sur une base de test fraîche (16 migrations) : 46 marques,
  111 références catalogue, 75 profils bouteille, 30 types casier.
- `cargo test --workspace` : 19 suites OK (aucune régression).

---

# PHASE 4 catalogue_seed.md — Interface OWNER du catalogue standard (bilan)

## Backend (`product_catalogue.rs` + migration 0017)
- **`set_catalogue_product_active`** : archivage/réactivation logique d'une référence
  (`is_active`), avec journal d'audit — jamais de suppression physique (§14).
- **`set_reference_price`** : prix de référence avec **historique complet**
  (`catalogue_reference_price_history`, migration 0017 : ancien prix, nouveau prix,
  auteur, motif, idempotence via `request_key`). Les ventes historiques ne sont
  jamais recalculées — elles portent leur propre photographie (critère 15).
- **`list_reference_price_history`** : consultation de l'historique.

## API
- REST : `PUT /api/catalogue-products/:id/active`,
  `PUT|GET /api/catalogue-products/:id/reference-price` (perm. CatalogWrite/CatalogRead).
- Tauri desktop : `set_catalogue_product_active_pc`, `set_catalogue_reference_price_pc`,
  `get_catalogue_reference_price_history_pc`.

## Frontend — `CatalogueAdminPanel.tsx`
Écran OWNER avec recherche globale, filtre par marque, affichage des archivées,
compteurs (actives / à vérifier) :
- tableau des références : code, nom, marque, famille, prix de référence, statut ;
- **modification du prix de référence** en modale (ancien prix affiché, motif facultatif,
  rappel « les ventes passées ne sont jamais recalculées ») ;
- **historique des prix** en modale (nouveau prix, auteur, motif, date) ;
- **archivage / réactivation** en un clic.
Couche API complète : `ApiClient` (contrat) + `HttpApiClient` (REST) + `TauriApiClient` (desktop).

## Validation
| Vérification | Résultat |
|---|---|
| Migrations (0017, snapshot v17) | ✅ lot4 OK |
| `cargo build --workspace` (incl. src-tauri) | ✅ |
| `cargo test --workspace` | ✅ 19 suites OK |
| `cargo clippy --workspace --tests` | ✅ 0 warning |
| `npm run typecheck` / `npm run lint` | ✅ 0 erreur |
