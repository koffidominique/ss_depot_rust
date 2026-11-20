# Lot d’implémentation — Catalogues multi-brasseries et casiers physiques

> **État : lot préparatoire sur branche dédiée.** Ce document et le schéma JSON canonique sont préparés à partir de l’audit du dépôt au commit `97b30291ca73c0c250c98a78cd0759112cb2777b` (branche `main`). Le backend, les migrations de production et les écrans ne sont pas encore modifiés. La migration proposée est volontairement placée hors de `migrations/sqlite/` et n’est pas enregistrée dans `db.rs`.

## 1. Résumé exécutif

Le dépôt possède déjà plusieurs briques réutilisables : produits opérationnels, conditionnements, types de casiers, groupes de compatibilité, catalogue de référence, gestion des achats/ventes et échanges physiques avec les fournisseurs. Le problème principal n’est pas l’absence totale de modèle, mais la coexistence de plusieurs modèles et d’anciennes règles de gestion financière des emballages qui ne correspondent plus à la règle demandée.

Le lot doit donc :
- conserver `products` et `product_packagings` comme référentiel opérationnel utilisé par les achats, ventes et stocks ;
- conserver `catalogue_products` comme ligne de référence importée par variante/SKU, en lui ajoutant un parent produit et les métadonnées de provenance ;
- séparer un producteur de catalogue (`SOLIBRA`, `BRASSIVOIRE`, etc.) d’un fournisseur commercial (`suppliers`) auprès duquel le sous-dépôt achète réellement ;
- réutiliser `crate_types` comme référentiel des types de casiers plastiques et `product_packagings.crate_type_id` comme liaison opérationnelle ;
- créer un journal physique des casiers pleins, vides et en circulation, sans utiliser le compte financier historique des obligations ;
- neutraliser les nouvelles écritures de valeur d’emballage dans les ventes : la valeur du casier est une valorisation du bien physique, pas une ligne de frais automatique ;
- importer tous les formats JSON connus par adaptateurs vers un contrat canonique unique ;
- permettre à l’OWNER d’importer, créer, modifier, actualiser, vérifier, activer et désactiver les références.

## 2. État du dépôt vérifié

### Architecture et version

- Dépôt : `koffidominique/ss_depot_rust` ; branche par défaut : `main` ; commit audité : `97b30291ca73c0c250c98a78cd0759112cb2777b`.
- Stack visible : React / TypeScript, SQLite / SQLx, Rust, Axum et Tauri 2.
- `crates/depotpro-core/src/infrastructure/db.rs` déclare `CURRENT_SCHEMA_VERSION = 17` et enregistre les migrations 1 à 17.
- Les migrations 14 à 17 sont déjà présentes dans `migrations/sqlite/`. Toute évolution de schéma doit donc être additive et prendre un nouveau numéro à partir de 18 ; vérifier à nouveau la version lors de l’implémentation.

### Modèles produits déjà présents

Le dépôt comporte plusieurs niveaux qui doivent être explicitement raccordés, et non dupliqués :

| Modèle existant | Usage constaté | Décision cible |
|---|---|---|
| `products` | Produit opérationnel : stock, CUMP, ventes et achats | Conserver comme article opérationnel vendu/acheté |
| `product_packagings` | Unités commerciales et coefficients de conversion | Conserver ; utiliser `crate_type_id` déjà ajouté par la migration 0006 |
| `catalogue_products` | Lignes du catalogue de référence, créées par les seeds et administrées dans l’écran catalogue | Conserver comme référence par variante/SKU ; ajouter le lien au produit parent et au produit opérationnel |
| `product_variants` | Variantes rattachées à `products` | Ne pas en faire un deuxième référentiel central ; garder pour les détails du produit opérationnel si le code actuel en dépend |
| `crate_types` | Profil physique d’un casier : capacité, profil de bouteille, producteur, matériau, compatibilité | Réutiliser comme référentiel canonique des casiers confirmés |
| `returnable_packaging_types` | Ancien référentiel de supports/bouteilles/casiers employé par le module historique | Conserver pour compatibilité et historiques ; ne plus créer de nouveaux types bouteille dans le flux physique |

Les champs existants `deposit_value`, `deposit_per_unit`, `deposit_held_amount` et les tables de conversion ne doivent pas être réutilisés comme prix, coût ou valeur des casiers dans les nouvelles fonctionnalités.

