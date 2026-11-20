Je retiens une règle métier essentielle pour DEPOTPRO : **l'emballage suivi est exclusivement le casier plastique qui contient les bouteilles.** Il peut être plein ou vide et possède une valeur financière propre au sous-dépôt.

Cela change sensiblement la conception du module :

- Une bouteille en verre, une canette ou une bouteille PET caractérise le contenant de la boisson, mais ne constitue pas un emballage suivi financièrement.
- Un casier plastique est un bien physique suivi par type, quantité, état et emplacement.
- Lorsqu'un casier plein est vendu, il sort physiquement du stock. Si le client remet un casier vide compatible, celui-ci entre dans le stock.
- Si le client ne remet pas de casier, on suit un **solde physique de casiers à récupérer**, pas une dette financière automatique.
- Le casier peut aussi être vendu séparément, par une opération commerciale explicite.
- Lors des achats, les casiers vides remis au fournisseur et les casiers reçus doivent être tracés séparément.

J'ai également relevé dans ton dépôt les migrations `0014_supplier_packaging_exchange.sql`, `0015_packaging_obligations_conversions.sql`, `0016_solibra_reference_catalogue.sql` et `0017_catalogue_reference_price_history.sql`. Le prompt demande donc à l'agent de faire évoluer les mécanismes existants, notamment ceux de la migration 0015, sans casser les historiques.

Autre point important : le dépôt contient déjà un ancien format SOLIBRA (`meta / manufacturers / brands`) et un format BRASSIVOIRE (`supplier / products / variants`). Le nouveau fichier SOLIBRA que tu présentes utilise lui aussi `supplier / categories / packaging_types`. Le futur importateur devra accepter ces formats et les normaliser vers un seul modèle interne.

# **MASTER PROMPT — DEPOTPRO PREMIUM**

CATALOGUES MULTI-BRASSERIES · GESTION DES CASIERS · STOCKS · ACHATS · VENTES · ADMINISTRATION OWNER

# MASTER PROMPT — DEPOTPRO PREMIUM

## Système centralisé et évolutif de gestion des catalogues de brasseries et des emballages physiques

---

# 1. MISSION GÉNÉRALE

Tu interviens sur le projet existant **DEPOTPRO PREMIUM V3**, disponible dans le dépôt GitHub :

`https://github.com/koffidominique/ss_depot_rust.git`

Ton objectif est de faire évoluer l'application afin de mettre en place un système professionnel, centralisé, évolutif et entièrement administrable de gestion des catalogues de brasseries et de producteurs de boissons en Côte d'Ivoire.

Le système doit être initialement alimenté par les catalogues de :

1. SOLIBRA.
2. BRASSIVOIRE.

Il doit pouvoir accueillir ultérieurement :

- Une nouvelle brasserie.
- Un nouveau producteur de boissons.
- Une nouvelle marque.
- Une nouvelle catégorie de boissons.
- Une nouvelle famille de produits.
- De nouveaux formats de bouteilles.
- De nouveaux types de casiers.
- De nouveaux conditionnements commerciaux.
- Des fournisseurs intermédiaires ou grossistes.

L'objectif est que l'OWNER puisse administrer intégralement ce référentiel depuis l'application, sans modifier le code source ni intervenir directement dans SQLite.

**IMPORTANT : le système doit être générique. SOLIBRA et BRASSIVOIRE ne doivent jamais être codés en dur comme les seuls producteurs possibles.**

---

# 2. RÈGLE MÉTIER FONDAMENTALE : DÉFINITION DE L'EMBALLAGE

Cette section est prioritaire sur toute ancienne logique du projet.

## 2.1 Définition

Dans DEPOTPRO, le terme « emballage » désigne exclusivement le casier plastique réutilisable qui contient un ensemble de bouteilles.

Le casier :

- Est un élément physique distinct de la boisson.
- Possède un identifiant de type.
- Possède une capacité déterminée.
- Possède une valeur financière configurable.
- Peut être plein.
- Peut être vide.
- Peut être présent au sous-dépôt.
- Peut être transféré à un client.
- Peut être remis à un fournisseur.
- Peut revenir du client.
- Peut être reçu d'un fournisseur.
- Peut être vendu séparément.
- Peut faire l'objet d'une perte, d'une casse ou d'un ajustement physique validé.

Le casier représente un élément de valeur du patrimoine opérationnel du sous-dépôt.

## 2.2 Éléments qui ne sont PAS des emballages suivis

Ne pas traiter comme des emballages financiers :

- Les bouteilles en verre individuelles.
- Les bouteilles PET.
- Les canettes.
- Les cartons.
- Les packs filmés.
- Les étiquettes.
- Les capsules.
- Les bouchons.

Ces éléments peuvent être décrits dans les caractéristiques des produits et de leurs contenants.

Une bouteille peut éventuellement être signalée comme réutilisable dans les caractéristiques techniques de son produit. Toutefois, cette information ne déclenche aucune gestion de quantité, de valeur financière ou de mouvement individuel de bouteilles dans le module des emballages de DEPOTPRO.

**SEUL LE CASIER PLASTIQUE EST GÉRÉ COMME EMBALLAGE PHYSIQUE ET FINANCIER.**

## 2.3 Vocabulaire obligatoire

Utiliser exclusivement dans les nouvelles interfaces et règles métier :

- Casier plein.
- Casier vide.
- Stock de casiers pleins.
- Stock de casiers vides.
- Casiers remis au fournisseur.
- Casiers reçus du fournisseur.
- Casiers sortis chez les clients.
- Casiers retournés par les clients.
- Solde physique des casiers.
- Valeur du stock de casiers.
- Retour d'emballages.
- Mouvement de casiers.
- Vente de casier vide.
- Perte de casier.
- Ajustement de stock de casiers.

Bannir de la nouvelle logique métier, des écrans, des intitulés, des formulaires et de la documentation utilisateur toute notion de consignation, de caution sur bouteille, de dépôt de garantie, de créance de consignation ou de transformation automatique d'une obligation physique en dette financière.

Les anciens noms techniques éventuellement présents dans les migrations SQLite doivent être traités comme des éléments historiques à migrer ou à maintenir temporairement pour compatibilité. Ils ne doivent pas devenir le vocabulaire du nouveau système.

---

# 3. AUDIT OBLIGATOIRE DU PROJET EXISTANT

Avant toute modification, examiner le dépôt intégralement.

## Fichiers et composants à inspecter

