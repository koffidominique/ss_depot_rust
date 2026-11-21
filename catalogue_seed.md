Voici un **MASTER PROMPT prêt à transmettre à ton agent IA de développement** pour intégrer les catalogues des brasseries dans SS DEPOT RUST.

L'objectif est de créer un véritable **catalogue central évolutif**, administré par l'owner de l'application, et non une simple liste de boissons enregistrée définitivement dans le code. Il permettra également de gérer les prix, les conditionnements, les nouveaux produits et les besoins propres à chaque sous-dépôt.

# MASTER PROMPT — INTÉGRATION DU CATALOGUE CENTRAL DES BRASSERIES ET PRODUITS

## SS DEPOT RUST — Catalogue standard, administration OWNER, prix et conditionnements dynamiques

---

# 1. MISSION GÉNÉRALE

Tu interviens sur le projet **SS DEPOT RUST**, une application professionnelle de gestion des sous-dépôts de boissons adaptée au marché ivoirien.

Ta mission est de concevoir et d'intégrer un véritable module de gestion de catalogue de produits, organisé par brasserie, fabricant, marque, catégorie, produit, variante et conditionnement.

Ce catalogue doit constituer la base standard de produits de l'application dès sa première installation.

Il doit être :

- Préchargé avec les catalogues de référence des producteurs de boissons présents en Côte d'Ivoire.
- Entièrement administrable par l'OWNER de l'application.
- Modifiable sans intervention dans le code source.
- Évolutif et extensible.
- Adaptable aux prix et aux réalités commerciales du marché.
- Utilisable hors connexion.
- Compatible avec la gestion des fournisseurs, des achats, des ventes, des stocks et des retours d'emballages.
- Conçu pour accueillir de nouvelles marques, brasseries et références sans modification de l'architecture de la base de données.

Ne développe pas un catalogue statique.

**Le catalogue doit être piloté intégralement par les données de la base SQLite.**

Toute création, modification, désactivation, réactivation ou évolution d'un produit doit pouvoir être réalisée depuis l'interface d'administration.

# 2. ARCHITECTURE TECHNIQUE À RESPECTER

Conserver la stack existante :

- Frontend : React + TypeScript.
- Backend : Rust.
- Base de données : SQLite.
- Interface : Tailwind CSS.
- Application : Desktop Windows et macOS.
- Fonctionnement : hors connexion.

Les règles métier, les calculs de prix, les relations entre produits et conditionnements ainsi que les opérations sur les stocks doivent être validés par le backend Rust.

Ne pas effectuer directement des modifications sensibles dans SQLite depuis le frontend.

Toutes les opérations de catalogue doivent être transactionnelles lorsque plusieurs entités sont concernées.

Avant toute modification, réaliser un audit de l'architecture existante et réutiliser les composants, services et tables déjà disponibles.

Ne jamais créer de doublons fonctionnels.

# 3. CONCEPTION DU CATALOGUE CENTRAL

## 3.1. Principe de fonctionnement

Créer deux niveaux de catalogue :

### A. Catalogue standard de l'application

Il contient les références de base intégrées dans SS DEPOT RUST.

Il est administré par l'OWNER de l'application.

Il comprend :

- Les brasseries.
- Les fabricants.
- Les marques.
- Les catégories.
- Les produits.
- Les variantes.
- Les formats.
- Les conditionnements.
- Les types d'emballages.
- Les caractéristiques des produits.
- Les données de référence.
- Les statuts de vérification.

### B. Catalogue opérationnel du sous-dépôt

Chaque sous-dépôt utilise le catalogue standard comme base.

Il peut :

- Activer les références qu'il commercialise.
- Désactiver les références qu'il ne vend pas.
- Définir ses propres prix d'achat.
- Définir ses propres prix de vente.
- Ajouter des informations commerciales locales.
- Définir ses seuils de stock.
- Associer ses fournisseurs aux références.
- Créer éventuellement des références locales, selon les droits attribués.

Une modification du catalogue standard ne doit jamais écraser automatiquement les prix, les stocks ou les données commerciales propres à chaque dépôt.

Dans une installation autonome, l'OWNER administrateur doit pouvoir effectuer l'ensemble des opérations de gestion du catalogue depuis son installation.

# 4. ORGANISATION HIÉRARCHIQUE DES DONNÉES

Le catalogue doit suivre cette hiérarchie :

BRASSERIE / FABRICANT\
→ MARQUE\
→ CATÉGORIE\
→ PRODUIT\
→ VARIANTE\
→ CONDITIONNEMENT COMMERCIAL\
→ RÈGLES D'EMBALLAGE

Exemple :