### Importation et catalogue

- `solibra_catalog.json` existe à la racine, avec `schema_version=1.0.0`, `catalog_id=solibra_ci`, 29 produits et 60 variantes.
- `brassivoire_catalog.json` existe à la racine, avec `schema_version=1.1.0`, `catalog_id=brassivoire_ci`, 14 produits et 18 variantes.
- `catalog_seed.json` est un ancien format `meta / manufacturers / brands / products / variants` : 4 producteurs, 34 marques, 40 produits et 89 variantes.
- `catalog_seed_solibra.json` est aussi un ancien format `meta / manufacturers / brands / products / variants`.
- `scripts/seed_catalogs.py` importe les fichiers `supplier / products / variants`, mais il utilise actuellement `24` comme capacité par défaut dès qu’un conditionnement casier est détecté sans quantité explicite. Il associe aussi les lignes importées à la marque créée à partir du nom du producteur, ce qui confond le producteur et la marque du produit.
- `scripts/seed_catalog.py` contient un bloc `if packaging:` au niveau global au lieu de rester dans `upsert_variant_as_catalogue_product`; le script référence alors `packaging` hors de sa fonction et ne constitue pas un importeur fiable dans son état actuel. Il contient également des valeurs de repli à 24 unités.
- Le script `seed_catalogs.py` écrit dans `catalogue_products`; il ne crée pas à lui seul les articles opérationnels complets dans `products` / `product_packagings` pour la vente en caisse.
- `package.json` expose `seed:catalog` via `scripts/seed_catalog.py`, pas via le chargeur `scripts/seed_catalogs.py`.

**Priorité P0 :** suspendre l’usage des deux chargeurs actuels pour tout import de production jusqu’à correction et tests. Aucune capacité de casier inconnue ne doit devenir 12, 24 ou une autre valeur par défaut.

### Casiers, achats, ventes et ancien modèle financier

- `migrations/sqlite/0006_catalogue_v3.sql` définit déjà `crate_types`, `crate_compatibility_groups`, les profils de bouteilles et ajoute `product_packagings.crate_type_id`.
- `migrations/sqlite/0007_packaging_components.sql` ajoute un suivi de composants incluant `bottle`, `crate_support` et `crate_assembled`. Ce suivi individuel des bouteilles n’est pas requis par la nouvelle règle et doit rester historique ou être désactivé dans les nouveaux parcours.
- `migrations/sqlite/0014_supplier_packaging_exchange.sql` ajoute `supplier_exchange` au journal historique `returnable_stock_movements`.
- `migrations/sqlite/0015_packaging_obligations_conversions.sql` crée les politiques avec `auto_convert_on_due = 1`, les conversions et le grand livre financier des emballages.
- `crates/depotpro-core/src/application/sales.rs` calcule actuellement des `deposit_items`, ajoute `total_deposit` au montant de vente, insère des `deposit_issues` et augmente `customer_packaging_accounts.deposit_held_amount`.
- `crates/depotpro-core/src/application/packaging_obligations.rs` contient le traitement des échéances qui peut créer une écriture financière automatique.
- `crates/depotpro-core/src/application/consignments.rs` expose l’ancien retour avec des paramètres de remboursement/réduction de crédit ; ce flux n’est pas adapté à un simple retour physique de casier.
- `crates/depotpro-core/src/application/purchases.rs` implémente déjà un échange fournisseur par type exact et son test `lot11_supplier_packaging_exchange.rs` vérifie un cas d’échange, mais le flux est relié à l’ancien référentiel d’emballages.
- `crates/depotpro-core/src/application/packaging_components.rs` suit des composants de bouteilles et de casiers séparément, mais ne représente pas encore le compte physique complet « dépôt / client / fournisseur » requis ici.

**Conséquence :** ne pas simplement renommer l’ancienne interface. Il faut supprimer des nouveaux flux les écritures de valeur automatique et implémenter un journal de mouvements physiques indépendant. Les tables et écritures historiques doivent rester consultables en lecture seule pendant la transition.

### Interfaces et API déjà présentes

