# Guide Utilisateur — DEPOTPRO PREMIUM V3

Ce guide décrit les opérations courantes du dépôt au quotidien dans **DEPOTPRO PREMIUM V3** (Web et Desktop). Tous les montants sont gérés en **FCFA entiers** et les quantités jusqu'au millième d'unité (`0,001`).

---

## 1. Premier démarrage et sécurité PIN

- Au tout premier lancement, aucun code PIN par défaut n'est prédéfini.
- Saisissez un **code PIN personnel à 6 chiffres** à l'aide du clavier tactile ou du clavier physique, puis confirmez-le.
- En cas de 5 tentatives erronées consécutives, la connexion est temporairement verrouillée.
- Vous pouvez verrouiller l'application à tout moment depuis l'en-tête supérieur ou modifier votre PIN dans **Paramètres → Sécurité**.

## 2. Navigation rapide & raccourcis clavier

- **`Ctrl + K` (ou `Cmd + K`)** : ouvre la **recherche globale** pour accéder directement à un écran, un produit, un client, un fournisseur ou une vente.
- **Thème Clair / Sombre** : bascule instantanée depuis l'en-tête (persistée localement).
- **Aide contextuelle (`?` / boutons d'aide)** : disponible sur chaque formulaire et écran pour rappeler les règles métier et contrôles de saisie.
- **Alertes échéances dépassées** : un badge rouge/ambre dans l'en-tête et des bandeaux sur le **Tableau de bord** signalent immédiatement les créances clients ou dettes fournisseurs arrivées à échéance.

## 3. Routine d'ouverture & clôture de caisse (**Caisse**)

1. Avant toute vente, rendez-vous dans **Caisse** et cliquez sur **Ouvrir une session de caisse**.
2. Saisissez le **fond de caisse initial en espèces** présent dans le tiroir.
3. En cours de journée :
   - Les paiements en espèces augmentent/diminuent les **espèces théoriques en tiroir**.
   - Les paiements digitaux (**Wave**, **Orange Money**, **MTN Money**, etc.) sont suivis **séparément** dans le total digital, sans fausser le tiroir espèces.
4. En fin de journée, cliquez sur **Clôturer la caisse**, saisissez le montant **physique compté** :
   - Si l'écart est nul (`0 FCFA`), la clôture est directe.
   - Si un écart existe (`!= 0`), un **commentaire justificatif obligatoire** doit être renseigné.
5. Exportez les mouvements (`CSV Mouvements`), les sessions (`CSV Sessions`) ou imprimez le **Rapport de caisse** PDF.

## 4. Produits, conditionnements & photos (**Produits**)

- Créez vos catégories puis vos produits (avec unité de base : `bouteille`, `canette`, `pack` ou `carton`, seuil d'alerte minimum, tarifs gros/demi-gros/détail et photo locale optionnelle).
- Configurez plusieurs **conditionnements** sur un même produit (ex. : `bouteille ×1`, `pack ×6`, `casier ×24`), leurs codes-barres respectifs et leur éventuel **emballage consigné** lié.
- Utilisez **Export CSV** et **Import CSV** pour importer ou archiver rapidement votre catalogue.

## 5. Point de vente rapide (**Nouvelle vente**)

- **`F2`** : place le curseur dans la barre de recherche / scan code-barres. Scannez un code-barres + `Entrée` pour ajouter instantanément le conditionnement correspondant au panier.
- Sélectionnez la grille tarifaire (**Détail**, **Demi-gros**, **Gros**), puis cliquez sur un conditionnement.
- **Client & crédit** : laissez *Client Comptoir* pour une vente au comptant, sélectionnez un client existant (la fiche affiche immédiatement son plafond disponible, son solde dû et ses vides), ou créez un client à la volée via **Nouveau client**.
- **Paniers en attente** : cliquez sur **Mettre en attente** si un client complète sa commande plus tard, puis reprenez le ticket via **En attente**.
- **Paiements mixtes** : utilisez **+ Ajouter moyen** pour combiner espèces + Wave + Orange Money, ou cliquez sur **Solder** pour préremplir le total exact.
- **`F9`** : valide la vente et génère immédiatement le reçu ou la facture imprimable / PDF (`REÇU DE VENTE` ou `FACTURE`). **`Échap`** ferme les fenêtres ouvertes.

## 6. Historique des ventes, retours & annulations (**Historique ventes**)

- Filtrez par référence/client, par statut (`Validées`, `Retour partiel`, `Retournées`, `Annulées`) ou par plage de dates (**Du … au …**), puis exportez en CSV (`Exporter CSV`).
- Ouvrez **Détails** sur une vente pour :
  - Imprimer ou exporter le PDF (`FACTURE` / `REÇU DE VENTE`),
  - Effectuer un **retour partiel** générant un **Avoir (`AVO-*`)** avec remise en stock optionnelle et remboursement sur le canal choisi,
  - **Annuler** une vente par contre-écriture non destructive (restauration stock, annulation créance, remboursement caisse/Wave/etc. selon le moyen choisi).

## 7. Clients, créances & fournisseurs (**Clients**, **Créances**, **Fournisseurs**, **Approvisionnements**)

- **Clients & Créances** : la politique de crédit (`interdit`, `limité`, `illimité`) est explicitement définie sur chaque fiche client. Dans **Créances**, consultez les jours de retard (`+X j retard`), l'historique des versements, encaissez en paiement simple ou mixte, exportez en CSV ou imprimez l'**État des créances clients**.
- **Approvisionnements** :
  1. Créez un **Bon de commande (`CMD-*`)** — cela n'augmente pas encore le stock.
  2. Tant qu'aucune réception n'a eu lieu, une commande erronée peut être **annulée avec motif obligatoire**.
  3. À la livraison, cliquez sur **Réceptionner** pour enregistrer les quantités reçues (réception totale ou partielle avec motif d'écart). Cela met à jour le stock, recalcule le **CUMP** et crée la dette fournisseur.
  4. Consultez **Écarts & Dettes** et réglez les dettes fournisseurs depuis **Fournisseurs** ou exportez l'historique en CSV.

## 8. Stocks, inventaires & consignations (**Stocks**, **Inventaires**, **Consignations**)

- **Stocks** : suivez le stock consolidé en unité de base, la valorisation CUMP (ou *Coût non renseigné* si aucun coût n'est connu), effectuez des **ajustements manuels motivés** (`ADJ-*` pour casse, perte, don, échantillon) et exportez soldes ou mouvements en CSV / PDF.
- **Inventaires** : lancez un inventaire, filtrez par nom/référence ou **Écarts uniquement** pendant le comptage sans perdre les autres lignes saisies, motivez les écarts et validez.
- **Consignations** : gérez le catalogue des emballages vides, ajustez le stock de vides au dépôt (entrées, casses, pertes), enregistrez les retours clients en **bon état** ou **endommagés/cassés** (avec remboursement ou déduction sur créance) et imprimez le reçu ou l'**État des consignations**.

## 9. Dépenses, rapports, paramètres & sauvegardes

- **Dépenses** : enregistrez les charges par catégorie et mode de règlement (seules les dépenses en **espèces** impactent le tiroir caisse), joignez une **photo justificative** (`receipt_path`) consultable à tout moment et exportez le journal en CSV.
- **Rapports** : explorez les 6 onglets (**Commercial & Finances**, **Stock & Valorisation**, **Caisse & Trésorerie**, **Créances clients**, **Fournisseurs & Dettes**, **Consignations**) filtrés par dates, avec exports CSV et PDF dédiés.
- **Paramètres** : personnalisez les coordonnées et le **logo du dépôt** (affiché sur tous les documents imprimés/PDF), les préfixes de numérotation, l'autorisation de stock négatif, les moyens de paiement et le code PIN.
- **Sauvegardes** : créez des sauvegardes SQLite cohérentes (`VACUUM INTO`, conservation automatique des 30 dernières archives), vérifiez leur intégrité, exportez-les sur un support externe ou restaurez une archive avec pré-sauvegarde automatique de sécurité.