- `catalog_seed.json`
- `catalog_seed_solibra.json`
- `brassivoire_catalog.json`
- `scripts/seed_catalog.py`
- `migrations/sqlite/`
- `migrations/sqlite/0006_catalogue_v3.sql`
- `migrations/sqlite/0007_packaging_components.sql`
- `migrations/sqlite/0008_compatibility_validation_partial_returns_catalogue.sql`
- `migrations/sqlite/0010_crate_compatibility.sql`
- `migrations/sqlite/0012_catalogue_products.sql`
- `migrations/sqlite/0013_pending_returns_pieces.sql`
- `migrations/sqlite/0014_supplier_packaging_exchange.sql`
- `migrations/sqlite/0015_packaging_obligations_conversions.sql`
- `migrations/sqlite/0016_solibra_reference_catalogue.sql`
- `migrations/sqlite/0017_catalogue_reference_price_history.sql`
- `docs/DATABASE.md`
- `docs/BUSINESS_RULES.md`
- `docs/phase2_modele_donnees_emballages.md`
- `MAJ.md`

Inspecter également :

- Les migrations réellement appliquées par Rust.
- Les migrations éventuellement appliquées par le moteur Node.js.
- Les repositories et services Rust.
- Les routes REST Axum.
- Les commandes Tauri.
- Les clients API frontend.
- Les composants React de gestion des produits.
- Les composants React de gestion des emballages.
- Les fonctions d'achat et de réception.
- Les fonctions de vente et de retour client.
- Les fonctions de gestion des fournisseurs.
- Les permissions RBAC.

Identifier la version de schéma réellement utilisée dans le code. Ne pas se fier uniquement aux numéros annoncés dans une documentation qui pourrait être ancienne.

## Règles d'audit

1. Ne pas créer de tables en double.
2. Ne pas remplacer une fonctionnalité déjà opérationnelle sans justification.
3. Ne pas créer une deuxième base de produits.
4. Ne pas créer un système parallèle de stock.
5. Réutiliser les services et modèles existants lorsque cela est pertinent.
6. Identifier précisément les fonctions de l'ancien système qui reposent sur une logique de conversion automatique des emballages en dettes.
7. Présenter un rapport d'écart entre l'architecture actuelle et le modèle métier demandé.
8. Définir la stratégie de migration avant de modifier les données.

Les migrations déjà publiées ne doivent pas être réécrites lorsqu'elles ont pu être appliquées sur des installations existantes.

Toute modification structurelle doit passer par une nouvelle migration séquentielle compatible avec les bases existantes.

---

# 4. ARCHITECTURE GÉNÉRALE DES CATALOGUES

Le système doit permettre de gérer un nombre illimité de catalogues de producteurs.

Hiérarchie logique :

PRODUCTEUR / BRASSERIE\
└── CATALOGUE DU PRODUCTEUR\
├── Catégories\
├── Marques\
├── Familles\
└── Produits\
└── Variantes\
├── Formats\
├── Contenants\
├── Conditionnements commerciaux\
└── Compatibilité avec les casiers

Les données des fournisseurs commerciaux doivent être distinctes des producteurs.

Exemple :

- Producteur : SOLIBRA.
- Produit : Bock.
- Fournisseur commercial : grossiste auprès duquel le sous-dépôt achète Bock.

Le fait qu'un produit appartienne à SOLIBRA ne signifie pas que le sous-dépôt doit obligatoirement l'acheter directement à SOLIBRA.

Un même produit peut être proposé par plusieurs fournisseurs avec des tarifs et des conditions d'achat différents.

## 4.1 Gestion des producteurs

Chaque producteur possède :

- ID unique.
- Code unique.
- Nom commercial.
- Nom légal facultatif.
- Pays.
- Ville.
- Site internet.
- Description.
- Logo facultatif.
- Contacts facultatifs.
- Statut actif/inactif.
- Date de création.
- Sources documentaires.

L'OWNER doit pouvoir créer, modifier, activer, désactiver et consulter chaque producteur.

## 4.2 Gestion des catalogues

Un producteur peut disposer d'un ou plusieurs catalogues ou versions de catalogue.

Chaque catalogue contient :

- Identifiant.
- Code stable.
- Nom.
- Producteur associé.
- Version du schéma.
- Version métier du catalogue.
- Date de publication ou de référence.
- Date d'import.
- Origine du fichier.
- Statut.
- Nombre de produits.
- Nombre de variantes.

Prévoir la possibilité d'importer une nouvelle version d'un catalogue sans perdre les données personnalisées du dépôt.

## 4.3 Création de nouvelles catégories

L'OWNER doit pouvoir créer librement :

- Une catégorie de catalogue.
- Une catégorie de boisson.
- Une famille de produits.
- Une sous-catégorie.
- Une nouvelle marque.

Les catégories ne doivent pas être limitées aux catégories initialement présentes dans SOLIBRA ou BRASSIVOIRE.

Exemples initiaux :

- Bières.
- Bières aromatisées.
- Boissons gazeuses.
- Boissons maltées.
- Boissons énergisantes.
- Cocktails alcoolisés.
- Vins.
- Jus.
- Eaux.

L'OWNER doit pouvoir ajouter, modifier, réorganiser ou désactiver ces catégories.

Ne jamais supprimer une catégorie encore utilisée par des produits ou des historiques commerciaux.

---

# 5. STRUCTURE DES PRODUITS ET VARIANTES

Il faut absolument distinguer un produit de ses variantes.

Exemple :

PRODUCTEUR : BRASSIVOIRE\
MARQUE : HEINEKEN\
PRODUIT : HEINEKEN

VARIANTES :

- Heineken 25 cl bouteille.
- Heineken 33 cl bouteille.
- Heineken 50 cl bouteille.
- Heineken 50 cl canette.

Ces variantes sont rattachées au même produit.

## 5.1 Fiche produit

Chaque produit doit comporter :

- ID.
- Code unique.
- Nom.
- Nom commercial.
- Producteur.
- Marque.
- Catalogue.
- Catégorie.
- Famille.
- Description.
- Photo.
- Taux d'alcool, si applicable.
- Statut de disponibilité.
- Statut de vérification.
- Actif/inactif.
- Vendable/non vendable.

## 5.2 Fiche variante

Chaque variante comporte :

- ID.
- SKU unique.
- Code-barres éventuel.
- Produit parent.
- Nom d'affichage.
- Volume en ml.
- Nature du contenant.
- Matériau.
- Format.
- Informations techniques.
- Compatibilités avec des casiers.
- Statut de vérification.
- Statut actif/inactif.

Nature du contenant :

- Bouteille en verre.
- Bouteille PET.
- Canette.
- Autre contenant configurable.

Le volume doit être stocké en millilitres sous forme d'entier.

Exemples :

- 25 cl = 250 ml.
- 33 cl = 330 ml.
- 50 cl = 500 ml.
- 60 cl = 600 ml.
- 65 cl = 650 ml.
- 100 cl = 1000 ml.
- 150 cl = 1500 ml.

Ne jamais déduire un volume à partir du nom du produit sans vérification.

