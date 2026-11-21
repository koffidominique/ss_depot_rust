/* ============================================================================
 * Commandes Tauri IPC : Commandes clientèle mixtes, emballages & consignes
 * ============================================================================ */

import type {
  ComposePreviewResult,
  CreateCustomerOrderInput,
  CustomerDepositBalance,
  CustomerOrderDetail,
  CustomerOrderSummary,
  OrderLineInput,
  PackagingAsset,
  PackagingMovementRecord,
  UpdateCustomerOrderInput,
} from "../../../types/erp.ts";
import { getStoredTauriToken, tauriInvoke } from "./tauriTransport.ts";

function tauriInvokeWithToken<T>(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return tauriInvoke<T>(cmd, { token: getStoredTauriToken(), ...args });
}

export const tauriOrdersApi = {
  composeOrderPreview(payload: {
    lines: OrderLineInput[];
    discount_xof?: number;
    tax_xof?: number;
  }): Promise<ComposePreviewResult> {
    return tauriInvokeWithToken<ComposePreviewResult>("compose_order_preview_v4", { payload });
  },
  listCustomerOrders(filter?: {
    status?: string;
    customer_id?: number;
  }): Promise<CustomerOrderSummary[]> {
    return tauriInvokeWithToken<CustomerOrderSummary[]>("list_orders_v4", {
      filter: filter ?? {},
    });
  },
  getCustomerOrder(id: number): Promise<CustomerOrderDetail> {
    return tauriInvokeWithToken<CustomerOrderDetail>("get_order_v4", { id });
  },
  createCustomerOrder(payload: CreateCustomerOrderInput): Promise<CustomerOrderDetail> {
    return tauriInvokeWithToken<CustomerOrderDetail>("create_order_v4", { payload });
  },
  updateCustomerOrder(
    id: number,
    payload: UpdateCustomerOrderInput,
  ): Promise<CustomerOrderDetail> {
    return tauriInvokeWithToken<CustomerOrderDetail>("update_order_v4", { id, payload });
  },
  confirmCustomerOrder(id: number): Promise<CustomerOrderDetail> {
    return tauriInvokeWithToken<CustomerOrderDetail>("confirm_order_v4", { id });
  },
  deliverCustomerOrder(id: number): Promise<CustomerOrderDetail> {
    return tauriInvokeWithToken<CustomerOrderDetail>("deliver_order_v4", { id });
  },
  invoiceCustomerOrder(id: number): Promise<CustomerOrderDetail> {
    return tauriInvokeWithToken<CustomerOrderDetail>("invoice_order_v4", { id });
  },
  payCustomerOrder(
    id: number,
    payload: { amount_xof: number; method: string },
  ): Promise<CustomerOrderDetail> {
    return tauriInvokeWithToken<CustomerOrderDetail>("pay_order_v4", { id, payload });
  },
  cancelCustomerOrder(id: number): Promise<CustomerOrderDetail> {
    return tauriInvokeWithToken<CustomerOrderDetail>("cancel_order_v4", { id });
  },
  returnOrderPackaging(
    id: number,
    payload: { packaging_asset_id: number; quantity: number; notes?: string },
  ): Promise<CustomerOrderDetail> {
    return tauriInvokeWithToken<CustomerOrderDetail>("return_order_packaging_v4", { id, payload });
  },
  listPackagingAssets(): Promise<PackagingAsset[]> {
    return tauriInvokeWithToken<PackagingAsset[]>("list_packaging_assets_v4");
  },
  getCustomerDeposits(customerId: number): Promise<CustomerDepositBalance[]> {
    return tauriInvokeWithToken<CustomerDepositBalance[]>("get_customer_deposits_v4", {
      customerId,
    });
  },
  getCustomerDepositHistory(customerId: number): Promise<PackagingMovementRecord[]> {
    return tauriInvokeWithToken<PackagingMovementRecord[]>(
      "get_customer_deposit_history_v4",
      { customerId },
    );
  },
  returnCustomerDeposits(
    customerId: number,
    payload: { packaging_asset_id: number; quantity: number; notes?: string },
  ): Promise<CustomerDepositBalance[]> {
    return tauriInvokeWithToken<CustomerDepositBalance[]>("return_customer_deposits_v4", {
      customerId,
      payload,
    });
  },
};
