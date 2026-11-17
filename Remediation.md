Voici le plan de remédiation que tu peux transmettre directement à un agent de développement IA. Il est organisé en lots ordonnés, avec les fichiers concernés, les corrections attendues, les tests et les conditions de validation.

Il prévoit de **corriger l'application existante sans la reconstruire**, de conserver React + TypeScript + Rust + SQLite + Tauri, et de traiter en priorité les risques financiers, les stocks et l'intégrité des données.

Plan de développement prêt à transmettre

# DEPOTPRO PREMIUM V3

# MASTER PLAN — AUDIT REMEDIATION & PRODUCTION HARDENING

**Projet :** DEPOTPRO PREMIUM V3\
**Dépôt :** [https://github.com/koffidominique/ss_depot_rust.git](https://github.com/koffidominique/ss_depot_rust.git)\
**Branche de référence :** main\
**Commit de référence audité :** c7c7db433e56ec8a732b49b43501ec34b278c4a5

**Stack à conserver :**

- React 19
- TypeScript
- Tailwind CSS
- Node.js / Express
- Rust
- Axum
- Tauri 2
- SQLite
- SQLx

**Objectif :** corriger les problèmes détectés pendant l'audit approfondi, fiabiliser toutes les opérations commerciales et financières, renforcer la sécurité, harmoniser les moteurs Node.js et Rust, puis produire des versions Desktop fiables pour Windows et macOS.

---

# PARTIE 1 — INSTRUCTIONS GÉNÉRALES À L'AGENT IA

## 1.1. Mission

Tu interviens comme un ingénieur logiciel senior spécialisé dans :

- Les applications ERP et POS.
- Les systèmes de gestion commerciale.
- La comptabilité et les opérations financières.
- Rust et les architectures applicatives.
- SQLite et les bases locales.
- React et TypeScript.
- Node.js et Express.
- Axum et Tauri.
- Les applications Desktop Windows et macOS.
- Les tests automatisés et l'intégration continue.

Ta mission est de corriger le dépôt DEPOTPRO PREMIUM V3, lot par lot, en respectant strictement les présentes instructions.

Tu ne dois pas simplement améliorer le code visuellement. Tu dois éliminer les problèmes de fiabilité, de cohérence métier, de sécurité, de persistance et de compilation.

Le résultat final doit être une application professionnelle capable de gérer réellement les activités d'un dépôt de boissons.

## 1.2. Règles non négociables

1. Examiner le code source réel avant de modifier un fichier.
2. Ne jamais considérer la documentation comme une preuve que l'implémentation est correcte.
3. Ne jamais remplacer une implémentation fonctionnelle sans raison technique démontrée.
4. Ne pas supprimer une fonctionnalité existante.
5. Ne pas modifier les contrats API sans vérifier les deux clients API et les interfaces associées.
6. Ne pas introduire de calcul financier en nombres flottants.
7. Ne jamais appliquer une migration destructive sans sauvegarde vérifiée.
8. Ne jamais perdre l'historique des ventes, achats, paiements, créances ou mouvements de stock.
9. Ne jamais contourner un test qui échoue simplement pour obtenir une CI verte.
10. Ne jamais désactiver une contrainte SQLite pour résoudre provisoirement un problème métier.
11. Ne jamais remplacer une erreur métier par une réussite artificielle.
12. Ne jamais utiliser de données fictives en production.
13. Ne pas mélanger les responsabilités de React, du cœur métier et de l'infrastructure.
14. Ne pas dupliquer de nouvelles règles métier entre Node.js et Rust.
15. Ne pas déclarer un lot terminé tant que ses tests obligatoires ne passent pas.

Toute modification doit être compatible avec l'architecture actuelle, sauf décision d'architecture explicitement justifiée.

## 1.3. Méthode de travail obligatoire

Tu dois travailler dans cet ordre :

1. Lire le dépôt et comprendre l'implémentation actuelle.
2. Identifier précisément les fichiers concernés.
3. Examiner les appels entrants et sortants des fonctions à modifier.
4. Identifier les effets sur la base de données et les API.
5. Concevoir la correction.
6. Implémenter la correction.
7. Écrire les tests de régression.
8. Exécuter les tests.
9. Vérifier qu'aucune fonctionnalité existante n'a régressé.
10. Documenter les modifications.
11. Passer au lot suivant uniquement après validation.

Chaque lot doit être indépendant autant que possible.

Ne pas effectuer plusieurs grands refactorings simultanément. Il faut pouvoir identifier précisément la cause de toute régression.

## 1.4. Gestion Git obligatoire

Avant les modifications :

- Vérifier la branche courante.
- Vérifier le commit.
- Vérifier que le répertoire de travail est propre.
- Identifier les fichiers locaux non suivis.
- Identifier les bases SQLite existantes.
- Identifier les données de démonstration.
- Vérifier que les fichiers utilisateur ne seront pas écrasés.

Créer une branche de travail dédiée :

`fix/depotpro-audit-remediation`

Ne jamais effectuer directement les corrections sur une branche de production.

Créer un commit Git à la fin de chaque lot validé.

Format recommandé :

- `fix(sales): prevent duplicate return lines`
- `fix(purchases): prevent duplicate receipt lines`
- `fix(finance): enforce exact financial calculations`
- `fix(database): implement safe write transactions`
- `feat(database): introduce versioned migrations`
- `fix(backups): make backup verification read-only`
- `fix(security): enforce session expiration`
- `fix(ci): repair Tauri desktop builds`
- `refactor(ui): modularize sales and inventory screens`

Ne jamais forcer un push.

## 1.5. Gestion des données existantes

La base de données peut contenir des données commerciales importantes.

Par conséquent :

- Ne jamais supprimer une base existante pour faire passer les tests.
- Utiliser des bases temporaires pour les tests.
- Ne jamais appliquer directement une migration expérimentale sur une base commerciale.
- Toujours conserver une sauvegarde vérifiée avant une migration réelle.
- Vérifier la compatibilité des anciennes bases.
- Vérifier la restauration avant de modifier le système de sauvegarde.

---

# PARTIE 2 — ORDRE GLOBAL DES LOTS

Respecter exactement l'ordre suivant.

| Ordre | Lot                                | Priorité | Objectif                             |
| ----- | ---------------------------------- | -------- | ------------------------------------ |
| 0     | Préparation et référence technique | P0       | Sécuriser le travail                 |
| 1     | Intégrité des ventes et achats     | P0       | Corriger les doublons de lignes      |
| 2     | Calculs financiers et POS          | P0       | Garantir les montants exacts         |
| 3     | Transactions SQLite                | P0       | Garantir la cohérence concurrente    |
| 4     | Migrations et initialisation       | P0       | Stabiliser la structure de la base   |
| 5     | Sauvegardes et restauration        | P0       | Fiabiliser la protection des données |
| 6     | Sécurité et authentification       | P1       | Sécuriser les sessions et les accès  |
| 7     | CI/CD et compilation Desktop       | P0       | Réparer les builds Windows/macOS     |
| 8     | Interface React et 17 écrans       | P1       | Modulariser sans régression          |
| 9     | Contrats et parité Node/Rust       | P1       | Uniformiser les règles métier        |
| 10    | Validation finale et livraison     | P0       | Autoriser la production              |

Un lot P0 ne peut pas être considéré comme terminé avec un test non exécuté ou un résultat inconnu.

---

# LOT 0 — PRÉPARATION ET ÉTABLISSEMENT DE LA RÉFÉRENCE

## Objectif

Sécuriser l'environnement de travail et établir un état de référence avant toute correction.

## Fichiers à examiner

- `README.md`
- `package.json`
- `package-lock.json`
- `Cargo.toml`
- `crates/depotpro-core/Cargo.toml`
- `crates/depotpro-server/Cargo.toml`
- `src-tauri/Cargo.toml`
- `.github/workflows/ci.yml`
- `.gitignore`
- `migrations/sqlite/0001_initial_v3.sql`

## Instructions

1. Examiner les dépendances et leurs versions.
2. Vérifier les versions de Node.js, npm, Rust, Cargo et Tauri.
3. Confirmer l'organisation réelle du workspace.
4. Identifier les commandes disponibles.
5. Examiner les tests existants.
6. Identifier les fichiers SQLite versionnés.
7. Identifier les éventuels fichiers de données sensibles.
8. Vérifier les dernières exécutions GitHub Actions.

Ne pas lancer une migration sur les données réelles.

## Tests de référence

Exécuter indépendamment :

```
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run benchmark
```

Puis :

```
cargo fmt --all -- --check
cargo test -p depotpro-core
cargo test -p depotpro-server
cargo clippy -p depotpro-core -p depotpro-server --all-targets -- -D warnings
```

Ces commandes doivent être exécutées séparément afin de connaître les vrais résultats, même si une étape précédente échoue.

## Livrable

Créer un rapport :

`docs/REMEDIATION_BASELINE.md`

Le rapport doit indiquer :

- Le commit testé.
- Les commandes exécutées.
- Les résultats obtenus.
- Les tests échoués.
- Les tests non exécutés.
- Les versions des outils.
- Les problèmes déjà présents avant les corrections.

## Validation du lot

Ne pas commencer les corrections tant que l'environnement et les résultats initiaux ne sont pas clairement identifiés.

---

# LOT 1 — CORRECTION CRITIQUE DES VENTES ET DES RÉCEPTIONS D'ACHATS

**Priorité : P0 — Bloquant métier**

Ce lot corrige deux anomalies pouvant produire des incohérences de stock et de valeur.

## 1.1. Retours de vente : empêcher les doublons de lignes

### Fichiers concernés

- `crates/depotpro-core/src/application/sales.rs`
- `server/services/sales.ts`
- `src/pages/SalesHistoryPage.tsx`
- `src/services/api/ApiClient.ts`
- Tests de ventes Node et Rust.

### Problème identifié

Une même ligne de vente peut apparaître plusieurs fois dans une requête de retour.

Chaque occurrence est actuellement vérifiée individuellement à partir de la quantité déjà retournée dans la base.

Les lignes de la requête courante ne sont pas toutes prises en compte lors de cette vérification.

Cela permet potentiellement de retourner davantage que la quantité réellement vendue.

### Correction obligatoire

Avant d'enregistrer un retour :

1. Parcourir toutes les lignes reçues.
2. Identifier les occurrences répétées du même `sale_line_id`.
3. Normaliser les lignes.
4. Rejeter les identifiants dupliqués ou les regrouper de manière déterministe.
5. Calculer la quantité totale demandée.
6. Charger la quantité initialement vendue.
7. Charger la quantité déjà retournée.
8. Vérifier le solde encore retournable.
9. Vérifier la cohérence financière.
10. Exécuter les mouvements, remboursements, réductions de créance et insertions dans une transaction atomique.

Comportement recommandé pour cette version : rejeter explicitement les lignes dupliquées dans une même requête avec un message métier compréhensible.

Une requête contenant une seule ligne consolidée reste autorisée.

### Invariants obligatoires

Pour chaque ligne de vente :

`Quantité déjà retournée + Quantité du nouveau retour <= Quantité vendue`

Pour une vente :

`Total des montants retournés = Montant remboursé + Réduction de créance`, sous réserve des règles de remboursement et des montants effectivement attribués.

Aucun mouvement ne doit être enregistré si la validation échoue.

### Tests obligatoires

- Retour normal d'une partie d'une ligne.
- Retour du solde restant.
- Tentative de retour supérieur au solde.
- Deux occurrences du même `sale_line_id`.
- Plusieurs lignes différentes dans le même retour.
- Retour d'une ligne déjà complètement retournée.
- Retour d'une vente annulée.
- Rejeu d'une requête avec la même `request_key`.
- Erreur en cours de traitement : aucune modification partielle de la base.

Répéter les tests dans Node et Rust.

## 1.2. Réceptions d'achat : empêcher les dépassements de quantités

### Fichiers concernés

- `crates/depotpro-core/src/application/purchases.rs`
- `server/services/purchases.ts`
- `src/pages/PurchasesPage.tsx`
- Tests d'approvisionnement.

### Problème identifié

Une même ligne de commande peut être répétée dans une requête de réception.

Chaque occurrence vérifie l'ancien reliquat sans prendre en compte les autres occurrences de la même requête.

Le cumul peut ainsi dépasser la quantité commandée.

### Correction obligatoire

Avant l'enregistrement :

1. Vérifier l'existence du bon de commande.
2. Vérifier son état.
3. Normaliser les lignes de réception.
4. Détecter les `purchase_order_line_id` répétés.
5. Rejeter les doublons ou les regrouper explicitement.
6. Vérifier la quantité cumulée.
7. Vérifier la conversion vers l'unité de base.
8. Vérifier le montant de chaque ligne.
9. Enregistrer les réceptions.
10. Mettre à jour le stock et le coût moyen.
11. Mettre à jour la dette fournisseur.
12. Mettre à jour le statut de la commande.
13. Valider la transaction.

Ajouter une mise à jour conditionnelle de la quantité reçue pour protéger également les invariants au niveau de la base.

### Invariant obligatoire

`Quantité reçue cumulée <= Quantité commandée`

### Tests obligatoires

- Réception totale.
- Réception partielle.
- Plusieurs réceptions partielles successives.
- Quantité supérieure au reliquat.
- Ligne répétée dans une même demande.
- Deux requêtes de réception concurrentes.
- Rejeu avec la même clé d'idempotence.
- Vérification du stock après réception.
- Vérification du coût moyen.
- Vérification de la dette fournisseur.
- Échec transactionnel sans effet partiel.

## 1.3. Validation générale du lot

Pour les deux moteurs :

- Même entrée valide = même résultat métier.
- Même entrée invalide = rejet cohérent.
- Aucune duplication de mouvement.
- Aucune modification partielle après échec.
- Idempotence préservée.

## Livrable

`docs/REMEDIATION_LOT_01.md`

Le rapport doit présenter les fichiers modifiés et les résultats de chaque test.

---

# LOT 2 — CALCULS FINANCIERS EXACTS ET FIABILISATION DU POS

**Priorité : P0**

## Objectif

Faire respecter les mêmes règles de calcul dans Rust, Node.js et React.

Aucun écart ne doit exister entre le montant affiché, le montant transmis et le montant enregistré.

## Fichiers concernés

### Rust

- `crates/depotpro-core/src/domain/money.rs`
- `crates/depotpro-core/src/domain/quantity.rs`
- `crates/depotpro-core/src/application/sales.rs`
- `crates/depotpro-core/src/application/cash.rs`
- `crates/depotpro-core/src/application/purchases.rs`
- `crates/depotpro-core/src/application/consignments.rs`
- `crates/depotpro-core/src/application/inventory.rs`

### Node.js

- `server/domain.ts`
- `server/services/sales.ts`
- `server/services/purchases.ts`
- `server/services/cash.ts`
- `server/services/consignments.ts`
- `server/services/inventory.ts`

### Frontend

- `src/pages/SalesPage.tsx`
- `src/pages/CashPage.tsx`
- `src/pages/PurchasesPage.tsx`
- `src/pages/ConsignmentsPage.tsx`
- `src/utils/`
- `src/types/erp.ts`

## 2.1. Renforcement de Money

Conserver :

`Money(i64)`

Améliorer les opérations avec des fonctions explicites :

- Addition contrôlée.
- Soustraction contrôlée.
- Multiplication contrôlée.
- Vérification des valeurs non négatives.
- Vérification des montants strictement positifs.
- Conversion sûre vers les types sérialisables.

Utiliser `i128` pour les calculs intermédiaires qui impliquent des multiplications.

Ne jamais laisser un débordement numérique devenir silencieusement un résultat financier.

## 2.2. Renforcement de Quantity

Conserver la représentation en milli-unités.

Toutes les conversions doivent respecter :

- Trois décimales maximum.
- Aucun arrondi silencieux.
- Aucun nombre flottant dans le cœur métier.
- Coefficient de conditionnement exact.
- Conversion vers l'unité de base exacte.

Les quantités invalides doivent être rejetées avant les modifications du stock.

## 2.3. Calcul exact des ventes

Pour chaque ligne :

`Montant brut = Quantité en milli-unités × Prix unitaire / 1000`

Le résultat doit être entier et exact en FCFA.

Si une division produit une fraction de FCFA, rejeter la donnée selon la règle métier existante.

Vérifier également :

- Remises par ligne.
- Remise globale.
- Total marchandises.
- Total consignes.
- Total général.
- Paiements mixtes.
- Solde de crédit.
- Plafond de crédit.

## 2.4. Correction du POS React

### Problème identifié

`SalesPage.tsx` utilise `Number()`, `Math.round()` et des additions JavaScript pour calculer les totaux du panier.

Le backend, lui, impose des calculs exacts.

### Correction

Créer un module dédié :

`src/features/sales/utils/saleCalculations.ts`

Ce module doit :

- Parser les quantités.
- Convertir les quantités en milli-unités.
- Calculer les montants sans approximation.
- Calculer les consignes uniquement pour les quantités autorisées.
- Calculer les remises.
- Calculer le total.
- Calculer le montant payé.
- Calculer le restant.
- Signaler les valeurs invalides.

Employer `BigInt` pour les calculs entiers qui dépassent potentiellement les capacités sûres de `number`.

Le résultat final envoyé au backend doit respecter les types et les limites prévues par le contrat API.

Ne jamais laisser le frontend décider seul qu'une vente est valide.

Le backend reste l'autorité finale.

### Interface attendue

En cas de quantité ou de montant invalide :

- Afficher clairement l'erreur.
- Ne pas présenter un total approximatif comme total validé.
- Désactiver la validation de vente lorsque le panier est invalide.
- Conserver un message explicite.
- Ne pas vider le panier après un échec.

## 2.5. Caisse

Centraliser les calculs suivants :

- Fond initial.
- Entrées.
- Sorties.
- Encaissements espèces.
- Remboursements espèces.
- Règlements fournisseurs.
- Dépenses.
- Solde théorique.
- Solde physique.
- Écart de clôture.

Vérifier tous les calculs et les conversions.

Les totaux SQL doivent eux aussi être protégés contre les dépassements d'entiers.

## 2.6. Consignations

Contrôler notamment :

- Valeur des bouteilles.
- Valeur des casiers.
- Valeur des retours.
- Remboursement.
- Réduction de créance.
- Stock de vides.
- Solde d'emballages détenus par le client.

Utiliser des opérations arithmétiques contrôlées.

## Tests obligatoires

- Montant entier.
- Montant nul.
- Montant négatif.
- Dépassement de limite numérique.
- Quantité entière.
- Quantité fractionnaire autorisée.
- Quantité fractionnaire interdite.
- Quantité avec plus de trois décimales.
- Multiplication exacte.
- Multiplication non représentable.
- Remise égale au montant.
- Remise supérieure au montant.
- Paiement avec plusieurs moyens.
- Paiement insuffisant.
- Crédit avec plafond dépassé.
- Clôture de caisse avec écart.
- Remboursement avec espèces insuffisantes.
- Comparaison des calculs React, Rust et Node.

## Livrable

`docs/REMEDIATION_LOT_02.md`

---

# LOT 3 — TRANSACTIONS SQLITE ET CONCURRENCE

**Priorité : P0**

## Objectif

Garantir l'intégrité de la base lors des écritures concurrentes.

## Fichiers concernés

- `crates/depotpro-core/src/infrastructure/db.rs`
- `crates/depotpro-core/src/application/sales.rs`
- `crates/depotpro-core/src/application/purchases.rs`
- `crates/depotpro-core/src/application/cash.rs`
- `crates/depotpro-core/src/application/consignments.rs`
- `server/db.ts`

## 3.1. Problème identifié

Dans le moteur Rust, `begin_write()` utilise `self.pool.begin()` alors que la stratégie annoncée prévoit `BEGIN IMMEDIATE`.

Le mutex Rust ne protège que les opérations qui partagent la même instance applicative.

Il ne constitue pas un verrou commun entre deux processus indépendants qui ouvrent le même fichier SQLite.

## 3.2. Correction attendue

Examiner la version réelle de SQLx et implémenter une transaction d'écriture qui réserve correctement le verrou SQLite au début de l'opération.

Ne pas envoyer un `BEGIN IMMEDIATE` sur une connexion et laisser ensuite SQLx gérer une transaction sur une autre connexion.

La solution doit garantir :

1. Une connexion unique pour toute la transaction.
2. Une acquisition correcte du verrou d'écriture.
3. Une libération garantie de la connexion.
4. Un commit explicite.
5. Un rollback fiable.
6. Une gestion des erreurs `SQLITE_BUSY`.
7. Une durée raisonnable des transactions.
8. Aucune opération externe longue pendant la transaction.

Si la version SQLx ne fournit pas directement le mécanisme attendu, créer une abstraction transactionnelle sûre et testable.

Conserver une interface de transaction suffisamment simple pour ne pas détériorer les services métier.

## 3.3. Cohérence avec Node.js

Le moteur Node utilise déjà :

`BEGIN IMMEDIATE`

dans `withWriteTx()`.

Conserver ce principe et vérifier son fonctionnement en cas de concurrence et d'erreur.

Ne pas laisser Node et Rust accéder simultanément à une même base sans protocole de coordination adapté.

## Tests obligatoires

- Deux ventes simultanées.
- Deux réceptions simultanées.
- Vente et paiement de créance simultanés.
- Vente et clôture de caisse simultanées.
- Deux mouvements de stock concurrents.
- Deux processus différents utilisant le même fichier SQLite.
- Blocage temporaire d'une connexion.
- Expiration du délai `busy_timeout`.
- Rollback après erreur.
- Vérification de `PRAGMA integrity_check`.
- Vérification des clés étrangères.

## Livrable

`docs/REMEDIATION_LOT_03.md`

---

# LOT 4 — MIGRATIONS VERSIONNÉES ET INITIALISATION DES DONNÉES

**Priorité : P0**

## Objectif

Mettre en place un système de migrations fiable, commun à Node et Rust.

## Fichiers concernés

- `migrations/sqlite/0001_initial_v3.sql`
- `crates/depotpro-core/src/infrastructure/db.rs`
- `server/db.ts`
- `docs/DATABASE.md`
- `docs/DATA_MIGRATION.md`

## 4.1. Système de migrations

Créer des migrations versionnées et séquentielles.

Exemple d'organisation :

```
migrations/
└── sqlite/
    ├── 0001_initial_v3.sql
    ├── 0002_expense_receipt_path.sql
    ├── 0003_security_improvements.sql
    └── 0004_future_schema_changes.sql
```

Ne pas modifier arbitrairement une migration déjà appliquée sur des bases existantes.

La migration initiale doit rester reproductible.

Les modifications futures doivent être réalisées dans de nouveaux fichiers.

## 4.2. Fonctionnement obligatoire

Au démarrage :

1. Ouvrir la base.
2. Vérifier la présence de `schema_version`.
3. Lire la dernière version appliquée.
4. Comparer les migrations disponibles.
5. Appliquer les migrations manquantes dans l'ordre.
6. Exécuter chaque migration de manière atomique.
7. Enregistrer la version après réussite.
8. Vérifier l'intégrité.
9. Initialiser uniquement les paramètres applicatifs nécessaires.

Les deux moteurs doivent avoir le même résultat de migration.

### Compatibilité avec les bases existantes

Certaines bases peuvent déjà posséder `logo_path` ou `receipt_path` sans disposer d'une entrée de migration correspondante.

Le mécanisme doit reconnaître ces colonnes et enregistrer proprement leur état sans les ajouter une seconde fois.

## 4.3. Séparation des données de démonstration

### Fichiers concernés

- `server/db.ts`
- `crates/depotpro-core/src/infrastructure/db.rs`
- `server/services/`
- Éventuellement `scripts/seed_demo.ts`

### Problème identifié

Node insère des catégories, produits, fournisseurs, stocks et emballages de démonstration au premier lancement.

Rust insère également des informations d'entreprise fictives dans `app_settings`.

Cela doit être séparé de l'initialisation de production.

### Correction

Créer trois responsabilités distinctes :

- Initialisation du schéma.
- Initialisation des paramètres neutres.
- Chargement facultatif des données de démonstration.

Les données de démonstration ne doivent être chargées que par une commande de développement explicite.

En production :

- Aucun fournisseur fictif.
- Aucun produit fictif.
- Aucun stock fictif.
- Aucun client fictif.
- Aucune adresse ou identité d'entreprise prédéfinie qui pourrait être utilisée par erreur.

Les moyens de paiement et catégories génériques peuvent être installés comme paramètres par défaut s'ils ne contiennent aucune donnée commerciale inventée.

Prévoir un assistant de première configuration.

## 4.4. Gestion des fichiers SQLite versionnés

### Fichiers concernés

- `.gitignore`
- Les éventuels fichiers suivis dans `data/`

Ajouter notamment :

```
data/
*.db
*.db-wal
*.db-shm
```

Avant de retirer des fichiers déjà suivis, vérifier qu'ils ne constituent pas des fixtures ou des ressources intentionnelles.

Ne jamais supprimer une base utilisateur.

## Tests obligatoires

- Base totalement vierge.
- Base V3 existante.
- Base avec colonne déjà présente.
- Base sans colonne requise.
- Migration interrompue.
- Migration rejouée.
- Migration partiellement appliquée.
- Migration Node.
- Migration Rust.
- Comparaison des deux schémas.
- Démarrage sans données fictives.
- Initialisation des paramètres par défaut.

## Livrable

`docs/REMEDIATION_LOT_04.md`

---

# LOT 5 — SAUVEGARDES, VÉRIFICATION ET RESTAURATION

**Priorité : P0**

## Objectif

Garantir que les données peuvent être sauvegardées, vérifiées et restaurées sans corruption ni modification silencieuse.

## Fichiers concernés

- `crates/depotpro-core/src/infrastructure/backup.rs`
- `server/services/reports.ts`
- `src/pages/BackupsPage.tsx`
- `src/services/api/ApiClient.ts`
- `src/services/api/HttpApiClient.ts`
- `src/services/api/TauriApiClient.ts`
- `docs/BACKUP_RESTORE.md`

## 5.1. Vérification en lecture seule

### Problème identifié

`verify_backup()` appelle `DepotDb::connect()`.

Cette fonction peut appliquer des migrations et des données par défaut.

La vérification risque donc de modifier le fichier vérifié.

### Correction

Créer une ouverture dédiée en lecture seule.

Exemple de responsabilité :

`open_backup_read_only()`

Cette fonction doit :

- Ne créer aucune table.
- Ne lancer aucune migration.
- Ne modifier aucun paramètre.
- Ne charger aucun seed.
- Ne modifier aucune donnée.
- Vérifier l'intégrité SQLite.
- Vérifier les clés étrangères.
- Vérifier la version du schéma.

## 5.2. Vérification de compatibilité

Une sauvegarde peut être intègre sans être compatible avec la version actuelle de l'application.

La restauration doit donc contrôler :

- L'intégrité physique.
- Les clés étrangères.
- La version du schéma.
- La compatibilité des migrations.
- Le format de sauvegarde.
- La version minimale de l'application si nécessaire.

Une sauvegarde incompatible ne doit pas être restaurée silencieusement.

## 5.3. Sécurisation des chemins

Vérifier que le nom de fichier correspond à une archive autorisée.

Vérifier également les chemins canoniques et les liens symboliques.

Un nom de sauvegarde ne doit jamais permettre d'accéder à un fichier situé en dehors du répertoire autorisé.

## 5.4. Restauration atomique

### Problème à prévenir

La copie directe d'une sauvegarde vers le fichier principal peut laisser une base incomplète si l'opération est interrompue.

### Correction

Mettre en place une restauration avec remplacement sécurisé :

1. Vérifier la sauvegarde source.
2. Créer une sauvegarde de sécurité de la base actuelle.
3. Vérifier cette sauvegarde de sécurité.
4. Fermer proprement les connexions.
5. Copier l'archive dans un fichier temporaire situé sur le même système de fichiers.
6. Vérifier le fichier temporaire.
7. Synchroniser les données sur disque lorsque cela est supporté.
8. Effectuer un remplacement atomique approprié au système.
9. Reconnecter SQLite.
10. Vérifier l'intégrité de la base restaurée.
11. Réactiver l'application.

En cas d'échec après fermeture de la connexion, prévoir une récupération qui évite de laisser l'application avec un pool définitivement fermé.

## 5.5. Vérification complète après restauration

Vérifier les données :

- Produits.
- Stocks.
- Clients.
- Fournisseurs.
- Ventes.
- Retours.
- Créances.
- Achats.
- Réceptions.
- Dettes fournisseurs.
- Consignations.
- Mouvements de caisse.
- Dépenses.
- Historique des opérations.

## 5.6. Chiffrement des sauvegardes

Préparer une conception technique pour chiffrer les archives.

Ne pas imposer une technologie de chiffrement sans vérifier sa compatibilité avec les environnements Windows et macOS.

La solution doit inclure :

- Algorithme moderne authentifié.
- Gestion sécurisée des clés.
- Procédure de récupération.
- Version du format d'archive.
- Protection contre les modifications du fichier.
- Compatibilité des sauvegardes anciennes.

Le chiffrement de la base principale sera traité avec une migration contrôlée et un prototype technique validé séparément.

## Tests obligatoires

- Création de sauvegarde.
- Vérification en lecture seule.
- Empreinte SHA-256 avant et après vérification.
- Vérification d'archive corrompue.
- Vérification d'archive incompatible.
- Tentative de chemin non autorisé.
- Tentative via lien symbolique.
- Restauration normale.
- Interruption de restauration.
- Échec de reconnexion.
- Redémarrage après restauration.
- Vérification des données métier.
- Sauvegarde de sécurité conservée.

## Livrable

`docs/REMEDIATION_LOT_05.md`

---

# LOT 6 — SÉCURITÉ ET AUTHENTIFICATION

**Priorité : P1**

## Objectif

Renforcer les protections existantes sans perturber le fonctionnement hors ligne.

## Fichiers concernés

- `crates/depotpro-core/src/application/auth.rs`
- `crates/depotpro-server/src/main.rs`
- `src-tauri/src/state.rs`
- `src-tauri/src/commands.rs`
- `src-tauri/src/lib.rs`
- `server/services/auth.ts`
- `src/services/api/TauriApiClient.ts`
- `src/services/api/HttpApiClient.ts`
- `src-tauri/capabilities/default.json`
- `docs/SECURITY.md`

## 6.1. Sessions Rust avec expiration

### Problème identifié

Axum et Tauri conservent des tokens dans des HashSet sans expiration temporelle explicite.

### Correction

Remplacer le stockage simplifié par une véritable structure de session.

Chaque session doit contenir :

- Identifiant du token.
- Date de création.
- Date de dernière activité.
- Date d'expiration.
- Identité de l'utilisateur.
- État de révocation.

Ajouter :

- Expiration après inactivité.
- Durée maximale de session.
- Révocation au verrouillage.
- Nettoyage des sessions expirées.
- Validation avant chaque opération protégée.

Conserver les protections déjà présentes dans Node et vérifier l'uniformité des comportements.

## 6.2. Tentatives PIN concurrentes

### Fichier concerné

`crates/depotpro-core/src/application/auth.rs`

Lire et mettre à jour le compteur des échecs de manière atomique.

Ne pas utiliser une ancienne valeur lue avant une transaction concurrente pour écraser le compteur courant.

Prévoir une politique uniforme de limitation des tentatives.

## 6.3. Contrôle des origines Axum

### Fichier concerné

`crates/depotpro-server/src/main.rs`

Remplacer les comparaisons par préfixe par une comparaison stricte de l'origine :

- Schéma.
- Hôte.
- Port.

Ne pas faire confiance aveuglément à `Host` et `X-Forwarded-For`.

Lorsque des en-têtes proxy sont utilisés, leur utilisation doit dépendre d'une configuration explicite.

Le serveur local doit conserver une écoute limitée à `127.0.0.1` par défaut.

## 6.4. Gestion des rôles

Préparer un système de permissions évolutif.

Rôles initiaux recommandés :

- Propriétaire.
- Administrateur.
- Responsable.
- Caissier.
- Gestionnaire de stock.
- Comptable.

Les commandes sensibles doivent vérifier une permission explicite.

Ne pas se limiter à cacher un bouton dans React.

La permission doit être contrôlée dans les services métier et à l'entrée de chaque endpoint ou commande.

Conserver l'historique des actions avec l'identité de l'utilisateur.

## 6.5. Chiffrement des données

Réaliser une étude de compatibilité pour :

- La base SQLite principale.
- Les fichiers de sauvegarde.
- Les pièces justificatives.
- Les documents exportés.

Avant toute activation générale du chiffrement de la base, produire un prototype fonctionnel sur Windows, macOS et les deux moteurs concernés.

Prévoir une migration non destructive des bases anciennes.

Ne jamais effectuer une conversion irréversible sans sauvegarde vérifiée et procédure de récupération.

## Tests obligatoires

- Connexion valide.
- PIN incorrect.
- Cinq tentatives incorrectes.
- Verrouillage.
- Déverrouillage.
- Plusieurs tentatives concurrentes.
- Expiration d'une session.
- Révocation.
- Commande sans token.
- Commande avec token expiré.
- Origine non autorisée.
- Utilisateur sans permission.
- Accès autorisé pour le bon rôle.
- Sauvegarde chiffrée et restauration avec la bonne clé.

## Livrable

`docs/REMEDIATION_LOT_06.md`

---

# LOT 7 — CI/CD ET COMPILATION WINDOWS / MACOS

**Priorité : P0 — Bloquant livraison Desktop**

## Objectif

Faire passer tous les jobs GitHub Actions et produire de véritables artefacts Desktop.

## Fichiers concernés

- `package.json`
- `package-lock.json`
- `Cargo.toml`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `.github/workflows/ci.yml`
- `tests/e2e/app.spec.ts`
- `src-tauri/src/commands.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/state.rs`

## 7.1. Correction du CLI Tauri

### Problème identifié

La CI exécute :

```
npx tauri build
```

Mais `@tauri-apps/cli` n'est pas déclaré explicitement dans les dépendances Node examinées.

Les jobs Windows et macOS échouent avec :

`npm error could not determine executable to run`

### Correction

Ajouter `@tauri-apps/cli` dans les dépendances de développement avec une version explicite compatible avec Tauri 2.

Synchroniser `package-lock.json`.

Utiliser une commande déterministe :

```
npm exec tauri -- --version
npm exec tauri build
```

Ne pas laisser npm récupérer implicitement un exécutable non verrouillé.

## 7.2. Correction Rust fmt

Exécuter :

```
cargo fmt --all
```

Examiner les différences produites.

Ne pas mélanger les modifications de formatage avec des modifications métier non liées.

Puis valider :

```
cargo fmt --all -- --check
```

## 7.3. Correction Playwright

### Fichier concerné

`tests/e2e/app.spec.ts`

Le sélecteur :

```
page.getByText(/Tableau de bord/i)
```

est ambigu.

Remplacer par des sélecteurs explicites et stables.

Exemple :

```
page.getByRole('heading', {
  name: 'Tableau de bord'
})
```

Séparer les parcours longs en scénarios métier distincts.

## 7.4. Audit des dépendances npm

La dernière CI signale 11 vulnérabilités de sévérité élevée.

Exécuter :

```
npm audit
npm audit --json
```

Identifier les dépendances responsables, leurs usages et les possibilités de mise à jour.

Corriger les vulnérabilités réellement applicables sans effectuer de mise à jour majeure non maîtrisée.

Ne pas utiliser `npm audit fix --force` comme solution automatique.

## 7.5. Durcissement de la CI

La CI doit inclure des jobs indépendants :

1. TypeScript.
2. ESLint.
3. Tests Node.
4. Build Vite.
5. Tests E2E.
6. Migration SQLite.
7. Tests Rust Core.
8. Tests Axum.
9. Clippy.
10. Formatage Rust.
11. Compilation Tauri Windows.
12. Compilation Tauri macOS.

Les tests Rust ne doivent pas être considérés comme exécutés lorsque le job s'est arrêté avant leur lancement.

Prévoir l'upload des artefacts Desktop pour vérifier réellement la présence des installateurs.

## Tests obligatoires

Sur une installation propre :

```
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
npm run benchmark
```

Puis :

```
cargo fmt --all -- --check
cargo clippy -p depotpro-core -p depotpro-server --all-targets -- -D warnings
cargo test -p depotpro-core
cargo test -p depotpro-server
```

Enfin :

```
npm exec tauri -- --version
npm exec tauri build
```

Exécuter la compilation Tauri sur les runners Windows et macOS appropriés.

## Validation

Le lot n'est terminé que lorsque tous les jobs obligatoires sont verts.

Les installateurs doivent réellement exister.

## Livrable

`docs/REMEDIATION_LOT_07.md`

---

# LOT 8 — REFACTORING DE L'INTERFACE REACT ET DES 17 ÉCRANS

**Priorité : P1**

## Objectif

Améliorer la maintenabilité et la testabilité sans dégrader le design actuel.

Ne pas entreprendre une refonte graphique globale.

Conserver la direction artistique, les thèmes, la navigation, les fonctionnalités et les interactions existantes.

## Écrans concernés

1. Connexion / PIN.
2. Tableau de bord.
3. Nouvelle vente.
4. Historique des ventes.
5. Clients.
6. Créances.
7. Produits.
8. Stocks.
9. Inventaires.
10. Consignations.
11. Fournisseurs.
12. Approvisionnements.
13. Caisse.
14. Dépenses.
15. Rapports.
16. Paramètres.
17. Sauvegardes.

## Fichiers concernés

- `src/App.tsx`
- `src/layouts/AppLayout.tsx`
- `src/layouts/Sidebar.tsx`
- `src/pages/`
- `src/components/`
- `src/services/api/`
- `src/stores/`
- `src/types/erp.ts`

## 8.1. Organisation par fonctionnalités

Mettre progressivement en place une organisation par domaine.

Exemple :

```
src/
├── app/
├── components/
│   ├── common/
│   ├── forms/
│   ├── tables/
│   └── dialogs/
├── features/
│   ├── sales/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── utils/
│   │   └── pages/
│   ├── products/
│   ├── purchases/
│   ├── inventory/
│   ├── consignments/
│   ├── cash/
│   ├── clients/
│   ├── reports/
│   └── backups/
├── layouts/
├── services/
├── stores/
├── types/
└── utils/
```

Ne pas déplacer l'intégralité du projet en une seule opération.

## 8.2. Priorité aux écrans volumineux

Commencer par :

- `src/pages/ProductsPage.tsx`
- `src/pages/SalesPage.tsx`
- `src/pages/ConsignmentsPage.tsx`
- `src/pages/PurchasesPage.tsx`
- `src/pages/CashPage.tsx`

Extraire :

- Tableaux.
- Modales.
- Formulaires.
- Composants de recherche.
- Panneaux de paiement.
- Calculs.
- Hooks métier.
- Mutations React Query.

## 8.3. Centralisation des requêtes

Conserver une interface API commune.

Les pages ne doivent pas dépendre directement de détails propres à Express ou Tauri.

Les contrats doivent rester dans `ApiClient.ts`.

Les clients `HttpApiClient.ts` et `TauriApiClient.ts` doivent implémenter le même comportement fonctionnel.

## 8.4. Qualité d'interface

Préserver :

- Responsive design.
- Thème clair.
- Thème sombre.
- États de chargement.
- États vides.
- Erreurs.
- Confirmations.
- Raccourcis clavier.
- Recherche.
- Navigation clavier.
- États de validation.
- Accessibilité de base.

La refactorisation ne doit pas supprimer les raccourcis du POS.

## Tests obligatoires

- Ouverture de chacun des 17 écrans.
- Navigation entre écrans.
- Changement de thème.
- Ouverture et fermeture des dialogues.
- Formulaires valides et invalides.
- États de chargement.
- États d'erreur.
- Recherche.
- Raccourcis du POS.
- Affichage sur différentes dimensions.
- Tests d'interaction des tableaux.
- Tests de régression des parcours commerciaux.

## Livrable

`docs/REMEDIATION_LOT_08.md`

---

# LOT 9 — PARITÉ MÉTIER NODE.JS / RUST

**Priorité : P1**

## Objectif

Garantir que les deux moteurs interprètent les règles métier de la même manière.

## Fichiers concernés

### Node.js

- `server/domain.ts`
- `server/services/sales.ts`
- `server/services/purchases.ts`
- `server/services/cash.ts`
- `server/services/consignments.ts`
- `server/services/inventory.ts`
- `server/services/auth.ts`

### Rust

- `crates/depotpro-core/src/domain/`
- `crates/depotpro-core/src/application/`

### Contrats

- `src/services/api/ApiClient.ts`
- `src/types/erp.ts`
- `crates/depotpro-server/src/main.rs`
- `src-tauri/src/commands.rs`

### Tests

- `tests/`
- Nouveaux tests de contrats communs.

## 9.1. Créer une matrice de parité

Les mêmes scénarios doivent être exécutés contre les deux moteurs.

Scénarios minimaux :

1. Création client.
2. Création fournisseur.
3. Création produit.
4. Création conditionnement.
5. Ajustement stock.
6. Ouverture caisse.
7. Vente comptant.
8. Vente à crédit.
9. Paiement mixte.
10. Retour de vente.
11. Annulation de vente.
12. Paiement de créance.
13. Création commande d'achat.
14. Réception partielle.
15. Réception totale.
16. Règlement fournisseur.
17. Retour de consignation.
18. Inventaire.
19. Dépense.
20. Clôture de caisse.
21. Sauvegarde.
22. Restauration.

## 9.2. Résultats attendus

Pour chaque scénario :

- Même validation.
- Même montant.
- Même quantité.
- Même statut.
- Même mouvement de stock.
- Même mouvement de caisse.
- Même dette ou créance.
- Même comportement d'idempotence.
- Même sens des erreurs métier.

Les champs purement techniques ou les références générées peuvent suivre des règles propres à chaque moteur si leur équivalence fonctionnelle est préservée.

## 9.3. Préparation de l'architecture cible

Éviter d'ajouter de nouvelles règles métier dans les deux implémentations.

À terme, le cœur Rust doit devenir la référence métier.

Node.js peut rester une couche Web compatible, mais il ne doit pas évoluer avec des règles divergentes.

Toute décision de suppression future du backend Node doit être traitée dans un lot architectural séparé et non introduite au milieu des corrections.

## Tests obligatoires

- Exécution des mêmes fixtures sur les deux moteurs.
- Comparaison des réponses.
- Comparaison des états SQLite.
- Vérification des erreurs.
- Vérification des transactions.
- Vérification des clés d'idempotence.
- Vérification des quantités et montants limites.

## Livrable

`docs/REMEDIATION_LOT_09.md`

---

# LOT 10 — VALIDATION FINALE ET PRÉPARATION DE LA PRODUCTION

**Priorité : P0**

## Objectif

Prouver que DEPOTPRO est exploitable dans un environnement commercial réel.

## 10.1. Tests métier complets

Exécuter un parcours réel simulé :

1. Première ouverture de l'application.
2. Configuration du dépôt.
3. Configuration du PIN.
4. Création d'un fournisseur.
5. Création de catégories.
6. Création de produits.
7. Configuration des conditionnements.
8. Définition des prix gros, demi-gros et détail.
9. Définition des profils de consigne.
10. Enregistrement du stock initial.
11. Ouverture de caisse.
12. Achat auprès d'un fournisseur.
13. Réception partielle.
14. Réception totale.
15. Vente comptant.
16. Vente à crédit.
17. Paiement partiel d'une créance.
18. Retour de bouteilles.
19. Retour de casiers.
20. Retour d'un article.
21. Ajustement d'inventaire.
22. Dépense.
23. Clôture de caisse.
24. Consultation des rapports.
25. Création d'une sauvegarde.
26. Vérification de la sauvegarde.
27. Restauration.
28. Vérification des données après restauration.

## 10.2. Tests de robustesse

Tester également :

- Coupure de l'application pendant une transaction.
- Interruption durant une sauvegarde.
- Interruption durant une restauration.
- Erreur SQLite.
- Verrouillage temporaire de la base.
- Base ancienne.
- Base partiellement migrée.
- Base corrompue.
- Perte de session.
- Redémarrage Windows.
- Redémarrage macOS.

## 10.3. Compilation et installation

### Windows

- Générer l'installateur Windows.
- Installer sur une machine propre.
- Lancer l'application.
- Configurer un dépôt.
- Effectuer une vente.
- Fermer et redémarrer.
- Vérifier la persistance SQLite.
- Tester l'impression si elle est prise en charge.

### macOS

- Générer le `.app` et le `.dmg`.
- Installer sur une machine propre.
- Lancer l'application.
- Effectuer une vente.
- Fermer et redémarrer.
- Vérifier les données.
- Tester l'ouverture, les permissions et les documents.
- Vérifier les exigences de signature et de notarisation pour la distribution publique.

## 10.4. Vérifications de performance

Réaliser des benchmarks reproductibles avec :

- 10 000 produits.
- 10 000 clients.
- 100 000 lignes de ventes et mouvements.
- Historique important de caisse.
- Historique de consignations.
- Sauvegarde d'une base représentative.

Surveiller :

- Recherche POS.
- Chargement du catalogue.
- Pagination.
- Validation des ventes.
- Réception d'achats.
- Ouverture des rapports.
- Création de sauvegarde.
- Temps de restauration.

Ne jamais dégrader l'intégrité des données pour améliorer les performances.

## 10.5. Documentation finale

Mettre à jour :

- `README.md`
- `docs/ARCHITECTURE_V3.md`
- `docs/DATABASE.md`
- `docs/SECURITY.md`
- `docs/BACKUP_RESTORE.md`
- `docs/TESTING.md`
- `docs/INSTALLATION_WINDOWS.md`
- `docs/INSTALLATION_MACOS.md`
- `docs/TROUBLESHOOTING.md`

Ajouter :

`docs/PRODUCTION_READINESS_REPORT.md`

Ce rapport doit indiquer les véritables résultats des tests, les plateformes validées, les limitations connues et les risques résiduels.

---

# PARTIE 3 — RÈGLES DE VALIDATION POUR CHAQUE LOT

À la fin de chaque lot, produire un rapport avec ce format :

## Rapport obligatoire

### A. Résumé

- Objectif du lot.
- Problème corrigé.
- Comportement obtenu.

### B. Fichiers modifiés

Pour chaque fichier :

- Chemin.
- Modification.
- Justification.
- Effet sur les autres modules.

### C. Tests

Pour chaque test :

- Nom.
- Commande ou méthode.
- Résultat.
- Résultat attendu.
- Résultat obtenu.

### D. Régressions

- Tests de régression exécutés.
- Fonctionnalités concernées.
- Éventuels problèmes restants.

### E. État du lot

Utiliser exclusivement :

- **PASSÉ** : toutes les exigences et tous les tests du lot ont été validés.
- **ÉCHEC** : au moins un test obligatoire échoue.
- **BLOQUÉ** : une dépendance ou une décision empêche l'implémentation.
- **NON EXÉCUTÉ** : les tests n'ont pas été réalisés.

Ne jamais marquer PASSÉ un test qui n'a pas été exécuté.

### F. Commit Git

- Hash du commit.
- Message.
- Liste des fichiers concernés.

Ne pas passer silencieusement au lot suivant si le lot courant échoue.

---

# PARTIE 4 — DÉFINITION FINALE DU DONE

DEPOTPRO PREMIUM V3 ne pourra être déclaré prêt pour la production que lorsque toutes les conditions suivantes seront remplies.

## Intégrité métier

- Une vente ne peut jamais dépasser les règles de stock.
- Un retour ne peut jamais dépasser les quantités vendues restantes.
- Une réception ne peut jamais dépasser le reliquat commandé.
- Aucun doublon d'opération ne peut créer de double mouvement.
- Toutes les opérations financières utilisent des calculs exacts.
- Les créances et dettes restent cohérentes.
- Les mouvements de caisse sont exacts.
- Les consignations restent traçables.

## Base de données

- Les écritures sont atomiques.
- Les accès concurrents sont correctement gérés.
- Les migrations sont versionnées.
- Les anciennes bases restent migrables.
- Les clés étrangères sont actives.
- Les bases et sauvegardes sont vérifiables.

## Sauvegardes

- Création réussie.
- Vérification non destructive.
- Compatibilité contrôlée.
- Restauration atomique.
- Reconnexion réussie.
- Données métier préservées.

## Sécurité

- Sessions expirables.
- Tokens révocables.
- PIN protégé.
- Accès sensibles contrôlés.
- Origines vérifiées.
- Sauvegardes protégées.
- Plan de chiffrement validé.
- Permissions et responsabilités documentées.

## Frontend

- Les 17 écrans fonctionnent.
- Aucun parcours métier essentiel n'a disparu.
- Les calculs affichés sont conformes au backend.
- Les thèmes clair et sombre fonctionnent.
- Les erreurs sont explicites.
- Les formulaires sont validés.
- Les tests E2E sont verts.

## Desktop

- Compilation Rust réussie.
- Compilation Tauri réussie.
- Installateur Windows généré et testé.
- Application macOS générée et testée.
- Base persistante après redémarrage.
- Restauration validée.

## CI/CD

Tous les jobs obligatoires sont verts.

Aucun job ne doit être ignoré pour obtenir artificiellement un résultat vert.

Les vulnérabilités critiques et élevées doivent être corrigées ou faire l'objet d'une analyse documentée et d'une acceptation explicite du risque.

---

# PARTIE 5 — INSTRUCTIONS FINALES À L'AGENT

Tu dois impérativement respecter l'ordre des lots.

Tu ne dois pas commencer par une refonte graphique, une nouvelle fonctionnalité ou une réécriture générale.

La priorité est la fiabilité commerciale et financière.

Ne cherche pas à produire le plus grand nombre de fichiers modifiés. Cherche à produire les modifications minimales, cohérentes et testables qui suppriment réellement les problèmes.

Chaque correction doit être démontrée par un test de régression.

Chaque opération sur SQLite doit préserver les invariants métier.

Chaque comportement doit rester cohérent entre le mode Web et le mode Desktop.

Ne prétends jamais qu'une fonctionnalité est fonctionnelle uniquement parce que le code compile.

Ne prétends jamais qu'un installateur est validé uniquement parce que la compilation frontend réussit.

Ne supprime aucune fonctionnalité existante pour simplifier les tests.

Ne modifie pas les données commerciales réelles.

En cas de risque de perte de données, de migration irréversible, de choix cryptographique structurant ou de modification incompatible avec une ancienne base, arrête cette opération et expose précisément le risque avant de poursuivre.

**Résultat final attendu : DEPOTPRO PREMIUM V3 doit devenir un logiciel de gestion de dépôt de boissons fiable, exact, sécurisé, hors ligne, maintenable et installable sur Windows et macOS, avec une architecture métier cohérente et une base SQLite protégée.**

## **Comment utiliser ce plan**

Je recommande de donner à l'agent IA le dépôt GitHub, ce document complet et une seule consigne supplémentaire :

**« Exécute les lots dans l'ordre. Ne saute aucune validation. À chaque lot, fournis le rapport, les tests réellement exécutés et le commit correspondant avant de poursuivre. »**

### **Les quatre premiers objectifs à surveiller particulièrement**

1. **Lot 1 :** aucune réception ni aucun retour ne doit pouvoir dépasser les quantités autorisées.
2. **Lot 2 :** le POS et les moteurs backend doivent calculer exactement les mêmes montants.
3. **Lot 3 :** les écritures SQLite doivent rester cohérentes même en situation de concurrence.
4. **Lot 7 :** les builds Windows et macOS doivent réellement réussir.

**Mon conseil :** ne considère pas DEPOTPRO comme prêt à être commercialisé tant que ces quatre objectifs, les restaurations et les tests métier complets ne sont pas validés.
