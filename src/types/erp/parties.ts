import type { CreditPolicy } from "./auth.ts";

/* ============================================================================
 * Types métier : Tiers (Clients & Fournisseurs)
 * ============================================================================ */

export interface Client {
  id: number;
  code: string;
  name: string;
  client_type: "particulier" | "professionnel";
  phone: string | null;
  address: string | null;
  city: string | null;
  email: string | null;
  contact_person: string | null;
  is_active: number;
  credit_policy: CreditPolicy;
  credit_limit: number | null;
  payment_terms_days: number;
  unpaid_balance: number;
  returnable_pieces_due: number;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  company_name: string | null;
  phone: string;
  address: string | null;
  email: string | null;
  contact_person: string | null;
  payment_terms_days: number;
  total_purchases: number;
  balance_due: number;
  is_active: number;
}
