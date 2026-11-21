import type { TipTopic } from './types.ts';

/* ============================================================================
 * Guides métier : Tiers, Consignations & Approvisionnements
 * ============================================================================ */

export const CLIENTS_TIP: TipTopic = {
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
};

export const DEBTS_TIP: TipTopic = {
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
};

export const CONSIGNMENTS_TIP: TipTopic = {
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
};

export const SUPPLIERS_TIP: TipTopic = {
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
};

export const PURCHASES_TIP: TipTopic = {
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
};
