/* ============================================================================
 * Types métier : Approvisionnements, Réceptions & Dettes fournisseurs
 * ============================================================================ */

export interface PurchaseOrder {
  id: number;
  reference: string;
  supplier_id: number;
  supplier_name: string;
  supplier_code: string;
  supplier_phone?: string;
  supplier_address?: string | null;
  supplier_email?: string | null;
  status: "draft" | "confirmed" | "partial" | "received" | "cancelled";
  approval_status?: string | null;
  total_amount: number;
  received_amount: number;
  expected_date: string | null;
  notes: string | null;
  created_at: string;
  lines: Array<{
    id: number;
    product_id: number;
    packaging_id: number;
    product_name: string;
    packaging_name: string;
    base_unit: string;
    coefficient_milli: number;
    ordered_quantity_milli: number;
    received_quantity_milli: number;
    unit_price: number;
    line_total: number;
  }>;
  receipts: Array<{
    id: number;
    reference: string;
    total_amount: number;
    created_at: string;
  }>;
}

export interface SupplierDebt {
  id: number;
  receipt_id: number;
  receipt_reference: string;
  order_reference: string;
  supplier_id: number;
  supplier_name: string;
  supplier_code: string;
  initial_amount: number;
  remaining_amount: number;
  due_date: string | null;
  status: "open" | "partial" | "paid";
  created_at: string;
}
