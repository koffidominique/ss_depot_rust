Voici le **MASTER PROMPT COMPLET DE DEPOTPRO PREMIUM V3**, intégrant les nouvelles règles de distribution des boissons en Côte d’Ivoire, la gestion des emballages, les commandes mélangées, les retours clients et fournisseurs, les tarifs, la liquidité, ainsi que la migration vers une architecture avec un seul serveur métier en Rust.

Ce document est conçu pour être transmis directement à ton agent IA de développement avec le dépôt GitHub du projet.

# DEPOTPRO PREMIUM V3

## MASTER PROMPT — REFONTE COMPLÈTE, GESTION DES BOISSONS, EMBALLAGES, COMMANDES MÉLANGÉES ET ARCHITECTURE RUST

**Version :** 3.0 — Spécification de référence\
**Marché cible :** Côte d'Ivoire, puis Afrique francophone\
**Type d'application :** ERP de gestion commerciale pour dépôts et sous-dépôts de boissons\
**Architecture cible :** React + TypeScript + Rust + SQLite + Tauri\
**Serveur métier unique :** Rust (Axum)\
**Application :** Desktop Windows/macOS et architecture web évolutive\
**Devise :** Franc CFA (XOF / FCFA)

---

# PARTIE 1 — MISSION GÉNÉRALE DE L'AGENT IA

Tu es un architecte logiciel senior, ingénieur Rust, expert en bases de données SQLite, développeur React/TypeScript et spécialiste des logiciels de gestion commerciale et de distribution.

Ta mission consiste à faire évoluer le projet existant DEPOTPRO vers une application professionnelle, robuste, moderne et exploitable commercialement par les dépôts et sous-dépôts de boissons en Côte d'Ivoire.

Tu dois travailler à partir du dépôt GitHub existant.

**Dépôt du projet :**

