# DEPOTPRO PREMIUM — Catalogue multi-producteurs & casiers physiques

**Audit distant :** 23 novembre 2026  
**Dépôt :** koffidominique/ss_depot_rust  
**Branche auditée :** main — commit 2c7d60409079fb038a043ffda08c30e205fd3212  
**Branche de travail créée :** feat/catalog-import-crate-physical-ledger  
**Statut :** spécification et SQL proposé uniquement; aucune implémentation métier ni test local n'a été exécuté.

## 1. Audit vérifié

### Architecture

Le workspace actuel comprend Rust (crates/depotpro-core, crates/depotpro-server Axum, src-tauri Tauri 2) et React 19/TypeScript/Vite. scripts/dev.mjs démarre Axum sur 127.0.0.1:3000 et Vite en proxy. Il précise que l'ancien hôte Node/Express (server.ts) a été remplacé et qu'aucun serveur métier Node n'est démarré. README et docs/DATABASE.md contiennent encore des références à l'ancienne architecture Node (server/db.ts, Express, node:sqlite) : ces descriptions sont obsolètes par rapport à l'arbre main audité.

Le moteur de migrations actif est Rust : crates/depotpro-core/src/infrastructure/db/{migrations.rs,sql_defs.rs} embarque migrations 0001 à 0023; CURRENT_SCHEMA_VERSION = 23. Les migrations sont transactionnelles et le schéma partagé Axum/Tauri. La nomenclature des fichiers est irrégulière : la version interne 11 référence 0007_packaging_components.sql; ne pas renuméroter/réécrire les migrations publiées. La documentation docs/DATABASE.md est stale et ne décrit que 0001–0005.

### Tables/services à réutiliser

| Domaine | Existant | Limite / réutilisation |
|---|---|---|
| Producteurs | breweries (0018) | Producteur distinct du fournisseur commercial (suppliers). |
| Marques | brands, brands.brewery_id | Upsert par code stable, relation producteur. |
| Catégories | categories, parent_id, slug | Taxonomie opérationnelle; familles V3 product_families restent compatibilité. |
| Produits opérationnels | products, product_packagings | Stock boissons et tarifs locaux; ne pas importer vendable. |
| Variantes | product_variants | SKU/barcode, volume, contenant, profil, type casier, capacité native et compatibilité. |
| Contenants | container_types | Verre/PET/canette descriptifs; aucune dette/stock de bouteille. |
| Conditionnements | packaging_types, product_packagings | Carton/pack/casier/unité; conditionnement commercial ≠ actif physique. |
| Casiers techniques | crate_types, crate_compatibility_groups, product_crate_compatibility | Capacité et compatibilité; capacité et volume bouteille obligatoires aujourd’hui. |
| Actifs physiques | packaging_assets (0019) | Capacité, valeur, stock_empty, stock_full; réutiliser après configuration. |
| Catalogue de référence | catalogue_products (0012), historique prix (0017) | Référence non opérationnelle; 0016 importe SOLIBRA à prix/valeur 0 et is_sellable=0. |
| Échange fournisseur | purchase_order_packaging_requirements, supplier_packaging_exchange_lines (0022), returnable_stock_movements (0014) | Journal actuel accepte bottle et crate; nouveau flux crate seulement. |
| Clients/consignations | deposit_issues, deposit_returns, returnable_stock_balances, customer_deposit_balances | Ancien flux mélange physique et finance; ne pas le réutiliser pour les nouveaux mouvements de casiers. |

### Migrations 0014–0017 et 0018–0023

- **0014** recrée returnable_stock_movements pour ajouter supplier_exchange, copie l’historique et recrée les index.
- **0015** ajoute politiques, échéances, pertes/destructions, packaging_conversions et customer_packaging_financial_ledger. auto_convert_on_due vaut 1 par défaut; services packaging_obligations/conversions.rs, losses.rs et late_returns.rs peuvent écrire des conversions/régularisations financières.
- **0016** insère les références SOLIBRA dans brands, product_families, catalogue_products; prix et valeur 0, références non vendables.
- **0017** crée catalogue_reference_price_history (ancien/nouveau prix, motif, auteur, request key).
- **0018** introduit V4 : brasseries, catégories hiérarchiques, types de contenants/conditionnements, emplacements, fournisseurs-produits et enrichit produits/variantes.
- **0019** ajoute packaging_assets (stocks pleins/vides), commandes/allocation, balances clients et packaging_movements avec montants de consigne.
- **0022** ajoute snapshots, réservations de composants et supplier_packaging_exchange_lines (bouteilles et casiers).
- **0023** ajoute snapshots immuables de reçus commandes clients.

