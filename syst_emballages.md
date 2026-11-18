Je vais intégrer ces nouvelles informations dans le MASTER PROMPT de DEPOTPRO PREMIUM V3, en apportant une distinction importante : **toutes les boissons en bouteilles ne fonctionnent pas avec des casiers consignables, et tous les emballages ne sont pas réutilisables.**

J'ai vérifié les formats commercialisés par SOLIBRA. Les sucreries en verre consigné utilisent effectivement les mêmes grandes familles de conditionnements que certaines bières : par exemple, Youki et Orangina existent en verre consigné de 30 cl en casier de 24 et de 50 cl en casier de 12. Les catalogues consultés montrent également des formats PET et des canettes vendus en packs ou cartons, qui ne doivent pas être traités comme des casiers consignables.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.solibra.ci\&sz=32)

Solibra+3



**Correction métier à intégrer :** on ne doit pas coder « B12 = tous les grands formats ». Un B12 de 50 cl, un B12 de 65 cl et un B12 de 100 cl peuvent avoir des géométries et des références d'emballages différentes. Le logiciel doit donc identifier le conditionnement exact, pas seulement le nombre de bouteilles.

De même, les formats PET de 1 L ou 1,5 L vendus en packs ne deviennent pas des casiers réutilisables simplement parce qu'ils contiennent plusieurs bouteilles. Le système doit distinguer le contenant de vente, le support logistique et le caractère réutilisable ou jetable.

# **MASTER PROMPT — DEPOTPRO PREMIUM V3**

Mise à jour majeure : catalogue intelligent, conditionnements, casiers consignables et emballages jetables

# DEPOTPRO PREMIUM V3

# MASTER PROMPT — REFONTE DU CATALOGUE PRODUITS ET DU SYSTÈME D'EMBALLAGES

**Projet :** DEPOTPRO PREMIUM V3\
**Marché cible :** Côte d'Ivoire, puis Afrique francophone\
**Architecture technique :** React + TypeScript + Rust + SQLite + Tauri 2, avec backend Node.js/Express existant\
**Devise :** FCFA\
**Objectif :** adapter intégralement le logiciel au fonctionnement commercial des dépôts et sous-dépôts de boissons en Côte d'Ivoire.

---

# PARTIE 1 — MISSION DE L'AGENT IA

Tu es un architecte logiciel senior, ingénieur Rust, expert en bases de données SQLite, développeur React/TypeScript et spécialiste des logiciels de gestion commerciale et de stock.

Tu dois faire évoluer le projet existant DEPOTPRO PREMIUM V3.

Tu ne dois pas créer une application indépendante ni réécrire inutilement les fonctionnalités existantes.

Tu dois examiner le code source, comprendre les règles métier déjà implémentées, puis intégrer une nouvelle architecture fonctionnelle autour de trois notions :

1. Le catalogue des produits et de leurs conditionnements.
2. La gestion des emballages réutilisables et des emballages jetables.
3. La gestion des échanges d'emballages entre le dépôt, ses clients et ses fournisseurs.

Le résultat doit être une application professionnelle, fiable, intuitive, rapide, utilisable hors ligne et adaptée aux pratiques commerciales ivoiriennes.

**RÈGLE ABSOLUE : les règles métier doivent être pilotées par la configuration du catalogue et non par des conditions codées en dur dans les écrans ou les services.**

Avant toute modification :

- Examiner le dépôt Git.
- Identifier les modules existants.
- Lire les migrations et les schémas SQLite.
- Examiner les ventes, achats, stocks, produits, clients, fournisseurs et anciennes consignations.
- Identifier les différences entre les implémentations Rust et Node.js.
- Établir un plan d'intégration.
- Ne supprimer aucune donnée existante.
- Ne pas modifier l'architecture générale sans justification technique.

Le code existant est la référence de départ.

# PARTIE 2 — NOUVEAU MODÈLE MÉTIER

## 2.1. Les trois dimensions d'un produit

Un produit commercial doit être décrit indépendamment de son conditionnement.

Exemple :

- Produit : Youki Orange.
- Marque : Youki.
- Catégorie : Sucrerie.
- Contenance unitaire : 30 cl.
- Type de contenant : verre.
- Conditionnement commercial : casier de 24.
- Emballage : casier réutilisable B24.
- Échange d'emballages : obligatoire selon les conditions commerciales.

Autre exemple :

- Produit : Youki Orange.
- Contenance unitaire : 33 cl.
- Type de contenant : canette aluminium.
- Conditionnement commercial : carton de 24.
- Emballage : carton jetable.
- Retour de casier : non applicable.

Un même produit ou une même marque peut avoir plusieurs références commerciales et plusieurs conditionnements.

Le logiciel ne doit jamais considérer qu'une marque possède un seul conditionnement.

## 2.2. Les familles de boissons

Créer des catégories configurables :

- Bières.
- Sucreries et boissons gazeuses.
- Énergisants.
- Malt et boissons maltées.
- Vins.
- Spiritueux et apéritifs.
- Cidres.
- Eaux.
- Autres boissons.

Chaque catégorie doit être modifiable par le propriétaire.