## 5.3 Caractéristiques de réutilisation des bouteilles

Il est possible de conserver une information descriptive concernant le caractère réutilisable d'une bouteille.

Cette information ne doit toutefois pas créer :

- Un stock de bouteilles vides individuelles.
- Une dette client de bouteilles.
- Une valeur financière individuelle de bouteille.
- Un mouvement de retour de bouteilles.
- Une ligne commerciale automatique de bouteille.

Le suivi physique et financier porte exclusivement sur les casiers plastiques.

---

# 6. MODÈLE SPÉCIFIQUE DES CASIERS PLASTIQUES

Cette partie est l'une des plus importantes du projet.

## 6.1 Fiche de type de casier

Chaque type de casier doit disposer de :

- ID unique.
- Code unique.
- Nom.
- Producteur ou marque associée, si nécessaire.
- Matériau (plastique).
- Nombre de bouteilles de capacité.
- Formats de bouteilles compatibles.
- Description physique.
- Photo facultative.
- Statut actif/inactif.
- Prix d'acquisition si disponible.
- Valeur de référence.
- Prix de vente du casier vide.
- Historique des valeurs.

La marque du produit et le type de casier sont deux informations distinctes.

Un casier ne doit pas être considéré comme compatible avec une variante simplement parce que les volumes des bouteilles sont identiques.

La compatibilité doit être explicitement définie par l'OWNER ou confirmée par une source fiable.

Exemples de références possibles :

- Casier 24 bouteilles 33 cl.
- Casier 12 bouteilles 50 cl.
- Casier 12 bouteilles 65 cl.
- Autres formats configurables.

Ces exemples ne doivent pas être automatiquement appliqués à toutes les marques.

## 6.2 Compatibilité produit / casier

Créer ou réutiliser une relation entre les variantes et les types de casiers.

Elle doit comporter :

- ID de variante.
- ID du casier.
- Nombre exact de bouteilles par casier.
- Statut de confirmation.
- Source de confirmation.
- Date de validation.
- Actif/inactif.

Une variante peut être compatible avec plusieurs types de casiers si les usages commerciaux le permettent.

Un casier peut être utilisé pour plusieurs variantes uniquement si sa compatibilité physique et commerciale est validée.

Les équivalences entre types de casiers de producteurs différents doivent être explicitement configurables.

Par défaut, les casiers de types différents ne sont pas interchangeables.

## 6.3 Quantités inconnues

Si le fichier JSON ne confirme pas le nombre de bouteilles par casier :

- Conserver la variante.
- Conserver les informations de volume.
- Laisser la capacité du casier à NULL.
- Marquer la compatibilité `to_verify`.
- Ne pas créer un coefficient fictif.
- Ne pas autoriser une opération en casier tant que la capacité nécessaire n'est pas validée.

La vente à l'unité peut rester disponible lorsque les prix et les paramètres nécessaires sont configurés.

---

# 7. MODÈLE DES STOCKS : CASIERS PLEINS ET VIDES

Le système doit distinguer précisément deux réalités :

1. Le stock de boissons.
2. Le stock physique de casiers plastiques.

Ces deux stocks sont liés, mais ne doivent jamais être confondus.

## 7.1 Stock des boissons

Les boissons sont stockées dans une unité de base adaptée :

- Bouteille.
- Canette.
- Unité.

Le stock commercial doit rester géré dans le système de stock existant.

Un casier de 24 bouteilles correspond à 24 unités de boisson.

La réception d'un casier plein de 24 bouteilles doit donc ajouter 24 bouteilles au stock produit.

La vente d'un casier plein de 24 bouteilles doit retirer 24 bouteilles au stock produit.

Ne jamais compter les 24 bouteilles une deuxième fois dans le stock parce qu'elles sont contenues dans un casier.

## 7.2 Stock physique des casiers

Créer un suivi indépendant des casiers plastiques avec les quantités :

- Casiers pleins au dépôt.
- Casiers vides au dépôt.
- Casiers sortis chez les clients.
- Casiers remis aux fournisseurs.
- Casiers reçus des fournisseurs.
- Casiers perdus.
- Casiers endommagés.
- Casiers retirés du circuit.

Le stock doit être ventilé par type de casier.

Le système doit pouvoir afficher :

- Le nombre total de casiers.
- Le nombre de casiers pleins.
- Le nombre de casiers vides.
- Le nombre de casiers chez les clients.
- Le nombre de casiers chez les fournisseurs.
- La valeur de référence du stock de casiers.

Ne jamais mélanger les quantités de casiers de types différents.

## 7.3 Journal de mouvements physiques

Créer un journal complet et immuable des mouvements de casiers.

Types de mouvements :

- `initial_balance`
- `purchase_receipt_full_in`
- `sale_full_out`
- `customer_empty_return_in`
- `supplier_empty_exchange_out`
- `supplier_crate_receipt_in`
- `empty_case_sale_out`
- `empty_case_purchase_in`
- `adjustment_in`
- `adjustment_out`
- `damaged`
- `lost`
- `writeoff`

Chaque mouvement doit enregistrer :

- ID.
- Clé d'idempotence.
- Date.
- Type de casier.
- Quantité.
- État avant mouvement.
- État après mouvement.
- Origine.
- Destination.
- Fournisseur ou client concerné.
- Document commercial associé.
- Utilisateur responsable.
- Motif.
- Valeur de référence applicable, si nécessaire.

Toute opération doit être transactionnelle.

Aucun mouvement de casier ne doit exister sans traçabilité.

---

# 8. VALEUR FINANCIÈRE DES CASIERS

Le casier possède une valeur économique pour le sous-dépôt.

Cette valeur doit être séparée du prix de la boisson.

Prévoir au minimum trois valeurs distinctes :

1. Valeur d'acquisition du casier.
2. Valeur de référence du stock de casiers.
3. Prix de vente du casier vide.

Ces valeurs ne doivent jamais être confondues.

L'OWNER peut configurer ces valeurs en FCFA.

Il peut définir des valeurs différentes selon :

- Le producteur.
- Le type de casier.
- Le format.
- Le fournisseur.
- La période commerciale, si nécessaire.

Conserver l'historique des valeurs avec :

- Montant.
- Date d'effet.
- Date de fin.
- Auteur de la modification.
- Motif.

Une modification ne doit jamais modifier rétroactivement la valeur historique d'un mouvement.

Ne jamais inventer une valeur de casier à partir du prix d'une boisson.

Ne jamais récupérer automatiquement un prix public comme prix d'achat du sous-dépôt.

## 8.1 Valeur du stock physique

Le tableau de bord peut calculer :

Valeur indicative des casiers au dépôt =\
Somme des quantités de casiers détenus × valeur de référence applicable.

Cette valorisation doit distinguer :