Conserver toutes les anciennes colonnes, valeurs, conversions, retours et journaux. Le lot ajoute une éligibilité legacy aux conversions afin de conserver le comportement des lignes avant cutover, tout en excluant les nouvelles opérations physiques.

### Importeurs et JSON

- scripts/seed_catalog.py + scripts/catalog_seed_lib.py : format historique meta/manufacturers/brands/products/variants. _resolve_packaging_type remplace quantité absente par **24**; crée crate_types avec producer SEED, material plastic, deposit 0. Seed de catalogue non vendable, sans preview, run, mapping source ni audit.
- scripts/seed_catalogs.py : supplier/categories/products/variants. Crée familles/unités, profils bouteilles et crate_types; quantité fallback **24**, matériau plastic, valeur 0; catalogue à prix 0 et is_sellable=0. Pas de validation de schéma complète, diff, permission OWNER ou journal de lot.
- catalog_seed.json, catalog_seed_solibra.json : formats historiques.
- solibra_catalog.json : schema_version/catalog_id/supplier/import_notes/categories/packaging_types/products/variants/sources; quantité dans package_size.units_per_package, pas dans packaging.
- brassivoire_catalog.json : schema_version/catalog_id/supplier/import_policy/categories/container_types/packaging_types/commercial_units/products/variants/sources; unités et consignes peuvent être null.
- catalog/brewery_catalog.json, product_model.json existent aussi; ne pas importer par supposition de format.

Compteurs du dépôt : solibra_catalog.json = 29 produits/60 variantes; brassivoire_catalog.json = 14/18. IDs variantes uniques par fichier. Ces compteurs ne valident pas disponibilité, prix ni casier physique.

Les importeurs sont des seeds offline, pas un workflow OWNER. Les fallback 24, création casier plastique sans preuve et valeurs 0 ambiguës doivent disparaître du nouvel import.

### UI/API/RBAC existants

RBAC actuel : 27 permissions, rôles Owner (ALL), Admin, Manager, Cashier, StockManager, Accountant. CatalogRead/CatalogWrite sont utilisés côté handlers et core. Axum routes et commandes Tauri existent pour producteurs, marques, contenants, conditionnements, unités, variantes, casiers/compatibilité. ApiClient, HttpApiClient, TauriApiClient et wrappers Tauri fournissent la parité transport. CatalogueAdminPanel gère activation/prix/historique de catalogue V3; ProductsPage gère produits/CSV. Aucun workflow preview/commit JSON ni journal d’import n’apparaît dans l’arbre audité.

## 2. Invariants métier

1. Seul le casier plastique réutilisable est un actif physique suivi. Verre, canette, PET, carton et pack sont descriptifs/commerciaux.
2. Casier plein livré au client = balance physique « à récupérer ». Aucune créance, caution, consignation ou caisse automatique.
3. Retour physique = balance client diminuée, stock dépôt augmenté. Aucun remboursement/caisse/receivable.
4. Échange fournisseur = casiers vides remis et casiers pleins reçus comme mouvements physiques distincts; aucune dette de casier.
5. Perte/casse/ajustement = physique seulement; permission, motif, acteur, document. Pas de conversion en créance.
6. Vente définitive casier vide = action commerciale explicite, ligne de vente/prix local et mouvement empty_sale. Pas de conversion d’obligation.
7. Stock boissons en unités de base/milli-unités; casiers pleins/vides en quantités entières séparées. Vente plein déduit coefficient boisson confirmé + actif casier atomiquement.
8. Capacité/valeur inconnues = null et to_verify. Type de casier opérationnel seulement après configuration OWNER de capacité positive et compatibilité. Un conditionnement nommé « casier » ne prouve pas le support plastique.