Ne pas coder une liste fermée de marques ou de catégories.

## 2.3. Les types de contenants

Prévoir les contenants suivants :

- Bouteille en verre.
- Bouteille PET/plastique.
- Canette aluminium.
- Autre contenant configurable.

Chaque produit doit posséder une contenance unitaire exprimée en millilitres.

Exemples :

- 25 cl = 250 ml.
- 30 cl = 300 ml.
- 33 cl = 330 ml.
- 50 cl = 500 ml.
- 65 cl = 650 ml.
- 75 cl = 750 ml.
- 100 cl = 1 000 ml.
- 150 cl = 1 500 ml.

Stocker les volumes en millilitres entiers, pas en nombres flottants.

# PARTIE 3 — CATALOGUE DES CONDITIONNEMENTS

## 3.1. Principe fondamental

Il faut dissocier :

1. Le produit.
2. Le contenant individuel.
3. Le conditionnement commercial.
4. L'emballage logistique.
5. Le caractère réutilisable ou jetable.

Un conditionnement détermine le nombre d'unités vendues ensemble.

Exemples :

- 1 casier de 24 bouteilles.
- 1 casier de 12 bouteilles.
- 1/2 casier de 12 bouteilles.
- 1 pack de 6 bouteilles PET.
- 1 pack de 12 bouteilles PET.
- 1 carton de 24 canettes.
- 1 bouteille vendue individuellement.

Un emballage réutilisable est un objet physique suivi dans le stock et les comptes partenaires.

Un emballage jetable est un support commercial consommé ou vendu avec le produit, sans dette de retour.

Ne jamais créer une dette d'emballage pour un carton jetable ou un pack PET jetable.

## 3.2. Catalogue initial des casiers réutilisables

Créer une configuration initiale proposée, modifiable par le propriétaire.

| Référence | Contenance | Bouteilles par casier | Usage indicatif                                  |
| --------- | ---------- | --------------------- | ------------------------------------------------ |
| B24-30    | 30 cl      | 24                    | Sucreries en verre                               |
| B24-33    | 33 cl      | 24                    | Bières et sucreries en verre                     |
| B12-50    | 50 cl      | 12                    | Bières, sucreries et certaines bouteilles de vin |
| B12-65    | 65 cl      | 12                    | Bières grand format                              |
| B12-75    | 75 cl      | 12                    | Vins et boissons compatibles                     |
| B12-100   | 100 cl     | 12                    | Grandes bouteilles compatibles                   |
| B20-50    | 50 cl      | 20                    | Conditionnement spécifique                       |
| B6-150    | 150 cl     | 6                     | Conditionnement spécifique à confirmer           |

IMPORTANT :

Cette liste est une base de configuration, et non une norme universelle.

L'administrateur doit pouvoir :

- Ajouter un nouveau format.
- Modifier une capacité.
- Créer un type de casier spécifique.
- Définir les dimensions ou la référence fabricant.
- Définir les produits compatibles.
- Définir le nombre de bouteilles.
- Définir la valeur du support plastique.
- Définir la valeur des bouteilles vides.
- Désactiver un type de casier.

Deux casiers qui contiennent 12 bouteilles ne sont pas automatiquement interchangeables.

Exemple :

- B12-50 et B12-65 sont deux références distinctes.
- Un B12-50 ne peut pas remplacer un B12-65 dans un retour d'emballage.
- Un B24-30 ne peut pas remplacer un B24-33.

Le rapprochement des dettes et des retours doit s'effectuer sur la référence exacte du conditionnement.

## 3.3. Catalogue initial des emballages jetables

Créer une famille spécifique :

**EMBALLAGES JETABLES**

Exemples de conditionnements :

| Conditionnement      | Quantité      | Support        |
| -------------------- | ------------- | -------------- |
| Pack PET             | 6 bouteilles  | Film plastique |
| Pack PET             | 12 bouteilles | Film plastique |
| Carton de canettes   | 24 canettes   | Carton         |
| Carton de canettes   | 12 canettes   | Carton         |
| Carton de bouteilles | Configurable  | Carton         |

L'administrateur doit pouvoir ajouter d'autres conditionnements.

Règles :

- Un pack PET de 6 bouteilles représente 6 unités de boisson.
- Un carton de 24 canettes représente 24 unités de boisson.
- Un carton jetable n'est pas un casier consigné.
- Le logiciel ne crée aucune dette d'emballage réutilisable sur ces conditionnements.
- Le carton ou le film peut être intégré au coût du conditionnement.
- La quantité de produits est convertie automatiquement en unités individuelles pour le stock.

# PARTIE 4 — GESTION DES SUCRERIES EN BOUTEILLES

Les sucreries doivent être gérées exactement comme les autres boissons lorsqu'elles utilisent un contenant en verre réutilisable.

Exemples de produits à prévoir dans le catalogue de démonstration :

- Youki Orange.
- Youki Cocktail.
- Youki Pamplemousse.
- Youki Tonic.
- Youzou.
- Orangina.
- World Cola.
- Autres marques configurables.

Exemples de conditionnements possibles à configurer :

