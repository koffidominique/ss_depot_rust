La règle métier est désormais fondée sur deux niveaux distincts :

1. **Créance physique d’emballages** : dès qu’un client achète une boisson conditionnée dans un casier réutilisable, il doit restituer le nombre correspondant de casiers vides. La valeur de ces emballages est enregistrée et visible, mais elle ne devient pas immédiatement une dette financière.
2. **Créance financière d’emballages** : si les casiers ne sont pas restitués à la date limite fixée par le sous-dépôt, ou si une perte ou une destruction est constatée, le système transforme la quantité concernée en dette financière, sur la base de la valeur applicable au moment de la vente.

Avec ton exemple, après la vente, le client doit **4 000 FCFA de marchandise** et **un casier à restituer**, valorisé à 3 600 FCFA. À l’échéance, si le casier n’a pas été rendu, les 3 600 FCFA deviennent une créance financière : le total des sommes dues atteint alors **7 600 FCFA**. Avant cette échéance, le système ne doit pas compter ces 3 600 FCFA comme une dette financière exigible.

Le catalogue public de SOLIBRA fournit une bonne base de références et de conditionnements : par exemple, Beaufort 33 cl en casier de 24, Beaufort 50 cl en casier de 12, Bock 33 cl en casier de 24, ainsi que plusieurs autres formats Bock. Ces références seront préchargées comme données de référence, sans empêcher l’owner de les modifier.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://solibrachezvous.ci&sz=32)

Solibra Chez Vous+2

Voici la version révisée du **MASTER PROMPT**, avec la nouvelle gestion des créances d’emballages, les délais de restitution, la conversion en dette financière, et un catalogue standard administrable par l’owner.

J’ai également prévu une séparation essentielle : **la brasserie qui fabrique ou commercialise une marque, le fournisseur qui approvisionne le sous-dépôt et le produit vendu sont trois notions différentes**. Cela évite de mélanger le catalogue des boissons avec les relations commerciales du dépôt.

# MASTER PROMPT — SS DEPOT RUST

## Gestion avancée des sous-dépôts de boissons en Côte d’Ivoire

### Module central : Catalogue, Brasseries, Fournisseurs, Clients, Stocks et Gestion des emballages

---

# 1. RÔLE ET MISSION DE L'AGENT IA

Tu es un architecte logiciel senior, expert en conception d'ERP de distribution, en gestion commerciale, en gestion de stocks, en comptabilité auxiliaire, en bases de données relationnelles et en développement d'applications desktop performantes.

Tu interviens sur le projet **SS DEPOT RUST**.

Ta mission est de concevoir et d'implémenter une application professionnelle de gestion de sous-dépôt de boissons, adaptée aux réalités commerciales et opérationnelles de la Côte d'Ivoire.

L'application doit notamment gérer :

- Les brasseries et les marques de boissons.
- Le catalogue centralisé des produits et de leurs conditionnements.
- Les fournisseurs et leurs relations avec le sous-dépôt.
- Les achats et réapprovisionnements.
- Les ventes au comptant et à crédit.
- Les clients et le suivi de leurs comptes.
- Les stocks de boissons pleines.
- Les stocks de casiers et emballages vides.
- Les retours d'emballages entre clients et sous-dépôt.
- Les retours d'emballages entre sous-dépôt et fournisseurs.
- Les échéances de restitution.
- La transformation des emballages non restitués en créances financières.
- Les recettes, dépenses, paiements et dettes commerciales.
- Les inventaires, pertes, casses et ajustements.
- Les rapports financiers, commerciaux et opérationnels.

Tu dois respecter la logique métier décrite dans ce document. Ne remplace pas une règle commerciale explicite par une interprétation personnelle.

L'application doit être fiable, cohérente, sécurisée, rapide, utilisable hors connexion et adaptée à une exploitation quotidienne.

# 2. ARCHITECTURE TECHNIQUE

Conserver l'architecture technique cible du projet :

- Frontend : React + TypeScript.
- Backend métier : Rust.
- Base de données locale : SQLite.
- Interface : Tailwind CSS et composants modernes.
- Communication frontend/backend : API interne sécurisée.
- Application desktop installable sur Windows et macOS.

Toutes les opérations sensibles doivent être exécutées et validées dans le backend Rust.

Ne jamais laisser le frontend être la seule autorité pour les calculs financiers, les stocks, les créances ou les échéances.

La base doit fonctionner sans connexion Internet.

Toutes les dates et tous les montants doivent être enregistrés de manière cohérente. Utiliser le fuseau horaire Africa/Abidjan par défaut et le franc CFA BCEAO (XOF).

Pour les montants financiers, utiliser des entiers en FCFA, jamais des nombres flottants.

Les modifications de stock, de compte client, de créances d'emballages et de paiements doivent être transactionnelles et atomiques.

# 3. MODÈLE MÉTIER FONDAMENTAL

L'application doit distinguer quatre ensembles de données qui ne doivent jamais être confondus :

1. **Marchandises :** boissons pleines achetées et vendues.
2. **Emballages :** casiers vides et autres emballages réutilisables suivis par le dépôt.
3. **Comptabilité commerciale :** créances clients, dettes fournisseurs, paiements, recettes et dépenses.
4. **Créances financières d'emballages :** sommes dues lorsque les emballages concernés ne sont pas restitués dans les conditions et délais définis.

Un emballage peut donc avoir deux états successifs :

- Une obligation physique de restitution, exprimée en quantité.
- Une créance financière, exprimée en FCFA, lorsque les conditions de conversion sont réunies.

Ces deux états doivent être suivis séparément.

**Règle fondamentale : une obligation de restitution n'est pas automatiquement une dette financière exigible.**

