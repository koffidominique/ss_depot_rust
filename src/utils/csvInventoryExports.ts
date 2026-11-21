import { downloadCsv, todayTag } from './csvCore.ts';
import { formatQty } from './format.ts';

/* ============================================================================
 * Exports CSV : Stocks, Mouvements & Consignations d'emballages
 * ============================================================================ */

export interface StockMovementCsvRow {
  created_at: string;
  product_reference: string;
  product_name: string;
  base_unit: string;
  movement_type: string;
  quantity_milli: number;
  stock_before_milli: number;
  stock_after_milli: number;
  reason: string | null;
  reference_document: string | null;
}

export function exportStockMovementsCsv(movements: StockMovementCsvRow[]) {
  return downloadCsv(
    `depotpro_mouvements_stock_${todayTag()}.csv`,
    [
      'Date & heure',
      'Référence produit',
      'Produit',
      'Unité base',
      'Type mouvement',
      'Variation',
      'Stock avant',
      'Stock après',
      'Motif',
      'Document',
    ],
    movements.map((m) => [
      m.created_at,
      m.product_reference,
      m.product_name,
      m.base_unit,
      m.movement_type,
      formatQty(m.quantity_milli),
      formatQty(m.stock_before_milli),
      formatQty(m.stock_after_milli),
      m.reason || '',
      m.reference_document || '',
    ])
  );
}

export interface StockBalanceCsvRow {
  reference: string;
  name: string;
  category_name?: string;
  brand?: string | null;
  base_unit: string;
  stock_milli: number;
  min_stock_milli: number;
  average_cost_fcfa: number | null;
  valuation_fcfa: number | null;
}

export function exportStockBalancesCsv(products: StockBalanceCsvRow[]) {
  return downloadCsv(
    `depotpro_etat_stock_${todayTag()}.csv`,
    [
      'Référence',
      'Produit',
      'Catégorie',
      'Marque',
      'Unité base',
      'Stock actuel',
      'Seuil alerte',
      'CUMP unitaire (FCFA)',
      'Valorisation (FCFA)',
    ],
    products.map((p) => [
      p.reference,
      p.name,
      p.category_name || '',
      p.brand || '',
      p.base_unit,
      formatQty(p.stock_milli),
      formatQty(p.min_stock_milli),
      p.average_cost_fcfa ?? '',
      p.valuation_fcfa ?? '',
    ])
  );
}

export interface ConsignmentBalanceCsvRow {
  client_name: string;
  client_code: string;
  packaging_name: string;
  packaging_code: string;
  balance_pieces: number;
  deposit_held_amount: number;
}

export function exportConsignmentBalancesCsv(balances: ConsignmentBalanceCsvRow[]) {
  return downloadCsv(
    `depotpro_consignations_soldes_${todayTag()}.csv`,
    ['Client', 'Code client', 'Emballage', 'Code emballage', 'Vides détenus (pcs)', 'Consigne retenue (FCFA)'],
    balances.map((b) => [
      b.client_name,
      b.client_code,
      b.packaging_name,
      b.packaging_code,
      b.balance_pieces,
      b.deposit_held_amount,
    ])
  );
}

export interface ConsignmentMovementCsvRow {
  created_at: string;
  packaging_name: string;
  packaging_code: string;
  movement_type: string;
  quantity: number;
  stock_before: number | null;
  stock_after: number;
  reason: string;
  reference_document: string | null;
}

export function exportConsignmentMovementsCsv(movements: ConsignmentMovementCsvRow[]) {
  return downloadCsv(
    `depotpro_consignations_mouvements_${todayTag()}.csv`,
    ['Date & heure', 'Emballage', 'Code', 'Type', 'Quantité (pcs)', 'Stock avant', 'Stock après', 'Motif', 'Document'],
    movements.map((m) => [
      m.created_at,
      m.packaging_name,
      m.packaging_code,
      m.movement_type,
      m.quantity,
      m.stock_before ?? 0,
      m.stock_after,
      m.reason,
      m.reference_document || '',
    ])
  );
}