## 3. Canonique JSON depotpro.catalog.v1

Normaliser les trois formats vers une structure versionnée. Chaque catalogue est un producteur; futurs producteurs, catégories et marques OWNER sont permis.

~~~json
{
  "schema_version": "1.0.0",
  "catalog_id": "solibra_ci",
  "catalog_name": "Catalogue SOLIBRA — Côte d'Ivoire",
  "producer": {
    "external_id": "solibra",
    "code": "BRW-SOLIBRA",
    "name": "SOLIBRA",
    "country_code": "CI",
    "website": null
  },
  "currency": "XOF",
  "categories": [
    {
      "external_id": "beer",
      "code": "BEER",
      "name": "Bière",
      "parent_external_id": null,
      "alcoholic": true,
      "verification_status": "verified"
    }
  ],
  "brands": [
    {
      "external_id": "bock",
      "code": "BOCK",
      "name": "Bock",
      "producer_external_id": "solibra",
      "verification_status": "verified"
    }
  ],
  "container_types": [
    {
      "external_id": "glass",
      "name": "Bouteille en verre",
      "material": "glass",
      "volume_ml": null,
      "returnable": null,
      "tracking_scope": "descriptive_only"
    }
  ],
  "commercial_packaging_types": [
    {
      "external_id": "crate",
      "name": "Casier",
      "unit": "crate",
      "reusable": null,
      "physical_asset_kind": null,
      "verification_status": "to_verify"
    }
  ],
  "products": [
    {
      "external_id": "bock",
      "code": null,
      "name": "Bock",
      "brand_external_id": "bock",
      "category_external_id": "beer",
      "catalog_status": "documented",
      "variants": [
        {
          "external_id": "bock_33_glass_crate24",
          "sku": "bock_33_glass_crate24",
          "display_name": "Bock 33 cl",
          "volume_ml": 330,
          "container_external_id": "glass",
          "commercial_packages": [
            {
              "package_type_external_id": "crate",
              "units_per_package": 24,
              "package_unit": "crate",
              "quantity_status": "confirmed"
            }
          ],
          "crate_asset": {
            "external_id": null,
            "plastic_crate_confirmed": false,
            "capacity": null,
            "capacity_status": "unknown",
            "value_xof": null,
            "value_status": "unknown",
            "compatibility_code": null
          },
          "sale_units": ["package", "individual_unit"],
          "source_status": "confirmed_storefront",
          "verification_status": "to_verify"
        }
      ]
    }
  ],
  "sources": [
    {
      "external_id": "source-1",
      "url": null,
      "source_type": "catalog",
      "accessed_on": null,
      "note": null
    }
  ]
}
~~~

Validation : SemVer; catalog/product/variant external IDs stables et obligatoires; SKU absent d’ancien format = clé déterministe catalog_id:variant_external_id, jamais nom seul. Volume, unités package, capacité, valeur, barcode, URL et consigne nullables. Package décrit vente; crate_asset décrit casier plastique confirmé, jamais déduit de package_unit=crate. Returnable bottle reste descriptif. Prix importés ignorés. Adaptateur pur, aucune écriture SQLite.

### Adaptateurs

| Format | Mapping |
|---|---|
| meta/manufacturers/brands/products/variants | manufacturer→producer; brand.code/name; product.name; variant.sku/name/volume/container; packaging.type/units. Quantité absente = null/to_verify, jamais 24. |
| SOLIBRA schema_version/catalog_id/supplier/categories/packaging_types/products/variants | supplier→producer; package_size.units_per_package/package_unit; deposit.amount_xof/status; sources. Distinguer verre retournable et casier plastique. |
| BRASSIVOIRE supplier/categories/container_types/packaging_types/commercial_units/products/variants | supplier.id/name; container_type_id; commercial_packaging; returnable_status; deposit; price; evidence_status. null reste null. |

## 4. Mapping vers SQLite