[https://github.com/koffidominique/ss_depot_rust.git](https://github.com/koffidominique/ss_depot_rust.git)

Tu ne dois pas créer un projet parallèle ni remplacer arbitrairement l'application existante.

Tu dois :

1. Examiner intégralement l'architecture actuelle.
2. Comprendre les fonctionnalités déjà développées.
3. Identifier les composants réutilisables.
4. Identifier les fonctionnalités incomplètes ou incorrectes.
5. Corriger les défauts techniques.
6. Adapter le modèle de données aux réalités commerciales des sous-dépôts ivoiriens.
7. Faire évoluer le moteur métier Rust.
8. Mettre à jour toutes les interfaces React.
9. Ajouter les nouvelles fonctionnalités sans détruire les données existantes.
10. Vérifier le fonctionnement de bout en bout.

**Règle absolue : ne jamais supprimer une fonctionnalité existante sans avoir étudié son utilité et prévu son remplacement.**

Le résultat attendu est une véritable application de gestion commerciale, et non une simple interface de démonstration.

---

# PARTIE 2 — ARCHITECTURE TECHNIQUE OBLIGATOIRE

## 2.1 Stack technologique

Conserver la stack suivante :

| Couche                       | Technologie                          |
| ---------------------------- | ------------------------------------ |
| Interface utilisateur        | React 19                             |
| Langage frontend             | TypeScript                           |
| Styles                       | Tailwind CSS                         |
| Composants UI                | Radix UI                             |
| Animations                   | Motion                               |
| Gestion des données frontend | TanStack Query                       |
| État global                  | Zustand                              |
| Graphiques                   | Recharts                             |
| Backend métier unique        | Rust                                 |
| Serveur HTTP                 | Axum                                 |
| Base de données              | SQLite                               |
| Accès SQL Rust               | SQLx                                 |
| Application desktop          | Tauri 2                              |
| Communication desktop        | Tauri IPC                            |
| Validation                   | Tests Rust, TypeScript et Playwright |

## 2.2 Un seul serveur métier : Rust

Le projet doit conserver exclusivement Rust comme langage d'implémentation du serveur métier.

Le serveur Node.js / Express doit être supprimé après migration complète de ses responsabilités.

Cela signifie :

- Aucun serveur Express.
- Aucun serveur Node.js chargé de gérer les ventes.
- Aucune seconde implémentation des règles commerciales en JavaScript.
- Aucune base SQLite concurrente initialisée par un ancien serveur.
- Aucune logique métier dupliquée entre Node.js et Rust.

**Rust devient l'unique autorité métier de DEPOTPRO.**

### Architecture cible

```
DEPOTPRO PREMIUM
│
├── Frontend React + TypeScript
│   ├── Dashboard
│   ├── Ventes
│   ├── Achats
│   ├── Produits
│   ├── Emballages
│   ├── Commandes mélangées
│   ├── Clients
│   ├── Fournisseurs
│   ├── Stocks
│   ├── Caisse
│   ├── Dettes
│   ├── Rapports
│   └── Paramètres
│
├── Rust Application Core
│   ├── Domain
│   ├── Application
│   ├── Infrastructure
│   └── Validation
│
├── Rust Axum Server
│   ├── REST API
│   ├── Authentication
│   ├── Authorization
│   └── HTTP Controllers
│
├── Tauri 2
│   ├── Desktop Runtime
│   ├── IPC Commands
│   └── Application Packaging
│
└── SQLite
    ├── Products
    ├── Packaging
    ├── Sales
    ├── Purchases
    ├── Customers
    ├── Suppliers
    ├── Inventory
    ├── Cash
    └── Accounting
```

### Règle d'architecture essentielle

Les règles commerciales doivent être développées une seule fois dans `depotpro-core`.

Le serveur Axum et les commandes Tauri doivent appeler les mêmes services Rust.

Ne jamais réécrire une règle de vente ou de stock dans deux endroits différents.

### Migration obligatoire du serveur Node.js

Avant toute suppression :

1. Recenser tous les endpoints Express.
2. Recenser tous les services Node.js.
3. Identifier les règles métier qui ne sont pas encore disponibles en Rust.
4. Migrer les fonctionnalités manquantes dans `depotpro-core`.
5. Migrer les endpoints vers Axum.
6. Adapter le frontend à l'API Rust.
7. Vérifier les tests et les flux complets.
8. Vérifier la compatibilité de la base de données.
9. Supprimer les anciens fichiers Node.js devenus inutiles.
10. Supprimer les dépendances exclusivement utilisées par le serveur Node.js.
11. Mettre à jour `package.json`, les scripts et la CI.
12. Mettre à jour la documentation.

Ne supprime pas Node.js avant d'avoir démontré que toutes ses responsabilités sont couvertes par Rust.

Le frontend peut continuer à utiliser l'écosystème JavaScript nécessaire à React, Vite et TypeScript. L'interdiction concerne le serveur métier Node.js, pas les outils de compilation frontend.

### Fonctionnement desktop

Dans Tauri :

- Le frontend communique avec le cœur Rust via IPC.
- La base SQLite est stockée dans le répertoire de données de l'application.
- Aucun serveur Node.js ne doit être lancé inutilement pendant le développement desktop.
- Les commandes Tauri doivent utiliser les services de `depotpro-core`.

### Fonctionnement web

Pour le déploiement web :

- Axum expose les endpoints REST.
- Plusieurs utilisateurs peuvent accéder au même serveur.
- L'authentification et les autorisations sont vérifiées côté serveur.
- SQLite peut être conservé pour un déploiement mono-instance maîtrisé.
- Si le besoin évolue vers plusieurs instances concurrentes ou une forte charge, préparer une migration documentée vers PostgreSQL.

Ne jamais prétendre qu'une base SQLite locale synchronise automatiquement plusieurs ordinateurs.

---

# PARTIE 3 — COMPRÉHENSION DU MÉTIER

## 3.1 Fonctionnement général d'un sous-dépôt

DEPOTPRO doit représenter le fonctionnement réel d'un sous-dépôt de boissons.

Le sous-dépôt :

- Achète des boissons auprès de fournisseurs ou de dépôts.
- Reçoit des casiers de boissons pleines.
- Dispose de stocks de boissons par référence et conditionnement.
- Vend aux clients professionnels et particuliers.
- Vend des casiers complets ou partiels.
- Accepte les emballages vides des clients.
- Retourne les emballages aux fournisseurs.
- Suit les emballages manquants.
- Gère les prix d'achat et de vente.
- Gère les liquidités nécessaires aux achats.
- Suit les créances clients et les dettes fournisseurs.
- Gère les mouvements de caisse.
- Contrôle les stocks physiques et financiers.

## 3.2 Le concept fondamental : l'emballage

Dans DEPOTPRO, un casier réutilisable ne doit pas être considéré comme un simple carton.

Un emballage réutilisable est constitué de deux éléments distincts :

1. Le support plastique.
2. Les bouteilles en verre associées au support.

Les bouteilles peuvent être pleines ou vides.

Un casier B24-33 est donc constitué :

- D'un support plastique B24-33.
- De 24 bouteilles compatibles de 33 cl.

Un casier B12-50 est constitué :

- D'un support plastique B12-50.
- De 12 bouteilles compatibles de 50 cl.

**Le support plastique et les bouteilles doivent être suivis séparément dans les stocks et les comptes d'emballages.**

Un support plastique reçu sans ses bouteilles ne doit pas être considéré comme un casier complet.

Une bouteille vide reçue sans support plastique ne doit pas être considérée comme un casier complet.

## 3.3 Nouveau modèle commercial : échange d'emballages

Le client commande des boissons en casiers.

Lorsqu'il commande un casier plein, il remet normalement les emballages vides correspondants.

Exemple :

Le client commande :

- 1 casier de Beaufort 33 cl.
- Il remet 1 support plastique B24-33 et 24 bouteilles vides compatibles.
- Le sous-dépôt lui remet 1 support plastique avec 24 bouteilles pleines.

Le système enregistre :

- Les boissons pleines sorties.
- Les bouteilles vides reçues.
- Les supports plastiques reçus.
- Les supports plastiques remis.
- Les éventuels emballages manquants.

Il ne faut pas créer automatiquement une dette financière ou une consigne sur chaque bouteille : le fonctionnement principal est un suivi physique des emballages et de leurs soldes.

Une valeur financière peut néanmoins être associée aux éléments d'emballage lorsque le propriétaire configure une politique tarifaire.

---

# PARTIE 4 — RÉFÉRENTIEL DES EMBALLAGES

## 4.1 Types de casiers initiaux

Créer un référentiel configurable avec les formats suivants :

| Code initial | Capacité      | Contenance nominale | Usage indicatif                 |
| ------------ | ------------- | ------------------- | ------------------------------- |
| B24-25       | 24 bouteilles | 25 cl               | Selon emballage réel            |
| B24-30       | 24 bouteilles | 30 cl               | Sucreries compatibles           |
| B24-33       | 24 bouteilles | 33 cl               | Bières et sucreries compatibles |
| B12-50       | 12 bouteilles | 50 cl               | Grosses bouteilles compatibles  |
| B12-60       | 12 bouteilles | 60 cl               | À vérifier                      |
| B12-65       | 12 bouteilles | 65 cl               | À vérifier                      |
| B12-75       | 12 bouteilles | 75 cl               | Selon fournisseur               |
| B12-100      | 12 bouteilles | 100 cl              | Grandes bouteilles compatibles  |
| B20-50       | 20 bouteilles | 50 cl               | Références spécifiques          |
| B6-150       | 6 bouteilles  | 150 cl              | Grand format à vérifier         |

Cette liste constitue un référentiel initial, et non une affirmation que tous ces supports existent chez tous les fournisseurs ivoiriens.

Le propriétaire doit pouvoir créer, modifier, désactiver et archiver un type de casier.

## 4.2 Informations à enregistrer pour un casier

Chaque casier doit comporter :

- Identifiant.
- Code.
- Nom commercial.
- Capacité maximale.
- Contenance nominale.
- Type de support.
- Matière.
- Forme physique.
- Dimensions éventuelles.
- Groupe de compatibilité.
- Valeur du support plastique.
- Valeur des bouteilles associées.
- Valeur totale indicative de l'emballage.
- Fournisseur ou fabricant éventuel.
- Statut actif/inactif.
- Notes.

La valeur de l'emballage ne doit pas être confondue avec le prix de la boisson.

## 4.3 Compatibilité physique

La contenance ne suffit pas pour établir une compatibilité.

Deux bouteilles de 50 cl peuvent avoir :

- Des diamètres différents.
- Des hauteurs différentes.
- Des bases différentes.
- Des formes différentes.
- Des emplacements de casier incompatibles.

Créer une notion de `crate_compatibility_group`.

Un produit peut être associé à un groupe de compatibilité uniquement après vérification physique.

Le propriétaire doit pouvoir :

- Autoriser le mélange de produits compatibles.
- Interdire le mélange de certaines références.
- Associer une référence à plusieurs conditionnements.
- Désactiver une compatibilité.
- Consulter les produits autorisés dans un groupe.

Ne jamais supposer qu'une bouteille est compatible simplement parce qu'elle possède le même volume en centilitres.

---

# PARTIE 5 — CATALOGUE COMPLET ET CONFIGURABLE DES BOISSONS

## 5.1 Familles de produits

Créer les catégories principales :

1. Bières.
2. Sucreries et boissons gazeuses.
3. Vins.
4. Boissons énergisantes.
5. Boissons maltées.
6. Cidres et autres boissons.
7. Eaux.
8. Autres boissons configurables.

Le propriétaire peut ajouter ses propres catégories.

## 5.2 Marques et références initiales

Préparer un catalogue de démarrage comprenant les références commerciales suivantes, sans les considérer comme toutes disponibles dans tous les dépôts :

### Bières

- Beaufort Lager.
- Bock.
- Castel Beer.
- Doppel Munich.
- Guinness.
- Ivoire Classic.
- Ivoire Black.
- Ivoire Mix.
- Heineken.
- Desperados.
- Tuborg.
- Sombreros.
- Asso.
- Budweiser.
- Drogba.
- Autres références configurables.

### Boissons maltées et énergisantes

- Malta Guinness.
- Doppel Energy Malt.
- Rhino Energy Malt.
- Autres références configurables.

### Sucreries et boissons gazeuses

- Youki Orange.
- Youki Cocktail.
- Youki Pamplemousse.
- Youki autres parfums.
- Youzou.
- Orangina.
- World Cola.
- Coca-Cola.
- Autres colas.
- Djino's.
- Chill.
- Autres références configurables.

### Vins

- Valpierre rouge.
- Valpierre blanc.
- Valpierre rosé.
- Autres vins rouges.
- Autres vins blancs.
- Autres vins rosés.
- Vins importés.
- Apéritifs.
- Autres références configurables.

## 5.3 Contenances

Prévoir les contenances configurables suivantes :

- 25 cl.
- 30 cl.
- 33 cl.
- 50 cl.
- 60 cl.
- 65 cl.
- 75 cl.
- 100 cl.
- 125 cl.
- 150 cl.
- Autres volumes personnalisés.

Les formats doivent être renseignés produit par produit.

Ne pas inventer les conditionnements manquants.

Les références dont le format ou le conditionnement n'est pas confirmé doivent porter le statut `À VÉRIFIER`.

## 5.4 Types de contenants

Créer les types suivants :

- Verre réutilisable.
- Verre non réutilisable.
- PET.
- Canette aluminium.
- Bouteille plastique.
- Autre contenant.

## 5.5 Conditionnements commerciaux

Distinguer les conditionnements réutilisables des conditionnements jetables.

### Réutilisables

- B24.
- B12.
- B20.
- B6.
- Autres casiers configurables.

### Jetables

- Pack PET de 6.
- Pack PET de 12.
- Pack de canettes.
- Carton de 24 bouteilles.
- Carton de 24 canettes.
- Film plastique.
- Carton simple.
- Autres conditionnements.

Un pack jetable ne doit jamais générer une dette de casier ou de bouteille réutilisable.

Un carton de canettes ne doit jamais générer un retour de bouteille en verre.

Un pack PET doit être géré comme un conditionnement commercial jetable, et non comme un casier consigné.

## 5.6 Variantes d'un même produit

Une marque peut avoir plusieurs variantes :

Exemple :

Beaufort :

- Beaufort 33 cl.
- Beaufort 50 cl.
- Beaufort en canette, si commercialisé.

Chaque variante doit posséder ses propres :

- Référence.
- Volume.
- Contenant.
- Profil de bouteille.
- Conditionnement.
- Compatibilité.
- Prix.
- Code-barres éventuel.

---

# PARTIE 6 — CONFIGURATION DU CATALOGUE PAR LE PROPRIÉTAIRE

Cette fonctionnalité est obligatoire.

Le propriétaire doit pouvoir gérer tout le catalogue sans intervention d'un développeur.

## 6.1 Écrans à créer

Créer une rubrique principale :

**Catalogue & Configuration**

Sous-rubriques :

- Catégories.
- Marques.
- Produits.
- Variantes.
- Formats.
- Contenants.
- Casiers.
- Compatibilités.
- Conditionnements jetables.
- Tarifs.

## 6.2 Formulaire d'ajout de produit

Le formulaire doit être simple, clair et progressif.

### Étape 1 — Informations générales

- Nom du produit.
- Marque.
- Catégorie.
- Description facultative.
- Code-barres facultatif.
- Photo facultative.

### Étape 2 — Caractéristiques

- Contenance.
- Unité de contenance.
- Type de contenant.
- Produit alcoolisé ou non, si utile à la gestion.
- Statut actif.

### Étape 3 — Conditionnement

Choisir :

- Casier réutilisable.
- Pack jetable.
- Carton.
- Unité individuelle.
- Autre conditionnement.

Si réutilisable :

- Type de casier.
- Profil de bouteille.
- Groupe de compatibilité.
- Capacité.
- Quantité par conditionnement.

Si jetable :

- Type de pack.
- Nombre d'unités.
- Nature du support.
- Aucun suivi de dette d'emballage réutilisable.

### Étape 4 — Tarifs

- Prix fournisseur.
- Prix de vente professionnel.
- Prix de vente détaillant.
- Prix de vente maquis.
- Prix de vente particulier.
- Valeur de l'emballage, si applicable.

Les prix peuvent être laissés vides lors de la création.

Ne jamais créer un prix à 0 FCFA par défaut.

### Étape 5 — Vérification

Afficher un récapitulatif avant validation.

Boutons :

- Enregistrer.
- Enregistrer et ajouter un autre.
- Annuler.

## 6.3 Gestion du catalogue

Le propriétaire doit pouvoir :

- Ajouter un produit.
- Modifier un produit.
- Dupliquer un produit.
- Désactiver un produit.
- Archiver un produit.
- Modifier une compatibilité.
- Modifier un conditionnement.
- Ajouter une nouvelle marque.
- Ajouter une nouvelle catégorie.
- Importer un catalogue.
- Exporter un catalogue.

La suppression physique d'un produit déjà utilisé dans une vente, un achat ou un mouvement de stock doit être interdite.

Utiliser l'archivage et les références historiques.

## 6.4 Importation

Prévoir une importation CSV ou Excel.

L'import doit :

- Contrôler les colonnes.
- Vérifier les doublons.
- Vérifier les formats.
- Signaler les produits incomplets.
- Afficher les erreurs avant import définitif.
- Permettre une prévisualisation.
- Ne jamais écraser les prix historiques.

---

# PARTIE 7 — FONCTIONNALITÉ MAJEURE : COMMANDES MÉLANGÉES

## 7.1 Définition

Une commande mélangée permet au client de commander plusieurs références de boissons dans un même emballage physique, à condition que les produits soient compatibles.

Le mélange ne doit pas être limité à une seule marque.

Il peut inclure plusieurs produits dans le même casier.

Le critère déterminant est la compatibilité physique du casier et des bouteilles, pas uniquement la marque ou le volume commercial.

## 7.2 Exemple 1 — Deux formats différents

Le client commande :

- ½ casier Beaufort 33 cl : 12 bouteilles.
- ½ casier d'une bière 50 cl : 6 bouteilles.

Le logiciel doit créer deux groupes distincts :

**Groupe A — B24-33**

- 12 Beaufort 33 cl.
- Capacité : 24.
- Occupation : 12/24.
- Retour attendu : 12 bouteilles vides compatibles.
- Retour attendu du support : selon le support physique effectivement remis.

**Groupe B — B12-50**

- 6 bouteilles de bière 50 cl.
- Capacité : 12.
- Occupation : 6/12.
- Retour attendu : 6 bouteilles vides compatibles.
- Retour attendu du support : selon le support physique effectivement remis.

Les deux groupes ne peuvent pas être fusionnés.

Le logiciel ne doit jamais compenser le manque de bouteilles d'un groupe avec celles d'un autre groupe incompatible.

## 7.3 Exemple 2 — Deux produits de même compatibilité

Le client commande :

- 6 grosses bières Drogba 50 cl.
- 6 grosses Beaufort 50 cl.

Si les deux références sont validées comme compatibles avec le même emballage B12-50 :

Créer un seul groupe de casier mélangé.

Composition :

- 6 Drogba.
- 6 Beaufort.

Total :

- 12 bouteilles.
- Capacité : 12.
- Occupation : 12/12.

Le client retourne :

- 6 bouteilles vides Drogba.
- 6 bouteilles vides Beaufort.
- Le support plastique compatible.

Le sous-dépôt remet :

- Le casier avec les 12 bouteilles pleines.
- La composition exacte commandée.

Le système doit conserver le détail des références.

## 7.4 Exemple 3 — Mélange de trois références

Le client commande :

- 4 bouteilles de produit A.
- 4 bouteilles de produit B.
- 4 bouteilles de produit C.

Les trois produits sont compatibles avec B12-50.

Le système accepte :

- 4 + 4 + 4 = 12 bouteilles.
- Un seul casier.
- Une seule composition mélangée.

## 7.5 Exemple 4 — Casier partiellement rempli

Le client commande :

- 8 bouteilles d'une référence compatible B12-50.

Le système doit autoriser un casier partiel si le propriétaire l'autorise.

Afficher :

- 8/12 emplacements occupés.
- 4 emplacements non utilisés.
- 8 bouteilles pleines remises.
- 8 bouteilles vides attendues.

Ne pas facturer automatiquement les 12 bouteilles si le client n'en commande que 8.

## 7.6 Calcul des demi-casiers

Le système doit gérer les quantités en bouteilles entières.

Exemples :

| Casier  | Capacité | Demi-casier |
| ------- | -------- | ----------- |
| B24-33  | 24       | 12          |
| B12-50  | 12       | 6           |
| B20-50  | 20       | 10          |
| B12-100 | 12       | 6           |
| B6-150  | 6        | 3           |

Les fractions de bouteilles sont interdites.

Le calcul doit être effectué à partir de la capacité réelle du conditionnement.

## 7.7 Interface de composition

Dans l'écran de vente, ajouter :

- Commande standard.
- Commande mélangée.

Pour une commande mélangée :

1. Choisir le groupe de compatibilité.
2. Choisir le type de casier.
3. Ajouter une référence.
4. Définir sa quantité.
5. Ajouter d'autres références compatibles.
6. Visualiser le remplissage.
7. Vérifier la capacité.
8. Enregistrer le groupe.
9. Ajouter un autre groupe si nécessaire.

Afficher une jauge :

`8 / 12 bouteilles`

Afficher les références et quantités sous forme de liste.

Refuser immédiatement :

- Une référence incompatible.
- Une quantité négative.
- Un dépassement de capacité.
- Une fraction de bouteille.
- Un produit désactivé.

---

# PARTIE 8 — GESTION DES RETOURS D'EMBALLAGES

## 8.1 Objectif

Le système doit permettre de suivre précisément les emballages reçus et remis.

Il faut distinguer :

1. Supports plastiques.
2. Bouteilles vides.
3. Bouteilles pleines.
4. Emballages jetables.

## 8.2 Retour complet

Exemple :

Le client commande un B24-33 de 24 bouteilles.

Il remet :

- 1 support B24-33.
- 24 bouteilles vides compatibles.

Le logiciel enregistre :

- 1 support reçu.
- 24 bouteilles vides reçues.
- 24 bouteilles pleines sorties.
- 1 support plein remis.

La transaction est équilibrée si tous les éléments requis sont présents.

## 8.3 Retour incomplet

Exemple :

Le client commande un casier mélangé B12-50 :

- 6 bouteilles Drogba.
- 6 bouteilles Beaufort.

Il ne retourne que :

- 6 bouteilles Drogba vides.
- 4 bouteilles Beaufort vides.

Le logiciel doit enregistrer :

- 6 bouteilles Drogba reçues.
- 4 bouteilles Beaufort reçues.
- 2 bouteilles Beaufort manquantes.
- Le support plastique reçu ou manquant, selon le constat physique.

Le compte du client doit afficher une dette physique de deux bouteilles Beaufort compatibles.

Cette dette ne doit pas être confondue avec une dette financière.

## 8.4 Retour de supports sans bouteilles

Autoriser l'enregistrement indépendant :

- D'un support plastique vide.
- De bouteilles vides sans support.
- D'un support complet avec bouteilles.

Chaque mouvement doit être détaillé.

## 8.5 Compte emballages du client

Créer une fiche client comportant un onglet :

**Compte emballages**

Afficher :

- Solde des supports plastiques.
- Solde des bouteilles vides par profil.
- Solde des bouteilles manquantes.
- Soldes par groupe de compatibilité.
- Historique des remises.
- Historique des retours.
- Historique des régularisations.

Un solde positif ou négatif doit être défini selon une convention claire.

Convention recommandée :

- Solde positif : emballages dus par le client au sous-dépôt.
- Solde négatif : emballages détenus en avance par le client auprès du sous-dépôt.

Afficher toujours les quantités et unités.

## 8.6 Retours partiels ultérieurs

Le client doit pouvoir revenir plus tard pour restituer les emballages manquants.

Exemple :

- Dette initiale : 2 bouteilles Beaufort.
- Retour ultérieur : 2 bouteilles Beaufort.
- Nouvelle dette : 0.

Créer une opération de régularisation reliée à la dette initiale.

Ne jamais modifier ou effacer l'opération d'origine.

---

# PARTIE 9 — GESTION DES FOURNISSEURS ET RETOURS D'EMBALLAGES

## 9.1 Achats fournisseurs

Un achat fournisseur doit contenir :

- Fournisseur.
- Date.
- Référence de commande.
- Produits.
- Quantités.
- Conditionnements.
- Prix d'achat.
- Montants.
- Frais éventuels.
- Montant payé.
- Solde à payer.

## 9.2 Réception des emballages

Lorsqu'un fournisseur livre 20 casiers pleins :

Le système doit distinguer :

- 20 supports plastiques reçus.
- Les bouteilles pleines reçues.
- Les quantités par référence.
- Les éventuels emballages manquants ou endommagés.

## 9.3 Retour des emballages au fournisseur

Exemple :

Le sous-dépôt retourne 20 casiers vides au fournisseur.

Le système doit enregistrer :

- 20 supports plastiques retournés.
- Le détail des bouteilles vides retournées.
- Les références des bouteilles.
- Le fournisseur destinataire.
- La date.
- La référence du bon de retour.
- Le statut de validation.

Si les 20 casiers contiennent plusieurs références, conserver la composition détaillée.

## 9.4 Compte emballages fournisseur

Créer un compte emballages pour chaque fournisseur.

Afficher :

- Supports plastiques reçus.
- Supports plastiques retournés.
- Bouteilles vides reçues.
- Bouteilles vides retournées.
- Bouteilles pleines reçues.
- Écarts.
- Emballages restant à restituer.
- Historique des opérations.

Ne jamais supposer qu'un retour au fournisseur est automatiquement accepté.

Prévoir les statuts :

- Préparé.
- Expédié.
- Reçu par le fournisseur.
- Validé.
- Contesté.
- Annulé.

Les comptes ne doivent être définitivement régularisés qu'après validation appropriée.

---

# PARTIE 10 — PRIX, EMBALLAGES ET LIQUIDITÉ

## 10.1 Distinguer les montants

Le logiciel doit différencier :

1. Prix des boissons.
2. Valeur du support plastique.
3. Valeur des bouteilles.
4. Valeur totale indicative de l'emballage.
5. Éventuelle consigne ou caution financière.
6. Montant de la commande.
7. Montant payé.
8. Solde restant dû.

Ne jamais additionner automatiquement une valeur d'emballage au prix des boissons si le scénario commercial ne le prévoit pas.

Le fonctionnement normal peut être un échange physique équilibré.

Une facturation d'emballage manquant ne doit intervenir que si le propriétaire l'autorise et si une règle commerciale explicite le prévoit.

## 10.2 Tarification fournisseur

Chaque produit peut avoir plusieurs tarifs fournisseur.

Enregistrer :

- Fournisseur.
- Produit.
- Conditionnement.
- Prix d'achat.
- Prix de l'emballage.
- Frais éventuels.
- Date de début.
- Date de fin.
- Source du tarif.
- Historique.

## 10.3 Tarification client

Prévoir les tarifs :

- Grossiste.
- Détaillant.
- Maquis.
- Particulier.
- Client spécial.

Le propriétaire doit pouvoir définir des grilles de prix.

Le prix doit être figé sur chaque ligne de facture au moment de la vente.

Une modification ultérieure du catalogue ne doit jamais modifier une ancienne facture.

## 10.4 Prix avec emballage

Exemple :

- Prix des boissons : 9 500 FCFA.
- Valeur indicative de l'emballage : 3 600 FCFA.
- Prix total avec emballage : 13 100 FCFA.

Ce calcul n'est applicable que si la politique commerciale configurée exige effectivement le paiement de l'emballage.

L'application doit présenter séparément les deux montants.

## 10.5 Liquidité nécessaire aux commandes fournisseur

Ajouter une fonctionnalité :

**Prévision de liquidité fournisseur**

Le sous-dépôt doit pouvoir préparer une commande fournisseur en connaissant les fonds nécessaires.

Afficher :

- Montant des boissons.
- Montant des emballages éventuellement facturés.
- Frais de transport.
- Autres frais.
- Acomptes.
- Solde à payer.
- Liquidité disponible.
- Liquidité nécessaire.

Exemple :

Commande fournisseur :

- Boissons : 500 000 FCFA.
- Emballages facturés : 30 000 FCFA.
- Transport : 10 000 FCFA.
- Acompte déjà versé : 100 000 FCFA.

Besoin de liquidité restant :\
440 000 FCFA.

Le calcul doit être dynamique et vérifiable.

Ne pas compter deux fois un montant d'emballage déjà inclus dans le prix fournisseur.

---

# PARTIE 11 — GESTION DES STOCKS

Créer des stocks distincts :

## 11.1 Stock de boissons pleines

Par produit et variante :

- Quantité en bouteilles.
- Quantité en casiers complets.
- Quantité en demi-casiers.
- Quantité en conditionnements jetables.
- Quantité disponible.
- Quantité réservée.
- Quantité vendue.

## 11.2 Stock de bouteilles vides

Par profil de bouteille :

- Quantité reçue.
- Quantité remise.
- Quantité retournée fournisseur.
- Quantité cassée.
- Quantité disponible.
- Quantité en attente de régularisation.

## 11.3 Stock de supports plastiques

Par type de casier :

- Quantité disponible.
- Quantité remise aux clients.
- Quantité reçue des clients.
- Quantité retournée fournisseur.
- Quantité endommagée.
- Quantité manquante.

## 11.4 Stock des conditionnements jetables

Suivre :

- Packs PET.
- Cartons.
- Packs de canettes.
- Films plastiques.
- Autres conditionnements.

Aucune dette de casier réutilisable ne doit être créée pour ces produits.

## 11.5 Inventaires

Permettre :

- Inventaire des boissons pleines.
- Inventaire des bouteilles vides.
- Inventaire des supports.
- Inventaire des packs jetables.
- Ajustements justifiés.
- Historique des écarts.

Toute correction doit être tracée.

---

# PARTIE 12 — VENTES ET FACTURATION

## 12.1 Types de ventes

- Vente au détail.
- Vente en gros.
- Vente maquis.
- Vente à crédit.
- Vente comptant.
- Vente mixte.
- Commande standard.
- Commande mélangée.

## 12.2 Parcours de vente

1. Sélectionner le client.
2. Ajouter les produits.
3. Choisir les conditionnements.
4. Composer les casiers mélangés si nécessaire.
5. Saisir les quantités.
6. Enregistrer les emballages retournés.
7. Vérifier les emballages manquants.
8. Calculer le total.
9. Enregistrer le paiement.
10. Valider la vente.
11. Générer la facture.
12. Mettre à jour les stocks.
13. Mettre à jour le compte emballages.
14. Mettre à jour la caisse ou le compte client.

## 12.3 Facture

La facture doit afficher :

- Numéro.
- Date.
- Client.
- Produits.
- Contenances.
- Quantités.
- Conditionnements.
- Composition des casiers mélangés.
- Prix unitaires.
- Montants.
- Paiements.
- Solde.
- Détail des emballages remis.
- Détail des emballages reçus.
- Emballages manquants.

Une facture doit permettre de comprendre exactement ce qui a été vendu et ce qui a été échangé physiquement.

## 12.4 Annulation et retour de vente

Ne jamais supprimer directement une vente validée.

Créer :

- Annulation justifiée.
- Avoir.
- Retour de marchandises.
- Régularisation d'emballages.

Chaque opération doit créer des mouvements inverses traçables.

---

# PARTIE 13 — CLIENTS, CRÉDITS ET DETTES

Chaque client doit avoir :

- Identité.
- Téléphone.
- Adresse.
- Type de client.
- Limite de crédit.
- Solde financier.
- Solde emballages.
- Historique des achats.
- Historique des paiements.
- Historique des retours.
- Historique des régularisations.

Ne jamais confondre :

- Dette financière.
- Dette de bouteilles.
- Dette de supports plastiques.

Créer trois soldes indépendants.

Les règlements financiers peuvent être :

- Espèces.
- Mobile Money.
- Virement.
- Chèque.
- Autres moyens configurables.

---

# PARTIE 14 — CAISSE ET TRÉSORERIE

Gérer :

- Ouverture de caisse.
- Clôture de caisse.
- Entrées.
- Sorties.
- Dépenses.
- Encaissements.
- Décaissements.
- Paiements fournisseurs.
- Paiements clients.
- Avances.
- Remboursements.
- Écarts de caisse.

Chaque mouvement doit avoir :

- Date.
- Type.
- Montant.
- Moyen de paiement.
- Utilisateur.
- Motif.
- Pièce justificative facultative.
- Référence à l'opération d'origine.

La liquidité disponible doit être calculée à partir des mouvements réels.

---

# PARTIE 15 — MODÈLE DE DONNÉES SQLITE

L'agent doit concevoir et implémenter un schéma relationnel normalisé, documenté et versionné.

Les tables ci-dessous constituent le périmètre fonctionnel cible. Tu peux adapter les noms et les relations si tu justifies techniquement les choix.

## 15.1 Référentiel

- `product_categories`
- `brands`
- `products`
- `product_variants`
- `bottle_profiles`
- `container_types`
- `crate_types`
- `crate_compatibility_groups`
- `product_packaging_options`
- `packaging_materials`
- `disposable_packaging_types`
- `units_of_measure`

## 15.2 Prix

- `suppliers`
- `supplier_product_prices`
- `customer_price_lists`
- `customer_price_list_items`
- `sale_price_history`
- `packaging_values`
- `price_history`

## 15.3 Clients et fournisseurs

- `customers`
- `suppliers`
- `customer_accounts`
- `supplier_accounts`
- `partner_packaging_accounts`

Si les fournisseurs et clients partagent des champs communs, utiliser une modélisation appropriée sans créer de doublons inutiles.

## 15.4 Ventes

- `sales`
- `sale_lines`
- `mixed_case_groups`
- `mixed_case_lines`
- `sale_payments`
- `sale_returns`
- `sale_return_lines`
- `invoices`

## 15.5 Achats

- `purchase_orders`
- `purchase_order_lines`
- `purchase_receipts`
- `purchase_receipt_lines`
- `supplier_payments`
- `supplier_returns`
- `supplier_return_lines`

## 15.6 Emballages

- `packaging_operations`
- `packaging_operation_lines`
- `partner_packaging_ledger`
- `packaging_balances`
- `packaging_adjustments`
- `packaging_damage_reports`

Les mouvements du compte emballages doivent être historisés et non écrasés.

## 15.7 Stocks

- `inventory`
- `inventory_movements`
- `stock_adjustments`
- `stocktakes`
- `stocktake_lines`
- `stock_reservations`

## 15.8 Caisse

- `cash_registers`
- `cash_sessions`
- `cash_movements`
- `expenses`
- `payment_methods`

## 15.9 Système

- `users`
- `roles`
- `permissions`
- `user_roles`
- `audit_logs`
- `settings`
- `schema_migrations`
- `idempotency_keys`
- `backups`

## 15.10 Règles de conception

- Clés primaires stables.
- Clés étrangères.
- Contraintes CHECK.
- Index adaptés.
- Transactions SQL.
- Historique des opérations.
- Horodatages cohérents.
- Soft delete pour les données référentielles utilisées.
- Montants stockés en entiers FCFA.
- Quantités fractionnaires représentées en unités entières minimales, par exemple milli-unités lorsque nécessaire.
- Aucun flottant pour les montants financiers.

Pour les lignes de casier, stocker explicitement :

- Le groupe de casier.
- Le produit.
- Le profil de bouteille.
- La quantité.
- Le conditionnement.
- Le prix unitaire figé.

Pour les mouvements d'emballage, stocker explicitement :

- Le partenaire.
- Le type d'emballage.
- Le profil de bouteille.
- Le sens du mouvement.
- La quantité.
- L'opération source.
- L'utilisateur.
- La date.
- Le statut.

Un mouvement doit être compréhensible sans dépendre de l'état actuel du catalogue.

---

# PARTIE 16 — RÈGLES MÉTIER ET INTÉGRITÉ

Toutes les règles métier doivent être centralisées dans Rust.

## 16.1 Validation des casiers

- Quantité entière obligatoire.
- Capacité non dépassée.
- Compatibilité validée.
- Produit actif.
- Conditionnement valide.
- Aucun mélange interdit.
- Aucune bouteille incompatible.

## 16.2 Validation des retours

- Ne pas accepter un retour supérieur à la dette existante sans enregistrer un crédit d'emballage explicite.
- Distinguer supports et bouteilles.
- Distinguer les profils de bouteilles.
- Distinguer les clients et fournisseurs.
- Ne jamais régulariser automatiquement une opération contestée.
- Conserver les opérations d'origine.

## 16.3 Validation des ventes

- Vérifier le stock.
- Vérifier les prix.
- Vérifier les quantités.
- Vérifier les emballages.
- Calculer les montants exactement.
- Mettre à jour les données dans une seule transaction cohérente.

## 16.4 Idempotence

Les commandes sensibles doivent accepter une clé d'idempotence.

Une requête rejouée ne doit jamais :

- Créer deux ventes.
- Décrémenter deux fois le stock.
- Enregistrer deux fois un paiement.
- Doubler un retour d'emballages.

## 16.5 Transactions

Toute opération commerciale doit être atomique.

Exemple de validation d'une vente :

1. Vérifier les produits.
2. Vérifier les stocks.
3. Vérifier les prix.
4. Vérifier les groupes de casiers.
5. Vérifier les retours d'emballages.
6. Créer la vente.
7. Créer les lignes.
8. Créer les mouvements de stock.
9. Créer les mouvements d'emballage.
10. Créer les paiements.
11. Mettre à jour les soldes.
12. Valider la transaction.

Si une étape échoue, toute l'opération doit être annulée.

Utiliser des transactions SQLite adaptées aux écritures concurrentes et tester les conflits `SQLITE_BUSY`.

---

# PARTIE 17 — INTERFACE UTILISATEUR ET EXPÉRIENCE

## 17.1 Direction artistique

Conserver une direction artistique premium :

- Interface professionnelle.
- Moderne.
- Sobre.
- Élégante.
- Rapide.
- Lisible.
- Adaptée à une utilisation quotidienne intensive.

Prévoir :

- Thème clair.
- Thème sombre.
- Navigation latérale.
- Tableaux professionnels.
- Modales.
- Formulaires progressifs.
- Notifications.
- États de chargement.
- États vides.
- Messages d'erreur compréhensibles.
- Animations fluides et discrètes.

Ne pas sacrifier la rapidité d'utilisation au profit d'animations décoratives.

## 17.2 Écrans à mettre à jour ou créer

1. Connexion.
2. Tableau de bord.
3. Ventes.
4. Nouvelle vente.
5. Composition de casier mélangé.
6. Historique des ventes.
7. Détail facture.
8. Clients.
9. Fiche client.
10. Compte emballages client.
11. Fournisseurs.
12. Fiche fournisseur.
13. Compte emballages fournisseur.
14. Commandes fournisseurs.
15. Réception des achats.
16. Retours fournisseurs.
17. Catalogue produits.
18. Configuration des casiers.
19. Compatibilités.
20. Stock boissons pleines.
21. Stock bouteilles vides.
22. Stock supports plastiques.
23. Stock jetable.
24. Inventaires.
25. Caisse.
26. Dépenses.
27. Dettes clients.
28. Dettes fournisseurs.
29. Rapports.
30. Sauvegardes.
31. Utilisateurs et rôles.
32. Paramètres généraux.

## 17.3 Tableau de bord

Afficher :

- Chiffre d'affaires du jour.
- Nombre de ventes.
- Achats.
- Encaissements.
- Décaissements.
- Solde de caisse.
- Créances clients.
- Dettes fournisseurs.
- Valeur des stocks.
- Emballages dus par les clients.
- Emballages dus aux fournisseurs.
- Alertes de stock.
- Dernières opérations.

Les indicateurs doivent provenir de données réelles.

---

# PARTIE 18 — RAPPORTS ET ANALYSES

Créer les rapports suivants :

- Ventes par jour.
- Ventes par période.
- Ventes par produit.
- Ventes par catégorie.
- Ventes par client.
- Marge commerciale.
- Achats par fournisseur.
- Dettes clients.
- Dettes fournisseurs.
- Situation de caisse.
- État des stocks.
- État des bouteilles vides.
- État des supports plastiques.
- Emballages dus par client.
- Emballages dus par fournisseur.
- Retours partiels.
- Écarts d'inventaire.
- Produits les plus vendus.
- Produits à faible rotation.

Prévoir les filtres :

- Date.
- Client.
- Fournisseur.
- Produit.
- Catégorie.
- Type de casier.
- Utilisateur.

Exporter en PDF, Excel ou CSV selon le rapport.

---

# PARTIE 19 — SÉCURITÉ ET SAUVEGARDES

## 19.1 Authentification

Prévoir :

- Connexion sécurisée.
- PIN ou mot de passe selon la configuration.
- Hachage sécurisé.
- Expiration des sessions.
- Limitation des tentatives.
- Déconnexion.
- Journalisation.

## 19.2 Rôles

Préparer les rôles :

- Propriétaire.
- Administrateur.
- Responsable.
- Caissier.
- Gestionnaire de stock.
- Comptable.

Les permissions doivent être contrôlées côté Rust, et non uniquement masquées dans React.

## 19.3 Journal d'audit

Enregistrer :

- Créations.
- Modifications.
- Annulations.
- Paiements.
- Retours.
- Ajustements de stock.
- Changements de prix.
- Changements de compatibilité.
- Opérations d'administration.

## 19.4 Sauvegardes

Prévoir :

- Sauvegarde manuelle.
- Sauvegarde automatique.
- Restauration.
- Vérification d'intégrité.
- Historique.
- Export externe.

La vérification d'une sauvegarde doit être effectuée en lecture seule.

La restauration doit utiliser un fichier temporaire vérifié puis un remplacement contrôlé.

Ne jamais modifier une sauvegarde pendant sa simple vérification.

Protéger les fichiers contre les chemins malveillants et les liens symboliques.

Préserver les données existantes.

## 19.5 Protection des données

Étudier une solution de chiffrement des bases et sauvegardes compatible avec la stack Rust retenue.

Ne pas activer un nouveau mécanisme de chiffrement sans procédure de migration, de récupération et de tests de compatibilité.

---

# PARTIE 20 — MIGRATIONS ET COMPATIBILITÉ DES DONNÉES

Le projet possède déjà une base de données et des migrations.

Tu dois :

- Étudier les migrations existantes.
- Préserver les données.
- Créer de nouvelles migrations versionnées.
- Ne jamais réécrire une migration déjà déployée.
- Prévoir les mises à niveau des anciennes bases.
- Vérifier les contraintes et index.
- Vérifier la compatibilité entre les anciennes et nouvelles versions.

Avant toute migration :

1. Faire une sauvegarde.
2. Vérifier la sauvegarde.
3. Exécuter la migration sur une copie.
4. Vérifier les données.
5. Exécuter les tests.
6. Documenter le résultat.

Les données de démonstration doivent être facultatives.

La première installation doit proposer une configuration initiale neutre :

- Nom du dépôt.
- Coordonnées.
- Devise.
- Paramètres commerciaux.
- Création du premier propriétaire.

Ne pas préremplir une fausse entreprise ou de faux stocks en production.

---

# PARTIE 21 — PLAN D'EXÉCUTION PAR LOTS

Tu dois exécuter le projet dans l'ordre suivant.

Ne saute aucun lot.

Chaque lot doit produire :

- Une liste de fichiers modifiés.
- Une explication des changements.
- Les tests exécutés.
- Les résultats réels.
- Les éventuelles limites.
- Un commit Git distinct.

## LOT 0 — Audit et préparation

- Lire le dépôt intégralement.
- Vérifier l'architecture.
- Identifier les responsabilités Node.js.
- Identifier les responsabilités Rust.
- Analyser les migrations.
- Analyser les écrans.
- Établir les tests de référence.
- Créer une branche de travail.

Livrable : `docs/IMPLEMENTATION_BASELINE.md`.

## LOT 1 — Architecture Rust unique

- Migrer toutes les responsabilités métier Node.js.
- Compléter les endpoints Axum.
- Faire utiliser `depotpro-core` par Axum et Tauri.
- Adapter les clients API React.
- Séparer le serveur Axum du démarrage Vite.
- Supprimer les anciens services Node.js après vérification.
- Nettoyer les dépendances inutilisées.

Tests :

- Tous les endpoints.
- Toutes les fonctionnalités métier.
- Démarrage web.
- Démarrage desktop.
- Persistance SQLite.
- Aucun serveur Node.js métier lancé.

Livrable : `docs/LOT_01_RUST_ONLY.md`.

## LOT 2 — Modèle de données catalogue

- Créer les catégories.
- Créer les marques.
- Créer les produits.
- Créer les variantes.
- Créer les profils de bouteilles.
- Créer les types de casiers.
- Créer les compatibilités.
- Créer les conditionnements jetables.
- Créer les tarifs.

Tests :

- Création.
- Modification.
- Archivage.
- Compatibilité.
- Import.
- Historisation des prix.

Livrable : `docs/LOT_02_CATALOGUE.md`.

## LOT 3 — Gestion des emballages

- Séparer supports plastiques et bouteilles.
- Créer les mouvements.
- Créer les comptes emballages clients.
- Créer les comptes emballages fournisseurs.
- Gérer les retours complets et partiels.
- Gérer les régularisations.
- Gérer les emballages endommagés.

Tests :

- Retour complet.
- Retour incomplet.
- Retour ultérieur.
- Support sans bouteilles.
- Bouteilles sans support.
- Retour fournisseur.
- Aucun mélange de soldes incompatibles.

Livrable : `docs/LOT_03_PACKAGING.md`.

## LOT 4 — Commandes mélangées

- Créer les groupes de casiers.
- Créer les lignes de composition.
- Vérifier les compatibilités.
- Calculer les capacités.
- Autoriser les demi-casiers.
- Autoriser les casiers partiels.
- Bloquer les dépassements.
- Conserver la composition historique.

Tests :

- B24-33 à 12 bouteilles.
- B12-50 à 6 bouteilles.
- Deux formats différents dans deux groupes.
- Deux marques compatibles dans un même groupe.
- Trois références dans un même groupe.
- Retour partiel.
- Produit incompatible refusé.
- Casier plein.
- Casier partiel.

Livrable : `docs/LOT_04_MIXED_CASES.md`.

## LOT 5 — Achats et fournisseurs

- Commandes fournisseurs.
- Réceptions.
- Retours d'emballages.
- Comptes fournisseurs.
- Prix d'achat.
- Paiements.
- Historique.

Tests :

- Achat complet.
- Réception partielle.
- Retour de 20 casiers.
- Retour fournisseur incomplet.
- Régularisation.
- Dette fournisseur.

Livrable : `docs/LOT_05_SUPPLIERS.md`.

## LOT 6 — Tarifs, liquidité et caisse

- Grilles tarifaires.
- Prix historiques.
- Valeur des emballages.
- Liquidité nécessaire.
- Paiements.
- Dépenses.
- Clôture de caisse.

Tests :

- Calcul du prix.
- Calcul de la liquidité.
- Paiement partiel.
- Paiement fournisseur.
- Absence de double comptabilisation.
- Exactitude FCFA.

Livrable : `docs/LOT_06_FINANCE.md`.

## LOT 7 — Ventes et facturation

- Ventes standard.
- Ventes mélangées.
- Ventes à crédit.
- Retours.
- Factures.
- Paiements.
- Mouvements de stock.
- Mouvements d'emballages.

Tests :

- Vente complète.
- Vente partielle.
- Vente à crédit.
- Vente avec retour complet.
- Vente avec retour incomplet.
- Annulation.
- Rejeu idempotent.
- Cohérence de la facture.

Livrable : `docs/LOT_07_SALES.md`.

## LOT 8 — Stock et inventaires

- Stocks pleins.
- Stocks vides.
- Supports plastiques.
- Jetables.
- Inventaires.
- Ajustements.
- Alertes.

Tests :

- Entrées.
- Sorties.
- Retours.
- Casse.
- Ajustements.
- Inventaires.
- Absence de stock négatif non autorisé.

Livrable : `docs/LOT_08_INVENTORY.md`.

## LOT 9 — Interfaces utilisateur

- Mettre à jour le catalogue.
- Créer le formulaire simple de produit.
- Créer l'interface de composition mélangée.
- Créer le compte emballages client.
- Créer le compte emballages fournisseur.
- Mettre à jour les achats.
- Mettre à jour les ventes.
- Mettre à jour les factures.
- Mettre à jour les rapports.

Préserver le design existant lorsqu'il est de qualité.

Tests :

- Tous les parcours utilisateur.
- Validation des formulaires.
- Responsive.
- Thème clair et sombre.
- Accessibilité.
- Absence d'erreurs console.

Livrable : `docs/LOT_09_UI.md`.

## LOT 10 — Sécurité, sauvegarde et migrations

- Contrôler les autorisations.
- Expiration des sessions.
- Journal d'audit.
- Sauvegardes.
- Restauration.
- Migrations anciennes bases.
- Protection des fichiers.

Tests :

- Permissions.
- Connexion.
- Tentatives incorrectes.
- Sauvegarde.
- Restauration.
- Migration.
- Intégrité SQLite.

Livrable : `docs/LOT_10_SECURITY.md`.

## LOT 11 — CI, tests et production

- Corriger Cargo fmt.
- Corriger Clippy.
- Corriger les tests Rust.
- Corriger Playwright.
- Configurer la compilation Tauri.
- Vérifier Windows.
- Vérifier macOS.
- Vérifier la compilation web.
- Vérifier les dépendances.
- Tester une installation neuve.

Livrable : `docs/LOT_11_RELEASE.md`.

## LOT 12 — Validation métier finale

Exécuter un scénario complet :

1. Créer un fournisseur.
2. Configurer ses produits.
3. Créer les types de casiers.
4. Définir les compatibilités.
5. Enregistrer les tarifs.
6. Préparer une commande fournisseur.
7. Calculer la liquidité nécessaire.
8. Réceptionner les boissons.
9. Enregistrer les supports et bouteilles reçus.
10. Créer un client.
11. Lui vendre un casier B24-33.
12. Lui vendre un casier mélangé B12-50.
13. Enregistrer les emballages retournés.
14. Enregistrer un retour incomplet.
15. Vérifier le compte emballages.
16. Recevoir ultérieurement les emballages manquants.
17. Retourner 20 casiers au fournisseur.
18. Vérifier le compte fournisseur.
19. Vérifier le stock.
20. Vérifier la caisse.
21. Vérifier les factures.
22. Générer les rapports.
23. Sauvegarder et restaurer la base.

Livrable : `docs/FINAL_PRODUCTION_VALIDATION.md`.

---

# PARTIE 22 — SCÉNARIOS MÉTIER OBLIGATOIRES

Les tests suivants ne sont pas facultatifs.

### Scénario A — Demi-casier 33 cl

Commande :

- 12 Beaufort 33 cl.
- Emballage B24-33.

Résultat attendu :

- 12 bouteilles pleines sorties.
- 12 bouteilles vides compatibles attendues.
- Support enregistré séparément.
- Solde client exact.

### Scénario B — Demi-casier 50 cl

Commande :

- 6 bouteilles 50 cl.
- Emballage B12-50.

Résultat attendu :

- 6 bouteilles pleines sorties.
- 6 bouteilles vides attendues.
- Capacité respectée.

### Scénario C — Deux formats différents

Commande :

- 12 Beaufort 33 cl.
- 6 bières 50 cl.

Résultat attendu :

- Deux groupes distincts.
- Deux profils de bouteilles.
- Deux suivis de retours distincts.

### Scénario D — Deux produits compatibles

Commande :

- 6 Drogba 50 cl.
- 6 Beaufort 50 cl.

Résultat attendu :

- Un seul groupe B12-50 si compatibilité validée.
- Composition enregistrée.
- 12 bouteilles au total.
- Retour détaillé par référence.

### Scénario E — Retour incomplet

Commande :

- 6 Drogba.
- 6 Beaufort.

Retour :

- 6 Drogba.
- 4 Beaufort.

Résultat attendu :

- 2 bouteilles Beaufort dues.
- Aucune dette Drogba.
- Compte emballages exact.

### Scénario F — Retour ultérieur

Retour ultérieur :

- 2 Beaufort.

Résultat attendu :

- Dette ramenée à zéro.
- Historique conservé.

### Scénario G — Conditionnement jetable

Commande :

- 1 pack PET de 6.
- 1 carton de 24 canettes.

Résultat attendu :

- Sortie de stock.
- Aucun mouvement de casier réutilisable.
- Aucune dette de bouteilles en verre.

### Scénario H — Retour fournisseur

Le sous-dépôt retourne :

- 20 supports plastiques.
- Les bouteilles vides correspondantes.

Résultat attendu :

- Mouvement fournisseur créé.
- Quantités détaillées.
- Compte emballages fournisseur actualisé après validation.

### Scénario I — Prix et liquidité

Commande fournisseur :

- Boissons : 500 000 FCFA.
- Emballages facturés : 30 000 FCFA.
- Transport : 10 000 FCFA.
- Acompte : 100 000 FCFA.

Résultat attendu :

- Solde à financer : 440 000 FCFA.
- Aucune double comptabilisation.
- Historique du calcul.

---

# PARTIE 23 — EXIGENCES DE QUALITÉ DU CODE

Le code doit être :

- Modulaire.
- Typé.
- Testable.
- Documenté.
- Maintenable.
- Sécurisé.
- Prévisible.

Éviter :

- Les fichiers gigantesques.
- Les fonctions métier trop longues.
- Les duplications.
- Les conversions financières approximatives.
- Les nombres flottants pour les montants.
- Les transactions incomplètes.
- Les accès directs à la base depuis React.
- Les règles métier dans les composants UI.

Utiliser :

- Types métier Rust.
- Newtypes pour les montants et quantités lorsque pertinent.
- Validation centralisée.
- Erreurs métier explicites.
- Transactions.
- Tests unitaires.
- Tests d'intégration.
- Tests de non-régression.

Les calculs financiers doivent être exacts en FCFA.

Les calculs de quantités doivent utiliser des unités entières adaptées.

Toute opération doit être traçable.

---

# PARTIE 24 — RÈGLES DE CONDUITE DE L'AGENT IA

Tu dois respecter strictement les consignes suivantes :

1. Ne pas commencer par réécrire toute l'application.
2. Ne pas supprimer les anciens serveurs avant migration vérifiée.
3. Ne pas supprimer les anciennes migrations.
4. Ne jamais effacer une base utilisateur.
5. Ne jamais inventer un tarif fournisseur.
6. Ne jamais inventer une compatibilité physique.
7. Ne jamais considérer tous les formats de bouteilles comme interchangeables.
8. Ne jamais mélanger des emballages incompatibles.
9. Ne jamais confondre dette financière et dette d'emballage.
10. Ne jamais comptabiliser deux fois un emballage.
11. Ne jamais créer de dette d'emballage pour un pack jetable.
12. Ne jamais modifier une ancienne facture à la suite d'un changement de prix.
13. Ne jamais valider une opération si une étape métier a échoué.
14. Ne jamais masquer une erreur de test.
15. Ne jamais annoncer un test comme réussi s'il n'a pas été exécuté.
16. Ne pas utiliser de fausses données en production.
17. Ne pas remplacer une fonctionnalité existante sans justification.
18. Ne pas modifier arbitrairement la direction artistique.
19. Ne pas contourner les règles de sécurité.
20. Ne pas poursuivre le lot suivant si le lot courant n'est pas validé.

À chaque lot, fournir :

- Le rapport.
- Les fichiers modifiés.
- Les migrations créées.
- Les tests exécutés.
- Les résultats exacts.
- Le commit Git.
- Les éventuelles réserves.

Si un point métier est ambigu, documenter l'ambiguïté et proposer une configuration plutôt que d'inventer une règle.

---

# PARTIE 25 — CRITÈRES FINAUX DE VALIDATION

DEPOTPRO PREMIUM V3 sera considéré comme prêt lorsque :

- Rust est le seul serveur métier.
- Le backend Axum est opérationnel.
- Tauri utilise le même cœur métier.
- SQLite fonctionne correctement.
- Les données existantes sont préservées.
- Le catalogue est configurable.
- Les formats sont correctement représentés.
- Les casiers sont paramétrables.
- Les compatibilités physiques sont contrôlées.
- Les commandes mélangées fonctionnent.
- Les demi-casiers fonctionnent.
- Les retours partiels fonctionnent.
- Les comptes emballages clients fonctionnent.
- Les comptes emballages fournisseurs fonctionnent.
- Les emballages jetables sont correctement distingués.
- Les prix fournisseurs et clients sont historisés.
- La liquidité est correctement calculée.
- Les stocks sont cohérents.
- Les factures sont exactes.
- Les ventes à crédit fonctionnent.
- Les paiements fonctionnent.
- Les sauvegardes et restaurations fonctionnent.
- Les permissions sont vérifiées côté Rust.
- Les tests Rust passent.
- Les tests frontend passent.
- Les tests E2E passent.
- Les builds Windows et macOS sont vérifiés.
- La documentation est à jour.

---

# INSTRUCTION FINALE À L'AGENT

Tu dois transformer le dépôt existant en DEPOTPRO PREMIUM V3 en respectant intégralement ce cahier des charges.

Commence par l'audit technique et métier du dépôt.

Ensuite, exécute les lots dans l'ordre, sans sauter de validation.

Privilégie toujours la fiabilité des données, la cohérence des stocks, la précision financière et la traçabilité des emballages.

**Le cœur du projet est désormais la gestion simultanée des boissons pleines, des bouteilles vides, des supports plastiques et des emballages jetables, avec la possibilité de composer des casiers mélangés selon leur compatibilité physique.**

Ne traite pas les casiers comme de simples unités de vente.

Un casier est un ensemble physique composé d'un support et de bouteilles, et chaque élément doit être suivi avec précision.

Le logiciel doit représenter fidèlement le fonctionnement réel d'un sous-dépôt ivoirien, tout en restant configurable pour les différences entre fournisseurs, marques, régions et pratiques commerciales.

**Commence par le LOT 0. Ne modifie aucune donnée de production avant d'avoir établi et vérifié une sauvegarde.**

## \*\*