- `crates/depotpro-core/src/application/product_catalogue.rs` expose les marques, familles, unités et `catalogue_products`.
- `crates/depotpro-core/src/application/catalogue.rs` gère déjà des marques, variantes, profils, types de casiers, groupes de compatibilité et grilles tarifaires, mais sur un autre chemin de modèle.
- `crates/depotpro-server/src/main.rs` contient des routes pour le catalogue, les casiers, les prix et le catalogue V3.
- `src-tauri/src/commands.rs` et `src-tauri/src/lib.rs` exposent une partie des commandes catalogue et emballages.
- `src/features/catalogue/components/CatalogueAdminPanel.tsx` existe pour l’administration d’une partie du catalogue de référence.
- `src/services/api/ApiClient.ts`, `HttpApiClient.ts` et `TauriApiClient.ts` possèdent déjà des contrats pour le catalogue et les anciens écrans d’emballages.
- Aucun parcours d’import JSON avec prévisualisation, détection des écarts, confirmation et rapport n’a été identifié dans les fichiers inspectés.
- Dans `auth.rs`, `CatalogWrite` est actuellement accordée à plusieurs rôles (dont Admin, Manager et StockManager). Une permission distincte doit protéger l’import et l’administration structurelle réservés à l’OWNER.

## 3. Règles métier définitives

### Ce qui est suivi

Le seul emballage physique suivi dans DEPOTPRO est le **casier plastique réutilisable** qui contient les bouteilles.

Le casier est une unité physique autonome avec :
- un type de casier exact ;
- une capacité confirmée ;
- les variantes de boissons compatibles ;
- un état physique : plein, vide, endommagé ou en circulation ;
- une localisation : sous-dépôt, client ou fournisseur ;
- une valeur patrimoniale / valeur de remplacement configurable, historisée ;
- des mouvements traçables.

Les bouteilles en verre, y compris celles qui peuvent être réutilisées par le producteur, les canettes, bouteilles PET, cartons et packs ne constituent pas des emballages financiers dans DEPOTPRO. Leur description technique est conservée, sans stock individuel de bouteilles vides, solde client, valeur de bouteille ou retour financier.

### Valeur financière : distinction obligatoire

Ne jamais confondre :
1. coût d’acquisition du casier par le sous-dépôt ;
2. valeur patrimoniale / valeur de référence d’un casier présent ou en circulation ;
3. prix de vente définitive d’un casier vide ;
4. prix d’achat et de vente de la boisson.

La valeur des casiers peut alimenter des rapports de patrimoine et de pertes. Elle ne constitue pas, à elle seule, une créance client. Une facturation d’un casier vide exige une vente explicite et séparée, enregistrée dans le circuit commercial normal.

### Soldes physiques

Solde physique client par type de casier = casiers pleins sortis vers ce client − casiers vides retournés par ce client − régularisations physiques validées.

Ce solde :
- ne s’ajoute jamais à `customer_receivables` ;
- n’ajoute aucune ligne à la facture de boissons ;
- ne déclenche aucune échéance ;
- ne déclenche aucune conversion automatique ;
- ne produit aucun mouvement de caisse lors d’un retour physique.

### Gestion des casiers pleins et vides au dépôt

Les boissons restent stockées dans l’unité de base existante. Un casier plein de 24 bouteilles augmente le stock boisson de 24 unités et le stock de casiers pleins de 1. Il ne faut jamais ajouter une seconde fois les 24 bouteilles dans le stock des casiers.

Lorsqu’un casier complet est vendu, un casier plein sort du dépôt et passe en circulation chez le client. Lors du retour, un casier vide entre dans le dépôt et le solde physique du client diminue.

Pour la vente à l’unité depuis un casier ouvert, prévoir une action explicite « Ouvrir un casier » : elle transforme 1 casier plein du dépôt en 1 casier vide au dépôt, sans modifier le stock de boissons. Les bouteilles libérées restent dans le stock boisson et peuvent ensuite être vendues individuellement. Cette action évite d’inventer une consommation physique de casier à partir de ventes partielles.

### Flux fournisseur

À la réception seulement :
- ajouter les boissons réellement reçues ;
- ajouter les casiers pleins effectivement reçus ;
- enregistrer séparément les casiers vides remis au fournisseur ;
- vérifier le type exact et la disponibilité des casiers vides ;
- associer les mouvements au fournisseur, à la réception et à la clé d’idempotence.