| Canonique | Tables existantes | Écriture |
|---|---|---|
| Producer | breweries | Upsert code; jamais suppliers. |
| Brand | brands | Upsert code; lier brewery_id. |
| Category | categories | Upsert slug/code, parent; conserver absentes. |
| Container | container_types | descriptif, aucun actif bouteille. |
| Commercial packaging | packaging_types | référentiel, aucun effet financier. |
| Product reference | catalogue_products | référence seulement; is_sellable=0, prix/consigne locaux intacts. |
| Variant | product_variants | activation opérationnelle seulement. |
| Coefficient | product_packagings | OWNER confirme; jamais fallback. |
| Physical crate | crate_types, packaging_assets, crate_compatibility_groups, product_crate_compatibility | Création seulement si plastique/capacité/compatibilité confirmés. |
| Purchase price | supplier_prices, product_suppliers | OWNER facture; import JSON n’écrit pas. |
| Price history | catalogue_reference_price_history | service existant. |
| Import mapping | nouvelles catalog_import_runs/external_refs/items | mapping ID, hash, snapshots, diff, overrides. |

Import référence ne crée pas stock et ne rend pas vendable. Activation OWNER crée/relie produit opérationnel, variante, conditionnements dans transaction. Prix achat/vente, coefficients, casier, compatibilité restent non configurés tant que validés; produit draft/inactive jusqu’à activation explicite.

## 5. Migration additive proposée — version 24

SQL de travail : docs/proposals/0024_catalog_import_and_crate_ledger.sql; non placé dans migrations/sqlite, non chargé au runtime.

Ajouts : catalog_import_runs (request key, catalog/version/hash, payload, preview/commit, acteur/résumé), catalog_external_refs (catalog/entity/external ID → table/ID interne, hash, last_seen, overrides), catalog_import_items (diff/décision/before/source/errors), colonnes source/verification/link operational dans catalogue_products, statuts crate_types/packaging_assets + lien packaging_assets.crate_type_id, crate_physical_balances et crate_physical_movements, conversion_legacy_eligible sur deposit_issues et packaging_policies.

À intégrer ensuite : version interne 24 dans sql_defs.rs/migrations.rs, expected_schema_v24.json, tests migration puis services/routes/Tauri. Vérifier version 24 sur branche concurrente avant intégration.

### Rapprochement historique contrôlé

- Migration conserve anciens champs/montants/mouvements; marque les lignes pré-cutover conversion_legacy_eligible=1 pour préserver leur conversion prévue. Nouvelles lignes par défaut 0.
- Ne pas convertir automatiquement customer_deposit_balances, deposit_issues, returnable_stock_balances, packaging_movements ou supplier_packaging_exchange_lines vers nouveau ledger.
- Écran OWNER : comparer stock dépôt ancien stock_empty/full, balances clients, échanges fournisseur, obligations/conversions et comptage physique. OWNER confirme ouverture; différence crée opening_balance/adjustment signé, motif, document, acteur et snapshot.
- Historiques financiers convertis restent dans comptes historiques. Les casiers nouveaux ne les alimentent plus. Réversalisations historiques uniquement par opération comptable contrôlée, jamais migration.

## 6. Transactions

| Opération | Boissons | Casiers | Finance |
|---|---|---|---|
| Réception achat | Stock base + CUMP quantité reçue | Plein reçu; vides remis fournisseur si échange confirmé | Dette fournisseur boissons reçues. |
| Vente plein | Stock base − coefficient confirmé | Dépôt plein −1; balance client +1 | CA boissons; aucune dette/consigne casier. |
| Vente unité | Stock base − | Aucun mouvement | Vente normale. |
| Retour client vide | Aucun | Client −1; dépôt vide +1 | Aucun remboursement/créance/caisse. |
| Échange fournisseur | Réception selon REC | Plein +; vide −; balance fournisseur ajustée | Dette calculée boissons seulement. |
| Perte/casse/ajustement | Aucun | Balance −/+ | Aucun débit client. |
| Vente vide | Aucun | Dépôt vide −; empty_sale lié sale_line | Vente commerciale explicite, prix local, document. |

Chaque transaction : BEGIN IMMEDIATE; permission/session/document; stocks/compatibilité; stock boissons, balances et ledger; audit; commit/rollback total. request_key unique.

