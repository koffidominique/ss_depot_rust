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

export const tauriCatalogApi = {
  listCategories: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listCategories"]>>>(
      "list_categories",
      { token: getStoredTauriToken() },
    ),
  createCategory: (name: string, description?: string, parentId?: number | null) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createCategory"]>>>(
      "create_category",
      { token: getStoredTauriToken(), name, parentId: parentId ?? null, description },
    ),
  updateCategory: (id: number, input: Parameters<ApiClient["updateCategory"]>[1]) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["updateCategory"]>>>(
      "update_category",
      {
        token: getStoredTauriToken(),
        id,
        name: input.name,
        parentId: input.parent_id ?? null,
        description: input.description,
        isActive: input.is_active,
      },
    ),
  listProducts: (
    params: Parameters<ApiClient["listProducts"]>[0] = {},
  ) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listProducts"]>>>(
      "list_products",
      {
        token: getStoredTauriToken(),
        search: params.search,
        categoryId: params.categoryId,
        includeArchived: params.includeArchived,
        lowStockOnly: params.lowStockOnly,
        page: params.page,
        pageSize: params.pageSize,
      },
    ),
  createProduct: (input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createProduct"]>>>(
      "create_product",
      { token: getStoredTauriToken(), payload: input },
    ),
  updateProduct: (id: number, input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["updateProduct"]>>>(
      "update_product",
      { token: getStoredTauriToken(), id, payload: input },
    ),
  deleteProduct: (id: number) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["deleteProduct"]>>>(
      "delete_product",
      { token: getStoredTauriToken(), id },
    ),
  upsertPackaging: (productId: number, pkg: Record<string, unknown>) =>
    tauriInvoke("upsert_packaging", {
      token: getStoredTauriToken(),
      productId,
      pkg,
    }),
  listBreweries: (search?: string) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listBreweries"]>>>(
      "list_breweries",
      { token: getStoredTauriToken(), search },
    ),
  createBrewery: (input: Parameters<ApiClient["createBrewery"]>[0]) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createBrewery"]>>>(
      "create_brewery",
      { token: getStoredTauriToken(), payload: input },
    ),
  listBrandsV4: (search?: string) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listBrandsV4"]>>>(
      "list_brands_v4",
      { token: getStoredTauriToken(), search },
    ),
  createBrandV4: (input: Parameters<ApiClient["createBrandV4"]>[0]) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createBrandV4"]>>>(
      "create_brand_v4",
      { token: getStoredTauriToken(), payload: input },
    ),
  listContainerTypesV4: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listContainerTypesV4"]>>>(
      "list_container_types_v4",
      { token: getStoredTauriToken() },
    ),
  listPackagingTypesV4: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listPackagingTypesV4"]>>>(
      "list_packaging_types_v4",
      { token: getStoredTauriToken() },
    ),
  listStockLocationsV4: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listStockLocationsV4"]>>>(
      "list_stock_locations_v4",
      { token: getStoredTauriToken() },
    ),
  listSalesUnits: (productId: number) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listSalesUnits"]>>>(
      "list_sales_units_v4",
      { token: getStoredTauriToken(), productId },
    ),
  createSalesUnit: (input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createSalesUnit"]>>>(
      "create_sales_unit_v4",
      { token: getStoredTauriToken(), payload: input },
    ),
  updateSalesUnit: (id: number, input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["updateSalesUnit"]>>>(
      "update_sales_unit_v4",
      { token: getStoredTauriToken(), id, payload: input },
    ),
  deleteSalesUnit: (id: number) =>
    tauriInvoke<void>("delete_sales_unit_v4", {
      token: getStoredTauriToken(),
      id,
    }),
  listProductSuppliers: (productId: number) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listProductSuppliers"]>>>(
      "list_product_suppliers_v4",
      { token: getStoredTauriToken(), productId },
    ),
  upsertProductSupplier: (productId: number, input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["upsertProductSupplier"]>>>(
      "upsert_product_supplier_v4",
      { token: getStoredTauriToken(), payload: { ...input, product_id: productId } },
    ),
  listDepositRules: (productId?: number) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listDepositRules"]>>>(
      "list_deposit_rules_v4",
      { token: getStoredTauriToken(), productId: productId ?? null },
    ),
  exportProductsCsv: () =>
    tauriInvoke<string>("export_products_csv", {
      token: getStoredTauriToken(),
    }),
  importProductsCsv: (csv: string) =>
    tauriInvoke<{ created: number }>("import_products_csv", {
      token: getStoredTauriToken(),
      csv,
    }),
};

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
  receivePurchaseOrder: (orderId: number, input: ReceivePurchaseOrderPayload) =>
    tauriInvoke("receive_purchase_order", {
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
