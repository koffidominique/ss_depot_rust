import type { PriceTier } from "./auth.ts";

/* ============================================================================
 * Types métier : Ventes, Détails de facture & Créances clients
 * ============================================================================ */

export interface SaleSummary {
  id: number;
  reference: string;
  client_id: number | null;
  client_name: string;
  sale_type: "cash" | "credit";
  price_tier: PriceTier;
  subtotal_merchandise: number;
  discount_amount: number;
  total_merchandise: number;
  total_deposit: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_labels: string | null;
  status: "validated" | "cancelled" | "partially_returned" | "returned";
  created_at: string;
}

export interface SaleDetail extends SaleSummary {
  client_code: string | null;
  client_phone: string | null;
  receivable_id: number | null;
  due_date: string | null;
  notes: string | null;
  lines: Array<{
    id: number;
    product_id: number;
    packaging_id: number;
    product_name: string;
    packaging_name: string;
    base_unit: string;
    coefficient_milli: number;
    quantity_milli: number;
    base_quantity_milli: number;
    unit_price: number;
    discount_amount: number;
    line_total: number;
    returned_base_milli: number;
  }>;
  payments: Array<{
    id: number;
    reference: string;
    method_code: string;
    method_label: string;
    part_amount: number;
    created_at: string;
  }>;
  deposits: Array<{
    id: number;
    returnable_id: number;
    packaging_name: string;
    packaging_code: string;
    pieces: number;
    returned_pieces: number;
    unit_value: number;
    amount: number;
    expected_products?: string | null;
  }>;
  cancellation: {
    id: number;
    reason: string;
    refunded_amount: number;
    created_at: string;
  } | null;
  returns: Array<{
    id: number;
    reference: string;
    credit_note_ref: string;
    total_amount: number;
    credit_reduction: number;
    refund_amount: number;
    reason: string;
    created_at: string;
  }>;
}

export interface Receivable {
  id: number;
  sale_id: number;
  sale_reference: string;
  sale_date: string;
  sale_total: number;
  client_id: number;
  client_name: string;
  client_code: string;
  client_phone: string | null;
  initial_amount: number;
  remaining_amount: number;
  due_date: string | null;
  status: "open" | "partial" | "paid" | "cancelled";
  created_at: string;
}