Le nombre de casiers remis au fournisseur n’est pas calculé automatiquement comme égal au nombre de casiers pleins reçus. L’échange peut être partiel et doit refléter le bon de livraison ou l’accord commercial réel.

### Flux client

Une vente en conditionnement casier sort un casier plein uniquement si le conditionnement opérationnel a une liaison confirmée avec un `crate_type_id`. Une vente en bouteille unitaire ne sort pas automatiquement un casier. Un retour client crédite uniquement le stock physique des casiers vides, sans remboursement financier automatique.

Une perte ou casse est une régularisation physique sous permission et avec motif. Elle ne crée pas automatiquement une dette client. Si le dépôt décide de facturer le casier, l’opération doit être une vente séparée.

## 4. Architecture cible des données

### Réutiliser les tables existantes

| Besoin | Réutilisation / évolution |
|---|---|
| Producteur de catalogue | Nouvelle table `catalog_producers` ; ne pas créer un fournisseur commercial dans `suppliers` automatiquement |
| Version de catalogue | Nouvelle table `producer_catalogues` |
| Catégorie / famille | Réutiliser `product_families` avec champs parent/alcool si requis par audit final ; éviter une table catégorie concurrente |
| Marque | Réutiliser `brands` |
| Produit parent dans le catalogue central | Nouvelle table `catalogue_master_products` pour grouper les variantes |
| Variante / SKU de référence | Réutiliser `catalogue_products` comme ligne de variante ; ajouter `master_product_id`, volume, type de contenant et provenance |
| Article opérationnel | Réutiliser `products` ; création seulement lors de l’activation OWNER |
| Unités commerciales | Réutiliser `units_of_measure` et `product_packagings` |
| Type de casier | Réutiliser `crate_types` uniquement pour un casier plastique identifié et confirmé |
| Compatibilité opérationnelle | Réutiliser `product_packagings.crate_type_id` ; prévoir une table de compatibilité catalogue si plusieurs casiers sont possibles pour une variante |
| Fournisseur réel d’achat | Réutiliser `suppliers` et `supplier_product_prices` |
| Prix client | Réutiliser les mécanismes tarifaires existants ; l’import JSON n’écrit jamais les prix locaux |
| Historique / audit import | Nouvelles tables `catalogue_import_runs` et sources associées ; utiliser aussi `audit_logs` |
| Stock physique des casiers | Nouvelles tables `crate_inventory_balances` et `crate_inventory_movements` |
| Valeur des casiers | Nouvelle table `crate_valuation_history` reliée à `crate_types` |

### Producteur et fournisseur commercial ne sont pas la même entité

Le producteur SOLIBRA ou BRASSIVOIRE est le propriétaire du catalogue de marques et de produits. Le fournisseur commercial est l’entreprise ou le grossiste auquel le sous-dépôt passe effectivement commande. Un produit de marque SOLIBRA peut être acheté à plusieurs fournisseurs commerciaux. Ne pas rattacher automatiquement `catalog_producers` à `suppliers`.

### Variante et produit parent

Un produit parent regroupe plusieurs variantes : par exemple « Heineken » contient 25 cl, 33 cl, 50 cl bouteille et 50 cl canette. Chaque variante/SKU est une ligne de référence séparée dans `catalogue_products` afin de conserver son code, son volume, son contenant, ses unités commerciales et son historique de vérification.

### Casier inconnu

`crate_types.capacity` et `crate_types.bottle_profile_id` sont obligatoires dans le schéma actuel. Ne pas fabriquer un type de casier si le nombre d’unités, le contenant ou le type physique n’est pas confirmé. La variante peut exister dans le catalogue central avec `crate_type_id = NULL` et un statut `to_verify`. L’OWNER pourra créer ou associer le casier plus tard.

## 5. Contrat JSON canonique

Le nouveau contrat est décrit dans `schemas/depotpro-brewery-catalog.v2.schema.json`.

Principes :
- version canonique `2.0.0` ;
- producteur distinct de la marque ;
- produit parent séparé des variantes ;
- variante avec SKU stable et volume entier en millilitres ;
- `container` décrit la bouteille/canette/PET, sans créer d’actif physique ;
- `package_options` décrit les unités commerciales (bouteille, canette, casier, carton, pack) ;
- `crate_types` décrit seulement les casiers plastiques identifiés ;
- `crate_compatibility` est explicite et porte un statut de vérification ;
- sources et statuts de vérification conservés ;
- aucun prix, dépôt, caution ou montant de bouteille dans le contrat canonique.

