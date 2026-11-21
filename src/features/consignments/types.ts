export interface ReturnableType {
  id: number;
  code: string;
  name: string;
  producer: string;
  kind: 'bottle' | 'crate';
  deposit_value: number;
  stock_quantity: number;
}

export interface ClientBalance {
  id: number;
  client_id: number;
  client_name: string;
  client_code: string;
  packaging_name: string;
  packaging_code: string;
  balance_pieces: number;
  deposit_held_amount: number;
}

export interface ReturnableMovementRow {
  id: number;
  packaging_id: number;
  packaging_name: string;
  packaging_code: string;
  movement_type:
    | 'initial'
    | 'entry'
    | 'exit'
    | 'breakage'
    | 'loss'
    | 'correction_in'
    | 'correction_out';
  quantity: number;
  stock_before: number | null;
  stock_after: number;
  reason: string;
  reference_document: string | null;
  created_at: string;
}

export interface OpenIssue {
  id: number;
  sale_id: number;
  sale_reference: string;
  client_id: number | null;
  client_name: string | null;
  returnable_id: number;
  packaging_name: string;
  packaging_code: string;
  pieces: number;
  returned_pieces: number;
  unit_value: number;
  amount: number;
  expected_products?: string | null;
}

export interface DepositReturnRow {
  id: number;
  reference: string;
  packaging_name: string;
  client_name: string | null;
  pieces: number;
  condition_state: 'good' | 'damaged';
  refund_amount: number;
  credit_reduction: number;
  method_label: string;
  reason: string;
  created_at: string;
}