- Les casiers vides.
- Les casiers pleins.
- Les casiers sortis chez les clients.
- Les casiers confiés aux fournisseurs.

La valeur indicative des casiers présents chez un client ne doit jamais être intégrée automatiquement à sa dette commerciale.

Il s'agit d'une information de suivi physique et de gestion du patrimoine opérationnel.

## 8.2 Vente explicite du casier vide

L'OWNER peut autoriser la vente définitive d'un casier vide.

Dans ce cas :

- Le casier est traité comme un article commercial distinct.
- Il apparaît sur une ligne spécifique de facture.
- Son prix est enregistré.
- Son stock physique diminue.
- Le paiement est enregistré par les mécanismes normaux de DEPOTPRO.
- L'opération est historisée.

Une vente définitive de casier n'est pas la même chose qu'une sortie temporaire de casier plein associée à une vente de boissons.

---

# 9. GESTION DES CASIERS DANS LES ACHATS FOURNISSEURS

Le sous-dépôt doit pouvoir suivre les échanges physiques de casiers avec chaque fournisseur.

## 9.1 Commande fournisseur

La création d'un bon de commande ne doit jamais modifier le stock.

Conserver le fonctionnement existant :

- Commande créée.
- Produits commandés.
- Quantités.
- Prix d'achat.
- Conditionnements.
- Quantités de casiers attendues, si connues.
- Conditions d'échange définies par le fournisseur.

## 9.2 Réception de marchandises

Seule la réception validée modifie le stock.

Lors d'une réception :

- Ajouter les boissons réellement reçues.
- Enregistrer les casiers pleins physiquement reçus.
- Enregistrer les casiers vides remis au fournisseur.
- Enregistrer les casiers éventuellement reçus séparément.
- Associer les mouvements au fournisseur.
- Mettre à jour le compte physique de casiers fournisseur.

Le nombre de casiers remis au fournisseur doit être enregistré indépendamment du nombre de casiers pleins reçus.

## 9.3 Échange de casiers fournisseur

Prévoir un formulaire de réception contenant :

- Fournisseur.
- Bon de commande.
- Type de casier.
- Quantité de casiers pleins reçus.
- Quantité de casiers vides remis.
- Type exact des casiers remis.
- Écart constaté.
- Prix des boissons.
- Montant facturé pour les casiers, lorsque cela existe.
- Observations.

Exemple de mouvement :

Le sous-dépôt reçoit :

- 20 casiers pleins Bock 33 cl.

Il remet :

- 15 casiers vides compatibles.

Le système enregistre :

- 20 entrées physiques de casiers pleins.
- 15 sorties physiques de casiers vides.
- Les quantités de boissons effectivement reçues.
- L'écart physique de 5 casiers.

Cet écart est suivi physiquement et ne devient pas automatiquement une dette ou une créance financière.

Toute différence financière imposée par la facture réelle du fournisseur doit être enregistrée dans l'achat selon les règles commerciales et comptables applicables.

## 9.4 Contrôles

- Bloquer une sortie supérieure au stock disponible de casiers vides.
- Autoriser plusieurs types de casiers dans une réception.
- Refuser un échange de types incompatibles, sauf équivalence explicitement autorisée.
- Autoriser les réceptions partielles.
- Garantir l'idempotence.
- Empêcher les doubles entrées de stock.
- Associer chaque mouvement à son document d'achat.

Ne jamais modifier le stock lors d'une simple commande.

---

# 10. GESTION DES CASIERS DANS LES VENTES CLIENTS

La vente doit distinguer :

- Les boissons vendues.
- Les casiers physiquement sortis.
- Les casiers vides éventuellement récupérés.
- Les éventuelles ventes définitives de casiers.

## 10.1 Vente d'un casier plein

Exemple :

Le client achète :

- 2 casiers de Bock 33 cl.
- Chaque casier contient 24 bouteilles.

Le système doit :

1. Déduire 48 bouteilles du stock produit.
2. Déduire 2 casiers pleins du stock physique.
3. Enregistrer 2 casiers sortis chez le client.
4. Calculer le montant des boissons selon le tarif commercial configuré.
5. Enregistrer les éventuels casiers vides remis par le client.

La valeur du casier doit rester séparée du prix des boissons.

## 10.2 Échange immédiat client

Exemple :

Le client prend :

- 2 casiers pleins.

Il rend :

- 2 casiers vides de même type.

Le système réalise :

- 2 casiers pleins sortants.
- 2 casiers vides entrants.
- 0 casier net restant chez le client.

Les deux mouvements physiques doivent rester visibles dans l'historique.

Le système ne doit pas créer une dette financière liée aux casiers.

## 10.3 Vente sans retour immédiat

Exemple :

Le client achète :

- 3 casiers pleins.
- Il ne rapporte aucun casier vide.

Le système :

- Déduit les boissons.
- Déduit les 3 casiers pleins du dépôt.
- Enregistre 3 casiers sortis chez le client.
- Met à jour son solde physique de casiers.
- Affiche la valeur indicative correspondante.

Le solde physique doit être visible dans la fiche client.

**Ce solde n'est pas une dette commerciale et ne doit pas être intégré au total des créances clients.**

Il ne doit pas déclencher une facture, un paiement, une échéance ou une conversion automatique en dette.

Aucun délai automatique de transformation en dette ne doit être créé.

## 10.4 Retour ultérieur du client

Exemple :

Un client doit physiquement restituer 3 casiers.

Il revient avec 2 casiers vides.

Le système :

- Vérifie le type exact des casiers.
- Enregistre 2 entrées de casiers vides.
- Diminue le solde physique du client de 2.
- Laisse 1 casier toujours sorti chez le client.

Une nouvelle opération de retour permet ensuite de solder le reliquat.

Le retour doit pouvoir être enregistré même si les boissons ont été consommées plusieurs jours auparavant.

## 10.5 Retour supérieur aux sorties

Le système ne doit pas créer automatiquement un solde négatif injustifié chez un client.

Si un client rapporte davantage de casiers que son solde physique enregistré :

- Signaler l'écart.
- Proposer une entrée exceptionnelle de casiers.
- Demander une validation selon les permissions.
- Enregistrer la provenance.
- Permettre un remboursement ou achat de casier uniquement par une opération commerciale explicite.

## 10.6 Casier perdu ou endommagé

Un casier non retourné ne doit jamais devenir automatiquement une dette financière.

Deux opérations distinctes doivent être possibles :

A. Perte physique :

- L'OWNER autorise la déclaration de perte.
- Le stock physique est ajusté.
- La valeur de la perte est historisée.
- Le solde physique du client est régularisé selon l'opération validée.
- Aucune facture ou dette automatique n'est générée.

B. Facturation explicite :

