export interface StockProductRow {
  id: number;
  reference: string;
  name: string;
  brand: string | null;
  category_name: string;
  base_unit: string;
  stock_milli: number;
  min_stock_milli: number;
  max_stock_milli: number;
  average_cost_fcfa: number | null;
  valuation_fcfa: number | null;
}

export interface StockMovementRow {
  id: number;
  product_id: number;
  product_name: string;
  product_reference: string;
  base_unit: string;
  movement_type: string;
  quantity_milli: number;
  stock_before_milli: number;
  stock_after_milli: number;
  reason: string | null;
  reference_document: string | null;
  created_at: string;
}

export interface InventoryLine {
  id: number;
  product_id: number;
  product_name: string;
  product_reference: string;
  base_unit: string;
  theoretical_milli: number;
  counted_milli: number | null;
  reason: string | null;
}

export interface InventoryRecord {
  id: number;
  reference: string;
  status: 'draft' | 'validated' | 'cancelled';
  notes: string | null;
  created_at: string;
  validated_at: string | null;
  lines: InventoryLine[];
}

export const MOVEMENT_LABELS: Record<string, string> = {
  purchase_in: 'Réception achat',
  sale_out: 'Sortie vente',
  sale_cancel_in: 'Annulation vente',
  return_in: 'Retour client',
  inventory_adjust: 'Ajustement inventaire',
  manual_adjust: 'Ajustement manuel',
};