- Youki verre 30 cl : casier B24-30.
- Youki verre 50 cl : casier B12-50.
- Orangina verre 30 cl : casier B24-30.
- Orangina verre 50 cl : casier B12-50.
- Youzou canette 33 cl : carton de 24 jetable.
- Youki PET 1 L : pack configurable.
- Youki PET 1,5 L : pack configurable.

Les exemples ne doivent pas être considérés comme une obligation de stock initial.

Le propriétaire doit pouvoir créer les références réellement commercialisées dans son dépôt.

Les sucreries en verre consignable doivent utiliser :

- Le stock de boissons pleines.
- Le stock des casiers vides.
- Le compte emballages client.
- Le compte emballages fournisseur.

Les sucreries en PET ou en canette doivent utiliser le stock de produits et leur conditionnement jetable, sans créer de dette de casier.

# PARTIE 5 — NOUVEAU SYSTÈME D'EMBALLAGES RÉUTILISABLES

## 5.1. Composition d'un emballage

Un emballage réutilisable peut comprendre :

- Un support plastique.
- Des bouteilles vides.

Exemple B24 :

- 1 support plastique.
- 24 bouteilles vides.

Exemple B12 :

- 1 support plastique.
- 12 bouteilles vides.

Les composants doivent pouvoir être suivis séparément.

Ne pas supposer qu'un demi-casier correspond à un demi-support plastique.

Le propriétaire doit pouvoir définir si un conditionnement autorise :

- Un casier complet.
- Un demi-casier.
- Une quantité libre de bouteilles.
- Une remise sans support plastique, selon les pratiques réellement observées.

## 5.2. Les états d'emballages

Prévoir :

- Vide complet.
- Plein complet.
- Partiellement plein.
- Incomplet.
- Endommagé.
- Hors service.

Le logiciel doit distinguer les stocks physiques et les engagements avec les partenaires.

## 5.3. Comptes emballages clients

Lors d'une vente :

1. Calculer les casiers pleins remis au client.
2. Enregistrer les casiers vides effectivement reçus.
3. Comparer les quantités par référence exacte.
4. Créer une dette d'emballage pour la différence.
5. Mettre à jour le compte client.

Exemple :

Le client prend :

- 2 B24-33.
- 3 B12-50.

Il retourne :

- 2 B24-33.
- 2 B12-50.

Résultat :

- Solde B24-33 : 0.
- Solde B12-50 : 1 casier dû.

La facture doit afficher les emballages remis, les retours reçus et le solde restant.

Lors d'un retour ultérieur :

- Rechercher le client.
- Afficher ses dettes par référence.
- Enregistrer les emballages réellement reçus.
- Régulariser les écritures correspondantes.
- Mettre à jour le stock physique.

Ne jamais comptabiliser un retour non reçu.

## 5.4. Comptes emballages fournisseurs

Lors d'une commande fournisseur :

- Identifier les références de casiers attendues.
- Calculer les quantités à retourner.
- Enregistrer les emballages réellement remis.
- Enregistrer les emballages reçus avec les marchandises.
- Suivre les différences.
- Créer les soldes correspondants au fournisseur.

Un casier B24-33 ne peut pas régler une dette B12-50.

## 5.5. Valeur financière des emballages

Chaque type d'emballage peut comporter :

- Valeur du support plastique.
- Valeur unitaire d'une bouteille vide.
- Nombre de bouteilles par casier.
- Valeur totale théorique.

Calcul :