### Adaptateurs des fichiers présents

| Fichier source | Format | Adaptation requise |
|---|---|---|
| `catalog_seed.json` | `meta / manufacturers / brands / products / variants` | Déplier chaque produit/variante ; conserver producteur et marque séparés ; convertir l’ancien `packaging.type=crate` vers une option casier |
| `catalog_seed_solibra.json` | Ancien format multi-niveaux | Même adaptateur historique |
| `solibra_catalog.json` | `supplier / categories / packaging_types / products / variants` | `supplier` → producteur ; `container` décrit le contenant ; `package_size.package_unit=casier` → option commerciale casier ; association physique du casier à confirmer |
| `brassivoire_catalog.json` | `supplier / categories / container_types / packaging_types / commercial_units / products / variants` | `supplier` → producteur ; `container_types` décrit le contenant ; `commercial_packaging.unit_id=crate` → option commerciale casier ; capacité null reste inconnue |

Attention particulière : dans le fichier SOLIBRA, `packaging_type_id=returnable_glass_bottle` décrit la bouteille en verre, tandis que `package_size.package_unit=casier` décrit l’unité commerciale. Ce sont deux informations différentes. Ne pas importer la bouteille comme un emballage à suivre. Le type `plastic_crate` présent dans le référentiel source n’est pas à lui seul une preuve de compatibilité d’une variante avec un casier précis.

Les champs historiques `deposit`, `deposit_amount`, `deposit_per_unit` et les mentions de bouteilles retournables doivent être ignorés comme données financières. L’import peut enregistrer un avertissement d’adaptation, mais ne doit créer aucune écriture dans les tables de dette ou de paiement.

## 6. Règles d’importation et de synchronisation

Modes obligatoires :
1. **Prévisualiser** : lire le fichier, détecter sa version, le normaliser sans écrire, produire statistiques, erreurs et différences.
2. **Ajouter** : créer les nouvelles références uniquement ; ne pas altérer les références existantes.
3. **Actualiser** : actualiser uniquement les champs descriptifs explicitement autorisés ; demander confirmation sur les changements sensibles.
4. **Fusion contrôlée** : présenter les différences produit par produit et variante par variante ; validation OWNER avant écriture.

Clés : `catalog_id`, identifiant externe du produit, identifiant externe de variante et SKU stable. En l’absence de SKU source, générer un identifiant déterministe à partir de `catalog_id + product_id + variant_id`, jamais à partir du seul nom affiché.

Protéger impérativement les données locales :
- stock et mouvements ;
- prix d’achat fournisseur ;
- prix de vente / grilles tarifaires ;
- valeurs de casiers et historiques ;
- coefficients de conversion validés ;
- liens opérationnels personnalisés ;
- activation/désactivation choisie par l’OWNER ;
- références dans ventes et achats.

Une référence absente d’un nouveau fichier n’est jamais supprimée. Elle est éventuellement marquée « absente du dernier import » pour examen. L’import doit être transactionnel, idempotent, avec checksum de fichier, rapport final et clé d’idempotence.

## 7. Proposition de migration physique

Le SQL préparatoire est fourni dans `docs/proposed_migrations/0018_catalogue_crates_physical.sql`. Il est volontairement hors du dossier actif des migrations : il ne doit pas être copié dans `migrations/sqlite/` ni enregistré dans `db.rs` avant adaptation, revue et tests sur une copie de base réelle.

La proposition ajoute :
- producteurs et versions de catalogues ;
- produit parent de catalogue ;
- références de sources ;
- historique des imports ;
- liens explicites variante-casier si plusieurs casiers sont possibles ;
- journal des soldes physiques par type, localisation et état ;
- journal append-only de chaque transfert ;
- historique des valeurs de casier (coût d’acquisition, valeur de référence, prix de vente vide).

### Migration des données historiques

