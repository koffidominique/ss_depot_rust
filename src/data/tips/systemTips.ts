import type { TipTopic } from './types.ts';

/* ============================================================================
 * Guides métier : Pilotage & Système (Tableau de bord, Rapports, Paramètres, Backups)
 * ============================================================================ */

export const DASHBOARD_TIP: TipTopic = {
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
};

export const REPORTS_TIP: TipTopic = {
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
};

export const SETTINGS_TIP: TipTopic = {
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
};

export const BACKUPS_TIP: TipTopic = {
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
};
