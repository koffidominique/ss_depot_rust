import type { TipTopic } from './types.ts';

/* ============================================================================
 * Guides métier : Commerce & Caisse (POS, Historique, Caisse, Dépenses)
 * ============================================================================ */

export const SALES_POS_TIP: TipTopic = {
  id: 'sales-pos',
  group: 'Commerce & Caisse',
  route: '/sales/new',
  title: 'Nouvelle vente (Point de vente)',
  subtitle: 'Grilles tarifaires, conditionnements, consignations et paiements mixtes',
  goldenRule:
    'Une vente validée déduit le stock en milli-unités exactes, génère les écritures de caisse et crée automatiquement la consigne client si le conditionnement est consigné.',
  tabs: [
    {
      name: 'Tarification unique (Détail)',
      role: 'Un sous-dépôt vend exclusivement au tarif Détail et au conditionnement casier.',
      whenToUse: 'Le prix détail du casier est appliqué automatiquement à chaque ligne du panier.',
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
      example: 'Pour un client prenant 5 casiers à régler sous 15 jours, sélectionnez sa fiche client avant de valider.',
    },
    {
      formName: 'Panier de vente',
      field: 'Quantité & Conditionnement',
      meaning: 'Seul le conditionnement casier est vendable et convertit votre saisie vers le stock de base via son coefficient exact.',
      rule: 'Les quantités fractionnaires (ex : 0,5 casier) sont autorisées si le conditionnement l’autorise. En panachage consigné, deux demi-casiers partageant le même casier comptent pour un seul casier consigné et les bouteilles vides retournées doivent correspondre aux produits livrés.',
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
};

export const SALES_HISTORY_TIP: TipTopic = {
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
};

export const CASH_TIP: TipTopic = {
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
};

export const EXPENSES_TIP: TipTopic = {
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
};