1. Conserver sans modification `deposit_issues`, `packaging_conversions`, `customer_packaging_financial_ledger`, `customer_packaging_accounts`, `deposit_returns` et les journaux historiques.
2. Construire un rapprochement contrôlé entre `returnable_packaging_types.kind='crate'` et `crate_types`. Une correspondance par nom ou volume seul ne suffit pas ; l’OWNER valide le rapprochement.
3. Après validation, proposer la reprise du stock de casiers vides du dépôt depuis `returnable_stock_balances` vers le nouveau solde physique `depot/empty`.
4. Les soldes clients `customer_packaging_accounts.balance_pieces` peuvent être proposés comme quantité en circulation uniquement si le type est certain et si le solde est cohérent avec le journal historique. Ils doivent passer par une table de staging / validation OWNER ; ne pas importer `deposit_held_amount` comme valeur ou dette.
5. Ne jamais convertir ou réinterpréter les lignes `packaging_conversions` et le grand livre financier. Les montants déjà facturés/payés restent dans les historiques financiers.
6. Neutraliser les traitements d’échéance et les endpoints de paiement d’emballages pour les nouvelles opérations. Les routes historiques doivent être retirées de l’interface ou présentées en archive en lecture seule ; conserver une compatibilité technique temporaire si nécessaire.
7. Toutes les nouvelles ventes doivent enregistrer `total_deposit = 0` et ne doivent plus créer `deposit_issues` ni augmenter `customer_packaging_accounts.deposit_held_amount`.
8. Toutes les nouvelles restitutions physiques doivent passer par le nouveau journal de casiers et ne doivent pas créer de paiement, remboursement, avoir financier ou mouvement de caisse.

## 8. Transactions métier à implémenter

| Opération | Stock boisson | Casiers | Compte commercial / caisse |
|---|---|---|---|
| Réception de N casiers pleins | + capacité × N bouteilles | dépôt plein +N | Achat/facture selon réception réelle |
| Remise de M casiers vides au fournisseur | Aucun effet boisson | dépôt vide −M ; fournisseur en circulation +M | Aucun frais automatique ; facture fournisseur séparée si elle existe |
| Vente de N casiers pleins | − capacité × N bouteilles | dépôt plein −N ; client en circulation +N | Vente boisson normale, sans montant de casier ajouté |
| Retour de M casiers vides par client | Aucun effet boisson | client en circulation −M ; dépôt vide +M | Aucun paiement / dette / mouvement caisse |
| Ouvrir un casier pour vente à l’unité | Aucun effet sur stock total boisson | dépôt plein −1 ; dépôt vide +1 | Aucun effet financier |
| Vente définitive d’un casier vide | Aucun effet boisson | dépôt vide −N ; sortie externe | Ligne commerciale explicite casier vide |
| Perte / casse / ajustement | Aucun effet boisson sauf opération distincte | Mouvement de correction avec motif et autorisation | Valeur patrimoniale / charge interne ; aucune facture client automatique |

Chaque mouvement physique doit utiliser `request_key` unique, une transaction atomique, un type de casier exact, une quantité positive, une localisation source/destination et un motif. Les mises à jour des soldes et l’écriture du journal doivent être faites dans la même transaction.

## 9. Contrats backend, API et permissions

### Services de domaine proposés

- `normalize_catalog_file`, `validate_catalog_file`, `preview_catalog_import`, `confirm_catalog_import`, `get_catalog_import_run` ;
- `create_catalog_producer`, `update_catalog_producer`, `create_catalog_category`, `create_catalog_master_product`, `create_catalog_variant`, `update_catalog_variant` ;
- `activate_catalog_variant`, `deactivate_catalog_variant`, `link_catalog_variant_to_operational_product` ;
- `create_crate_type`, `update_crate_type`, `configure_variant_crate_compatibility`, `set_crate_valuation` ;
- `receive_full_crates`, `return_empty_crates_to_supplier`, `issue_full_crates_to_customer`, `receive_customer_empty_crates`, `open_full_crate`, `sell_empty_crate`, `adjust_crate_inventory` ;
- `get_crate_balances`, `get_customer_crate_balance`, `get_supplier_crate_balance`, `get_crate_movement_history`, `get_crate_valuation_history`.

Ces noms sont des contrats fonctionnels. Réutiliser les fonctions équivalentes déjà présentes au lieu de créer des doublons.

### Endpoints REST indicatifs