- Si une facturation est décidée, elle passe par une opération commerciale normale.
- Le casier apparaît comme une ligne spécifique.
- Le prix est confirmé par l'opérateur autorisé.
- La facture et le paiement suivent les mécanismes commerciaux habituels.
- L'historique de la vente de casier est conservé.

Ne jamais mélanger une perte physique et une créance commerciale.

---

# 11. COMPTE PHYSIQUE DES CASIERS PAR CLIENT

Créer un tableau de bord des casiers par client.

Il doit afficher :

- Nombre total de casiers sortis.
- Nombre total de casiers retournés.
- Solde physique restant.
- Répartition par type de casier.
- Historique des sorties.
- Historique des retours.
- Historique des corrections.
- Valeur indicative des casiers encore sortis.

Formule :

Solde physique =\
Quantités de casiers sortis

- Quantités de casiers retournés
- Quantités de casiers régularisées par opération physique validée.

Cette formule ne constitue pas un calcul de dette financière.

Les soldes physiques doivent être distincts de :

- La dette commerciale.
- Les paiements client.
- Les créances liées aux ventes.
- La caisse.
- Les remboursements.

L'écran client doit afficher deux zones distinctes :

1. **Compte commercial** : ventes, paiements, factures, créances.
2. **Compte physique des casiers** : casiers sortis, casiers retournés, solde restant.

L'interface ne doit jamais additionner la valeur indicative des casiers au solde financier du client.

---

# 12. IMPORTATION ET NORMALISATION DES CATALOGUES JSON

L'importateur doit prendre en charge les formats déjà présents dans le projet et les futurs catalogues.

## 12.1 Formats à prendre en charge

Format historique :

- `meta`
- `manufacturers`
- `brands`
- `variants`

Format SOLIBRA récent :

- `schema_version`
- `catalog_id`
- `supplier`
- `categories`
- `packaging_types`
- `products`
- `variants`

Format BRASSIVOIRE :

- `schema_version`
- `catalog_id`
- `supplier`
- `categories`
- `container_types`
- `packaging_types`
- `commercial_units`
- `products`
- `variants`
- `source_ids`
- Sources documentaires.

Ne pas supposer que les deux nouveaux catalogues utilisent exactement les mêmes champs.

Développer des adaptateurs capables de convertir chaque format vers un modèle interne commun.

## 12.2 Correspondance entre les formats et DEPOTPRO

Le système doit distinguer :

- `supplier` ou `manufacturer` : producteur ou fournisseur du catalogue.
- `categories` : catégories de produits.
- `products` : produits commerciaux.
- `variants` : formats et références commercialisables.
- `container_types` : nature des contenants.
- `packaging_types` : informations sur les emballages physiques.
- `commercial_units` : unités de vente et d'achat.
- `commercial_packaging` : relation entre variantes et conditionnements.

Point fondamental :

Dans les nouveaux catalogues, les types `returnable_glass_bottle`, `one_way_glass_bottle`, `can`, `pet_bottle`, `carton` et `plastic_crate` ne doivent pas être interprétés de la même manière.

Mapping obligatoire :

- `plastic_crate` : type de casier physique suivi dans DEPOTPRO.
- `returnable_glass_bottle` : caractéristique informative du contenant, sans stock financier individuel.
- `one_way_glass_bottle` : caractéristique du contenant.
- `can` : caractéristique du contenant.
- `pet_bottle` : caractéristique du contenant.
- `carton` : conditionnement commercial éventuel, non suivi comme casier physique.

Seul le type `plastic_crate`, ou un futur type explicitement déclaré comme casier plastique réutilisable par l'OWNER, peut entrer dans le suivi physique des casiers.

## 12.3 Adaptation des produits

Pour chaque produit importé :

- Créer ou mettre à jour le producteur.
- Créer ou mettre à jour son catalogue.
- Créer ou mettre à jour sa catégorie.
- Créer ou mettre à jour sa marque.
- Créer ou mettre à jour le produit.
- Créer ou mettre à jour ses variantes.
- Créer les relations de compatibilité avec les casiers uniquement lorsque les informations sont confirmées.

Conserver :

- Les sources.
- Les URLs.
- Les informations officielles.
- Les dates.
- Les statuts de vérification.
- Les commentaires d'import.

## 12.4 Importation idempotente

L'importation répétée d'un même JSON ne doit pas créer de doublons.

Utiliser des identifiants métier stables :

- `catalog_id`
- `supplier_id` ou `manufacturer_id`
- `product_id`
- `variant_id`
- `SKU`
- `crate_type_id`.

Les noms ne doivent pas être utilisés comme seul identifiant.

## 12.5 Actualisation sans écrasement

Lorsqu'une nouvelle version est importée :

Ne pas écraser automatiquement :

- Les prix locaux.
- Les valeurs des casiers.
- Les stocks.
- Les coefficients de conversion validés localement.
- Les paramètres de ventes.
- Les paramètres de fournisseur.
- Les données historiques.
- Les images personnalisées du dépôt.
- Les choix d'activation effectués par l'OWNER.

Ne jamais supprimer une référence absente du nouveau JSON.

Proposer une prévisualisation des différences avant actualisation.

---

# 13. CATALOGUE CENTRAL ET CATALOGUE OPÉRATIONNEL

Mettre en place deux niveaux fonctionnels.

## 13.1 Catalogue central de référence

Il contient les produits et variantes des différentes brasseries.

Exemples :

- SOLIBRA.
- BRASSIVOIRE.
- NBCI.
- SIPROCOM.
- Autres producteurs.

Il est destiné à fournir une base de produits réutilisable.

## 13.2 Catalogue opérationnel du sous-dépôt

Il contient les références réellement utilisées par le dépôt.

L'OWNER choisit les produits activés.

Il peut :

- Activer un produit.
- Désactiver un produit.
- Activer certaines variantes seulement.
- Modifier les prix.
- Modifier les conditionnements.
- Configurer la capacité des casiers.
- Définir les fournisseurs qui commercialisent le produit.
- Créer des références personnalisées.
- Ajouter de nouveaux casiers.

Un produit présent dans le catalogue central ne doit jamais devenir automatiquement vendable sans configuration locale suffisante.

---

# 14. PARAMÉTRAGE DES PRIX ET DES FOURNISSEURS

Les catalogues JSON constituent des données de référence, et non des tarifs d'achat officiels.

Les prix doivent être configurés par l'OWNER à partir des factures ou documents fournisseurs.

Prévoir :

Pour les boissons :

- Prix d'achat.
- Prix de gros.
- Prix semi-gros.
- Prix de détail.

Pour les casiers :

- Valeur d'acquisition.
- Valeur de référence.
- Prix de vente du casier vide.

Pour les fournisseurs :