- Brasserie : SOLIBRA
- Marque : Bock
- Catégorie : Bière
- Produit : Bock Lager
- Variante : Bock 33 cl
- Contenant : Bouteille en verre
- Conditionnement : Casier de 24 bouteilles
- Type d'emballage : Casier réutilisable Bock 33 cl
- Quantité de référence : 24 bouteilles
- Retour d'emballages : Oui
- Valeur de l'emballage : Configurable.

Un produit peut avoir plusieurs variantes et plusieurs conditionnements.

Ne jamais considérer que le nom d'une marque suffit à identifier une référence commercialisable.

# 5. BRASSERIES ET PRODUCTEURS À PRÉCHARGER

Intégrer une base initiale organisée autour des producteurs suivants.

## 5.1. SOLIBRA

Créer SOLIBRA comme producteur distinct.

Catalogue initial à intégrer :

### Bières

- Bock.
- Beaufort Lager.
- Castel Beer.
- Doppel Munich.
- Guinness.

### Bières aromatisées et cocktails

- Chill.
- Chill Citron.
- Racines.
- Racines Fort.
- Sombreros.

### Boissons maltées et énergisantes

- Malta Guinness.
- Doppel Energy Malt.
- Ferox Energy.
- XXL Energy.

### Boissons gazeuses

- Orangina.
- World Cola.
- Youki.
- Youzou.

### Vins

- Valpierre.

### Marques importées ou distribuées

Prévoir également les relations commerciales pour Budweiser, Corona Extra et les autres références importées éventuellement commercialisées par le distributeur.

Ne pas attribuer automatiquement à SOLIBRA la fabrication physique de chaque produit distribué.

Source de référence :