- `GET /api/catalogues/producers` ; `POST /api/catalogues/producers` ; `GET /api/catalogues/:id` ;
- `POST /api/catalogues/import/preview` ; `POST /api/catalogues/import/confirm` ; `GET /api/catalogues/import-runs/:id` ;
- `GET /api/catalogues/:id/products` ; `POST /api/catalogue-products` ; `PATCH /api/catalogue-products/:id` ;
- `POST /api/catalogue-products/:id/activate` ; `POST /api/catalogue-products/:id/deactivate` ;
- `GET /api/crates/balances` ; `GET /api/crates/customers/:clientId` ; `GET /api/crates/suppliers/:supplierId` ;
- `GET /api/crates/movements` ; `POST /api/crates/customer-returns` ; `POST /api/crates/supplier-exchanges` ; `POST /api/crates/open` ; `POST /api/crates/adjustments` ;
- Les sorties de casiers dues à une vente et les entrées liées aux achats doivent être incluses dans les transactions métier existantes, pas effectuées par un appel API indépendant après la vente/réception.

Créer les commandes Tauri correspondantes et exposer les méthodes dans `ApiClient`, `HttpApiClient` et `TauriApiClient`. Web et Desktop doivent appeler les mêmes fonctions Rust de domaine.

### Permissions recommandées

| Permission | Owner | Admin | Manager | Stock manager | Cashier | Accountant |
|---|---:|---:|---:|---:|---:|---:|
| Consulter catalogue | Oui | Oui | Oui | Oui | Oui | Oui |
| Créer/importer producteur, catalogue, catégorie, marque, produit | Oui | Non par défaut | Non | Non | Non | Non |
| Modifier les paramètres centraux et activer les références | Oui | Non par défaut | Non | Non | Non | Non |
| Consulter soldes et mouvements de casiers | Oui | Oui | Oui | Oui | Selon poste | Oui |
| Enregistrer retour client / échange dans opération vente-achat | Oui | Oui | Oui | Oui | Oui si autorisé | Non |
| Ajustement, perte, casse | Oui | Oui sur délégation | Oui sur délégation | Oui sur délégation | Non | Non |
| Modifier les valeurs des casiers | Oui | Non par défaut | Non | Non | Non | Non |

Ajouter des permissions explicites côté backend, par exemple `CatalogAdmin`, `CatalogImport`, `CrateRead`, `CrateMove`, `CrateAdjust` et `CrateValuationWrite`. Le contrôle ne doit pas dépendre du masquage d’un bouton React. Toute opération sensible journalise l’utilisateur, la date, l’entité, l’ancienne/nouvelle valeur, le motif, la source et le document lié.

## 10. Écrans OWNER à produire

1. **Producteurs et catalogues** : liste, statut, version courante, date d’import, nombre de produits/variantes, bouton ajouter/importer.
2. **Import JSON** : glisser-déposer, détection du format, validation, prévisualisation, différences, warnings, confirmation, progression et rapport.
3. **Catégories et marques** : création, modification, désactivation, arborescence et recherche.
4. **Produits et variantes** : produit parent, liste des formats, volume, contenant, SKU, sources, statut de vérification, disponibilité, activation locale.
5. **Gestion des casiers** : code, nom, capacité, type de plastique, compatibilités confirmées, valeurs, historique.
6. **Stock des casiers** : cartes « Pleins au dépôt », « Vides au dépôt », « En circulation chez les clients », « Chez les fournisseurs », « Endommagés » ; filtre par type.
7. **Fiche client** : compte commercial dans une zone et compte physique des casiers dans une zone séparée ; aucun total combiné.
8. **Fiche fournisseur / réception** : casiers pleins reçus, casiers vides rendus, écarts et pièces justificatives.
9. **Historique et audit** : recherche de chaque mouvement et chaque modification de catalogue.

## 11. Tests obligatoires

### Import / catalogue
- Import des deux nouveaux catalogues (SOLIBRA et BRASSIVOIRE) ;
- import de `catalog_seed.json` et `catalog_seed_solibra.json` historiques ;
- import répété sans doublons ;
- identifiants/SKU identiques entre fichiers ;
- brand distincte du producer ;
- capacité manquante reste NULL et aucune crate n’est créée par défaut ;
- `returnable_glass_bottle` ne crée aucun actif bouteille ;
- champs legacy `deposit` ignorés ;
- actualisation ne change pas prix, stock, compatibilité locale validée et statut vendable ;
- suppression absente du fichier n’entraîne aucune suppression en base ;
- refus import par rôle non Owner ;
- rollback transactionnel en cas d’erreur.

