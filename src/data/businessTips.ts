export interface TipTabGuide {
  name: string;
  role: string;
  whenToUse: string;
}

export interface TipFieldGuide {
  formName: string;
  field: string;
  meaning: string;
  rule: string;
  example?: string;
}

export interface TipTopic {
  id: string;
  group: 'Commerce & Caisse' | 'Catalogue & Stock' | 'Tiers & Consignations' | 'Pilotage & Système';
  route: string;
  title: string;
  subtitle: string;
  goldenRule: string;
  tabs: TipTabGuide[];
  fields: TipFieldGuide[];
  pitfalls: string[];
}

export const BUSINESS_TIPS_TOPICS: TipTopic[] = [
  {
    id: 'dashboard',
    group: 'Pilotage & Système',
    route: '/',
    title: 'Tableau de bord',
    subtitle: 'Lecture des KPI temps réel et du graphique mensuel des ventes',
    goldenRule:
      "Le chiffre d'affaires marchandises exclut toujours les consignations d'emballages : une consigne est un dépôt de garantie remboursable, jamais un revenu commercial.",
    tabs: [
      {
        name: 'Ventes journalières du mois en cours',
        role: 'Courbe/barres alimentée par /api/reports sur le mois civil courant (du 1er au dernier jour du mois).',
        whenToUse: 'Pour comparer le rythme journalier de facturation marchandises et les encaissements effectifs.',
      },
      {
        name: 'Espèces théoriques vs Numérique',
        role: 'Sépare strictement le contenu physique du tiroir-caisse des encaissements Wave / Orange / MTN / Virement.',
        whenToUse: 'Avant un versement banque ou une clôture de session pour contrôler le tiroir.',
      },
    ],
    fields: [
      {
        formName: 'Graphique mensuel (/api/reports)',
        field: "Chiffre d'affaires marchandises vs Encaissé",
        meaning: "Le CA mesure la valeur facturée des boissons vendues hors emballages consignés ; l'Encaissé mesure l'argent réellement perçu ce jour-là (comptant + acomptes).",
        rule: "Les ventes annulées sont exclues du total ; une vente à crédit apparaît dans le CA le jour de facturation et dans l'encaissé uniquement lors des règlements.",
        example: 'Vente à crédit 120 000 FCFA avec acompte 40 000 FCFA → CA = 120 000 FCFA, Encaissé = 40 000 FCFA.',
      },
      {
        formName: 'Indicateurs Stocks',
        field: 'Stock faible / Ruptures de stock',
        meaning: "Compte les produits actifs dont le stock en unité de base est inférieur ou égal au seuil minimum configuré.",
        rule: 'Exclut les produits archivés. Cliquez sur « Nouvel approvisionnement » pour passer commande.',
      },
    ],
    pitfalls: [
      "Ne confondez pas encaissements totaux et chiffre d'affaires : un client qui règle une ancienne créance augmente les encaissements du jour sans augmenter le CA du mois.",
      'Si la caisse est fermée, aucun encaissement en espèces ou digital ne peut être validé au comptoir.',
    ],
  },
  {
    id: 'sales-pos',
    group: 'Commerce & Caisse',
    route: '/sales/new',
    title: 'Nouvelle vente (Point de vente)',
    subtitle: 'Grilles tarifaires, conditionnements, consignations et paiements mixtes',
    goldenRule:
      'Une vente validée déduit le stock en milli-unités exactes, génère les écritures de caisse et crée automatiquement la consigne client si le conditionnement est consigné.',
    tabs: [
      {
        name: 'Grille tarifaire (Détail / Demi-gros / Gros)',
        role: 'Recalcule immédiatement le prix unitaire des articles du panier selon la catégorie de client.',
        whenToUse: 'Sélectionnez Gros pour les maquis/revendeurs, Demi-gros pour les événements, Détail au comptoir.',
      },
      {
        name: 'Type de vente (Comptant / À crédit)',
        role: 'Comptant exige que le total saisi couvre 100 % du net à payer ; À crédit autorise un reste dû si le client y a droit.',
        whenToUse: 'Utilisez À crédit uniquement pour un client nommé disposant d’une politique limitée ou illimitée.',
      },
    ],
    fields: [
      {
        formName: 'Panier de vente',
        field: 'Client',
        meaning: 'Identifie le tiers facturé et détermine les droits au crédit ainsi que le suivi des emballages consignés.',
        rule: 'Le Client Comptoir (Anonyme) ne peut acheter qu’au comptant et sans crédit.',
        example: 'Pour un bar achetant 10 casiers à régler sous 15 jours, sélectionnez sa fiche client avant de valider.',
      },
      {
        formName: 'Panier de vente',
        field: 'Quantité & Conditionnement',
        meaning: 'Chaque conditionnement (casier, pack, carton, bouteille) convertit votre saisie vers le stock de base via son coefficient exact.',
        rule: 'Les quantités fractionnaires (ex : 0,5 casier) ne sont autorisées que si le conditionnement l’autorise.',
        example: '1 casier × 24 bouteilles = 24 bouteilles déduites du stock atomiquement.',
      },
      {
        formName: 'Panier de vente',
        field: 'Remise globale (FCFA)',
        meaning: 'Déduction commerciale entière appliquée sur le sous-total marchandises uniquement.',
        rule: 'Ne peut jamais dépasser le montant marchandises ni réduire les consignes d’emballages.',
      },
      {
        formName: 'Encaissement',
        field: 'Paiement mixte (+ Ajouter moyen)',
        meaning: 'Permet de répartir un règlement sur plusieurs canaux (ex : Espèces + Wave) dans la même facture.',
        rule: 'Requiert une session de caisse ouverte dès qu’au moins un montant payé est supérieur à 0 FCFA.',
        example: 'Total 35 000 FCFA = 20 000 FCFA Espèces + 15 000 FCFA Wave.',
      },
    ],
    pitfalls: [
      "Ne validez pas une vente à crédit sans avoir vérifié le plafond du client dans Clients → Crédit.",
      'Les consignes s’additionnent automatiquement au Total à payer dès que le conditionnement lié porte un emballage consigné.',
    ],
  },
  {
    id: 'sales-history',
    group: 'Commerce & Caisse',
    route: '/sales',
    title: 'Historique des ventes & Avoirs',
    subtitle: 'Contre-écriture d’annulation, retours partiels et impression',
    goldenRule:
      'Aucune facture validée n’est jamais effacée : toute correction passe soit par une annulation par contre-écriture intégrale, soit par un retour partiel générant un avoir numéroté.',
    tabs: [
      {
        name: 'Filtres Statut (Validées / Retour partiel / Retournées / Annulées)',
        role: 'Isole rapidement les factures ayant subi un retour ou une annulation.',
        whenToUse: 'Pour contrôler les avoirs émis sur une période ou retrouver une facture.',
      },
      {
        name: 'Détail facture → Retour & Avoir / Annuler la vente',
        role: 'Ouvre les actions correctives auditées sur la facture sélectionnée.',
        whenToUse: 'Annuler si toute la vente est erronée (et sans retour déjà émis) ; Retour & Avoir si le client ramène une partie de la marchandise.',
      },
    ],
    fields: [
      {
        formName: 'Annulation par contre-écriture',
        field: 'Motif obligatoire',
        meaning: 'Trace dans le journal d’audit la raison exacte de la contre-passation.',
        rule: 'Réintègre 100 % du stock vendu, annule la créance éventuelle et rembourse les montants encaissés sur la session de caisse ouverte.',
      },
      {
        formName: 'Retour de marchandises',
        field: 'Quantité retournée (unité de base)',
        meaning: 'S’exprime en unité de base (bouteille, canette...) dans la limite des quantités non encore retournées.',
        rule: 'Calcule l’avoir au prorata exact, réduit d’abord la créance client ouverte puis rembourse l’excédent si déjà payé.',
      },
      {
        formName: 'Retour de marchandises',
        field: 'Réintégrer les marchandises en stock',
        meaning: 'Indique si les bouteilles ou packs retournés sont intacts et revendables.',
        rule: 'Décochez cette case pour les produits périmés ou abîmés afin de ne pas fausser le stock vendable.',
      },
    ],
    pitfalls: [
      'Une vente ayant déjà un avoir partiel ne peut plus être annulée globalement.',
      'Une session de caisse ouverte est obligatoire si l’annulation ou le retour implique un remboursement au client.',
    ],
  },
  {
    id: 'clients',
    group: 'Tiers & Consignations',
    route: '/clients',
    title: 'Clients & Politiques de crédit',
    subtitle: 'Segmentation comptant, plafond limité et suivi des vides dus',
    goldenRule:
      'La politique de crédit est explicite sur chaque fiche client : par défaut, un nouveau client est en Crédit interdit (comptant uniquement).',
    tabs: [
      {
        name: 'Liste Clients & Action Crédit',
        role: 'Affiche en temps réel le solde de créances et le nombre d’emballages consignés détenus par chaque client.',
        whenToUse: 'Avant d’accorder un nouveau délai de paiement ou de modifier un plafond.',
      },
    ],
    fields: [
      {
        formName: 'Nouveau client / Politique de crédit',
        field: 'Type (Particulier / Professionnel)',
        meaning: 'Distingue les acheteurs occasionnels des comptes professionnels réguliers (maquis, hôtels, bars, restaurants).',
        rule: 'Information commerciale pour la segmentation et les documents imprimés.',
      },
      {
        formName: 'Nouveau client / Politique de crédit',
        field: 'Politique de crédit explicite',
        meaning: 'Détermine si le POS autorise la vente à crédit pour ce client.',
        rule: 'forbidden = comptant obligatoire ; limited = crédit plafonné au montant saisi ; unlimited = crédit sans plafond.',
        example: 'Maquis Le Palmier : Plafond limité à 500 000 FCFA et échéance 15 jours.',
      },
      {
        formName: 'Nouveau client / Politique de crédit',
        field: 'Plafond autorisé & Échéance (jours)',
        meaning: 'Le plafond bloque toute nouvelle vente à crédit qui ferait dépasser le solde impayé autorisé ; l’échéance calcule automatiquement la date limite sur chaque facture.',
        rule: 'Si un client dépasse son délai ou son plafond, le POS bloque la validation tant qu’un règlement n’est pas encaissé.',
      },
    ],
    pitfalls: [
      'Ne passez pas un client en « Crédit illimité » sans accord de direction : en cas d’impayé, aucune alerte de plafond ne bloquera la vente.',
    ],
  },
  {
    id: 'debts',
    group: 'Tiers & Consignations',
    route: '/debts',
    title: 'Créances clients',
    subtitle: 'Recouvrement partiel ou total et relances d’échéances',
    goldenRule:
      'Chaque règlement de créance met à jour simultanément le reste dû de la facture, le solde client et les mouvements de la session de caisse ouverte.',
    tabs: [
      {
        name: 'Encaisser une créance',
        role: 'Permet un règlement total ou par acomptes successifs, y compris en paiement mixte.',
        whenToUse: 'Dès qu’un client vient solder ou réduire une facture à crédit.',
      },
    ],
    fields: [
      {
        formName: 'Encaisser créance',
        field: 'Paiement (simple ou mixte)',
        meaning: 'Enregistre la ventilation exacte entre espèces et paiements digitaux.',
        rule: 'La somme des parts doit être supérieure à 0 et ne peut pas dépasser le reste dû de la facture.',
        example: 'Reste dû 75 000 FCFA → règlement 50 000 FCFA Espèces + 25 000 FCFA Orange Money.',
      },
      {
        formName: 'Encaisser créance',
        field: 'Observation',
        meaning: 'Référence de bordereau, nom du porteur ou justificatif de virement.',
        rule: 'Conservée sur l’écriture de caisse et l’audit.',
      },
    ],
    pitfalls: [
      'Les dossiers dépassant la date du jour apparaissent marqués « (En retard) » et doivent être priorisés avant d’accorder un nouveau crédit.',
    ],
  },
  {
    id: 'products',
    group: 'Catalogue & Stock',
    route: '/products',
    title: 'Produits & Conditionnements',
    subtitle: 'Unité de base, coefficients exacts, tarification et consignes liées',
    goldenRule:
      'Le stock est toujours suivi dans l’unité de base la plus fine (bouteille, canette...) ; les conditionnements (casier, pack, carton) ne sont que des multiples de vente ou d’achat.',
    tabs: [
      {
        name: 'Modifier / Nouveau produit',
        role: 'Définit l’identité article, l’unité de base, le seuil d’alerte et les prix de base.',
        whenToUse: 'Lors de la création d’une référence ou pour ajuster ses prix catalogue.',
      },
      {
        name: 'Configurer les conditionnements (icône couches)',
        role: 'Associe des formats de vente/achat (casier ×24, pack ×6...) et leur éventuel emballage consigné.',
        whenToUse: 'Obligatoire pour vendre un casier ou appliquer automatiquement la consigne au POS.',
      },
      {
        name: 'Import / Export CSV',
        role: 'Permet de sauvegarder ou d’importer rapidement un catalogue séparé par points-virgules (;).',
        whenToUse: 'Lors de la mise en place initiale ou d’une mise à jour en masse.',
      },
    ],
    fields: [
      {
        formName: 'Nouveau produit',
        field: 'Unité de base & Stock initial',
        meaning: 'Unité atomique utilisée pour tous les calculs de stock et d’inventaire. Non modifiable après création pour préserver l’historique.',
        rule: 'Saisissez le stock initial dans cette unité (ex : 240 bouteilles pour 10 casiers de 24).',
      },
      {
        formName: 'Nouveau produit',
        field: "Seuil d'alerte minimum",
        meaning: 'Niveau en unité de base en dessous duquel le produit remonte en alerte stock faible sur le tableau de bord.',
        rule: 'Exprimé en unité de base (ex : 48 bouteilles = 2 casiers).',
      },
      {
        formName: 'Nouveau produit',
        field: "Prix d'achat / Gros / Demi-gros / Détail",
        meaning: 'Tarifs de référence en FCFA entiers pour l’unité de base et pré-remplissage des conditionnements.',
        rule: 'Les prix sont toujours des entiers FCFA (aucun centime flottant).',
      },
      {
        formName: 'Conditionnement',
        field: 'Coefficient (en unité de base)',
        meaning: 'Nombre exact d’unités de base contenues dans ce conditionnement.',
        rule: 'Ex : un casier de 24 bouteilles a un coefficient de 24 ; un pack de 6 a un coefficient de 6.',
      },
      {
        formName: 'Conditionnement',
        field: 'Régime de consigne & Emballage consigné',
        meaning: 'Lie automatiquement un emballage vide (ex : Casier 24 alvéoles + Bouteille verre) chaque fois que ce conditionnement est vendu.',
        rule: 'Si « Avec emballage consigné » est choisi, la valeur de consigne s’ajoute séparément du CA marchandises.',
      },
    ],
    pitfalls: [
      "Ne créez pas deux fiches produits différentes pour la bouteille et le casier d'une même boisson : créez 1 produit en unité « bouteille » puis ajoutez le conditionnement « casier ×24 ».",
    ],
  },
  {
    id: 'stock',
    group: 'Catalogue & Stock',
    route: '/stock',
    title: 'Stocks & Mouvements',
    subtitle: 'Niveaux actuels, CUMP exact et journal immuable des mouvements',
    goldenRule:
      'Le stock ne se modifie jamais directement à la main sur la fiche produit : il n’évolue que par une réception d’achat, une vente, un retour ou un inventaire physique justifié.',
    tabs: [
      {
        name: 'Niveaux & valorisation',
        role: 'Affiche le stock actuel, le seuil d’alerte, le CUMP unitaire et la valeur stock en FCFA.',
        whenToUse: 'Pour contrôler la valorisation comptable du dépôt et imprimer l’état de stock.',
      },
      {
        name: 'Journal des mouvements',
        role: 'Historique chronologique montrant Avant → Après, variation, motif et document source.',
        whenToUse: 'Pour auditer l’origine d’un écart ou retracer chaque entrée/sortie d’un article.',
      },
    ],
    fields: [
      {
        formName: 'Tableau Valorisation',
        field: 'CUMP unitaire',
        meaning: 'Coût Unitaire Moyen Pondéré calculé automatiquement à chaque réception fournisseur.',
        rule: 'Si aucun achat avec prix d’achat n’a encore été enregistré, le système indique « Coût non renseigné » sans inventer de valeur.',
      },
      {
        formName: 'Filtres Stock',
        field: 'Alertes uniquement',
        meaning: 'N’affiche que les articles dont le stock est inférieur ou égal au seuil minimum configuré.',
        rule: 'Utilisez ensuite « Rapport de stock » pour imprimer la liste à réapprovisionner.',
      },
    ],
    pitfalls: [
      'Un article marqué « Non valorisable » n’est pas une erreur : il suffit d’enregistrer une réception fournisseur valorisée pour initialiser son CUMP.',
    ],
  },
  {
    id: 'inventories',
    group: 'Catalogue & Stock',
    route: '/inventories',
    title: 'Inventaires physiques',
    subtitle: 'Comptage réel par brouillon et régularisation motivée',
    goldenRule:
      'La validation d’un inventaire ajuste atomiquement les stocks au comptage physique et impose un motif écrit sur chaque article présentant un écart.',
    tabs: [
      {
        name: 'Brouillon d’inventaire → Saisir & valider',
        role: 'Fige la photo théorique au moment de l’ouverture afin de comparer avec le comptage physique en rayon/entrepôt.',
        whenToUse: 'Lors des inventaires hebdomadaires ou mensuels.',
      },
    ],
    fields: [
      {
        formName: 'Inventaire physique',
        field: 'Compté (en unité de base)',
        meaning: 'Quantité réelle comptée physiquement dans le dépôt, exprimée dans l’unité de base du produit.',
        rule: 'Convertissez vos casiers en unités de base (ex : 5 casiers de 24 + 3 bouteilles = 123).',
      },
      {
        formName: 'Inventaire physique',
        field: 'Motif (obligatoire si écart ≠ 0)',
        meaning: 'Justifie la différence constatée (casse manutention, perte, erreur de comptage antérieure...).',
        rule: 'Le système bloque la validation tant qu’un écart n’est pas motivé.',
      },
    ],
    pitfalls: [
      'Ne laissez pas un brouillon d’inventaire ouvert pendant plusieurs jours d’activité intense : créez-le juste avant de compter et validez-le dans la foulée.',
    ],
  },
  {
    id: 'consignments',
    group: 'Tiers & Consignations',
    route: '/consignments',
    title: 'Consignations & Emballages vides',
    subtitle: 'Emballages détenus par les clients, retours bon état vs cassés et stock de vides',
    goldenRule:
      'Les emballages consignés suivent un double cycle : stock physique de vides au dépôt et compte de détention par client.',
    tabs: [
      {
        name: 'Consignes clients ouvertes',
        role: 'Liste les ventes ayant laissé des bouteilles ou casiers consignés non encore restitués.',
        whenToUse: 'Quand un client rapporte des casiers ou bouteilles vides au dépôt.',
      },
      {
        name: 'Catalogue & stock vides',
        role: 'Référentiel des types d’emballages (bouteille verre, casier plastique) avec tarif de consigne et ajustements de casse/reprise brasserie.',
        whenToUse: 'Pour créer un nouvel emballage ou enregistrer une reprise fournisseur / casse interne.',
      },
      {
        name: 'Historique des retours',
        role: 'Archive tous les retours clients avec option d’impression du reçu de retour.',
        whenToUse: 'Pour réimprimer un justificatif de restitution ou vérifier un remboursement.',
      },
    ],
    fields: [
      {
        formName: 'Retour de vides',
        field: 'État (Bon état / Endommagé)',
        meaning: 'Détermine si les vides réintègrent le stock réutilisable du dépôt et s’ils ouvrent droit au remboursement.',
        rule: 'En bon état : le stock dépôt augmente et la consigne peut être remboursée ou déduite de créance ; Endommagé : la détention client est soldée sans réintégrer le stock vendable et le remboursement passe par défaut à 0 FCFA.',
      },
      {
        formName: 'Retour de vides',
        field: 'Remboursement client vs Déduction créance',
        meaning: 'Vous pouvez soit rendre l’argent en caisse, soit imputer la valeur des vides restitués en réduction d’une créance client.',
        rule: 'La somme Remboursement + Déduction créance ne peut pas dépasser la valeur consignée des pièces retournées.',
      },
      {
        formName: 'Mouvement de vides',
        field: 'Type de mouvement & Motif',
        meaning: 'Permet de déclarer une entrée dépôt, une casse, une perte ou une sortie vers la brasserie fournisseur.',
        rule: 'Un motif explicite est obligatoire pour chaque ajustement.',
      },
    ],
    pitfalls: [
      'Un retour client avec remboursement en espèces exige une session de caisse ouverte disposant du solde suffisant.',
    ],
  },
  {
    id: 'suppliers',
    group: 'Tiers & Consignations',
    route: '/suppliers',
    title: 'Fournisseurs & Dettes fournisseurs',
    subtitle: 'Fiches brasseries/grossistes et règlement des réceptions',
    goldenRule:
      'La dette fournisseur n’est jamais créée par le bon de commande : elle naît uniquement au moment de la réception effective en stock.',
    tabs: [
      {
        name: 'Annuaire fournisseurs & Dettes issues des réceptions',
        role: 'Regroupe les fiches tiers et les factures de réception restant à payer.',
        whenToUse: 'Pour créer un fournisseur ou enregistrer un règlement vers une brasserie.',
      },
    ],
    fields: [
      {
        formName: 'Nouveau fournisseur',
        field: 'Délai de règlement (jours)',
        meaning: 'Nombre de jours accordés après réception avant échéance de la dette fournisseur.',
        rule: 'Utilisé automatiquement pour dater les échéances sur chaque réception.',
      },
      {
        formName: 'Régler dette fournisseur',
        field: 'Moyen de paiement & Montant versé',
        meaning: 'Enregistre une sortie de fonds (espèces ou virement/mobile) diminuant le reste dû.',
        rule: 'Un règlement en espèces est plafonné par le solde théorique disponible en caisse.',
      },
    ],
    pitfalls: [
      'Vérifiez le moyen de paiement avant de valider : un virement bancaire ou chèque ne doit pas être saisi en Espèces afin de ne pas fausser le comptage du tiroir.',
    ],
  },
  {
    id: 'purchases',
    group: 'Commerce & Caisse',
    route: '/purchases',
    title: 'Approvisionnements & Réceptions',
    subtitle: 'Bon de commande (sans stock) → Réception partielle ou totale (stock + CUMP)',
    goldenRule:
      'Séparation stricte en 2 temps : la commande (CMD) engage l’intention sans toucher au stock ; la réception (REC) augmente le stock, recalcule le CUMP et génère la dette fournisseur.',
    tabs: [
      {
        name: 'Tableau des commandes & Bouton Réceptionner',
        role: 'Suit les commandes en brouillon, partielles ou intégralement reçues avec impression Bon de commande / Bon de réception.',
        whenToUse: 'Créez la commande à l’envoi au fournisseur, puis cliquez sur « Réceptionner » à l’arrivée du camion.',
      },
    ],
    fields: [
      {
        formName: 'Nouveau bon de commande',
        field: 'Conditionnement & PU achat',
        meaning: 'Vous commandez dans le conditionnement fournisseur (casier, pack...) avec son prix d’achat unitaire.',
        rule: 'Le prix d’achat saisi sert ensuite de coût d’entrée pour recalculer le CUMP du produit à la réception.',
      },
      {
        formName: 'Réceptionner',
        field: 'Quantité reçue & Motif d’écart',
        meaning: 'Autorise les livraisons fractionnées (ex : 30 casiers reçus sur 50 commandés).',
        rule: 'La commande passe en statut « partiel » jusqu’à réception du solde. Le stock et la dette augmentent uniquement à hauteur de la quantité réellement livrée.',
      },
    ],
    pitfalls: [
      'Ne ré-entrez pas un deuxième bon de commande si le fournisseur livre en deux fois : utilisez simplement « Réceptionner » sur la commande partielle existante.',
    ],
  },
  {
    id: 'cash',
    group: 'Commerce & Caisse',
    route: '/cash',
    title: 'Session de caisse',
    subtitle: 'Ouverture, séparation espèces/digital et clôture contrôlée',
    goldenRule:
      'Les encaissements digitaux (Wave, Orange Money, MTN, Virement) sont suivis pour contrôle mais n’entrent jamais dans le calcul des espèces théoriques du tiroir.',
    tabs: [
      {
        name: 'Session active & Mouvements',
        role: 'Affiche le fond de caisse initial, le théorique tiroir en temps réel, la ventilation par moyen et le journal des flux.',
        whenToUse: 'En permanence durant la journée de vente et avant la remise de caisse.',
      },
      {
        name: 'Historique des sessions clôturées',
        role: 'Archive toutes les fermetures avec écarts et impression du Rapport de caisse.',
        whenToUse: 'Pour auditer les écarts de caisse passés.',
      },
    ],
    fields: [
      {
        formName: 'Ouvrir la caisse',
        field: 'Fond de caisse initial en espèces',
        meaning: 'Montant physique des billets et pièces présents dans le tiroir avant la première vente.',
        rule: 'Une seule session peut être ouverte à la fois.',
      },
      {
        formName: 'Clôturer la caisse',
        field: 'Espèces physiques comptées',
        meaning: 'Montant réel compté à la main dans le tiroir en fin de journée.',
        rule: 'Comparé automatiquement aux espèces théoriques attendues (Fond initial + entrées espèces - sorties espèces).',
      },
      {
        formName: 'Clôturer la caisse',
        field: 'Commentaire de clôture',
        meaning: 'Explication d’un manquant ou d’un excédent de caisse.',
        rule: 'Strictement obligatoire dès que l’écart constaté est différent de 0 FCFA.',
      },
    ],
    pitfalls: [
      'Ne comptez jamais les paiements Wave ou Orange Money dans « Espèces physiques comptées » : cela créerait un faux excédent d’écart.',
    ],
  },
  {
    id: 'expenses',
    group: 'Commerce & Caisse',
    route: '/expenses',
    title: 'Dépenses d’exploitation',
    subtitle: 'Sorties de caisse opérationnelles et impact résultat net',
    goldenRule:
      'Toute dépense génère immédiatement un mouvement de sortie sur la session de caisse ouverte et vient en déduction du résultat net connu dans les rapports.',
    tabs: [
      {
        name: 'Journal des dépenses & Ajouter une dépense',
        role: 'Classe les frais (transport, carburant, électricité, manutention...) par catégorie et moyen de décaissement.',
        whenToUse: 'À chaque sortie d’argent qui n’est pas un règlement de marchandise fournisseur.',
      },
    ],
    fields: [
      {
        formName: 'Enregistrer une dépense',
        field: 'Catégorie & Montant',
        meaning: 'Permet de suivre les postes de charges du dépôt en FCFA entiers.',
        rule: 'Doit être strictement positif (> 0 FCFA).',
      },
      {
        formName: 'Enregistrer une dépense',
        field: 'Moyen de décaissement',
        meaning: 'Indique si la dépense sort du tiroir espèces ou d’un compte digital.',
        rule: 'Si Espèces est choisi, le montant ne peut pas dépasser le solde théorique disponible en caisse.',
      },
    ],
    pitfalls: [
      'N’enregistrez pas les achats de boissons ici : passez par Approvisionnements → Bon de commande / Réception puis Fournisseurs → Régler.',
    ],
  },
  {
    id: 'reports',
    group: 'Pilotage & Système',
    route: '/reports',
    title: 'Rapports & Rentabilité',
    subtitle: 'CA marchandises, marge brute sur coût connu et ventilation des flux',
    goldenRule:
      'DEPOTPRO n’invente jamais un coût d’achat manquant : les lignes sans coût historique connu sont explicitement isolées plutôt que de fausser la marge brute.',
    tabs: [
      {
        name: 'Filtre Du / Au & Compte d’exploitation',
        role: 'Agrège CA marchandises, COGS sur coûts connus, marge brute, dépenses et résultat net sur la période choisie.',
        whenToUse: 'Pour vos bilans hebdomadaires, mensuels ou annuels.',
      },
    ],
    fields: [
      {
        formName: 'Filtres de période',
        field: 'Du / Au',
        meaning: 'Borne les ventes et marges analysées aux dates calendaires sélectionnées (AAAA-MM-JJ).',
        rule: 'Laissez vide pour obtenir le cumul global depuis le démarrage.',
      },
      {
        formName: 'Compte d’exploitation',
        field: 'Transparence des coûts historiques',
        meaning: 'Signale le nombre exact de lignes vendues sans coût d’achat renseigné afin que vous sachiez quelle part du CA est couverte par la marge calculée.',
        rule: 'Saisissez un prix d’achat sur les produits ou passez par les réceptions fournisseurs pour obtenir une couverture à 100 %.',
      },
    ],
    pitfalls: [
      'Les consignations facturées apparaissent dans un indicateur dédié car elles ne constituent pas une marge commerciale.',
    ],
  },
  {
    id: 'settings',
    group: 'Pilotage & Système',
    route: '/settings',
    title: 'Paramètres généraux',
    subtitle: 'Identité du dépôt, préfixes documentaires, stock négatif, moyens de paiement et PIN',
    goldenRule:
      'Le moyen de paiement Espèces (cash) ne peut jamais être désactivé afin de garantir la continuité de la caisse physique.',
    tabs: [
      {
        name: 'Identité & numérotation / Moyens de paiement / Code PIN',
        role: 'Configure les informations imprimées sur les reçus/factures et la sécurité d’accès.',
        whenToUse: 'À la mise en route du dépôt ou pour ajouter un nouveau canal Mobile Money.',
      },
    ],
    fields: [
      {
        formName: 'Identité & numérotation',
        field: 'Préfixes (VTE, FAC, etc.)',
        meaning: 'Préfixes utilisés pour générer les numéros séquentiels de documents.',
        rule: 'Convertis automatiquement en majuscules sans espaces.',
      },
      {
        formName: 'Règles de stock',
        field: 'Autoriser le stock négatif en vente',
        meaning: 'Si désactivé (recommandé), bloque toute validation au POS dépassant le stock disponible.',
        rule: 'À n’activer que temporairement si vous facturez avant de saisir une réception déjà arrivée physiquement.',
      },
      {
        formName: 'Sécurité',
        field: 'Code PIN propriétaire (6 chiffres)',
        meaning: 'Protège l’accès local au poste hors ligne.',
        rule: 'Requiert le PIN actuel valide pour être remplacé.',
      },
    ],
    pitfalls: [
      'N’oubliez pas de cliquer sur « Enregistrer les paramètres » après modification des champs texte ou du stock négatif.',
    ],
  },
  {
    id: 'backups',
    group: 'Pilotage & Système',
    route: '/backups',
    title: 'Sauvegardes & Restauration',
    subtitle: 'Snapshots SQLite cohérents (VACUUM INTO), vérification et restauration sûre',
    goldenRule:
      'Avant toute restauration, le système vérifie l’intégrité structurelle et les clés étrangères de l’archive puis crée automatiquement une pré-sauvegarde de sécurité de la base actuelle.',
    tabs: [
      {
        name: 'Actions Archive (Vérifier / Exporter / Restaurer)',
        role: 'Permet de contrôler une archive SQLite, la copier sur clé USB (Exporter) ou revenir à un point antérieur.',
        whenToUse: 'Créez et exportez une sauvegarde en fin de journée ou avant une opération majeure.',
      },
    ],
    fields: [
      {
        formName: 'Sauvegardes SQLite',
        field: 'Vérifier (PRAGMA integrity_check)',
        meaning: 'Contrôle qu’aucun bloc de la sauvegarde n’est corrompu et que toutes les clés étrangères et la version de schéma sont valides.',
        rule: 'Une archive présentant une erreur est automatiquement refusée à la restauration.',
      },
    ],
    pitfalls: [
      'Conservez régulièrement un export (.db) sur un support externe (clé USB ou disque externe) en plus des sauvegardes locales.',
    ],
  },
];

const ROUTE_TO_TOPIC: Record<string, string> = {
  '/': 'dashboard',
  '/sales/new': 'sales-pos',
  '/sales': 'sales-history',
  '/clients': 'clients',
  '/debts': 'debts',
  '/products': 'products',
  '/stock': 'stock',
  '/inventories': 'inventories',
  '/consignments': 'consignments',
  '/suppliers': 'suppliers',
  '/purchases': 'purchases',
  '/cash': 'cash',
  '/expenses': 'expenses',
  '/reports': 'reports',
  '/settings': 'settings',
  '/backups': 'backups',
};

export function resolveTopicIdFromPath(pathname: string): string {
  return ROUTE_TO_TOPIC[pathname] ?? 'dashboard';
}