La valeur indicative de l'emballage peut être affichée et utilisée pour les analyses dès la vente, mais elle ne doit pas être ajoutée automatiquement au solde financier du client.

# 4. CATALOGUE STANDARD DE L'APPLICATION

## 4.1. Objectif

Créer un catalogue standard de boissons qui constitue la base de données initiale de l'application.

Ce catalogue doit être structuré par :

1. Brasserie ou producteur.
2. Marque.
3. Produit.
4. Variante du produit.
5. Format de bouteille ou de contenant.
6. Conditionnement commercial.
7. Type d'emballage.
8. Caractéristiques de restitution éventuelle.

Il doit être possible d'enrichir le catalogue sans modifier le code source de l'application.

Le catalogue central doit être utilisable dès la première installation.

## 4.2. Séparer brasseries, marques et fournisseurs

Ne jamais considérer qu'une brasserie est automatiquement le fournisseur direct d'un sous-dépôt.

Créer des entités distinctes :

- `breweries` : brasseries, producteurs ou entreprises responsables des marques.
- `brands` : marques commerciales.
- `products` : produits commercialisés.
- `product_variants` : variantes précises d'un produit.
- `suppliers` : fournisseurs effectifs du sous-dépôt.
- `supplier_products` : association entre les fournisseurs et les références qu'ils approvisionnent.

Une même marque peut être distribuée par plusieurs fournisseurs selon les accords commerciaux.

Un même fournisseur peut approvisionner le dépôt en produits provenant de plusieurs brasseries.

Une brasserie ne doit pas être automatiquement créée comme fournisseur du sous-dépôt.

## 4.3. Catalogue de référence SOLIBRA

Précharger dans la base standard des références issues du catalogue public de SOLIBRA.

Source officielle de référence :