## 7. Contrats backend

### Rust core

~~~rust
#[derive(Deserialize)]
pub struct CatalogImportPreviewInput {
    pub catalog_id: String,
    pub file_name: Option<String>,
    pub payload: serde_json::Value,
    pub request_key: String,
}
#[derive(Deserialize)]
pub struct CatalogImportCommitInput {
    pub preview_id: i64,
    pub payload_sha256: String,
    pub request_key: String,
    pub confirm: bool,
}
pub struct CatalogImportPreviewDto {
    pub preview_id: i64,
    pub payload_sha256: String,
    pub errors: Vec<ImportIssue>,
    pub warnings: Vec<ImportIssue>,
    pub counts: ImportCounts,
    pub diff: Vec<ImportDiffItem>,
    pub can_commit: bool,
}
~~~

Modules : application/catalog_import/{mod.rs,canonical.rs,adapters.rs,validate.rs,preview.rs,commit.rs,history.rs}; application/crate_physical/{mod.rs,balances.rs,movements.rs,customer_returns.rs,supplier_exchange.rs,adjustments.rs,empty_sales.rs,dtos.rs,inputs.rs}. Core re-vérifie permissions. Money(i64) XOF; casiers compte entier; boissons milli-unités.

### Axum proposé

| Méthode | Route | Permission |
|---|---|---|
| POST | /api/catalog/imports/preview | catalog:import OWNER |
| POST | /api/catalog/imports/:id/commit | catalog:import OWNER |
| GET | /api/catalog/imports/:id | catalog:read/audit:read |
| GET | /api/catalog/imports | audit:read |
| POST | /api/catalogue-products/:id/activate | catalog:activate OWNER |
| GET | /api/crates/balances | crates:read |
| GET | /api/crates/movements | crates:read/audit:read |
| POST | /api/crates/customer-returns | crates:move |
| POST | /api/crates/supplier-exchanges | crates:move + purchases:write |
| POST | /api/crates/adjustments | crates:adjust OWNER/ADMIN, motif |
| POST | /api/crates/empty-sales | sales:write + crates:sell_empty, linked sale line |

Movement DTO : request_key, asset_id, movement_type, quantity, from/to {location_type,location_id,state}, client_id/supplier_id, sale_id/sale_line_id/purchase_receipt_id, reason, document_reference. Aucun champ debt/refund/deposit/conversion.

### Tauri/TypeScript

Commandes miroir : catalog_import_preview, catalog_import_commit, list_catalog_imports, get_catalog_import, activate_catalogue_product, list_crate_balances, list_crate_movements, return_client_crates, exchange_supplier_crates, adjust_crate_physical_stock, sell_empty_crate.

Ajouter ApiClient contracts/types; implémenter HttpApiClient/TauriApiClient; wrapper src/services/api/tauri; enregistrer chaque commande dans src-tauri/src/lib.rs. Handlers ne font pas SQL/calcul métier.

Types proposés :

~~~ts
type VerificationStatus = 'verified'|'to_verify'|'historical'|'owner_configured'|'inactive';
type CatalogImportPreview = { previewId:number; payloadSha256:string; errors:ImportIssue[]; warnings:ImportIssue[]; counts:ImportCounts; diff:ImportDiffItem[]; canCommit:boolean };
type CrateState = 'full'|'empty';
type CrateLocation = { type:'depot'|'client'|'supplier'; id:number|null; state:CrateState };
type CrateMovementInput = { request_key:string; asset_id:number; movement_type:string; quantity:number; from?:CrateLocation; to?:CrateLocation; client_id?:number|null; supplier_id?:number|null; sale_id?:number|null; sale_line_id?:number|null; purchase_receipt_id?:number|null; reason:string; document_reference?:string|null };
type CrateBalance = { asset_id:number; code:string; name:string; capacity:number|null; value_xof:number|null; location_type:'depot'|'client'|'supplier'; location_id:number|null; full_qty:number; empty_qty:number; outstanding_qty:number };
~~~

