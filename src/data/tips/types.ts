/* ============================================================================
 * Types des guides et règles métier (Modale d'aide contextuelle)
 * ============================================================================ */

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