- Prix propre au fournisseur.
- Conditions d'achat.
- Conditions d'échange des casiers.
- Unités de commande.
- Historique des factures et réceptions.

Les tarifs doivent être historisés.

Un changement de prix ne doit jamais modifier une vente ancienne.

Tous les montants sont des INTEGER en FCFA.

Aucun `FLOAT` ou `REAL` ne doit être utilisé pour les montants financiers.

---

# 15. INTERFACE OWNER — ADMINISTRATION COMPLÈTE

Créer une section professionnelle :

**PARAMÈTRES → CATALOGUES ET BRASSERIES**

Elle doit comprendre les modules suivants.

## 15.1 Tableau de bord des catalogues

Afficher :

- Nombre de producteurs.
- Nombre de catalogues.
- Nombre de marques.
- Nombre de produits.
- Nombre de variantes.
- Nombre de catégories.
- Produits actifs.
- Produits historiques.
- Produits à vérifier.
- Variantes sans capacité de casier confirmée.

## 15.2 Gestion des brasseries et producteurs

Permettre :

- Ajouter un producteur.
- Modifier ses informations.
- Ajouter son logo.
- Créer un catalogue.
- Importer un catalogue.
- Actualiser un catalogue.
- Désactiver un catalogue.

## 15.3 Gestion des catégories

Permettre :

- Créer une catégorie.
- Modifier son nom.
- Modifier sa description.
- Définir si elle concerne des boissons alcoolisées.
- Ajouter une sous-catégorie.
- Réorganiser les catégories.
- Désactiver une catégorie.

## 15.4 Gestion des produits

Fonctions :

- Recherche.
- Filtres.
- Tri.
- Création.
- Modification.
- Activation.
- Désactivation.
- Gestion des images.
- Gestion des variantes.
- Consultation des sources.
- Historique.

## 15.5 Gestion des variantes

Permettre de :

- Ajouter un format.
- Modifier son volume.
- Modifier son contenant.
- Associer un casier.
- Définir sa capacité exacte.
- Définir sa compatibilité avec d'autres casiers.
- Modifier son statut de vérification.
- Activer ou désactiver sa vente.

## 15.6 Gestion des casiers

Créer une interface dédiée :

**PARAMÈTRES → GESTION DES CASIERS**

Elle permet :

- Créer un type de casier.
- Modifier le nom.
- Définir sa capacité.
- Définir les variantes compatibles.
- Configurer ses valeurs.
- Configurer le prix de vente vide.
- Activer ou désactiver le type.
- Consulter les mouvements.
- Consulter la valeur du stock.

## 15.7 Importation des catalogues

Interface par glisser-déposer :

- Sélection du JSON.
- Détection de sa version.
- Détection du producteur.
- Validation.
- Prévisualisation.
- Détection des doublons.
- Détection des références inconnues.
- Liste des capacités de casiers à confirmer.
- Présentation des modifications.
- Confirmation par l'OWNER.
- Importation.
- Rapport final.

Le rapport doit indiquer :

- Producteurs créés.
- Catalogues créés.
- Catégories créées.
- Produits créés.
- Produits actualisés.
- Variantes créées.
- Variantes actualisées.
- Casiers créés.
- Références ignorées.
- Erreurs.
- Données à vérifier.

---

# 16. SÉCURITÉ ET PERMISSIONS

L'OWNER dispose du contrôle complet du référentiel.

Il peut :

- Importer des catalogues.
- Créer des producteurs.
- Créer des catégories.
- Modifier les références.
- Modifier les variantes.
- Modifier les prix.
- Créer des casiers.
- Modifier les capacités.
- Modifier les valeurs des casiers.
- Corriger les stocks sous contrôle.
- Consulter et exporter les historiques.

Les rôles secondaires disposent de permissions spécifiques.

Le contrôle doit être réalisé côté backend.

Masquer un bouton dans React ne constitue jamais une protection suffisante.

Les opérations de correction de casiers, de perte et de vente de casiers doivent avoir des permissions explicites.

Chaque modification doit être enregistrée dans l'audit log.

---

# 17. STRATÉGIE DE MIGRATION DE L'ANCIEN SYSTÈME D'EMBALLAGES

Cette section est obligatoire.

Le projet possède déjà des mécanismes associés aux retours d'emballages, aux échanges fournisseurs et à des conversions financières.

Il faut les auditer avant toute modification.

Objectif : conserver les fonctionnalités utiles de suivi physique et supprimer la logique automatique de transformation d'un solde physique de casiers en dette financière.

## 17.1 Conservation des historiques

Ne jamais supprimer les ventes, paiements, achats ou mouvements passés.

Ne jamais modifier rétroactivement les documents validés.

Les anciennes tables peuvent être conservées temporairement pour compatibilité technique et historique.

Leur utilisation dans les nouveaux workflows doit être désactivée lorsqu'elles implémentent une logique incompatible avec le nouveau modèle.

## 17.2 Migration vers le solde physique

Si les anciennes obligations contiennent des quantités de casiers non retournées et que leur type peut être identifié :

- Créer les mouvements physiques correspondants.
- Reconstituer le solde physique client.
- Conserver les références aux documents sources.
- Enregistrer la provenance de la migration.

Ne pas migrer une quantité dont le type de casier est indéterminé sans validation.

## 17.3 Anciennes opérations déjà facturées

Les montants réellement facturés ou réglés dans le passé doivent être conservés dans les historiques financiers existants.

Ne pas les effacer.

Ne pas transformer automatiquement une ancienne opération financière en mouvement physique.

Présenter les situations ambiguës dans un rapport de rapprochement à valider par l'OWNER.

## 17.4 Nouvelles opérations

Après migration :

- Aucune nouvelle conversion automatique de casiers en dette.
- Aucun délai de restitution déclenchant une dette.
- Aucun montant indicatif de casier ajouté au compte client.
- Aucun calcul automatique de dette à partir des casiers sortis.
- Aucun mouvement de caisse déclenché par un retour physique seul.

La gestion des casiers doit utiliser un véritable journal de mouvements physiques.

---

# 18. BACKEND, API ET STOCKAGE

Respecter la stack actuelle :

- React.
- TypeScript.
- SQLite.
- Rust.
- Axum.
- Tauri 2.

Ne pas remplacer la stack.

Créer ou étendre les services existants suivant les conventions architecturales du dépôt.

Prévoir des services de catalogue :

- `list_brewery_catalogs`
- `create_brewery_catalog`
- `update_brewery_catalog`
- `import_catalog_file`
- `preview_catalog_import`
- `validate_catalog`
- `create_product`
- `update_product`
- `create_product_variant`
- `update_product_variant`
- `activate_catalog_product`
- `deactivate_catalog_product`
- `create_product_category`
- `create_crate_type`
- `update_crate_type`
- `configure_crate_compatibility`
- `configure_crate_valuation`
- `get_catalog_import_history`

