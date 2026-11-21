/* ============================================================================
 * Types partagés & Erreur API transversale
 * ============================================================================ */

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export interface CreateSaleReturnPayload {
  request_key: string;
  reason: string;
  restock_approved: boolean;
  refund_method_code: string;
  lines: Array<{ sale_line_id: number; base_quantity: string | number }>;
}

export interface ReceivePurchaseOrderPayload {
  request_key: string;
  notes?: string;
  lines: Array<{
    purchase_order_line_id: number;
    received_quantity: string | number;
    discrepancy_reason?: string;
  }>;
}
