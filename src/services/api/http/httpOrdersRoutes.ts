/* ============================================================================
 * Routes HTTP : Commandes clientèle mixtes, emballages physiques & consignes
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
import { httpRequest } from "./httpTransport.ts";

export const httpOrdersApi = {
  composeOrderPreview(payload: {
    lines: OrderLineInput[];
    discount_xof?: number;
    tax_xof?: number;
  }): Promise<ComposePreviewResult> {
    return httpRequest<ComposePreviewResult>("/api/orders/compose-preview", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  listCustomerOrders(filter?: {
    status?: string;
    customer_id?: number;
  }): Promise<CustomerOrderSummary[]> {
    const p = new URLSearchParams();
    if (filter?.status) p.set("status", filter.status);
    if (filter?.customer_id) p.set("customer_id", String(filter.customer_id));
    const qs = p.toString();
    return httpRequest<CustomerOrderSummary[]>(`/api/orders${qs ? `?${qs}` : ""}`);
  },
  getCustomerOrder(id: number): Promise<CustomerOrderDetail> {
    return httpRequest<CustomerOrderDetail>(`/api/orders/${id}`);
  },
  createCustomerOrder(payload: CreateCustomerOrderInput): Promise<CustomerOrderDetail> {
    return httpRequest<CustomerOrderDetail>("/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  confirmCustomerOrder(id: number): Promise<CustomerOrderDetail> {
    return httpRequest<CustomerOrderDetail>(`/api/orders/${id}/confirm`, { method: "POST" });
  },
  deliverCustomerOrder(id: number): Promise<CustomerOrderDetail> {
    return httpRequest<CustomerOrderDetail>(`/api/orders/${id}/deliver`, { method: "POST" });
  },
  invoiceCustomerOrder(id: number): Promise<CustomerOrderDetail> {
    return httpRequest<CustomerOrderDetail>(`/api/orders/${id}/invoice`, { method: "POST" });
  },
  payCustomerOrder(
    id: number,
    payload: { amount_xof: number; method: string },
  ): Promise<CustomerOrderDetail> {
    return httpRequest<CustomerOrderDetail>(`/api/orders/${id}/pay`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  cancelCustomerOrder(id: number): Promise<CustomerOrderDetail> {
    return httpRequest<CustomerOrderDetail>(`/api/orders/${id}/cancel`, { method: "POST" });
  },
  returnOrderPackaging(
    id: number,
    payload: { packaging_asset_id: number; quantity: number; notes?: string },
  ): Promise<CustomerOrderDetail> {
    return httpRequest<CustomerOrderDetail>(`/api/orders/${id}/returns`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  listPackagingAssets(): Promise<PackagingAsset[]> {
    return httpRequest<PackagingAsset[]>("/api/packaging/assets");
  },
  getCustomerDeposits(customerId: number): Promise<CustomerDepositBalance[]> {
    return httpRequest<CustomerDepositBalance[]>(`/api/customers/${customerId}/deposits`);
  },
  returnCustomerDeposits(
    customerId: number,
    payload: { packaging_asset_id: number; quantity: number; notes?: string },
  ): Promise<CustomerDepositBalance[]> {
    return httpRequest<CustomerDepositBalance[]>(`/api/customers/${customerId}/deposits/returns`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