[https://solibrachezvous.ci/boutique/](https://solibrachezvous.ci/boutique/)

Exemples de références et conditionnements à intégrer dans les données initiales :

| Marque / produit | Présentation publique relevée            |
| ---------------- | ---------------------------------------- |
| Beaufort         | 25 cl, carton de 24 bouteilles           |
| Beaufort         | 33 cl, casier de 24 bouteilles           |
| Beaufort         | 50 cl, casier de 12 bouteilles           |
| Beaufort         | Canette 33 cl, carton de 24              |
| Bock             | 33 cl, casier de 24 bouteilles           |
| Bock             | 50 cl, casier de 12 bouteilles           |
| Bock             | 65 cl, casier de 12 bouteilles           |
| Bock             | 100 cl, casier de 12 bouteilles          |
| Bock             | Canette 33 cl, carton de 24              |
| Bock             | Canette 50 cl, carton de 24              |
| Castel           | 33 cl, casier de 24 bouteilles           |
| Castel           | 50 cl, casier de 12 bouteilles           |
| Doppel Munich    | 33 cl, casier de 24                      |
| Doppel Munich    | 50 cl, casier de 12                      |
| Guinness         | 33 cl, casier de 24                      |
| Guinness         | 65 cl, casier de 12                      |
| Malta Guinness   | 30 cl, casier de 24                      |
| Valpierre        | 50 cl, casier de 12                      |
| Valpierre        | 100 cl, casier de 12                     |
| Budweiser        | 33 cl, conditionnement public à vérifier |
| Orangina         | Canette 33 cl, carton de 24              |
| World Cola       | 1,5 l, pack de 6                         |

Le catalogue public présente également des références et marques telles que Racines, Racines Fort, Chill, Sombreros, Corona Extra, Youki et Youzou.

L'agent doit préparer leur structure dans le catalogue et permettre l'ajout de leurs différentes variantes.

Les exemples ci-dessus sont des données initiales de référence, pas une affirmation d'exhaustivité. Les conditionnements, disponibilités, fabricants, prix et règles d'emballage doivent être vérifiés auprès des fournisseurs et actualisés par l'owner.

Ne jamais inventer un conditionnement manquant.

Pour chaque référence dont le producteur réel n'est pas confirmé, utiliser un statut « À vérifier » plutôt que d'attribuer arbitrairement le produit à SOLIBRA.

Ne pas reprendre automatiquement les prix de la boutique publique comme prix d'achat du sous-dépôt.

Les prix de vente et d'achat propres à chaque dépôt doivent rester configurables.

## 4.4. Autres brasseries

Prévoir la structure permettant d'intégrer d'autres brasseries et producteurs présents sur le marché ivoirien.

L'architecture doit permettre d'ajouter à tout moment :

- Une nouvelle brasserie.
- Une nouvelle marque.
- Un nouveau produit.
- Une nouvelle variante.
- Un nouveau format de bouteille.
- Un nouveau conditionnement.
- Un nouveau type d'emballage.

Le catalogue doit pouvoir évoluer sans migration structurelle de la base de données à chaque ajout de produit.

## 4.5. Gestion des conditionnements

Chaque variante doit être identifiée de manière unique.

Exemples :

- Bock 33 cl, bouteille, casier de 24.
- Bock 50 cl, bouteille, casier de 12.
- Bock 65 cl, bouteille, casier de 12.
- Bock 33 cl, canette, carton de 24.
- Beaufort 25 cl, bouteille, carton de 24.

Ces références sont différentes et ne doivent pas être regroupées sous un seul produit générique.

Champs recommandés pour `product_variants` :

- `id`
- `product_id`
- `sku`
- `barcode`
- `volume_ml`
- `container_type` : bouteille, canette, carton, autre.
- `sales_unit`
- `units_per_package`
- `package_type_id`
- `is_returnable_packaging`
- `is_active`
- `catalog_source`
- `verification_status`

Le système doit pouvoir distinguer les casiers de 12 bouteilles des casiers de 24 bouteilles, même si les deux concernent une bouteille de 33 cl.

## 4.6. Administration du catalogue par l'owner

L'owner de l'application doit disposer des droits complets sur le catalogue standard.

Créer une interface dédiée :

**Administration → Catalogue standard**

L'owner doit pouvoir :

- Créer une brasserie.
- Modifier une brasserie.
- Archiver ou supprimer une brasserie inutilisée.
- Créer une marque.
- Modifier une marque.
- Supprimer ou archiver une marque.
- Créer un produit.
- Modifier un produit.
- Ajouter des variantes.
- Modifier les volumes.
- Modifier les conditionnements.
- Modifier le nombre de bouteilles par casier ou carton.
- Définir si un emballage doit être restitué.
- Associer un produit à un type d'emballage.
- Définir sa valeur indicative.
- Définir son prix de référence éventuel.
- Importer un catalogue.
- Exporter le catalogue.
- Consulter l'historique des modifications.

Prévoir une interface ergonomique avec recherche, filtres par brasserie, marque, catégorie et format.

### Règles de sécurité

Le catalogue standard ne doit être modifiable que par le rôle `OWNER` ou `SUPER_ADMIN`, selon le mode de déploiement.

Dans une architecture multi-dépôts :

- L'owner de l'application gère le catalogue central.
- Le gestionnaire d'un dépôt peut activer ou désactiver les références dans son catalogue local.
- Le gestionnaire peut personnaliser ses prix et ses paramètres commerciaux.
- Une modification du catalogue central ne doit pas écraser les prix ni les mouvements historiques d'un dépôt.

Dans une installation autonome, l'administrateur principal identifié comme owner doit pouvoir administrer la base standard locale.

La suppression doit être logique par défaut : utiliser `is_active`, `deleted_at` ou un mécanisme d'archivage.

La suppression physique ne doit être permise que si la référence n'a aucune dépendance historique ou commerciale.

Une référence déjà utilisée dans une vente ou un mouvement de stock doit rester consultable dans l'historique, même si elle est archivée.

Chaque modification sensible doit être enregistrée dans un journal d'audit.

# 5. GESTION DES EMBALLAGES RÉUTILISABLES

## 5.1. Principe général

Le sous-dépôt manipule des boissons conditionnées dans différents emballages.

Seuls les emballages expressément déclarés comme réutilisables et suivis doivent générer une obligation de restitution.

Pour le fonctionnement standard du projet, suivre les casiers réutilisables associés aux boissons en bouteilles.

Ne pas créer automatiquement une obligation de retour pour :

- Les packs de bières non conditionnés en casiers réutilisables.
- Les packs de canettes.
- Les cartons de canettes.
- Les cartons de bouteilles.
- Les packs d'eau.
- Les canettes vendues individuellement.
- Les bouteilles vendues individuellement sans casier suivi.
- Tout autre emballage marqué comme non restituable.

L'owner doit toutefois pouvoir définir une règle particulière pour une nouvelle référence ou un nouvel emballage.

## 5.2. Valeur des emballages

Chaque type d'emballage réutilisable doit pouvoir avoir une valeur configurable.

Exemple :

| Type d'emballage      | Valeur indicative   |
| --------------------- | ------------------- |
| Casier Bock 33 cl     | 3 600 FCFA          |
| Casier Bock 50 cl     | Valeur configurable |
| Casier Beaufort 33 cl | Valeur configurable |
| Casier Beaufort 50 cl | Valeur configurable |

Les montants ci-dessus sont illustratifs.

Pour chaque type d'emballage, enregistrer :

- Sa désignation.
- Son code.
- Le ou les produits compatibles.
- Son format.
- Sa valeur indicative.
- Sa valeur applicable en cas de non-restitution.
- Sa date d'entrée en vigueur.
- Son statut actif ou inactif.

La valeur de l'emballage doit être indépendante du prix commercial de la boisson.

Ne jamais calculer automatiquement la valeur de l'emballage en fonction du prix du casier plein.

## 5.3. Politique de restitution configurable

Le sous-dépôt doit pouvoir définir un délai de restitution des emballages.

Créer un module :

**Paramètres → Politique de retour d'emballages**

Paramètres configurables :

- Délai standard de restitution en jours.
- Délai propre à un type d'emballage.
- Délai propre à un produit.
- Délai particulier accordé à un client.
- Date et heure de départ du délai.
- Règle de calcul de la date d'échéance.
- Possibilité d'accorder un délai supplémentaire.
- Possibilité d'activer une conversion automatique en créance financière.
- Possibilité d'exiger une validation manuelle pour certaines conversions.
- Montant applicable en cas de non-restitution.
- Règle en cas de perte ou de destruction.
- Possibilité de recevoir un emballage après échéance.

Le système doit conserver la politique applicable au moment de chaque vente.

Une modification ultérieure des paramètres ne doit pas modifier rétroactivement les échéances et les montants des ventes déjà réalisées.

Chaque délai et chaque valeur doivent être enregistrés sous forme de photographie historique au moment de la création de l'obligation.

# 6. VENTE CLIENT ET CRÉANCE PHYSIQUE D'EMBALLAGES

## 6.1. Déclenchement automatique

Lorsqu'un client achète une référence associée à un casier réutilisable, le système doit automatiquement :

1. Enregistrer la vente.
2. Décrémenter le stock de boissons pleines.
3. Créer une obligation de restitution d'emballages.
4. Enregistrer le nombre de casiers dus.
5. Enregistrer leur valeur unitaire de référence.
6. Calculer la date limite de restitution.
7. Enregistrer le client concerné.
8. Enregistrer la vente d'origine.
9. Créer un historique de l'obligation.

Cette obligation doit être indépendante du mode de paiement.

Une vente au comptant peut elle aussi créer une obligation d'emballages.

Une vente à crédit peut créer simultanément une créance commerciale et une créance physique d'emballages.

## 6.2. Exemple obligatoire de validation

Un client achète :

- 1 casier de Bock 33 cl plein : 12 000 FCFA.
- Valeur indicative du casier vide : 3 600 FCFA.
- Paiement immédiat : 8 000 FCFA.

Le système doit enregistrer :

**Compte commercial :**

- Montant de la vente : 12 000 FCFA.
- Paiement : 8 000 FCFA.
- Créance commerciale : 4 000 FCFA.

**Compte emballages :**

- Nombre de casiers dus : 1.
- Nombre de casiers retournés : 0.
- Valeur unitaire de référence : 3 600 FCFA.
- Échéance : calculée selon la politique du dépôt.
- Créance financière d'emballages exigible : 0 FCFA avant échéance, tant qu'aucune perte, destruction ou autre motif de conversion n'est validé.

Le tableau de bord client doit afficher séparément :

- Dette commerciale : 4 000 FCFA.
- Emballages physiques à restituer : 1 casier.
- Valeur indicative des emballages en attente : 3 600 FCFA.
- Créance financière d'emballages échue : 0 FCFA.

Ne pas additionner la valeur indicative au solde financier exigible avant la conversion.

# 7. TRANSFORMATION EN CRÉANCE FINANCIÈRE

## 7.1. Déclencheurs

Une obligation physique peut devenir une créance financière dans les cas suivants :

1. Le client n'a pas restitué l'emballage à la date limite fixée par le sous-dépôt.
2. Le client déclare avoir perdu l'emballage.
3. L'emballage est détruit.
4. L'emballage est détérioré au point de ne plus pouvoir être accepté, selon la politique du dépôt.
5. Un responsable habilité valide un autre motif prévu par les règles commerciales du dépôt.

La conversion peut être automatique à l'échéance ou soumise à une validation manuelle, selon les paramètres de l'application.

## 7.2. Conversion à l'échéance

Au moment de l'échéance :

- Vérifier la quantité initialement due.
- Soustraire les quantités déjà restituées.
- Exclure les quantités déjà converties.
- Calculer la quantité restant à restituer.
- Appliquer la valeur unitaire enregistrée au moment de la vente, sauf règle contractuelle explicitement différente.
- Créer une créance financière pour la quantité non restituée.
- Enregistrer l'opération dans le compte financier du client.
- Enregistrer une opération correspondante dans le journal des emballages.

Formule :

`Montant de la créance d'emballages = Quantité non restituée échue × Valeur unitaire applicable`

Exemple :

- 1 casier dû.
- 0 casier retourné.
- Date d'échéance dépassée.
- Valeur applicable : 3 600 FCFA.

Résultat :

- Créance commerciale initiale : 4 000 FCFA.
- Créance financière d'emballages : 3 600 FCFA.
- Total financier dû : 7 600 FCFA.

La conversion doit être idempotente : le traitement d'une même échéance ne doit jamais créer deux fois la même dette.

## 7.3. Perte ou destruction avant échéance

Si le client déclare avoir perdu ou détruit un emballage avant l'échéance :

- Un utilisateur habilité doit pouvoir déclarer l'événement.
- La quantité concernée est enregistrée.
- Le motif doit être obligatoire.
- L'opération doit être horodatée.
- La valeur applicable est calculée.
- Une créance financière peut être créée immédiatement, selon la politique du dépôt.

Exiger une validation managériale pour les opérations sensibles.

Les quantités déjà retournées ne doivent jamais être facturées une seconde fois.

## 7.4. Emballages partiellement restitués

Le système doit gérer les retours partiels.

Exemple :

- 5 casiers dus.
- 3 casiers retournés.
- 2 casiers non retournés à échéance.
- Valeur unitaire : 3 600 FCFA.

À échéance :

- Obligation satisfaite : 3 casiers.
- Non-restitution : 2 casiers.
- Créance financière créée : 7 200 FCFA.

La quantité retournée ne doit jamais entrer dans le calcul de la dette financière.

## 7.5. Retour tardif après conversion financière

Le système doit autoriser la restitution physique d'un emballage même si sa valeur a déjà été convertie en créance financière.

Il faut prévoir un mécanisme de régularisation contrôlé :

- Vérifier le type d'emballage.
- Vérifier la créance d'emballage d'origine.
- Identifier la quantité restituée.
- Enregistrer le retour tardif.
- Générer une contre-écriture financière ou un avoir correspondant à la valeur recouvrée.
- Mettre à jour le solde de la créance d'emballages.

Si la dette n'a pas encore été payée, le montant restant dû est réduit ou annulé à hauteur de la valeur restituée.

Si la dette a déjà été payée, le système doit produire un avoir ou un crédit au compte client. Tout remboursement en espèces doit suivre une opération de remboursement distincte et autorisée.

Ne jamais supprimer ou modifier silencieusement une ancienne créance.

L'historique doit permettre de comprendre :

- Pourquoi la dette a été créée.
- Quand elle a été créée.
- Quand l'emballage a été récupéré.
- Quelle valeur a été régularisée.
- Quelle somme reste due.

# 8. GESTION DES RETOURS D'EMBALLAGES CLIENTS

Créer un écran dédié :

**Clients → Retour d'emballages**

Fonctionnalités :

- Rechercher un client.
- Afficher ses emballages en attente.
- Afficher les dates d'échéance.
- Afficher les emballages échus.
- Afficher les emballages déjà convertis en créances financières.
- Sélectionner le type d'emballage retourné.
- Saisir la quantité.
- Valider le retour.
- Afficher le nouveau solde d'emballages.
- Afficher l'éventuelle régularisation financière.

Chaque retour doit incrémenter le stock physique des emballages vides récupérés.

Interdire le retour d'une quantité supérieure à ce que le client doit réellement, sauf réception exceptionnelle autorisée et tracée.

Le système doit permettre de consulter l'historique complet des retours d'un client.

# 9. GESTION DES FOURNISSEURS ET DU RÉAPPROVISIONNEMENT

## 9.1. Création du fournisseur

Avant tout réapprovisionnement, le sous-dépôt doit pouvoir créer et enregistrer son fournisseur.

Informations :

- Nom ou raison sociale.
- Contact principal.
- Téléphone.
- Adresse.
- Informations complémentaires.
- Brasserie(s) ou produits fournis.
- Conditions commerciales.
- Historique des commandes.
- Historique des livraisons.
- Historique des retours d'emballages.

## 9.2. Règle commerciale du réapprovisionnement

Le sous-dépôt commande des boissons pleines au fournisseur.

Dans le modèle opérationnel standard, le fournisseur accepte le réapprovisionnement en échange de la remise d'un nombre équivalent de casiers vides compatibles.

Exemple :

Le sous-dépôt commande :

- 20 casiers Bock 33 cl.
- 10 casiers Bock 50 cl.

Le sous-dépôt doit remettre au fournisseur :

- 20 casiers vides compatibles Bock 33 cl.
- 10 casiers vides compatibles Bock 50 cl.

Le système doit gérer les retours par type exact d'emballage et non uniquement par nombre total de casiers.

Un casier de 33 cl ne doit pas automatiquement être considéré comme équivalent à un casier de 50 cl.

Une équivalence différente ne peut être acceptée que si elle a été explicitement configurée ou validée.

## 9.3. Workflow de réapprovisionnement

1. L'utilisateur sélectionne un fournisseur.
2. Il crée une nouvelle commande.
3. Il ajoute les références et les quantités souhaitées.
4. Le système calcule les emballages vides nécessaires.
5. Il affiche le stock disponible de boissons pleines.
6. Il affiche le stock disponible d'emballages vides.
7. Il prépare l'opération de remise des emballages.
8. L'utilisateur confirme la quantité effectivement remise.
9. Le fournisseur livre les boissons pleines.
10. L'utilisateur valide les quantités effectivement reçues.
11. Le stock de boissons pleines augmente.
12. Le stock de casiers vides diminue.
13. La commande est mise à jour.

Autoriser une livraison partielle si le fournisseur et le dépôt acceptent cette situation. Les quantités réellement reçues et les quantités réellement remises doivent être enregistrées indépendamment des quantités initialement commandées.

## 9.4. Absence de dette automatique sur les emballages fournisseurs

Dans le fonctionnement standard défini pour le projet :

- Le retour d'emballages au fournisseur se fait dans le cadre de l'échange de réapprovisionnement.
- Il n'y a pas de dette financière automatique créée pour les emballages échangés.
- Il n'y a pas de créance financière automatique liée à un déséquilibre d'emballages.
- Le système doit signaler une quantité insuffisante avant validation de l'échange.
- Toute exception doit nécessiter une décision explicite et être enregistrée.

Ne pas appliquer automatiquement aux fournisseurs la règle de conversion des emballages non restitués applicable aux clients. Une règle spécifique fournisseur ne pourra exister que si elle est expressément configurée pour un accord commercial particulier.

# 10. GESTION DES STOCKS

Maintenir des stocks distincts :

1. Stock de boissons pleines.
2. Stock de casiers vides.
3. Éventuellement, stocks d'autres emballages suivis.
4. Stock endommagé ou en attente de décision, si le dépôt le souhaite.

Chaque mouvement doit être tracé.

Types de mouvements :

- Réception fournisseur.
- Vente client.
- Retour d'emballages client.
- Retour d'emballages fournisseur.
- Inventaire.
- Ajustement.
- Perte.
- Casse.
- Destruction.
- Régularisation.

Chaque mouvement doit contenir :

- Identifiant.
- Type de mouvement.
- Référence concernée.
- Quantité.
- Stock avant.
- Stock après.
- Source de l'opération.
- Date et heure.
- Utilisateur responsable.
- Commentaire éventuel.

Il doit être impossible de modifier directement le stock sans produire un mouvement historique.

# 11. COMPTES CLIENTS ET COMPTABILITÉ

## 11.1. Séparation des comptes

Prévoir des registres distincts :

- `customer_commercial_ledger`
- `customer_packaging_ledger`
- `customer_financial_ledger`
- `customer_payment_ledger`

Le compte commercial suit les ventes, paiements et créances de marchandises.

Le compte emballages suit les obligations physiques et les retours.

Le compte financier d'emballages suit uniquement les montants devenus exigibles à la suite d'une conversion valide.

Le compte des paiements suit les règlements et remboursements.

La valeur indicative d'un emballage en attente ne doit pas être comptabilisée comme une créance financière exigible.

## 11.2. Tableau de bord client

Pour chaque client, afficher distinctement :

- Solde commercial débiteur.
- Montant total payé.
- Montant total des ventes.
- Emballages physiquement dus.
- Emballages retournés.
- Emballages échus non restitués.
- Valeur indicative des emballages en attente.
- Créances financières d'emballages.
- Paiements affectés aux créances d'emballages.
- Avoirs liés aux retours tardifs.
- Total financier restant dû.

La valeur indicative doit être clairement identifiée comme telle.

Ne pas présenter une valeur indicative comme une somme immédiatement exigible.

# 12. INVENTAIRES ET RÉGULARISATIONS

Créer un module d'inventaire complet pour :

- Les boissons pleines.
- Les casiers vides.
- Les emballages récupérés.
- Les emballages endommagés.
- Les emballages en attente d'une décision.

L'inventaire doit comparer le stock théorique et le stock réel.

Toute différence doit être justifiée.

Une perte ou une destruction d'emballages doit pouvoir être associée à :

- Un événement interne.
- Un client.
- Un fournisseur.
- Un mouvement d'inventaire.

Si la perte est imputable à un client et que les conditions sont remplies, créer la créance financière correspondante.

Un ajustement de stock ne doit jamais créer automatiquement une dette client sans lien explicite avec une obligation documentée et validée.

# 13. BASE DE DONNÉES SQLITE

Concevoir un schéma relationnel propre, normalisé et documenté.

Tables principales attendues :

### Catalogue et référentiels

- `breweries`
- `brands`
- `products`
- `product_variants`
- `packaging_types`
- `product_packaging`
- `catalog_sources`
- `catalog_change_logs`

### Fournisseurs

- `suppliers`
- `supplier_products`
- `supplier_orders`
- `supplier_order_lines`
- `supplier_deliveries`
- `supplier_delivery_lines`
- `supplier_packaging_returns`

### Clients et ventes

- `customers`
- `sales`
- `sale_lines`
- `customer_payments`
- `customer_credit_notes`

### Emballages

- `packaging_policies`
- `packaging_valuations`
- `customer_packaging_obligations`
- `customer_packaging_returns`
- `packaging_movements`
- `packaging_conversions`
- `packaging_adjustments`

### Stocks

- `stock_locations`
- `stock_movements`
- `stock_inventory_sessions`
- `stock_inventory_lines`

### Comptabilité auxiliaire et audit

- `customer_commercial_ledger`
- `customer_packaging_financial_ledger`
- `customer_payment_ledger`
- `supplier_account_ledger`
- `cash_transactions`
- `audit_logs`

Les noms et la structure définitive peuvent être améliorés par l'architecte, mais toutes les séparations métier exigées doivent être conservées.

## 13.1. Structure d'une obligation d'emballages

La table `customer_packaging_obligations` doit notamment permettre de conserver :

- `id`
- `customer_id`
- `sale_id`
- `sale_line_id`
- `product_variant_id`
- `packaging_type_id`
- `quantity_due`
- `quantity_returned`
- `quantity_lost`
- `quantity_destroyed`
- `quantity_converted`
- `unit_value_snapshot`
- `total_reference_value`
- `obligation_date`
- `due_date`
- `policy_id`
- `status`
- `created_at`
- `updated_at`

La structure peut être adaptée si une conception événementielle plus robuste est retenue.

## 13.2. Règle de valorisation historique

La valeur d'emballage utilisée pour une vente doit être conservée dans l'enregistrement de l'obligation.

Une modification future du catalogue ou de la valeur de l'emballage ne doit pas changer les créances historiques.

Toute régularisation doit utiliser la valeur et les paramètres applicables à l'opération d'origine, sauf correction explicitement autorisée.

## 13.3. Intégrité financière

Toute conversion d'une obligation physique en créance financière doit être enregistrée dans une transaction SQLite unique :

1. Vérifier la quantité encore non restituée.
2. Vérifier la quantité déjà convertie.
3. Calculer le montant applicable.
4. Enregistrer le mouvement de conversion.
5. Créer l'écriture financière correspondante.
6. Mettre à jour le statut et les quantités.
7. Enregistrer l'utilisateur et la date.

Si une étape échoue, toute la transaction doit être annulée.

Prévoir des contraintes, index et clés étrangères adaptés.

# 14. ÉCRANS ET EXPÉRIENCE UTILISATEUR

Créer des écrans professionnels, modernes et intuitifs.

Navigation principale recommandée :

- Tableau de bord.
- Ventes.
- Clients.
- Fournisseurs.
- Réapprovisionnement.
- Catalogue.
- Stocks.
- Retours d'emballages.
- Inventaires.
- Caisse et finances.
- Rapports.
- Administration.
- Paramètres.

Écrans particuliers :

**Catalogue**

- Vue par brasserie.
- Vue par marque.
- Vue par produit.
- Vue par format.
- Recherche instantanée.
- Filtres.
- Création et modification.

**Fiche client**

- Historique des achats.
- Dette commerciale.
- Historique des paiements.
- Emballages dus.
- Emballages retournés.
- Échéances.
- Créances financières d'emballages.
- Avoirs et régularisations.

**Suivi des emballages**

- Emballages en attente.
- Emballages bientôt échus.
- Emballages échus.
- Pertes déclarées.
- Emballages convertis en créances.
- Retours tardifs.
- Historique des mouvements.

**Fournisseur**

- Commandes.
- Livraisons.
- Quantités de boissons pleines reçues.
- Casiers vides remis.
- Historique des échanges.
- Écarts constatés.

Le design doit permettre de comprendre immédiatement la différence entre une dette commerciale, un emballage physiquement dû et une dette financière d'emballages.

Ne jamais utiliser le mot « consigne » dans les libellés fonctionnels, les écrans, les rapports ou les notifications. Utiliser le vocabulaire métier du projet :

- Retour d'emballages.
- Emballages dus.
- Emballages retournés.
- Emballages échus.
- Emballages non restitués.
- Stock de casiers vides.
- Créance financière d'emballages.
- Historique des retours.

# 15. NOTIFICATIONS ET ALERTES

Créer des alertes configurables :

- Emballages proches de leur date limite.
- Emballages arrivés à échéance.
- Emballages non restitués.
- Conversion en créance financière.
- Client ayant plusieurs obligations en retard.
- Stock insuffisant de casiers vides pour un réapprovisionnement.
- Écart d'inventaire.
- Produit proche de la rupture.

L'application étant utilisable hors connexion, les échéances doivent être recalculées à chaque démarrage et lors des opérations appropriées.

Le traitement des échéances doit être idempotent et ne doit pas dépendre d'une connexion Internet.

Si l'application était fermée à la date d'échéance, elle doit identifier les obligations devenues échues au prochain démarrage et appliquer les règles de conversion prévues.

Afficher une notification et conserver une trace de chaque conversion.

# 16. DROITS ET AUTORISATIONS

Prévoir au minimum les rôles suivants :

### OWNER / SUPER ADMIN

- Gestion du catalogue standard.
- Gestion des paramètres globaux.
- Gestion des utilisateurs et rôles.
- Configuration des politiques de restitution.
- Consultation de toutes les données.
- Validation des opérations sensibles.
- Exportation et sauvegarde.

### ADMINISTRATEUR DU DÉPÔT

- Gestion opérationnelle du dépôt.
- Paramètres locaux autorisés.
- Gestion des clients et fournisseurs.
- Gestion des ventes et achats.
- Validation des retours et des inventaires selon ses droits.

### CAISSIER

- Ventes.
- Paiements.
- Consultation de certaines données clients.
- Retours d'emballages autorisés.

### MAGASINIER

- Réception.
- Stock.
- Inventaires.
- Préparation des retours d'emballages.
- Mouvements autorisés.

Les droits doivent être contrôlés par le backend, pas uniquement masqués dans l'interface.

Toute opération financière sensible doit enregistrer l'utilisateur responsable.

# 17. SAUVEGARDE, HISTORIQUE ET AUDIT

La base locale doit pouvoir être sauvegardée et restaurée.

Prévoir :

- Sauvegardes automatiques.
- Sauvegardes manuelles.
- Export du catalogue standard.
- Import du catalogue standard.
- Journal d'activité.
- Historique des modifications.
- Historique des ventes.
- Historique des retours.
- Historique des conversions financières.
- Historique des corrections et avoirs.

Aucune suppression de données financières ou d'emballages déjà mouvementés ne doit être effectuée sans procédure contrôlée.

# 18. TESTS MÉTIER OBLIGATOIRES

Créer des tests unitaires et des tests d'intégration pour les scénarios suivants.

### Test 1 — Vente partiellement payée

Vente :

- 1 casier Bock 33 cl : 12 000 FCFA.
- Paiement : 8 000 FCFA.
- Valeur de l'emballage : 3 600 FCFA.

Résultat attendu avant échéance :

- Dette commerciale : 4 000 FCFA.
- Emballages dus : 1.
- Valeur indicative : 3 600 FCFA.
- Créance financière d'emballages : 0 FCFA.

### Test 2 — Restitution avant échéance

Le client restitue son casier avant la date limite.

Résultat :

- Emballages dus : 0.
- Emballages retournés : 1.
- Créance financière d'emballages : 0 FCFA.
- Stock de casiers vides augmenté de 1.

### Test 3 — Non-restitution à échéance

Le client ne restitue pas le casier.

Résultat :

- Créance commerciale : 4 000 FCFA.
- Créance financière d'emballages : 3 600 FCFA.
- Total financier dû : 7 600 FCFA.
- Quantité physique en attente : 0 pour la quantité convertie.
- Historique de conversion conservé.

### Test 4 — Restitution partielle

Le client doit 5 casiers et en restitue 3 avant échéance.

Résultat :

- 3 casiers sont soldés physiquement.
- 2 casiers restent à restituer.
- À échéance, seuls les 2 casiers restants sont convertis.

### Test 5 — Perte avant échéance

Le client déclare avoir perdu un casier et la déclaration est validée.

Résultat :

- La quantité concernée est convertie immédiatement selon la politique.
- Une créance financière est générée une seule fois.
- Le motif et le responsable sont enregistrés.

### Test 6 — Retour tardif

Un casier est restitué après sa conversion en créance financière.

Résultat :

- Le retour physique est enregistré.
- La créance est régularisée par une contre-écriture ou un avoir.
- Si elle a déjà été payée, un crédit client ou un remboursement autorisé est généré.
- L'historique initial reste intact.

### Test 7 — Réapprovisionnement fournisseur

Commande :

- 20 casiers Bock 33 cl.
- 10 casiers Bock 50 cl.

Échange :

- 20 casiers vides compatibles 33 cl remis.
- 10 casiers vides compatibles 50 cl remis.

Résultat :

- 20 casiers pleins 33 cl ajoutés au stock.
- 10 casiers pleins 50 cl ajoutés au stock.
- 30 casiers vides déduits du stock.
- Aucun compte de dette financière d'emballages créé automatiquement.

### Test 8 — Produit non restituable

Un client achète un carton de 24 canettes.

Résultat :

- Stock commercial décrémenté.
- Aucune obligation de retour de casier créée.
- Aucune échéance d'emballages créée.

### Test 9 — Modification de valeur du catalogue

Une valeur d'emballage passe de 3 600 à 4 000 FCFA.

Résultat :

- Les nouvelles ventes utilisent la nouvelle valeur.
- Les obligations historiques conservent leur valeur d'origine.
- Les créances historiques ne sont pas recalculées rétroactivement.

### Test 10 — Traitement répété des échéances

Le traitement des échéances est exécuté deux fois.

Résultat :

- Une seule conversion financière est créée.
- Aucun doublon dans le compte client.
- Aucun double comptage dans les rapports.

### Test 11 — Catalogue standard

L'owner crée un nouveau produit, modifie un conditionnement puis archive une référence.

Résultat :

- Le produit est disponible dans le catalogue après création.
- Les nouvelles ventes utilisent les nouveaux paramètres.
- Les historiques existants restent intacts.
- La référence archivée ne peut plus être sélectionnée pour une nouvelle vente, sauf réactivation.

# 19. CRITÈRES D'ACCEPTATION

La fonctionnalité sera considérée comme terminée uniquement lorsque :

1. Le catalogue standard existe et est préchargé.
2. Les produits sont bien séparés par brasserie, marque et variantes.
3. L'owner peut créer, modifier et supprimer ou archiver les références.
4. Les conditionnements et volumes sont configurables.
5. Les fournisseurs sont indépendants des brasseries.
6. Le réapprovisionnement suit la règle d'échange des emballages vides.
7. Les ventes génèrent correctement les obligations physiques d'emballages.
8. Les ventes à crédit distinguent la dette commerciale de l'obligation physique.
9. Les délais de restitution sont configurables.
10. Une non-restitution échue peut devenir une créance financière.
11. Une perte ou destruction validée peut déclencher cette conversion.
12. Les retours partiels sont correctement calculés.
13. Les retours tardifs peuvent régulariser la créance financière.
14. Les valeurs historiques restent conservées.
15. Les stocks pleins et vides sont séparés.
16. Les écritures financières sont cohérentes et sans doublons.
17. Les rapports affichent séparément les créances commerciales et celles d'emballages.
18. L'application fonctionne hors connexion.
19. Les données historiques et les journaux d'audit sont préservés.
20. Tous les scénarios de tests métier passent.

# 20. MÉTHODE D'EXÉCUTION IMPOSÉE À L'AGENT IA

Ne développe pas tous les modules de manière désordonnée.

Respecte les phases suivantes :

**PHASE 1 — Audit de l'existant**

- Examiner l'architecture du projet.
- Examiner les tables SQLite existantes.
- Identifier les modules déjà développés.
- Identifier les incohérences du modèle métier.
- Établir les migrations nécessaires.
- Ne pas supprimer les fonctionnalités existantes sans justification.

**PHASE 2 — Conception des données**

- Définir les entités et leurs relations.
- Définir les contraintes d'intégrité.
- Définir les registres commerciaux et d'emballages.
- Définir les règles d'échéance et de conversion.
- Documenter les migrations SQLite.

**PHASE 3 — Catalogue standard**

- Créer les tables de référence.
- Précharger les données SOLIBRA vérifiées.
- Ajouter les structures pour les autres brasseries.
- Développer les interfaces d'administration par l'owner.
- Implémenter les règles d'archivage et d'audit.

**PHASE 4 — Gestion des emballages**

- Implémenter les types et valeurs d'emballages.
- Implémenter les politiques de restitution.
- Implémenter les obligations physiques.
- Implémenter les retours partiels.
- Implémenter les échéances.
- Implémenter les conversions financières.
- Implémenter les retours tardifs et les régularisations.

**PHASE 5 — Fournisseurs et réapprovisionnement**

- Implémenter les fournisseurs.
- Implémenter les commandes.
- Implémenter la remise des emballages vides.
- Implémenter les réceptions partielles.
- Implémenter les mouvements de stock.

**PHASE 6 — Clients et ventes**

- Intégrer les obligations d'emballages aux ventes.
- Gérer les crédits clients.
- Gérer les paiements.
- Synchroniser les registres sans mélanger les soldes.

**PHASE 7 — Interface et rapports**

- Développer les écrans.
- Ajouter les filtres.
- Ajouter les alertes.
- Ajouter les tableaux de bord.
- Produire les rapports détaillés.

**PHASE 8 — Tests et validation**

- Exécuter tous les tests métier.
- Tester les transactions concurrentes.
- Tester les restaurations.
- Tester les échéances après fermeture de l'application.
- Vérifier l'absence de doublons.
- Corriger tous les problèmes bloquants.

À chaque phase, produire un bilan des changements effectués, des fichiers créés ou modifiés, des migrations réalisées et des tests exécutés.

Ne prétends jamais qu'une fonctionnalité est terminée si elle n'a pas été implémentée et testée.

---

# INSTRUCTION FINALE

La priorité absolue est la cohérence métier.

Le système doit comprendre qu'un casier vendu avec une boisson peut créer une obligation physique de restitution, que cette obligation possède une valeur configurable et que cette valeur peut devenir une créance financière si la restitution n'a pas été faite dans les conditions exigées par le sous-dépôt.

Le système doit également comprendre que les retours d'emballages entre le sous-dépôt et son fournisseur relèvent d'un processus d'échange distinct.

Enfin, le catalogue standard doit être une véritable base de référence administrable par l'owner, et non une liste de produits figée dans le code.

**Ne simplifie pas ces règles. Ne mélange jamais les comptes commerciaux, les obligations physiques d'emballages et les créances financières d'emballages. Implémente le modèle de manière traçable, transactionnelle et vérifiable.**

**Point de conception important :** j'ai prévu que le système conserve la valeur de l'emballage au moment de la vente. Ainsi, si l'owner passe la valeur d'un casier de 3 600 à 4 000 FCFA, les anciennes obligations ne changent pas rétroactivement. J'ai également intégré la restitution tardive : un client qui rend finalement son casier après facturation doit pouvoir obtenir la régularisation correspondante, sans effacement de l'historique.

Le catalogue SOLIBRA doit rester une **base de référence évolutive**, et non un catalogue verrouillé : l'owner peut le faire grandir, le corriger et l'adapter aux réalités constatées auprès des fournisseurs.
