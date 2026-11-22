import type { SessionUser } from "../../../types/erp.ts";
import type {
  ApiClient,
  CreateSaleReturnPayload,
  ReceivePurchaseOrderPayload,
} from "../ApiClient.ts";
import {
  clearStoredTauriToken,
  getStoredTauriToken,
  setStoredTauriToken,
  tauriInvoke,
} from "./tauriTransport.ts";

/* ============================================================================
 * Commandes Tauri : Auth, Catalogue, Ventes, Clients & Approvisionnements
 * ============================================================================ */

export const tauriAuthApi = {
  getAuthStatus: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["getAuthStatus"]>>>("auth_status"),
  setupPin: async (pin: string) => {
    const res = await tauriInvoke<{ token: string; user?: SessionUser }>(
      "auth_setup_pin",
      { pin },
    );
    setStoredTauriToken(res.token);
    return res;
  },
  login: async (pin: string, username?: string) => {
    const res = await tauriInvoke<{ token: string; user?: SessionUser }>(
      "auth_login",
      { pin, username },
    );
    setStoredTauriToken(res.token);
    return res;
  },
  lock: async () => {
    const token = getStoredTauriToken();
    if (token) {
      await tauriInvoke("auth_lock", { token });
    }
    clearStoredTauriToken();
  },
  changePin: async (currentPin: string, newPin: string) => {
    await tauriInvoke("change_owner_pin", {
      token: getStoredTauriToken(),
      currentPin,
      newPin,
    });
  },
  getMe: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["getMe"]>>>("auth_me", {
      token: getStoredTauriToken(),
    }),
  listUsers: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listUsers"]>>>(
      "auth_list_users",
      { token: getStoredTauriToken() },
    ),
  createUser: (input: Parameters<ApiClient["createUser"]>[0]) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createUser"]>>>(
      "auth_create_user",
      { token: getStoredTauriToken(), payload: input },
    ),
  toggleUser: (userId: number, active: boolean) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["toggleUser"]>>>(
      "auth_toggle_user",
      { token: getStoredTauriToken(), userId, active },
    ),
  getDashboard: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["getDashboard"]>>>(
      "get_dashboard",
      { token: getStoredTauriToken() },
    ),
};

export { tauriCatalogApi } from "./tauriCatalogApi.ts";

export const tauriSalesApi = {
  listClients: (search?: string) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listClients"]>>>("list_clients", {
      token: getStoredTauriToken(),
      search,
    }),
  createClient: (input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createClient"]>>>(
      "create_client",
      { token: getStoredTauriToken(), payload: input },
    ),
  updateClient: (clientId: number, input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["updateClient"]>>>(
      "update_client",
      { token: getStoredTauriToken(), clientId, payload: input },
    ),
  updateClientCredit: (clientId: number, input: Record<string, unknown>) =>
    tauriInvoke("update_client_credit", {
      token: getStoredTauriToken(),
      clientId,
      payload: input,
    }),
  listSales: (params: Parameters<ApiClient["listSales"]>[0] = {}) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listSales"]>>>("list_sales", {
      token: getStoredTauriToken(),
      search: params.search,
      status: params.status,
      from: params.from,
      to: params.to,
      page: params.page,
      pageSize: params.pageSize,
    }),
  getSaleDetail: (saleId: number) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["getSaleDetail"]>>>(
      "get_sale_detail",
      { token: getStoredTauriToken(), saleId },
    ),
  createSale: (input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createSale"]>>>("create_sale", {
      token: getStoredTauriToken(),
      payload: input,
    }),
  cancelSale: (saleId: number, input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["cancelSale"]>>>("cancel_sale", {
      token: getStoredTauriToken(),
      saleId,
      payload: input,
    }),
  createSaleReturn: (saleId: number, input: CreateSaleReturnPayload) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createSaleReturn"]>>>(
      "create_sale_return",
      { token: getStoredTauriToken(), saleId, payload: input },
    ),
  listReceivables: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listReceivables"]>>>(
      "list_receivables",
      { token: getStoredTauriToken() },
    ),
  payReceivable: (receivableId: number, input: Record<string, unknown>) =>
    tauriInvoke("pay_receivable", {
      token: getStoredTauriToken(),
      receivableId,
      payload: input,
    }),
};

export const tauriPurchasesApi = {
  listSuppliers: (search?: string) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listSuppliers"]>>>(
      "list_suppliers",
      { token: getStoredTauriToken(), search },
    ),
  createSupplier: (input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createSupplier"]>>>(
      "create_supplier",
      { token: getStoredTauriToken(), payload: input },
    ),
  updateSupplier: (supplierId: number, input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["updateSupplier"]>>>(
      "update_supplier",
      { token: getStoredTauriToken(), supplierId, payload: input },
    ),
  listPurchases: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listPurchases"]>>>(
      "list_purchases",
      { token: getStoredTauriToken() },
    ),
  createPurchaseOrder: (input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createPurchaseOrder"]>>>(
      "create_purchase_order",
      { token: getStoredTauriToken(), payload: input },
    ),
  updatePurchaseOrder: (orderId: number, input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["updatePurchaseOrder"]>>>(
      "update_purchase_order",
      { token: getStoredTauriToken(), purchaseOrderId: orderId, payload: input },
    ),
  receivePurchaseOrder: (orderId: number, input: ReceivePurchaseOrderPayload) =>
    tauriInvoke<Awaited<ReturnType<ApiClient['receivePurchaseOrder']>>>("receive_purchase_order", {
      token: getStoredTauriToken(),
      purchaseOrderId: orderId,
      payload: input,
    }),
  cancelPurchaseOrder: (orderId: number, input: { reason: string }) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["cancelPurchaseOrder"]>>>(
      "cancel_purchase_order",
      { token: getStoredTauriToken(), purchaseOrderId: orderId, payload: input },
    ),
  listSupplierDebts: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listSupplierDebts"]>>>(
      "list_supplier_debts",
      { token: getStoredTauriToken() },
    ),
  paySupplierDebt: (debtId: number, input: Record<string, unknown>) =>
    tauriInvoke("pay_supplier_debt", {
      token: getStoredTauriToken(),
      debtId,
      payload: input,
    }),
};
