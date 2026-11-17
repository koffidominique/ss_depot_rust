import type { CashSession, ExpenseItem, PurchaseOrder, Receivable, SaleSummary } from '../types/erp.ts';
import { formatQty } from './format.ts';

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[;"\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): string {
  const lines = [
    headers.map(escapeCsvCell).join(';'),
    ...rows.map((row) => row.map(escapeCsvCell).join(';')),
  ];
  return lines.join('\n');
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
): string {
  const csv = buildCsv(headers, rows);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return csv;
}

const todayTag = () => new Date().toISOString().slice(0, 10);

export function exportSalesCsv(items: SaleSummary[]) {
  return downloadCsv(
    `depotpro_ventes_${todayTag()}.csv`,
    [
      'Référence',
      'Date',
      'Client',
      'Type',
      'Tarif',
      'Sous-total marchandises (FCFA)',
      'Remise (FCFA)',
      'Net marchandises (FCFA)',
      'Consignes (FCFA)',
      'Total TTC (FCFA)',
      'Payé (FCFA)',
      'Reste dû (FCFA)',
      'Moyens de paiement',
      'Statut',
    ],
    items.map((s) => [
      s.reference,
      s.created_at,
      s.client_name,
      s.sale_type === 'credit' ? 'Crédit' : 'Comptant',
      s.price_tier,
      s.subtotal_merchandise,
      s.discount_amount,
      s.total_merchandise,
      s.total_deposit,
      s.total_amount,
      s.paid_amount,
      s.remaining_amount,
      s.payment_labels || '',
      s.status,
    ])
  );
}

export function exportReceivablesCsv(items: Receivable[]) {
  return downloadCsv(
    `depotpro_creances_${todayTag()}.csv`,
    [
      'Client',
      'Code client',
      'Téléphone',
      'Facture',
      'Date vente',
      'Échéance',
      'Montant initial (FCFA)',
      'Payé (FCFA)',
      'Reste à encaisser (FCFA)',
      'Statut',
    ],
    items.map((r) => [
      r.client_name,
      r.client_code,
      r.client_phone || '',
      r.sale_reference,
      r.sale_date,
      r.due_date || '',
      r.initial_amount,
      Math.max(0, r.initial_amount - r.remaining_amount),
      r.remaining_amount,
      r.status,
    ])
  );
}

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

export function exportExpensesCsv(items: ExpenseItem[]) {
  return downloadCsv(
    `depotpro_depenses_${todayTag()}.csv`,
    [
      'Référence',
      'Date',
      'Catégorie',
      'Bénéficiaire',
      'Moyen de paiement',
      'Montant (FCFA)',
      'Notes',
      'Justificatif joint',
    ],
    items.map((e) => [
      e.reference,
      e.expense_date,
      e.category,
      e.beneficiary || '',
      e.method_label,
      e.amount,
      e.notes || '',
      e.receipt_path ? 'Oui' : 'Non',
    ])
  );
}

export interface CashMovementCsvRow {
  created_at: string;
  description: string;
  method_label: string;
  is_cash: number;
  direction: 'in' | 'out';
  amount: number;
  reference_document: string | null;
}

export function exportCashMovementsCsv(sessionRef: string, movements: CashMovementCsvRow[]) {
  return downloadCsv(
    `depotpro_caisse_mouvements_${sessionRef}_${todayTag()}.csv`,
    ['Date & heure', 'Opération', 'Moyen', 'Canal', 'Sens', 'Montant (FCFA)', 'Document'],
    movements.map((m) => [
      m.created_at,
      m.description,
      m.method_label,
      m.is_cash === 1 ? 'Espèces' : 'Digital',
      m.direction === 'in' ? 'Entrée' : 'Sortie',
      m.direction === 'in' ? m.amount : -m.amount,
      m.reference_document || '',
    ])
  );
}

export function exportCashSessionsCsv(history: CashSession[]) {
  return downloadCsv(
    `depotpro_caisse_sessions_${todayTag()}.csv`,
    [
      'Référence',
      'Ouverte le',
      'Clôturée le',
      'Fond initial (FCFA)',
      'Théorique (FCFA)',
      'Compté (FCFA)',
      'Écart (FCFA)',
      'Notes clôture',
    ],
    history.map((s) => [
      s.reference,
      s.opened_at,
      s.closed_at || '',
      s.opening_cash,
      s.theoretical_cash ?? '',
      s.physical_cash ?? '',
      s.difference ?? '',
      s.closing_notes || '',
    ])
  );
}

export function exportPurchasesCsv(orders: PurchaseOrder[]) {
  return downloadCsv(
    `depotpro_approvisionnements_${todayTag()}.csv`,
    [
      'Référence',
      'Date',
      'Fournisseur',
      'Code fournisseur',
      'Montant commandé (FCFA)',
      'Montant réceptionné (FCFA)',
      'Nb lignes',
      'Nb réceptions',
      'Statut',
    ],
    orders.map((o) => [
      o.reference,
      o.created_at,
      o.supplier_name,
      o.supplier_code,
      o.total_amount,
      o.received_amount,
      o.lines.length,
      o.receipts.length,
      o.status,
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
