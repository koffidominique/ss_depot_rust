/* ============================================================================
 * Types métier : Caisse, Moyens de paiement & Dépenses
 * ============================================================================ */

export interface CashSession {
  id: number;
  reference: string;
  opened_at: string;
  closed_at: string | null;
  status: "open" | "closed";
  opening_cash: number;
  theoretical_cash: number | null;
  physical_cash: number | null;
  difference: number | null;
  closing_notes: string | null;
}

export interface CashStatus {
  activeSession: CashSession | null;
  summary: {
    theoreticalCash: number;
    byMethod: Array<{
      method_code: string;
      label: string;
      is_cash: number;
      total_in: number;
      total_out: number;
    }>;
    movements: Array<{
      id: number;
      kind: string;
      method_code: string;
      method_label: string;
      is_cash: number;
      direction: "in" | "out";
      amount: number;
      description: string;
      reference_document: string | null;
      created_at: string;
    }>;
  } | null;
  history: CashSession[];
}

export interface PaymentMethodConfig {
  code: string;
  label: string;
  is_cash: number;
  active: number;
}

export interface ExpenseItem {
  id: number;
  reference: string;
  category: string;
  amount: number;
  method_code: string;
  method_label: string;
  session_id: number;
  beneficiary: string | null;
  notes: string | null;
  receipt_path: string | null;
  expense_date: string;
  created_at?: string;
}