Valeur totale = valeur du support plastique + (nombre de bouteilles × valeur unitaire d'une bouteille vide).

Ces valeurs sont paramétrables et historisées.

Prévoir deux traitements :

- Emballage à retourner.
- Emballage payé financièrement.

Un paiement d'emballage doit clôturer la dette correspondante sans créer de mouvement physique fictif.

Ne pas confondre :

- Le prix de vente des boissons.
- La valeur des emballages.
- Le paiement réel.
- La dette physique d'emballage.

# PARTIE 6 — GESTION DES DEMI-CASIERS ET UNITÉS

Les ventes doivent accepter les quantités suivantes :

- Casier complet.
- Demi-casier.
- Bouteille individuelle, si autorisée pour le produit.

Exemples :

- B24-33 complet = 24 bouteilles.
- Demi-B24-33 = 12 bouteilles.
- B12-50 complet = 12 bouteilles.
- Demi-B12-50 = 6 bouteilles.

La conversion doit être pilotée par le conditionnement.

Pour les quantités, utiliser des unités entières de bouteilles ou une unité de sous-conditionnement exacte.

Le système ne doit pas supposer que tous les produits autorisent les demi-casiers.

Ajouter un paramètre :\
`allows_half_case`.

La gestion du support physique doit rester indépendante de la quantité de boissons.

# PARTIE 7 — FORMULAIRE INTELLIGENT DE CONFIGURATION DES PRODUITS

Cette partie est prioritaire.

Le propriétaire doit pouvoir configurer son catalogue sans connaissances techniques.

Le formulaire doit être simple, clair, rapide et compréhensible par un commerçant.

Il ne faut pas afficher toutes les propriétés techniques dans un seul grand formulaire.

Utiliser une configuration progressive en quatre étapes.

## ÉTAPE 1 — IDENTITÉ DU PRODUIT

Champs :

- Nom du produit.
- Marque.
- Catégorie.
- Description facultative.
- Image facultative.
- Code-barres facultatif.
- Référence interne facultative.

Exemple :

Nom : Bock\
Marque : Bock\
Catégorie : Bière

## ÉTAPE 2 — CARACTÉRISTIQUES DE LA BOISSON

Champs :

- Type de contenant : Verre / PET / Canette / Autre.
- Contenance : saisie en cl ou L avec conversion automatique en ml.
- Couleur ou variante facultative.
- Code produit facultatif.
- Activer ou non la vente à l'unité.

Exemple :

Contenant : Bouteille en verre\
Contenance : 33 cl

## ÉTAPE 3 — CONDITIONNEMENT COMMERCIAL

Afficher une question simple :

**Comment ce produit est-il vendu ?**

Proposer des choix visuels :

1. Casier réutilisable.
2. Pack jetable.
3. Carton jetable.
4. Unité individuelle.
5. Autre conditionnement.

### Si le propriétaire choisit « Casier réutilisable »

Afficher :

- Référence du casier.
- Nombre de bouteilles par casier.
- Autoriser la vente en demi-casier ?
- Nombre de bouteilles par demi-casier.
- Suivi des emballages activé.
- Valeur du support plastique.
- Valeur d'une bouteille vide.
- Produits compatibles.

Exemple :

Type : B24-33\
Contenance : 33 cl\
Capacité : 24 bouteilles\
Demi-casier : Oui, 12 bouteilles\
Retour d'emballages : Oui

### Si le propriétaire choisit « Pack jetable »

Afficher :

- Nombre de bouteilles par pack.
- Type de support : film plastique, carton ou autre.
- Vente en pack autorisée.
- Vente à l'unité autorisée.

Exemple :

Pack PET : 6 bouteilles de 1,5 L\
Support : film plastique\
Emballage réutilisable : Non

### Si le propriétaire choisit « Carton de canettes »

Afficher :

- Nombre de canettes par carton.
- Contenance de chaque canette.
- Type de support : carton.
- Vente par carton autorisée.
- Vente à la canette autorisée.
- Retour d'emballages : Non.

Exemple :

Carton : 24 canettes\
Contenance : 33 cl\
Support : carton jetable\
Consignation : Non

## ÉTAPE 4 — PARAMÈTRES COMMERCIAUX

Champs :

- Prix d'achat.
- Prix de vente détail.
- Prix de vente grossiste.
- Seuil d'alerte de stock.
- Fournisseur principal facultatif.
- Référence fournisseur facultative.
- Statut actif/inactif.

Le formulaire doit proposer un récapitulatif avant validation.

Afficher clairement :

- Nom du produit.
- Contenance.
- Type de contenant.
- Conditionnement.
- Nombre d'unités.
- Type d'emballage.
- Prix.
- Règles de retour.

Ajouter deux boutons :

- Enregistrer le produit.
- Enregistrer et ajouter un autre.

## 7.1. Règles de validation

Le formulaire doit empêcher :

- Un produit sans nom.
- Une contenance nulle ou négative.
- Un casier sans capacité.
- Un conditionnement sans quantité.
- Un emballage réutilisable sans type de référence.
- Un demi-casier incohérent.
- Un produit canette configuré par erreur comme bouteille en verre.
- Un carton jetable activant automatiquement une dette d'emballage.
- Une référence de casier inactive affectée à un nouveau produit.

Les erreurs doivent être expliquées en langage commercial simple.

Exemple :\
« Indiquez le nombre de bouteilles contenues dans ce casier. »

Ne pas afficher des messages techniques du type :\
« Foreign key constraint failed ».

# PARTIE 8 — GESTION COMPLÈTE DU CATALOGUE

Créer un véritable module Catalogue.

Fonctions obligatoires :

- Ajouter un produit.
- Modifier un produit.
- Dupliquer un produit.
- Désactiver un produit.
- Réactiver un produit.
- Archiver un produit.
- Gérer ses conditionnements.
- Gérer ses prix.
- Gérer ses catégories.
- Gérer ses marques.
- Gérer ses formats.
- Gérer ses images.
- Rechercher et filtrer.

## 8.1. Suppression sécurisée

Ne jamais supprimer physiquement un produit déjà utilisé dans :

- Une vente.
- Un achat.
- Un mouvement de stock.
- Une facture.
- Un historique d'emballage.

Dans ce cas, proposer :\
« Ce produit possède un historique commercial. Voulez-vous le désactiver plutôt que le supprimer ? »

Une suppression physique n'est autorisée que si le produit n'a aucune référence historique et aucune dépendance.

## 8.2. Modification des conditionnements

Si un produit a déjà été vendu :

- Ne jamais réécrire les anciennes factures.
- Conserver les anciennes quantités et valeurs.
- Historiser les changements de conditionnement.
- Appliquer les nouvelles règles uniquement aux opérations futures.

Chaque ligne de vente et d'achat doit conserver un instantané du conditionnement utilisé au moment de l'opération.

## 8.3. Interface catalogue

Créer une interface premium comprenant :

- Barre de recherche.
- Filtres par catégorie.
- Filtres par marque.
- Filtres par contenance.
- Filtres par contenant.
- Filtres par type de conditionnement.
- Filtres par statut.
- Tableau ou grille des produits.
- Actions rapides.
- Fiche détaillée du produit.

Dans la liste, afficher :

- Nom.
- Marque.
- Contenance.
- Conditionnement.
- Quantité par conditionnement.
- Type d'emballage.
- Prix.
- Stock.
- Statut.

Prévoir une distinction visuelle simple :

- Réutilisable.
- Jetable.
- Vente à l'unité.

Ne pas surcharger la page de couleurs et d'informations secondaires.

# PARTIE 9 — ARCHITECTURE DE LA BASE DE DONNÉES

Examiner d'abord le schéma existant.

Ne pas dupliquer les tables de produits, catégories, clients, fournisseurs, ventes, achats et stocks.

Créer une migration versionnée adaptée à la base existante.

Tables à prévoir ou adapter :

## `products`

Conserver les champs existants et ajouter si nécessaire :

- brand_id
- category_id
- container_type
- volume_ml
- barcode
- description
- image_path
- is_active
- archived_at

## `product_brands`

- id
- name
- is_active

## `product_categories`

- id
- name
- description
- is_active

## `packaging_types`

Référentiel des emballages physiques réutilisables.

- id
- code
- name
- plastic_support_type
- bottle_capacity
- bottle_volume_ml
- bottles_per_case
- support_value_fcfa
- empty_bottle_value_fcfa
- total_value_fcfa
- is_active

La référence doit identifier un format exact, pas seulement B12 ou B24.

## `product_packaging_options`

- id
- product_id
- packaging_type_id
- commercial_unit_name
- units_per_pack
- allows_half_case
- units_per_half_case
- returnable
- is_default
- valid_from
- valid_until
- is_active

Pour les packs jetables, autoriser `packaging_type_id` à être nul si aucun emballage réutilisable n'est associé, mais conserver les informations du conditionnement commercial.

## `packaging_operations`

- id
- operation_number
- operation_type
- partner_type
- partner_id
- sale_id
- purchase_order_id
- operation_date
- status
- created_by
- created_at

## `packaging_operation_lines`

- id
- operation_id
- packaging_type_id
- quantity_full_cases
- quantity_half_cases
- quantity_bottles
- plastic_support_quantity
- empty_bottle_quantity
- packaging_value_snapshot_fcfa

## `packaging_stock_movements`

- id
- packaging_type_id
- component_type
- quantity
- direction
- operation_id
- warehouse_id
- occurred_at
- created_by

Composants :

- PLASTIC_CRATE
- EMPTY_BOTTLE

## `partner_packaging_ledger`

- id
- partner_type
- partner_id
- packaging_type_id
- direction
- quantity_half_case_units
- operation_id
- source_document_id
- packaging_value_snapshot_fcfa
- settled_quantity
- created_at
- created_by

Les soldes doivent être calculés par partenaire et référence exacte.

Les noms de colonnes et les types définitifs doivent respecter les conventions du dépôt existant.

Ajouter les clés étrangères, index, contraintes et règles d'intégrité nécessaires.

Les mouvements validés doivent être immuables. Les corrections passent par des écritures d'ajustement ou d'annulation tracées.

# PARTIE 10 — INTÉGRATION AUX VENTES

Modifier le parcours de vente.

Lorsqu'un produit est ajouté au panier :

- Afficher le conditionnement.
- Afficher le nombre de bouteilles.
- Afficher la quantité en casiers ou packs.
- Calculer automatiquement les unités individuelles.
- Afficher les emballages réutilisables attendus.
- Permettre la saisie des emballages vides reçus.

Pour les produits réutilisables :

- Calculer les casiers pleins remis.
- Calculer les casiers vides attendus.
- Saisir les casiers réellement récupérés.
- Calculer les différences.
- Mettre à jour le compte emballages.

Pour les produits jetables :

- Ne pas afficher de formulaire de retour de casier.
- Déduire les unités du stock.
- Gérer le pack ou carton comme conditionnement commercial.

La facture doit afficher séparément :

- Les boissons.
- Les conditionnements.
- Les emballages remis.
- Les emballages récupérés.
- Les emballages restant à retourner.
- Les paiements et soldes financiers.

# PARTIE 11 — INTÉGRATION AUX ACHATS FOURNISSEURS

Lors d'une commande fournisseur :

- Sélectionner les produits et conditionnements.
- Calculer les quantités de boissons.
- Calculer les emballages associés.
- Afficher les emballages vides disponibles.
- Enregistrer les casiers remis au fournisseur.
- Enregistrer les boissons reçues.
- Enregistrer les emballages reçus.
- Enregistrer les paiements réels.
- Calculer les soldes financiers et physiques séparément.

Exemple :\
Commande : 20 casiers.\
Emballages disponibles : 17.\
Emballages remis : 17.\
Solde : 3 casiers à régulariser si le fournisseur exige le retour des 20.

Ne pas enregistrer 20 casiers sortis si seulement 17 ont été remis.

# PARTIE 12 — GESTION DES STOCKS

Gérer au minimum trois catégories de stocks :

1. Boissons pleines.
2. Supports plastiques vides.
3. Bouteilles vides.

Les emballages jetables ne doivent pas apparaître dans les comptes de casiers réutilisables.

Prévoir des rapports distincts :

- Stock de boissons par produit.
- Stock d'emballages par référence.
- Stock de supports plastiques.
- Stock de bouteilles vides.
- Emballages détenus par les clients.
- Emballages détenus par les fournisseurs.
- Emballages endommagés.

Les quantités physiques doivent être réconciliables avec les mouvements.

# PARTIE 13 — DESIGN ET ERGONOMIE

Conserver la direction artistique premium existante de DEPOTPRO.

Créer une expérience de configuration compréhensible par un commerçant qui n'a aucune connaissance technique.

Principes :

- Formulaires courts.
- Étapes clairement identifiées.
- Libellés métier simples.
- Exemples visuels.
- Prévisualisation du conditionnement.
- Valeurs par défaut pertinentes.
- Messages d'erreur explicites.
- Navigation clavier.
- Interface responsive.
- Thème clair et sombre.
- Animations discrètes et fluides.
- Confirmation avant les opérations sensibles.

Ne pas exposer les détails SQL ou les identifiants techniques à l'utilisateur.

Dans le formulaire produit, privilégier des choix simples :

- « Bouteille en verre »
- « Bouteille plastique »
- « Canette »
- « Casier réutilisable »
- « Pack jetable »
- « Carton jetable »

Le formulaire doit adapter les champs affichés à la sélection.

# PARTIE 14 — ADAPTATION TECHNIQUE AU PROJET

Conserver la stack existante.

## Rust

Créer ou adapter les modules métier :

- `crates/depotpro-core/src/application/packaging.rs`
- `crates/depotpro-core/src/application/packaging_accounts.rs`
- `crates/depotpro-core/src/application/packaging_inventory.rs`
- Module catalogue produits à localiser dans l'architecture existante.

Le module `consignments.rs` doit être étudié et remplacé progressivement.

Ne pas conserver deux systèmes concurrents de consignation.

## Node.js

Mettre à jour les services web pour respecter les mêmes règles que le cœur Rust.

Ne pas dupliquer des règles métier divergentes.

## React / TypeScript

Créer ou adapter :

- Page Catalogue.
- Formulaire de création/modification produit.
- Gestion des conditionnements.
- Gestion des casiers.
- Gestion des retours clients.
- Gestion des retours fournisseurs.
- Comptes emballages.
- Stocks d'emballages.

Localiser les fichiers existants avant de les modifier.

## API

Prévoir les opérations nécessaires :

- CRUD catalogue.
- CRUD catégories et marques.
- CRUD conditionnements.
- Gestion des références de casiers.
- Mouvements physiques.
- Comptes emballages.
- Retours clients.
- Retours fournisseurs.
- Historique et rapports.

Toutes les opérations doivent être validées côté serveur.

# PARTIE 15 — MIGRATION ET COMPATIBILITÉ

Créer une migration SQLite versionnée.

Exigences :

- Conserver les anciennes ventes.
- Conserver les anciennes factures.
- Conserver les anciennes données de stock.
- Conserver les anciennes consignations en historique.
- Ne pas convertir automatiquement les anciennes dettes de bouteilles en dettes de casiers.
- Ajouter une procédure de migration contrôlée si une conversion est nécessaire.
- Prévoir une sauvegarde avant migration.
- Tester la migration sur une copie de base réelle.
- Tester les bases neuves et les bases déjà utilisées.

Ne pas supprimer les anciennes tables avant validation complète.

# PARTIE 16 — TESTS OBLIGATOIRES

## Catalogue

1. Création d'un produit bière en verre.
2. Création d'une sucrerie en verre B24.
3. Création d'une sucrerie en verre B12.
4. Création d'un produit PET en pack de 6.
5. Création d'un carton de 24 canettes.
6. Création d'un produit avec plusieurs conditionnements.
7. Modification d'un produit.
8. Désactivation d'un produit utilisé.
9. Tentative de suppression d'un produit historique.
10. Modification du prix sans réécriture des anciennes factures.

## Emballages

11. Vente de 2 B24-33 avec retour complet.
12. Vente de 3 B12-50 avec retour incomplet.
13. Retour ultérieur du casier manquant.
14. Refus d'un retour B12-65 pour une dette B12-50.
15. Vente d'un demi-casier.
16. Retour supérieur à la dette avec crédit d'emballage.
17. Paiement d'un emballage manquant.
18. Emballage endommagé.
19. Annulation d'une vente avec neutralisation des écritures.
20. Double envoi d'une requête sans double mouvement.

## Emballages jetables

21. Vente d'un pack PET de 6.
22. Vente d'un carton de 24 canettes.
23. Vente à l'unité si autorisée.
24. Vérifier qu'aucune dette de casier n'est créée.
25. Vérifier la conversion exacte vers le stock individuel.

## Fournisseurs

26. Commande de 20 casiers avec retour complet.
27. Commande de 20 casiers avec retour de 17.
28. Réception partielle de marchandises.
29. Paiement partiel.
30. Régularisation ultérieure des emballages.

## Intégrité

31. Vérifier la cohérence du stock physique.
32. Vérifier les soldes des partenaires.
33. Vérifier les montants FCFA.
34. Vérifier les transactions concurrentes.
35. Vérifier les sauvegardes et restaurations.
36. Vérifier la parité Rust/Node.js.
37. Vérifier le fonctionnement hors ligne.
38. Vérifier le parcours Windows et macOS.

Tous les tests doivent être exécutés et leurs résultats documentés.

# PARTIE 17 — LOTS DE DÉVELOPPEMENT ORDONNÉS

L'agent doit exécuter les lots dans cet ordre.

**LOT 0 — Audit et préparation**

- Examiner le code et la base.
- Établir les dépendances.
- Faire une sauvegarde.
- Créer une branche de travail.
- Documenter l'état initial.

**LOT 1 — Modèle métier et schéma**

- Définir les produits, contenants et conditionnements.
- Définir les emballages réutilisables et jetables.
- Créer les migrations.
- Valider les relations.

**LOT 2 — Catalogue produits**

- Créer le CRUD.
- Créer le formulaire intelligent en quatre étapes.
- Ajouter catégories, marques et conditionnements.
- Gérer l'archivage sécurisé.

**LOT 3 — Référentiel des casiers**

- Ajouter B24 et B12 par format exact.
- Ajouter les autres références configurables.
- Définir les capacités et valeurs.
- Définir les associations produits/casiers.

**LOT 4 — Moteur métier des emballages**

- Comptes clients.
- Comptes fournisseurs.
- Mouvements physiques.
- Retours.
- Soldes.
- Paiements d'emballages.

**LOT 5 — Intégration des ventes**

- Casiers complets.
- Demi-casiers.
- Retours clients.
- Factures.
- Comptes partenaires.

**LOT 6 — Intégration des achats**

- Commandes fournisseurs.
- Retours de casiers.
- Réceptions.
- Liquidités.
- Soldes fournisseurs.

**LOT 7 — Stocks et rapports**

- Boissons pleines.
- Supports plastiques.
- Bouteilles vides.
- Emballages jetables.
- Rapports et rapprochements.

**LOT 8 — Interface premium**

- Catalogue.
- Formulaires.
- Pages emballages.
- Fiches clients et fournisseurs.
- Intégration à la navigation.

**LOT 9 — Parité et sécurité**

- Tests communs Rust/Node.
- Idempotence.
- Transactions.
- Contrôles d'accès.
- Intégrité des données.

**LOT 10 — Validation finale**

- Tests complets.
- Migration ancienne base.
- Vérification hors ligne.
- Tests Windows/macOS.
- Documentation utilisateur.
- Rapport de mise en production.

# PARTIE 18 — CONDITIONS DE VALIDATION

Un lot n'est terminé que lorsque :

1. Les fichiers concernés ont été inspectés.
2. Les modifications sont réellement implémentées.
3. Les tests correspondants ont été exécutés.
4. Les tests existants restent fonctionnels.
5. Les migrations sont vérifiées.
6. Aucun historique n'est perdu.
7. Rust et Node.js respectent les mêmes règles.
8. Le rapport du lot est écrit.
9. Un commit propre est créé.

Fournir un rapport par lot dans `docs/`.

Ne jamais déclarer un test réussi s'il n'a pas réellement été exécuté.

Ne jamais désactiver un test pour faire passer la CI.

Ne jamais contourner une contrainte d'intégrité.

Ne jamais modifier silencieusement les données historiques.

# PARTIE 19 — LIVRABLE FINAL

À la fin du projet, fournir :

- Le catalogue configurable.
- Le formulaire produit intelligent.
- Les familles de conditionnements.
- Le référentiel des casiers.
- Le système de gestion des emballages réutilisables.
- Le système des packs et cartons jetables.
- Les retours clients et fournisseurs.
- Les comptes emballages.
- Les stocks physiques.
- Les factures adaptées.
- Les rapports.
- Les migrations.
- Les tests.
- La documentation.
- Le rapport final.

Le propriétaire doit pouvoir créer un nouveau produit en quelques étapes simples, définir son contenant, choisir son conditionnement, indiquer si l'emballage est réutilisable ou jetable, puis enregistrer ses prix.

Il ne doit jamais avoir besoin de modifier le code pour ajouter une nouvelle marque, un nouveau produit, une nouvelle contenance, un nouveau casier ou un nouveau pack.

**OBJECTIF FINAL : DEPOTPRO PREMIUM doit être un logiciel de gestion de dépôt de boissons configurable, capable de s'adapter à différents fournisseurs, marques, formats et pratiques commerciales sans nouvelle intervention d'un développeur.**

Commence par le LOT 0. N'exécute pas les lots suivants tant que le lot courant n'a pas été validé et documenté.

## **5. Exemple du catalogue que l'application devra permettre de créer**

Voici des exemples de configurations initiales. Ils servent à montrer la logique, pas à imposer un stock ou des prix au propriétaire.

[BOCK - Solibra](https://images.openai.com/static-rsc-4/AgzYwouu9NNpsJ8Dyy42ampcHLW4gIY5LIKBmuwuPfvVmIF5hjFrDgc3N0MEwbWVL8IGeS_H24zw1W46FXX4NVzot9RfiSJM1LBhBN9ng0RKQZQfyhdrK5Nzazq38kOSIEoYI2Fl-nUFMDTvZWUlJaAQiz73g3ah7tVCBZWEwFs?purpose=inline)

**Bock 33 cl**

Bière · Verre · B24-33

Réutilisable

**24 bouteilles**

[YOUKI - Solibra](https://images.openai.com/static-rsc-4/R0_OngUr4VDOP1Eu-MD67w49hGV0IFjogynNXXoASD3IPxeE8LmzbBov9bKwSZ8GzxaOhx2SLiFi9gdJmD6Vibq82tC4giCw3DCfhJhT4mrZ25zm6OO0pCOtU5ud5XAV0zHZnG8JP4W5NCRPUhovG8F6bbXn0cQSuAZKKiLocpc?purpose=inline)

**Youki Orange 30 cl**

Sucrerie · Verre · B24-30

Réutilisable

**24 bouteilles**

[ORANGINA VC 50 cl (casier de 12) - Solibra chez vous](https://images.openai.com/static-rsc-4/W1mf6JrUAQm2UAAPZBykkeBGAlBaEhEgR0rOgIZV_ludhkff_Kgsqfa0nj9N-Ac19LYhMbM8A_8L5OJdXiyaww5RfprYP7KSyRTbgZcAcqdjyfqMuuA1DXsKiO2d8Lo1F1qGd46JORO9q8U2jpvnw6s8HQVUJyBitk4osbH71mc?purpose=inline)

**Orangina 50 cl**

Sucrerie · Verre · B12-50

Réutilisable

**12 bouteilles**

[YOUKI canette 33 cl (carton de 24) – Solibra chez vous](https://images.openai.com/static-rsc-4/EUJz1iUmbkiZfY_NYzY5_LsDUZVfELCQsFESGpqU7-6cMpIcSgILxMbEJeOyeBR54ah1-n6Kiah89Ku6hPzR0fN7XxFnuFeHM50y0Rjah6lc4NOA__p1lSV9xHL9TKF2hVX468jmI-TaBWCRDEUZqKVYszTRAz8NkNZR1hG-XKw?purpose=inline)

**Youki Canette 33 cl**

Sucrerie · Aluminium · Carton

Jetable

**24 canettes**

[YOUKI PET 1.5L (pack de 6 bouteilles) - Solibra chez vous](https://images.openai.com/static-rsc-4/ZFIt7lVcwGZDknaOM3TEwnvCzysapv6hIg4QKz4OLCIktIY-kPweQFru2eE_Yuue8ScL4x_p3cc_27kD-kf4aqkNwhKGkXK6goPBDWfPrjlSN553_U6_kc_D1xVruKydKfDAddh2KOD-AP_7lG1jvadVIfdgmn7eKuclpBRKNo0?purpose=inline)

**Youki PET 1,5 L**

Sucrerie · PET · Pack

Jetable

**6 bouteilles**

Les exemples de formats en verre et de conditionnements jetables sont cohérents avec le catalogue commercial consulté de SOLIBRA, notamment ses références Youki, Orangina et Youzou.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://solibrachezvous.com\&sz=32)

solibrachezvous.com+2



## **6. Une décision d'architecture très importante**

Je recommande de ne pas utiliser uniquement `B24` ou `B12` comme identifiants dans la base.

Il faut utiliser des références précises :

| Code interne    | Signification                    |
| --------------- | -------------------------------- |
| `B24-30`        | Casier 24 bouteilles de 30 cl    |
| `B24-33`        | Casier 24 bouteilles de 33 cl    |
| `B12-50`        | Casier 12 bouteilles de 50 cl    |
| `B12-65`        | Casier 12 bouteilles de 65 cl    |
| `B12-75`        | Casier 12 bouteilles de 75 cl    |
| `B12-100`       | Casier 12 bouteilles de 1 L      |
| `CARTON-24-CAN` | Carton jetable de 24 canettes    |
| `PACK-PET-6`    | Pack jetable de 6 bouteilles PET |

Ainsi, même si deux casiers ont tous les deux 12 bouteilles, le système ne fera jamais un échange incorrect.

**Autre point à ne pas négliger :** le propriétaire doit pouvoir ajouter un conditionnement sans créer un nouveau type de casier si le support physique est identique. À l'inverse, deux supports physiquement incompatibles doivent conserver deux références différentes, même si leur nombre de bouteilles est identique.

Cette séparation rendra DEPOTPRO beaucoup plus évolutif : il pourra intégrer de nouvelles marques, des formats de sucreries, des boissons importées, des canettes, des packs PET et des casiers spécifiques sans modifier son moteur métier.