DTO Rust camelCase; SQL snake_case. Valider overflow, XOF entiers, quantité casier >0.

## 8. Permissions/audit

Ajouter permissions : catalog:import, catalog:activate, crate:configure, crate:adjust, crate:sell_empty, crate:read, crate:move, audit:read. OWNER ALL; ADMIN peut lire/configurer catalogue opérationnel, mais import/activation/ajustements restent OWNER par défaut. Manager/StockManager lecture/mouvements standard selon délégation; Cashier retours autorisés; Accountant lecture seule. Ajouter à Role::permissions et Permission::ALL/code; double barrière HTTP/Tauri + core.

Audit obligatoire : acteur ID/nom/rôle, timestamp UTC, entity/id, action, old/new JSON, reason, source catalog/hash, request_key, document lié. Ledger append-only; correction contre-mouvement.

## 9. UX OWNER

1. Producteurs/catalogues : source URL, catalog ID, version, dernier import, compte articles, statut; créer producteurs.
2. Taxonomie : catégories parent/enfant, marques liées, contenants descriptifs, conditionnements commerciaux; verre retournable descriptif.
3. Références produits/variantes : SKU/external ID, statut, volume, contenant, packaging, source; pas de prix import local.
4. Casiers : type plastique, code, capacité, valeur XOF, statut confirmation, compatibilité, variantes autorisées; null reste à vérifier.
5. Import 5 étapes : fichier → format/version → validation → preview/diff (créés, modifiés source, protégés localement, warnings, invalides) → confirmation OWNER. Rapport run/hash/audit.
6. Activation : références sélectionnées → configuration unité base/coefficient confirmé/prix/stock initial via inventaire/casier/compatibilité → preview → activation OWNER.
7. Suivi casiers : plein/vide dépôt, balances clients/fournisseurs, mouvements, retours, casse/pertes, ajustements et rapprochement initial; physique séparé compte commercial.

## 10. Tests

- Adaptateurs legacy/SOLIBRA/BRASSIVOIRE; version invalide; JSON invalid; champs manquants; IDs/SKU dupliqués; références category/brand invalides.
- Preview sans écriture; hash mismatch; idempotence request_key; rollback total; import répété sans doublons; absents jamais supprimés.
- Null volume/package/capacity/value conservés; pas de fallback 24; prix/valeur/coefficient/stock/activation locaux intacts; historique prix non rétroactif.
- Producteur/catégorie/brand OWNER ajoutés; SKU stable; activation OWNER; refus non-OWNER.
- Compatibilité, capacité/stocks insuffisants, plein/vide séparés.
- Achat, vente plein, retour ultérieur, échange fournisseur, perte/casse/ajustement; balance client/fournisseur; zéro caisse/receivable/conversion.
- Vente vide explicite liée sale_line.
- Ancien deposit_issue convertissable avant cutover, nouveau non; retours/historique/rollback conservés.
- Parité Web/Tauri; concurrence et rollback.

**Tests réellement exécutés : aucun** (pas de checkout local, cargo/npm/SQLite runner non exécutés). docs/PRODUCTION_READINESS_REPORT.md daté 2026-11-19 rapporte tests workspace, typecheck, lint, build et benchmark sur son environnement; ce n’est pas une validation de ce patch. CI actuelle contient 11 jobs : typecheck, lint, Vite build, Playwright, migration/benchmark, tests Rust core, tests Axum, clippy, rustfmt, build Tauri Windows et macOS.

## 11. Ordre de réalisation

1. Migration 24 + tests/snapshot; neutralisation conversions nouvelles.
2. Canonique/adaptateurs purs/validation.
3. Preview/commit, mapping/audit, idempotence/rollback.
4. UI OWNER import/activation.
5. Ledger casiers + rapprochement initial contrôlé.
6. Achat/vente/retour/échange/ajustement/vente vide core, puis Axum/Tauri/UI.
7. Parité Web/Desktop, typecheck/lint/build/cargo test/e2e; PR draft après validation.

**Non livré :** code Rust/React, migration active, fixtures complètes, tests exécutés. Ce patch est une spécification et un SQL proposé; ne l’appliquez pas à une base de production.
