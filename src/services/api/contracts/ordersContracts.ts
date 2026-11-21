/* ============================================================================
 * Contrat API : Commandes clientèle mixtes & actifs d'emballage
 * ============================================================================ */

import type {
  ComposePreviewResult,
  CreateCustomerOrderInput,
  CustomerDepositBalance,
  CustomerOrderDetail,
  CustomerOrderSummary,
  OrderLineInput,
  PackagingAsset,
} from "../../../types/erp.ts";

export interface OrdersApiClient {
  composeOrderPreview(payload: {
    lines: OrderLineInput[];
    discount_xof?: number;
    tax_xof?: number;
  }): Promise<ComposePreviewResult>;
  listCustomerOrders(filter?: {
    status?: string;
    customer_id?: number;
  }): Promise<CustomerOrderSummary[]>;
  getCustomerOrder(id: number): Promise<CustomerOrderDetail>;
  createCustomerOrder(payload: CreateCustomerOrderInput): Promise<CustomerOrderDetail>;
  confirmCustomerOrder(id: number): Promise<CustomerOrderDetail>;
  deliverCustomerOrder(id: number): Promise<CustomerOrderDetail>;
  invoiceCustomerOrder(id: number): Promise<CustomerOrderDetail>;
  payCustomerOrder(
    id: number,
    payload: { amount_xof: number; method: string },
  ): Promise<CustomerOrderDetail>;
  cancelCustomerOrder(id: number): Promise<CustomerOrderDetail>;
  returnOrderPackaging(
    id: number,
    payload: { packaging_asset_id: number; quantity: number; notes?: string },
  ): Promise<CustomerOrderDetail>;
  listPackagingAssets(): Promise<PackagingAsset[]>;
  getCustomerDeposits(customerId: number): Promise<CustomerDepositBalance[]>;
  returnCustomerDeposits(
    customerId: number,
    payload: { packaging_asset_id: number; quantity: number; notes?: string },
  ): Promise<CustomerDepositBalance[]>;
}
