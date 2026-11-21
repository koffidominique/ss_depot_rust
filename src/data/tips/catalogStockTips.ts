import type { TipTopic } from './types.ts';

/* ============================================================================
 * Guides métier : Catalogue & Stock (Produits, Stocks, Inventaires)
 * ============================================================================ */

export const PRODUCTS_TIP: TipTopic = {
  id: 'products',
  group: 'Catalogue & Stock',
  route: '/products',
  title: 'Produits & Conditionnements',
  subtitle: 'Unité de base, coefficients exacts, tarification et consignes liées',
  goldenRule:
    'Le stock est toujours suivi dans l’unité de base la plus fine (bouteille, canette...) ; le seul conditionnement commercialisable et consignable en sous-dépôt est le casier.',
  tabs: [
    {
      name: 'Modifier / Nouveau produit',
      role: 'Définit l’identité article, l’unité de base, le seuil d’alerte et les prix de base.',
      whenToUse: 'Lors de la création d’une référence ou pour ajuster ses prix catalogue.',
    },
    {
      name: 'Configurer le conditionnement casier (icône couches)',
      role: 'Associe le format casier (ex : ×24 ou ×12) et son éventuel emballage consigné.',
      whenToUse: 'Obligatoire pour vendre un casier ou appliquer automatiquement la consigne au POS.',
    },
    {
      name: 'Catalogue brasseries (SOLIBRA / BRASSIVOIRE)',
      role: 'Pré-remplit jusqu’à 60 fiches produits (30 SOLIBRA + 30 BRASSIVOIRE) avec codes EAN-13, conditionnements et consignes à stock initial 0.',
      whenToUse: 'Au démarrage d’un dépôt pour charger tout ou partie du catalogue officiel en mode actif ou inactif.',
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
      field: 'Anti-doublon normalisé & Statut initial',
      meaning: 'Le système normalise accents, casse et espaces pour empêcher deux fiches identiques ; un produit peut être enregistré en actif ou inactif.',
      rule: 'La suppression définitive est réservée au Propriétaire uniquement sur les articles sans historique (ventes, achats ou stock) ; sinon il faut archiver.',
    },
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
      field: "Prix d'achat / Prix de vente détail",
      meaning: 'Tarifs de référence en FCFA entiers (un sous-dépôt vend uniquement au tarif détail).',
      rule: 'Les prix sont toujours des entiers FCFA (aucun centime flottant).',
    },
    {
      formName: 'Conditionnement',
      field: 'Coefficient (en unité de base)',
      meaning: 'Nombre exact d’unités de base contenues dans le casier.',
      rule: 'Ex : un casier de 24 bouteilles a un coefficient de 24.',
    },
    {
      formName: 'Conditionnement',
      field: 'Régime de consigne & Emballage consigné',
      meaning: 'Lie automatiquement un emballage vide (casier plastique + bouteilles verre) chaque fois que ce casier est vendu.',
      rule: 'Seul le casier est soumis au système de retour d’emballage ; la valeur de consigne s’ajoute séparément du CA marchandises.',
    },
  ],
  pitfalls: [
    "Ne créez pas deux fiches produits différentes pour la bouteille et le casier d'une même boisson : créez 1 produit en unité « bouteille » puis ajoutez le conditionnement « casier ×24 ».",
  ],
};

export const STOCK_TIP: TipTopic = {
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
    {
      formName: 'Ajustement manuel du stock',
      field: 'Type, Quantité & Motif obligatoire',
      meaning: 'Permet de déclarer une casse, une perte, un don ou un surplus ponctuel sans passer par un inventaire complet.',
      rule: 'Chaque ajustement exige un motif tracé, crée un mouvement manual_adjust (ADJ-YYYY-NNNNN) et respecte le paramètre de stock négatif.',
      example: 'Sortie (-) · 2 bouteille · « Casse / bouteille brisée lors de la manutention »',
    },
  ],
  pitfalls: [
    'Un article marqué « Non valorisable » n’est pas une erreur : il suffit d’enregistrer une réception fournisseur valorisée pour initialiser son CUMP.',
  ],
};

export const INVENTORIES_TIP: TipTopic = {
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
};
