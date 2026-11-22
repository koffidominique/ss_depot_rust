/* ============================================================================
 * Types métier : Approvisionnements, Réceptions & Dettes fournisseurs
 * ============================================================================ */

export interface PurchasePackagingRequirement {
  purchase_order_line_id: number;
  returnable_id: number;
  code: string;
  name: string;
  kind: 'bottle' | 'crate';
  pieces_per_pack: number;
  required_pieces: number;
  reserved_pieces: number;
  issued_pieces: number;
  reservation_status: 'reserved' | 'partially_issued' | 'issued' | 'released';
}

export interface SupplierPackagingExchangeLine {
  purchase_order_line_id: number;
  returnable_id: number;
  code_snapshot: string;
  name_snapshot: string;
  kind_snapshot: 'bottle' | 'crate';
  pieces_issued: number;
}

export interface PurchaseReceiptLine {
  purchase_order_line_id: number;
  product_name: string;
  packaging_name: string;
  base_unit: string;
  coefficient_milli: number;
  received_quantity_milli: number;
  base_quantity_milli: number;
  unit_price: number;
  amount: number;
  discrepancy_reason: string | null;
}

export interface PurchaseReceipt {
  id: number;
  reference: string;
  purchase_order_id: number;
  order_reference: string;
  supplier_name: string;
  total_amount: number;
  notes: string | null;
  created_at: string;
  lines: PurchaseReceiptLine[];
  packaging_exchanges: SupplierPackagingExchangeLine[];
}

export interface PurchaseReceiptResult {
  order: PurchaseOrder;
  receipt: PurchaseReceipt;
}

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
    product_snapshot_json: string;
    packaging_snapshot_json: string;
  }>;
  packaging_requirements: PurchasePackagingRequirement[];
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