Prévoir les services de casiers :

- `get_crate_stock`
- `get_crate_stock_by_type`
- `get_customer_crate_balance`
- `get_supplier_crate_balance`
- `record_customer_crate_return`
- `record_supplier_crate_exchange`
- `record_crate_adjustment`
- `record_crate_loss`
- `record_empty_crate_sale`
- `get_crate_movement_history`
- `get_crate_valuation_history`

Ces noms sont des contrats fonctionnels indicatifs. Réutiliser les conventions de nommage et services existants lorsqu'ils sont équivalents.

## API REST

Créer ou étendre les endpoints nécessaires pour :

- Consulter les producteurs.
- Consulter les catalogues.
- Créer un catalogue.
- Importer un JSON.
- Prévisualiser un import.
- Gérer les catégories.
- Gérer les produits.
- Gérer les variantes.
- Gérer les types de casiers.
- Gérer les compatibilités.
- Consulter le stock de casiers.
- Consulter les soldes physiques clients.
- Consulter les échanges fournisseurs.
- Enregistrer les retours physiques.
- Consulter les historiques.

Le moteur Tauri doit proposer les commandes équivalentes dans la couche desktop.

Le frontend doit passer par les abstractions API existantes.

Ne pas créer deux implémentations métier différentes entre le mode Web et le mode Desktop.

---

# 19. INTÉGRITÉ ET TRANSACTIONS

Toute opération qui modifie plusieurs tables doit être atomique.

Réutiliser les mécanismes transactionnels existants.

Exiger une clé `request_key` unique pour :

- Réception fournisseur.
- Échange de casiers fournisseur.
- Vente.
- Retour client.
- Vente de casier vide.
- Ajustement.
- Déclaration de perte.

Garantir :

- Idempotence.
- Contraintes de clés étrangères.
- Cohérence des stocks.
- Contrôle des quantités disponibles.
- Protection contre les doubles mouvements.
- Rollback intégral en cas d'erreur.
- Protection contre les opérations concurrentes.

Les quantités doivent respecter les conventions actuelles de DEPOTPRO.

Les montants restent des entiers en FCFA.

Aucun stock ne doit devenir négatif sauf autorisation explicite déjà prévue par les règles métier.

---

# 20. TESTS MÉTIER OBLIGATOIRES

Créer des tests Rust et frontend couvrant au minimum :

## Importation et catalogues

1. Importation du catalogue SOLIBRA nouveau format.
2. Importation du catalogue SOLIBRA ancien format.
3. Importation du catalogue BRASSIVOIRE.
4. Importation d'une nouvelle brasserie créée par l'OWNER.
5. Création d'une nouvelle catégorie.
6. Création d'une nouvelle marque.
7. Création manuelle d'un produit.
8. Création manuelle d'une variante.
9. Importation répétée sans doublons.
10. Actualisation sans écrasement des prix locaux.
11. Préservation des stocks lors d'une actualisation.
12. Fichier JSON invalide.
13. SKU dupliqué.
14. Variante avec capacité de casier inconnue.
15. Produit historique importé non vendable.

## Casiers

16. Création d'un type de casier.
17. Définition de sa capacité.
18. Compatibilité entre variante et casier.
19. Refus d'une compatibilité non confirmée.
20. Réception d'un casier plein.
21. Vente d'un casier plein.
22. Vérification du stock de boissons après vente.
23. Échange immédiat de casier avec un client.
24. Vente sans retour immédiat.
25. Mise à jour du solde physique client.
26. Retour partiel de casiers.
27. Retour total de casiers.
28. Refus d'un retour d'un type incompatible.
29. Retour exceptionnel de casiers supplémentaires.
30. Échange de casiers avec un fournisseur.
31. Refus d'une remise supérieure au stock disponible.
32. Gestion de plusieurs types de casiers dans un achat.
33. Vente définitive d'un casier vide.
34. Déclaration de perte.
35. Ajustement physique autorisé.
36. Historique des mouvements.
37. Modification de valeur sans altération historique.

## Invariants financiers et historiques

38. La valeur indicative des casiers ne crée pas de dette client.
39. Le solde physique des casiers n'est pas intégré au compte commercial.
40. Un retour physique ne génère pas de paiement.
41. Une date dépassée ne déclenche aucune conversion automatique.
42. Une perte physique n'engendre pas de facture automatique.
43. Une vente explicite de casier vide crée une transaction commerciale normale.
44. Une nouvelle valeur de casier ne modifie pas les anciennes ventes.
45. Une nouvelle valeur de casier ne modifie pas les anciennes réceptions.
46. Aucun mouvement de casier en double après répétition d'une requête.
47. Rollback complet en cas d'échec d'une opération multi-table.
48. Compatibilité avec une base SQLite existante.
49. Conservation de l'historique ancien après migration.
50. Contrôle des permissions Owner et des autres rôles.

---

# 21. DESIGN ET EXPÉRIENCE UTILISATEUR

Créer une interface moderne et professionnelle cohérente avec la direction artistique de DEPOTPRO.

Prévoir :

- Tableau de bord des catalogues.
- Fiches producteurs.
- Fiches produits.
- Gestion des variantes.
- Gestion des catégories.
- Gestion des casiers.
- Configuration des prix.
- Gestion du stock physique des casiers.
- Historique des mouvements.
- Compte physique des casiers par client.
- Historique des échanges fournisseur.

Les écrans de casiers doivent clairement différencier :

- Plein.
- Vide.
- Chez le client.
- Chez le fournisseur.
- Endommagé.
- Perdu.

Prévoir des filtres par producteur, marque, produit, format, casier, client et fournisseur.

Toutes les informations financières doivent être affichées en FCFA.

Aucune interface ne doit mélanger :

- Le stock des boissons.
- Le stock des casiers.
- La dette commerciale.
- Le solde physique des casiers.

L'utilisateur doit comprendre immédiatement s'il consulte un stock de boissons, un stock de casiers ou un compte commercial.

---

# 22. LOTS DE DÉVELOPPEMENT

Procéder dans l'ordre suivant.

## LOT 1 — AUDIT ET CONCEPTION

- Audit du modèle actuel.
- Audit des migrations.
- Audit des deux catalogues.
- Audit de l'importateur.
- Identification des anciennes fonctions financières d'emballages.
- Rapport de compatibilité.
- Architecture cible détaillée.

Ne pas modifier le code avant d'avoir défini la stratégie de migration.

## LOT 2 — NORMALISATION DES CATALOGUES

- Définition du schéma JSON commun.
- Adaptateur ancien format SOLIBRA.
- Adaptateur nouveau format SOLIBRA.
- Adaptateur BRASSIVOIRE.
- Mécanisme générique d'ajout de producteur.
- Validation et détection des doublons.