### Casiers / achats / ventes
- réception casier plein avec augmentation exacte des bouteilles ;
- remise de casiers vides fournisseur séparée et contrôlée par type ;
- échange fournisseur partiel ;
- vente de casier plein avec sortie physique et solde client ;
- vente bouteille unitaire sans sortie de casier ;
- ouverture d’un casier plein en casier vide sans modifier le stock boisson ;
- retour partiel puis total de casiers ;
- casier incompatible refusé ;
- stock de casiers vides insuffisant bloquant ;
- retour physique sans paiement ni mouvement de caisse ;
- aucun solde physique ajouté aux créances commerciales ;
- perte/casse avec validation et sans dette automatique ;
- vente définitive de casier vide comme ligne commerciale distincte ;
- clés `request_key` idempotentes et concurrence sans double mouvement.

### Historique / compatibilité
- base neuve migrée jusqu’à la nouvelle version ;
- upgrade d’une base à la version 17 ;
- anciens soldes rapprochés uniquement après validation ;
- anciens journaux financiers inchangés ;
- ancien traitement automatique d’échéance inactif pour toutes les nouvelles opérations ;
- tests Web/Tauri sur le même service de domaine.

## 12. Ordre d’implémentation

**Lot A — Sécuriser l’existant :** corriger/suspendre les seeders défectueux, ajouter tests qui prouvent qu’aucune capacité par défaut n’est inventée, figer les fixtures JSON.

**Lot B — Modèle catalogue :** migration additive producteurs/catalogues/produits parents/import runs, schéma canonique, adaptateurs legacy et new format, import preview/commit.

**Lot C — Activation opérationnelle :** relier une variante du catalogue à un article `products` et à ses `product_packagings`, copier seulement les données approuvées ; conserver les prix et stocks locaux indépendants.

**Lot D — Casiers physiques :** journal + balances + valorisations + mapping contrôlé ancien type vers `crate_types`.

**Lot E — Flux achats/ventes/retours :** intégrer les mouvements de casiers dans les transactions d’achat, de vente, d’ouverture et de retour ; interdire les appels post-transaction non atomiques.

**Lot F — Neutralisation legacy :** retirer les nouvelles écritures et échéances financières automatiques ; conserver les anciens historiques en archive en lecture seule.

**Lot G — UI OWNER, tests et documentation :** terminer les écrans Web/Tauri, les permissions, les rapports et les tests de non-régression.

## 13. Vérifications réellement effectuées dans ce lot préparatoire

- Lecture GitHub des métadonnées du dépôt et de la référence de `main` ;
- inspection des fichiers `db.rs`, migrations 0006/0007/0010/0012/0014/0015/0016/0017, `sales.rs`, `purchases.rs`, `consignments.rs`, `packaging_components.rs`, `packaging_obligations.rs`, `product_catalogue.rs`, `catalogue.rs`, `auth.rs`, `main.rs`, commandes Tauri, interfaces API, composant CatalogueAdminPanel et scripts de seed ;
- lecture et parsing JSON de `solibra_catalog.json`, `brassivoire_catalog.json`, `catalog_seed.json` et `catalog_seed_solibra.json` ;
- comptages confirmés dans les fichiers actuels : SOLIBRA 29 produits / 60 variantes ; BRASSIVOIRE 14 produits / 18 variantes ; seed central historique 4 producteurs / 34 marques / 40 produits / 89 variantes ;
- création de la branche `feat/catalogues-multibrasseries-casiers-physiques` depuis `main`.

**Non exécuté :** aucun `cargo test`, `cargo clippy`, `npm run typecheck`, `npm run lint`, build frontend ou test Tauri n’a été lancé, car l’environnement de cette session permet l’inspection et l’écriture GitHub mais ne fournit pas un checkout local exécutable du dépôt. Aucun résultat de test ne doit être annoncé comme vert.

**État de livraison :** documentation d’implémentation, schéma JSON canonique et proposition de migration sont préparés sur la branche dédiée. Aucun fichier actif de migration, service Rust, route Axum, commande Tauri ou écran frontend n’a encore été modifié. La prochaine étape de développement est le Lot A puis le Lot B.