[https://www.solibra.ci/](https://www.solibra.ci/)

Boutique publique :

[https://solibrachezvous.ci/boutique/](https://solibrachezvous.ci/boutique/)

## 5.2. BRASSIVOIRE

Créer BRASSIVOIRE comme producteur distinct.

Catalogue initial :

### Bières

- Ivoire Classic.
- Ivoire Black.
- Heineken.
- Desperados.

### Boissons énergisantes

- Rhino Energy Malt.

### Références historiques à conserver dans une catégorie séparée

- Ivoire Mix.
- Ivoire Spéciale.
- Class.
- Mützig.
- Amstel.
- Sol.

Les références historiques doivent être intégrées avec le statut `historical` ou `to_verify` tant que leur commercialisation actuelle n'a pas été confirmée.

Source officielle :

[https://brassivoire.ci/nos-marques/](https://brassivoire.ci/nos-marques/)

## 5.3. NBCI

Créer la Nouvelle Brasserie de Côte d'Ivoire comme producteur distinct.

Catalogue initial :

- American Cola.
- Planet.
- Bubble Up.
- Reaktor.
- Assinie.
- Jiri.
- Vimto, avec statut à vérifier.

Source :

[https://digital-nb-ci.com/site/](https://digital-nb-ci.com/site/)

## 5.4. SIPROCOM

Créer SIPROCOM comme producteur de boissons, mais ne pas la classer comme brasserie de bière.

Références à prévoir :

- Joyce.
- Joyce Gingembre.
- Joyce Café.
- Joyce Coco.
- Joyce Mangue.
- Joyce Ananas.
- Sangria.
- Vin Akwaba.

Source :

[https://siprocom.ci/](https://siprocom.ci/)

## 5.5. Extensibilité

L'OWNER doit pouvoir créer de nouvelles brasseries et entreprises sans modifier le code source.

Le système ne doit pas limiter le catalogue aux quatre producteurs initiaux.

Prévoir également des entreprises de distribution et des fabricants de spiritueux ou autres boissons.

Une nouvelle société doit pouvoir recevoir ses propres marques et références.

# 6. INTÉGRATION DES VARIANTES ET CONDITIONNEMENTS INITIAUX

Précharger les formats et conditionnements connus dans la base standard.

Les exemples ci-dessous sont des données initiales de référence. Ne jamais inventer une variante ou un conditionnement manquant.

## 6.1. SOLIBRA — Bières

| Produit       | Format           | Conditionnement | Quantité |
| ------------- | ---------------- | --------------- | -------- |
| Bock          | 33 cl bouteille  | Casier          | 24       |
| Bock          | 50 cl bouteille  | Casier          | 12       |
| Bock          | 65 cl bouteille  | Casier          | 12       |
| Bock          | 100 cl bouteille | Casier          | 12       |
| Bock          | 33 cl canette    | Carton          | 24       |
| Bock          | 50 cl canette    | Carton          | 24       |
| Beaufort      | 25 cl bouteille  | Carton          | 24       |
| Beaufort      | 33 cl bouteille  | Casier          | 24       |
| Beaufort      | 50 cl bouteille  | Casier          | 12       |
| Beaufort      | 33 cl canette    | Carton          | 24       |
| Castel        | 33 cl bouteille  | Casier          | 24       |
| Castel        | 50 cl bouteille  | Casier          | 12       |
| Doppel Munich | 33 cl bouteille  | Casier          | 24       |
| Doppel Munich | 50 cl bouteille  | Casier          | 12       |
| Guinness      | 33 cl bouteille  | Casier          | 24       |
| Guinness      | 65 cl bouteille  | Casier          | 12       |
| Guinness      | 33 cl canette    | Carton          | 24       |

## 6.2. SOLIBRA — Autres boissons

| Produit            | Format           | Conditionnement | Quantité |
| ------------------ | ---------------- | --------------- | -------- |
| Chill Citron       | 50 cl bouteille  | Casier          | 12       |
| Chill              | 33 cl canette    | Carton          | 24       |
| Racines            | 33 cl bouteille  | Casier          | 24       |
| Racines            | 50 cl bouteille  | Casier          | 20       |
| Racines            | 33 cl canette    | Carton          | 24       |
| Racines Fort       | 50 cl bouteille  | Casier          | 12       |
| Sombreros          | 33 cl bouteille  | Casier          | 24       |
| Sombreros          | 50 cl bouteille  | Casier          | 12       |
| Valpierre          | 50 cl bouteille  | Casier          | 12       |
| Valpierre          | 100 cl bouteille | Casier          | 12       |
| Malta Guinness     | 30 cl bouteille  | Casier          | 24       |
| Doppel Energy Malt | 33 cl bouteille  | Casier          | 24       |
| Doppel Energy Malt | 33 cl canette    | Carton          | 24       |
| Ferox Energy       | 33 cl canette    | Carton          | 24       |
| XXL Energy         | 33 cl canette    | Carton          | 24       |

## 6.3. SOLIBRA — Boissons gazeuses

Précharger les variantes connues :

- Orangina : verre 30 cl et 50 cl, PET 50 cl et 125 cl, canette 33 cl.
- World Cola : verre 30 cl et 50 cl, PET 30 cl, 1 L et 1,5 L, canette 33 cl.
- Youki : verre 30 cl et 50 cl, PET 30 cl, 1 L et 1,5 L, canette 33 cl.
- Youzou : verre 30 cl et 50 cl, PET 30 cl, 1 L et 1,5 L, canette 33 cl.

Pour les conditionnements collectifs :

- Verre 30 cl : casier de 24.
- Verre 50 cl : casier de 12.
- PET 30 cl : pack de 12.
- PET 1 L : pack de 6.
- PET 1,5 L : pack de 6.
- Canette 33 cl : carton de 24.

Prévoir également les variantes aromatiques de Youki et les autres parfums du catalogue.

## 6.4. BRASSIVOIRE

Créer au minimum les références suivantes :

- Ivoire Classic 33, 50 et 60 cl : à confirmer selon disponibilité.
- Ivoire Black 33 et 60 cl ; 50 cl à confirmer.
- Heineken 33 et 50 cl bouteille.
- Desperados 25 et 33 cl bouteille ; canette 50 cl.
- Rhino Energy Malt 33 cl.

Les quantités par casier, carton ou pack doivent être renseignées uniquement lorsqu'elles sont confirmées.

## 6.5. NBCI

Créer les références suivantes :

- American Cola.
- Planet et ses parfums.
- Bubble Up.
- Reaktor.
- Assinie.
- Jiri.
- Vimto à vérifier.

Prévoir les formats PET de 300 ml, 330 ml, 500 ml, 1 L et 1,5 L lorsque leur disponibilité est confirmée pour chaque référence.

Ne pas attribuer arbitrairement un pack de 6, 12 ou 24.

## 6.6. SIPROCOM

Prévoir les produits Joyce et ses variantes, les sangrias et Vin Akwaba.

Les volumes, emballages et conditionnements doivent rester modifiables et être complétés à partir des informations fournisseurs.

# 7. GESTION DYNAMIQUE DES PRODUITS PAR L'OWNER

Créer un module complet :

**ADMINISTRATION → CATALOGUE STANDARD**

L'OWNER doit avoir un contrôle total sur le catalogue standard.

Il doit pouvoir :

### 7.1. Gérer les producteurs

- Ajouter un producteur.
- Modifier ses informations.
- Ajouter son logo.
- Modifier son pays d'origine.
- Renseigner son adresse et son site officiel.
- Archiver ou réactiver un producteur.
- Consulter les marques associées.
- Consulter les produits associés.

### 7.2. Gérer les marques

- Créer une marque.
- Modifier son nom.
- Ajouter son logo.
- Renseigner sa description.
- Définir sa catégorie principale.
- Associer la marque à un producteur.
- Modifier son association.
- Archiver ou réactiver la marque.

### 7.3. Gérer les produits

L'OWNER doit pouvoir créer un nouveau produit sans restriction artificielle liée aux catégories préexistantes.

Champs :

- Nom du produit.
- Marque.
- Producteur.
- Catégorie.
- Sous-catégorie.
- Description.
- Type de boisson.
- Taux d'alcool éventuel.
- Origine.
- Statut commercial.
- Image du produit.
- Références complémentaires.

### 7.4. Gérer les variantes

Un produit doit pouvoir avoir autant de variantes que nécessaire.

Exemple :

Bock :

- 33 cl bouteille.
- 50 cl bouteille.
- 65 cl bouteille.
- 100 cl bouteille.
- 33 cl canette.
- 50 cl canette.

L'OWNER doit pouvoir ajouter une variante, la modifier, la dupliquer, la désactiver ou l'archiver.

Champs d'une variante :

- Volume en millilitres.
- Type de contenant.
- Code SKU.
- Code-barres.
- Présentation.
- Unité de stock de base.
- Statut de commercialisation.
- Informations complémentaires.

### 7.5. Gérer les conditionnements

L'OWNER doit pouvoir créer des conditionnements :

- Bouteille individuelle.
- Canette individuelle.
- Casier de 6.
- Casier de 12.
- Casier de 20.
- Casier de 24.
- Pack de 4.
- Pack de 6.
- Pack de 12.
- Carton de 12.
- Carton de 24.
- Conditionnements personnalisés.

Ces exemples ne constituent pas des conditionnements automatiquement attribués à tous les produits.

L'OWNER doit pouvoir définir :

- Le type de conditionnement.
- Le nombre d'unités.
- Le niveau d'emballage.
- L'unité de vente.
- Le prix de référence éventuel.
- La disponibilité.
- Les règles de conversion de stock.

Il doit pouvoir créer un conditionnement personnalisé en saisissant librement le nombre d'unités.

# 8. GESTION DES PRIX ET MISE À JOUR DES TARIFS

Cette fonctionnalité est fondamentale.

Le catalogue doit pouvoir évoluer en fonction des prix commerciaux pratiqués et des besoins du marché ivoirien.

Ne jamais enregistrer un prix unique et permanent directement dans une fiche produit comme unique source de vérité.

Distinguer trois niveaux :

### A. Prix de référence

Prix indicatif ou suggéré associé à une référence standard.

Il peut être renseigné et actualisé par l'OWNER.

### B. Prix d'achat fournisseur

Chaque fournisseur doit pouvoir disposer de ses propres tarifs pour un même produit.

Exemple :

| Fournisseur   | Produit           | Prix d'achat |
| ------------- | ----------------- | ------------ |
| Fournisseur A | Bock 33 cl casier | Configurable |
| Fournisseur B | Bock 33 cl casier | Configurable |

Le système doit conserver un historique des prix d'achat.

### C. Prix de vente du dépôt

Chaque sous-dépôt doit pouvoir définir ses propres prix de vente :

- Prix par bouteille.
- Prix par canette.
- Prix par casier.
- Prix par carton.
- Prix par pack.
- Prix par demi-conditionnement si commercialement autorisé.

Prévoir la possibilité d'avoir plusieurs tarifs de vente : grossiste, détaillant, particulier ou client professionnel.

## 8.1. Mise à jour des prix

L'OWNER et les utilisateurs autorisés doivent pouvoir modifier les prix selon leurs permissions.

Chaque changement doit avoir :

- Ancien prix.
- Nouveau prix.
- Date d'application.
- Heure de modification.
- Utilisateur responsable.
- Motif éventuel.
- Périmètre du prix : global, fournisseur ou dépôt.

Permettre de programmer un changement de tarif à une date future.

Les nouvelles ventes doivent utiliser le tarif applicable à la date de vente.

Les ventes historiques ne doivent jamais être recalculées après une modification de tarif.

Les prix doivent être stockés en FCFA sous forme d'entiers.

## 8.2. Alertes commerciales

Prévoir :

- Alerte lorsqu'un prix d'achat augmente.
- Alerte lorsqu'un prix de vente est inférieur au coût configuré.
- Alerte lorsqu'un fournisseur modifie son tarif.
- Historique des fluctuations.
- Analyse de marge par produit.
- Analyse de marge par fournisseur.
- Analyse de marge par catégorie.

Ne pas modifier automatiquement un prix de vente à la suite d'une hausse du prix fournisseur sans validation d'un utilisateur autorisé.

# 9. INTÉGRATION DES EMBALLAGES ET RETOURS

Le catalogue doit être directement connecté au module de gestion des emballages.

Chaque variante doit pouvoir être associée à un type d'emballage.

Paramètres :

- Emballage suivi : oui/non.
- Emballage réutilisable : oui/non.
- Type d'emballage.
- Nombre d'emballages associés à la vente.
- Valeur indicative.
- Valeur applicable en cas de non-restitution.
- Délai de restitution par défaut.
- État de la règle.
- Date de validité.

Exemple :

Bock 33 cl :

- Contenant : bouteille en verre.
- Conditionnement : casier de 24.
- Casier réutilisable : oui.
- Retour d'emballages : oui.
- Valeur indicative : configurable.

Bock canette 33 cl :

- Contenant : canette aluminium.
- Conditionnement : carton de 24.
- Casier réutilisable : non.
- Retour d'emballages : non.

La même marque peut donc comporter des références avec des règles de retour différentes.

Respecter strictement la logique métier définie dans le module de gestion des emballages du projet.

Une modification du catalogue ne doit jamais altérer les obligations physiques, échéances ou créances financières déjà créées.

Les valeurs historiques des emballages doivent être conservées dans les transactions d'origine.

# 10. CONCEPTION DE LA BASE DE DONNÉES SQLITE

Créer ou adapter les tables suivantes selon l'existant.

## Tables principales du catalogue

### `manufacturers`

- id
- name
- country
- address
- website
- logo_path
- description
- status
- created_at
- updated_at

### `breweries`

- id
- manufacturer_id
- name
- description
- status

### `brands`

- id
- manufacturer_id
- brewery_id
- name
- logo_path
- description
- status
- created_at
- updated_at

### `product_categories`

- id
- name
- parent_id
- description
- status

### `products`

- id
- brand_id
- category_id
- name
- description
- alcohol_percentage
- country_of_origin
- image_path
- catalog_scope
- verification_status
- status
- created_at
- updated_at
- archived_at

### `product_variants`

- id
- product_id
- sku
- barcode
- volume_ml
- container_type_id
- stock_base_unit
- description
- verification_status
- status
- created_at
- updated_at

### `container_types`

- id
- name
- description
- is_reusable
- status

### `packaging_types`

- id
- name
- packaging_category
- units_per_package
- is_returnable
- default_value
- status

### `product_packaging`

- id
- product_variant_id
- packaging_type_id
- units_per_package
- is_default
- is_returnable
- return_value
- return_delay_days
- effective_from
- effective_until
- status

## Tables des prix

### `reference_prices`

- id
- product_variant_id
- packaging_id
- reference_price
- effective_from
- effective_until
- updated_by
- reason

### `supplier_product_prices`

- id
- supplier_id
- product_variant_id
- packaging_id
- purchase_price
- effective_from
- effective_until
- updated_at

### `depot_product_prices`

- id
- depot_id
- product_variant_id
- packaging_id
- customer_category
- selling_price
- effective_from
- effective_until
- updated_at

### `product_price_history`

- id
- price_type
- product_variant_id
- supplier_id
- depot_id
- packaging_id
- old_price
- new_price
- effective_at
- changed_by
- reason

## Tables d'administration

### `catalog_sources`

- id
- name
- source_url
- source_type
- last_checked_at
- description

### `catalog_change_logs`

- id
- entity_type
- entity_id
- action
- old_data
- new_data
- changed_by
- created_at

### `catalog_import_batches`

- id
- file_name
- imported_by
- import_date
- total_rows
- successful_rows
- failed_rows
- status
- error_report_path

Adapter les noms et les colonnes aux conventions de la base existante.

Les clés étrangères, index, contraintes d'unicité et règles de suppression doivent être définis.

Ne pas supprimer les données historiques déjà utilisées dans les ventes, les réapprovisionnements et les inventaires.

# 11. STATUTS ET QUALITÉ DES DONNÉES

Chaque référence doit posséder un statut de vérification.

Valeurs recommandées :

- `verified` : information confirmée par une source fiable.
- `to_verify` : information à confirmer.
- `historical` : référence historique ou commercialisation actuelle non confirmée.
- `custom` : référence créée manuellement par l'OWNER.
- `inactive` : référence non commercialisée actuellement.

Chaque référence doit pouvoir conserver sa provenance :

- `manufacturer_official`
- `manufacturer_announcement`
- `official_shop`
- `supplier_catalog`
- `retailer`
- `secondary_source`
- `manual_entry`

Les références non vérifiées ne doivent pas être supprimées automatiquement.

Afficher un avertissement dans la fiche du produit lorsqu'un format ou conditionnement est à confirmer.

Ne jamais transformer une donnée inconnue en valeur fictive.

# 12. INTERFACE UTILISATEUR — ADMINISTRATION DU CATALOGUE

Créer une interface moderne et professionnelle.

## Écran 1 : Vue générale du catalogue

Afficher :

- Nombre de producteurs.
- Nombre de marques.
- Nombre de catégories.
- Nombre de produits.
- Nombre de variantes.
- Références actives.
- Références archivées.
- Références à vérifier.

Ajouter :

- Recherche globale.
- Filtres.
- Tri.
- Pagination.
- Vues compactes et détaillées.

## Écran 2 : Brasseries et producteurs

Afficher les producteurs sous forme de fiches avec :

- Logo.
- Nom.
- Pays.
- Nombre de marques.
- Nombre de produits.
- Statut.

Actions disponibles :

- Ajouter.
- Modifier.
- Archiver.
- Consulter les marques.
- Consulter les produits.

## Écran 3 : Marques

Afficher les marques rattachées à leurs producteurs respectifs.

Permettre une navigation directe vers les produits et variantes associés.

## Écran 4 : Catalogue des produits

Créer un tableau professionnel avec :

- Image.
- Producteur.
- Marque.
- Produit.
- Catégorie.
- Format.
- Conditionnement.
- Nombre d'unités.
- Retour d'emballage.
- Prix de référence.
- Statut.

Filtres par :

- Producteur.
- Marque.
- Catégorie.
- Format.
- Contenant.
- Conditionnement.
- Retour d'emballages.
- Statut de vérification.
- Statut commercial.

## Écran 5 : Fiche produit

Créer une fiche détaillée organisée en onglets :

1. Informations générales.
2. Variantes et formats.
3. Conditionnements.
4. Emballages et retours.
5. Tarifs de référence.
6. Fournisseurs associés.
7. Historique.
8. Documents et sources.

## Écran 6 : Création et modification

Créer des formulaires dynamiques.

Lorsqu'un nouvel utilisateur sélectionne un produit ou une variante, les champs dépendants doivent être proposés intelligemment.

L'OWNER doit pouvoir créer une référence complète sans avoir besoin de connaissances techniques.

Prévoir la duplication d'un produit existant pour accélérer la création d'une nouvelle variante.

## Écran 7 : Gestion des prix

Créer un écran permettant :

- De visualiser les prix en cours.
- De modifier plusieurs références.
- De programmer les nouveaux tarifs.
- De comparer les prix fournisseurs.
- De consulter les historiques.
- D'exporter les tarifs.

Prévoir la modification en masse avec confirmation avant validation.

# 13. IMPORTATION ET EXPORTATION

Le catalogue doit pouvoir être enrichi à l'aide de fichiers externes.

Formats d'import :

- CSV.
- XLSX.
- JSON.

Formats d'export :

- CSV.
- XLSX.
- JSON.

Créer un assistant d'importation :

1. Sélection du fichier.
2. Identification des colonnes.
3. Prévisualisation des données.
4. Détection des doublons.
5. Vérification des formats.
6. Validation.
7. Importation transactionnelle.
8. Rapport détaillé des résultats.

Ne jamais écraser silencieusement une référence existante.

Proposer des choix :

- Créer une nouvelle référence.
- Mettre à jour une référence existante.
- Ignorer la ligne.
- Enregistrer comme variante.
- Signaler un conflit.

Prévoir une sauvegarde avant les opérations d'importation en masse.

# 14. RÈGLES DE PROTECTION DES DONNÉES

Une référence utilisée dans des opérations commerciales ne doit pas être physiquement supprimée.

L'OWNER doit pouvoir :

- Désactiver une référence.
- Archiver une référence.
- Réactiver une référence.
- Corriger une information descriptive.
- Modifier les nouvelles règles tarifaires.

En revanche :

- Les anciennes ventes doivent conserver leur désignation.
- Les anciens prix doivent être conservés.
- Les anciennes quantités doivent rester identiques.
- Les obligations d'emballages doivent conserver leurs règles d'origine.
- Les mouvements de stock historiques ne doivent pas être recalculés.

Utiliser des photographies historiques des données commerciales nécessaires dans les lignes de vente et autres documents transactionnels.

Exiger une confirmation pour les changements sensibles.

Chaque changement doit produire un journal d'audit.

# 15. DROITS D'ACCÈS

## OWNER / SUPER ADMIN

Droits complets :

- Création et modification des producteurs.
- Gestion des marques.
- Gestion des catégories.
- Création et suppression logique des produits.
- Création des variantes.
- Modification des conditionnements.
- Gestion des règles d'emballages.
- Gestion des tarifs de référence.
- Importation et exportation.
- Historique des modifications.
- Gestion des paramètres globaux.

## ADMINISTRATEUR DU DÉPÔT

Selon les permissions :

- Activation ou désactivation des références locales.
- Gestion des prix propres au dépôt.
- Gestion des stocks.
- Association des fournisseurs.
- Création de références locales si cette permission est accordée.

## CAISSIER ET MAGASINIER

Droits de consultation du catalogue et de sélection des produits selon leurs fonctions.

Ne pas autoriser la modification du catalogue standard à ces rôles par défaut.

Toutes les permissions doivent être contrôlées côté Rust.

# 16. COMPORTEMENT DU CATALOGUE DANS LES AUTRES MODULES

Le catalogue central doit alimenter directement :

### Ventes

- Sélection des produits.
- Affichage des variantes.
- Affichage des unités de vente.
- Application des prix du dépôt.
- Déclenchement des règles d'emballages.

### Fournisseurs

- Association des références aux fournisseurs.
- Tarifs d'achat.
- Conditions d'approvisionnement.
- Historique des tarifs.

### Réapprovisionnement

- Sélection des produits.
- Calcul des quantités.
- Calcul des emballages vides à remettre.
- Réception des marchandises.

### Stock

- Suivi par variante.
- Conversion des unités.
- Gestion des conditionnements.
- Mouvements de stock.

### Inventaire

- Comptage par produit et variante.
- Comparaison des quantités réelles et théoriques.
- Gestion des écarts.

### Rapports

- Analyse par brasserie.
- Analyse par marque.
- Analyse par catégorie.
- Analyse par variante.
- Analyse par fournisseur.
- Analyse des marges.

Aucun module ne doit gérer sa propre liste de produits indépendante du catalogue central, sauf besoin de références locales explicitement prévu.

# 17. TESTS OBLIGATOIRES

Créer des tests unitaires et d'intégration.

### Test 1 — Initialisation

Au premier lancement :

- Les producteurs standard sont chargés.
- Les marques sont associées aux bons producteurs.
- Les produits sont rattachés aux bonnes marques.
- Les variantes sont disponibles.
- Les conditionnements connus sont enregistrés.

### Test 2 — Création d'un nouveau producteur

L'OWNER ajoute une nouvelle brasserie.

Résultat : elle apparaît dans le catalogue et peut recevoir des marques et des produits.

### Test 3 — Création d'une nouvelle marque

L'OWNER ajoute une marque à un producteur existant.

Résultat : elle devient disponible pour la création des produits associés.

### Test 4 — Création d'une nouvelle variante

L'OWNER ajoute une nouvelle taille de bouteille.

Résultat : la variante est créée et accessible dans les modules autorisés.

### Test 5 — Création d'un conditionnement

L'OWNER crée un conditionnement personnalisé de 18 bouteilles.

Résultat : la conversion de quantité est correcte et utilisable dans le stock.

### Test 6 — Modification d'un prix

Le prix de vente passe de 12 000 à 13 000 FCFA.

Résultat : les nouvelles ventes utilisent 13 000 FCFA à partir de la date d'application. Les anciennes ventes restent à 12 000 FCFA.

### Test 7 — Modification d'un conditionnement

L'OWNER modifie le nombre d'unités d'un conditionnement pour les nouvelles opérations.

Résultat : les transactions historiques ne changent pas.

### Test 8 — Archivage d'un produit

L'OWNER archive un produit déjà utilisé.

Résultat : il n'est plus proposé pour les nouvelles ventes, mais les anciennes opérations restent consultables.

### Test 9 — Références non vérifiées

Une référence historique est importée.

Résultat : elle possède le statut `historical` ou `to_verify` et ne peut pas être considérée comme une référence confirmée.

### Test 10 — Autorisations

Un caissier tente de modifier une référence du catalogue standard.

Résultat : l'opération est refusée côté backend.

### Test 11 — Importation

Un fichier CSV contenant des produits nouveaux, modifiés et dupliqués est importé.

Résultat : les doublons sont détectés et les erreurs sont présentées sans écrasement silencieux.

### Test 12 — Compatibilité des ventes

Un produit du catalogue est utilisé dans une vente puis archivé.

Résultat : l'historique de la vente reste parfaitement consultable.

# 18. MÉTHODE DE DÉVELOPPEMENT IMPOSÉE

Respecter les phases ci-dessous.

## PHASE 1 — Audit

- Examiner le projet.
- Identifier les modèles de données existants.
- Identifier les tables produits et catégories.
- Examiner les modules de ventes, fournisseurs et stocks.
- Identifier les migrations nécessaires.

## PHASE 2 — Modélisation

- Définir les producteurs.
- Définir les marques.
- Définir les catégories.
- Définir les produits.
- Définir les variantes.
- Définir les conditionnements.
- Définir les prix.
- Définir les relations avec les fournisseurs.
- Définir les relations avec les emballages.

## PHASE 3 — Initialisation du catalogue

- Créer le jeu de données standard.
- Importer les références SOLIBRA.
- Importer les références Brassivoire.
- Importer les références NBCI.
- Importer les références SIPROCOM.
- Associer les sources.
- Marquer les données à vérifier.
- Vérifier les doublons.

Les données standard doivent être conservées dans des fichiers de seed versionnés et reproductibles.

Ne pas insérer les produits directement dans les composants React.

## PHASE 4 — Administration OWNER

- Interface des producteurs.
- Interface des marques.
- Interface des produits.
- Interface des variantes.
- Interface des conditionnements.
- Interface des prix.
- Importation et exportation.
- Droits et audit.

## PHASE 5 — Intégration métier

- Ventes.
- Fournisseurs.
- Réapprovisionnement.
- Stocks.
- Emballages.
- Inventaires.
- Rapports.

## PHASE 6 — Tests

- Tests des règles de données.
- Tests de permissions.
- Tests d'importation.
- Tests des prix.
- Tests de stock.
- Tests de conservation des historiques.
- Tests hors connexion.

# 19. CRITÈRES FINAUX D'ACCEPTATION

La fonctionnalité est terminée lorsque :

1. Le catalogue standard est présent dès l'installation.
2. Les produits sont séparés par producteurs et marques.
3. Les variantes sont correctement identifiées.
4. Les formats et conditionnements sont configurables.
5. L'OWNER peut créer une nouvelle brasserie.
6. L'OWNER peut créer de nouvelles marques.
7. L'OWNER peut ajouter de nouveaux produits.
8. L'OWNER peut modifier les références existantes.
9. L'OWNER peut archiver et réactiver les produits.
10. L'OWNER peut créer des conditionnements personnalisés.
11. Les prix de référence sont modifiables.
12. Les fournisseurs peuvent avoir leurs propres prix d'achat.
13. Chaque dépôt peut avoir ses propres prix de vente.
14. Les changements tarifaires sont historisés.
15. Les anciennes ventes ne sont jamais modifiées rétroactivement.
16. Les règles de retour d'emballages sont associées aux bonnes variantes.
17. Les références non vérifiées sont clairement identifiées.
18. Le catalogue est exploité par les modules de ventes, fournisseurs et stocks.
19. L'importation et l'exportation fonctionnent.
20. Les autorisations OWNER sont vérifiées dans le backend.
21. Le fonctionnement hors connexion est assuré.
22. Les tests métier passent.

---

# 20. INSTRUCTION FINALE À L'AGENT IA

Construis un catalogue standard réellement administrable et évolutif.

Ne code pas les produits en dur dans l'application.

Ne limite pas le nombre de producteurs, de marques, de produits, de variantes ou de conditionnements.

L'OWNER doit pouvoir créer de nouvelles références selon les nouveaux produits disponibles sur le marché ivoirien, les nouveaux tarifs fournisseurs et les besoins commerciaux de l'exploitation.

Le catalogue standard doit être une base de référence, pas une contrainte.

Le catalogue opérationnel de chaque dépôt doit conserver sa liberté commerciale : chaque dépôt doit pouvoir sélectionner ses produits, définir ses propres prix et travailler avec ses propres fournisseurs.

La gestion des prix, des stocks, des emballages et des ventes doit conserver son historique et rester cohérente avec les règles métier du projet.

**Priorité absolue : flexibilité, fiabilité des données, traçabilité et simplicité d'administration.**

Ne considère pas cette tâche comme terminée tant que l'OWNER n'est pas réellement capable de gérer tout le catalogue depuis l'interface de l'application sans intervention dans le code source.

### **Résultat attendu**

À la fin de cette implémentation, tu dois disposer de trois niveaux complémentaires :

Niveau 1

**Catalogue standard — OWNER**

Base de référence des brasseries, marques, produits, formats et conditionnements. L'owner peut créer, modifier, actualiser et archiver.

Niveau 2

**Catalogue opérationnel — Dépôt**

Chaque dépôt choisit les produits qu'il commercialise, configure ses prix et associe ses fournisseurs.

Niveau 3

**Historique commercial**

Les anciens prix, ventes, conditionnements et mouvements sont conservés même après les modifications du catalogue.

**Ma recommandation technique :** demande à ton agent de réaliser d'abord le catalogue central et son interface OWNER avant de connecter les ventes et les approvisionnements. Cela évitera de construire les autres modules sur une liste de produits rigide.

Une prochaine étape utile serait de produire le fichier initial `catalog_seed.json` et les scripts SQL correspondant à ce prompt, avec les produits et variantes déjà structurés.