## LOT 3 — MODÈLE DES CASIERS

- Types de casiers.
- Compatibilités.
- Capacités.
- Valeurs.
- Historique des valeurs.
- Journal des mouvements.
- Soldes physiques par client et fournisseur.

## LOT 4 — MIGRATION ET BACKEND

- Migration SQLite séquentielle.
- Services Rust.
- Repositories.
- Transactions.
- Idempotence.
- Permissions.
- Journal d'audit.
- Compatibilité Web et Desktop.

## LOT 5 — WORKFLOW FOURNISSEURS

- Commandes.
- Réceptions.
- Réceptions partielles.
- Échanges physiques de casiers.
- Mise à jour des stocks.
- Historique des mouvements.

## LOT 6 — WORKFLOW CLIENTS

- Vente en casier.
- Vente à l'unité.
- Retour immédiat.
- Retour ultérieur.
- Solde physique.
- Vente séparée de casier vide.
- Gestion des pertes et ajustements.

## LOT 7 — INTERFACE OWNER

- Gestion des producteurs.
- Gestion des catalogues.
- Gestion des catégories.
- Gestion des produits.
- Gestion des variantes.
- Gestion des casiers.
- Importation JSON.
- Configuration des prix.

## LOT 8 — TABLEAUX DE BORD

- Stocks de casiers pleins et vides.
- Casiers chez les clients.
- Casiers chez les fournisseurs.
- Valeur indicative des stocks.
- Historique des mouvements.
- Alertes et anomalies physiques.

## LOT 9 — TESTS ET VALIDATION

- Tests unitaires.
- Tests d'intégration.
- Tests métier.
- Tests de migration.
- Tests d'idempotence.
- Tests de non-régression.
- Tests frontend.
- Vérification Web.
- Vérification Tauri Desktop.

## LOT 10 — DOCUMENTATION

Mettre à jour :

- `docs/DATABASE.md`
- `docs/BUSINESS_RULES.md`
- La documentation technique des catalogues.
- La documentation des imports JSON.
- Le guide utilisateur.
- La matrice des permissions.
- Les schémas de données.

La documentation doit refléter le modèle physique des casiers et ne plus présenter l'ancien système de conversion en dette comme une fonctionnalité active.

---

# 23. CRITÈRES FINAUX D'ACCEPTATION

La mission est considérée comme terminée uniquement si :

1. SOLIBRA est intégré.
2. BRASSIVOIRE est intégré.
3. Les deux formats de fichiers JSON sont pris en charge.
4. Une nouvelle brasserie peut être ajoutée par l'OWNER.
5. Une nouvelle catégorie peut être créée.
6. Un nouveau produit peut être créé.
7. Une variante peut être ajoutée ou modifiée.
8. Les casiers sont distingués des contenants individuels.
9. Les capacités de casiers sont exactes ou explicitement à vérifier.
10. Les casiers pleins et vides sont suivis indépendamment des boissons.
11. Les achats suivent les casiers reçus et remis au fournisseur.
12. Les ventes suivent les casiers sortis et récupérés auprès des clients.
13. Le compte physique du client est distinct de son compte commercial.
14. Les valeurs financières sont configurables par l'OWNER.
15. Les modifications conservent les historiques.
16. Les anciennes données commerciales restent intactes.
17. Aucun automatisme ne transforme un solde physique en dette financière.
18. Aucune opération de retour physique ne crée de mouvement de caisse.
19. Les ventes explicites de casiers passent par le circuit commercial normal.
20. L'interface Web et Desktop fonctionnent selon les mêmes règles métier.
21. Les migrations sont compatibles avec les installations existantes.
22. Tous les tests obligatoires passent.

---

# 24. DIRECTIVE FINALE À L'AGENT IA

Tu dois agir comme un ingénieur logiciel senior spécialisé dans les ERP de distribution de boissons, les dépôts et sous-dépôts, la gestion des stocks physiques, les échanges de casiers et les flux financiers.

Tu dois comprendre les pratiques commerciales avant de modifier le code.

Ne suppose jamais :

- Qu'un casier contient toujours 12 ou 24 bouteilles.
- Qu'un casier d'un producteur est interchangeable avec celui d'un autre.
- Qu'une bouteille réutilisable est un emballage suivi financièrement.
- Que la valeur du casier est incluse dans le prix des boissons.
- Qu'un retour physique crée un paiement.
- Que tout casier sorti constitue une créance financière.
- Qu'un prix du catalogue public est le prix réel du sous-dépôt.

Les quantités et valeurs doivent provenir de données vérifiées, de factures fournisseurs ou d'une configuration explicite validée par l'OWNER.

Ne pas coder des règles commerciales arbitraires présentées comme des obligations légales générales. Les modalités d'échange, les prix et les équivalences doivent être configurables selon les accords réellement appliqués par le sous-dépôt et ses fournisseurs.

Ne pas supprimer une fonctionnalité historique avant d'avoir étudié ses dépendances et les données déjà enregistrées.

Ne pas réécrire inutilement les composants existants.

Ne pas déclarer un lot terminé sans tests.

À chaque étape, fournir :

- Les fichiers examinés.
- Les fichiers créés ou modifiés.
- Les migrations ajoutées.
- Les fonctionnalités implémentées.
- Les tests exécutés.
- Les résultats obtenus.
- Les éventuels points restant à traiter.

**RÉSULTAT FINAL ATTENDU :**

DEPOTPRO PREMIUM doit devenir un ERP de sous-dépôt de boissons adapté au fonctionnement commercial ivoirien, avec un catalogue multi-brasseries évolutif et administrable par l'OWNER, ainsi qu'une gestion fiable, physique et financière des casiers plastiques, de leur circulation chez les fournisseurs et les clients, sans confondre les casiers, les boissons, les stocks et les comptes financiers.

## **3. Les trois règles à faire respecter absolument**

**1. Le casier est un stock à part entière**

Le sous-dépôt doit savoir combien il possède de casiers pleins, vides, sortis chez les clients et remis aux fournisseurs.

**2. Le solde client est d'abord physique**

Un casier sorti et non encore récupéré est un casier à récupérer. Il ne devient pas automatiquement une dette commerciale.

**3. La valeur du casier est indépendante de la boisson**

Le prix des boissons, la valeur du stock de casiers et le prix de vente d'un casier vide sont trois données distinctes.

**Mon conseil technique :** ne demande pas à ton agent de simplement remplacer les mots de l'ancien module. Il doit réellement vérifier et adapter les transactions, les soldes physiques, les écrans, les API et les migrations. C'est particulièrement important pour le mécanisme de la migration `0015`, qui doit être neutralisé pour les nouvelles opérations sans détruire les données historiques.

