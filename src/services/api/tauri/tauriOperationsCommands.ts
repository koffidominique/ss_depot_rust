import type { ApiClient } from "../ApiClient.ts";
import { getStoredTauriToken, tauriInvoke } from "./tauriTransport.ts";

/* ============================================================================
 * Commandes Tauri : Stocks, Consignations, Caisse, Rapports & Système
 * ============================================================================ */

export const tauriStockApi = {
  getStockOverview: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["getStockOverview"]>>>(
      "get_stock_overview",
      { token: getStoredTauriToken() },
    ),
  adjustStock: (input: Parameters<ApiClient["adjustStock"]>[0]) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["adjustStock"]>>>(
      "adjust_stock",
      {
        token: getStoredTauriToken(),
        payload: { ...input, quantity: String(input.quantity) },
      },
    ),
  listInventories: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listInventories"]>>>(
      "list_inventories",
      { token: getStoredTauriToken() },
    ),
  createInventory: (notes?: string) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createInventory"]>>>(
      "create_inventory",
      { token: getStoredTauriToken(), notes },
    ),
  validateInventory: (
    inventoryId: number,
    lines: Array<Record<string, unknown>>,
  ) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["validateInventory"]>>>(
      "validate_inventory",
      { token: getStoredTauriToken(), inventoryId, lines },
    ),
};

export const tauriConsignmentsApi = {
  getConsignmentsOverview: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["getConsignmentsOverview"]>>>(
      "get_consignments_overview",
      { token: getStoredTauriToken() },
    ),
  createReturnableType: (input: Record<string, unknown>) =>
    tauriInvoke("create_returnable_type", {
      token: getStoredTauriToken(),
      payload: input,
    }),
  adjustReturnableStock: (input: Record<string, unknown>) =>
    tauriInvoke("adjust_returnable_stock", {
      token: getStoredTauriToken(),
      payload: input,
    }),
  returnClientEmpties: (input: Record<string, unknown>) =>
    tauriInvoke("return_client_empties", {
      token: getStoredTauriToken(),
      payload: input,
    }),
  listPackagingObligations: (clientId?: number) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listPackagingObligations"]>>>(
      "list_packaging_obligations",
      { token: getStoredTauriToken(), clientId: clientId ?? null },
    ),
  getPackagingDashboard: (clientId: number) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["getPackagingDashboard"]>>>(
      "get_packaging_dashboard",
      { token: getStoredTauriToken(), clientId },
    ),
  payPackagingDebt: (input: Parameters<ApiClient["payPackagingDebt"]>[0]) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["payPackagingDebt"]>>>(
      "pay_packaging_debt",
      { token: getStoredTauriToken(), payload: input },
    ),
  getProductCatalogueOverview: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["getProductCatalogueOverview"]>>>(
      "get_product_catalogue_overview_pc",
      { token: getStoredTauriToken() },
    ),
  setCatalogueProductActive: (id: number, is_active: boolean) =>
    tauriInvoke("set_catalogue_product_active_pc", {
      token: getStoredTauriToken(),
      productId: id,
      isActive: is_active,
    }),
  setCatalogueReferencePrice: (
    id: number,
    input: { reference_price: number; reason?: string; request_key: string },
  ) =>
    tauriInvoke("set_catalogue_reference_price_pc", {
      token: getStoredTauriToken(),
      productId: id,
      payload: input,
    }),
  getCatalogueReferencePriceHistory: (id: number) =>
    tauriInvoke<
      Awaited<ReturnType<ApiClient["getCatalogueReferencePriceHistory"]>>
    >("get_catalogue_reference_price_history_pc", {
      token: getStoredTauriToken(),
      productId: id,
    }),
};

export const tauriFinanceApi = {
  getCashStatus: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["getCashStatus"]>>>(
      "get_cash_status",
      { token: getStoredTauriToken() },
    ),
  openCashSession: (input: Record<string, unknown>) =>
    tauriInvoke("open_cash_session", {
      token: getStoredTauriToken(),
      payload: input,
    }),
  closeCashSession: (input: Record<string, unknown>) =>
    tauriInvoke("close_cash_session", {
      token: getStoredTauriToken(),
      payload: input,
    }),
  listExpenses: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listExpenses"]>>>(
      "list_expenses",
      { token: getStoredTauriToken() },
    ),
  createExpense: (input: Record<string, unknown>) =>
    tauriInvoke("create_expense", {
      token: getStoredTauriToken(),
      payload: input,
    }),
  getReports: (from?: string, to?: string) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["getReports"]>>>("get_reports", {
      token: getStoredTauriToken(),
      from,
      to,
    }),
};

export const tauriSystemApi = {
  getSettings: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["getSettings"]>>>("get_settings", {
      token: getStoredTauriToken(),
    }),
  updateSettings: (input: Record<string, unknown>) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["updateSettings"]>>>(
      "update_settings",
      { token: getStoredTauriToken(), payload: input },
    ),
  addPaymentMethod: (label: string) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["addPaymentMethod"]>>>(
      "add_payment_method",
      { token: getStoredTauriToken(), label },
    ),
  togglePaymentMethod: (code: string, active: boolean) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["togglePaymentMethod"]>>>(
      "toggle_payment_method",
      { token: getStoredTauriToken(), code, active },
    ),
  listBackups: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["listBackups"]>>>("list_backups", {
      token: getStoredTauriToken(),
    }),
  getLocalDbStatus: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["getLocalDbStatus"]>>>(
      "get_local_db_status",
      { token: getStoredTauriToken() },
    ),
  createBackup: () =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createBackup"]>>>(
      "create_backup",
      { token: getStoredTauriToken() },
    ),
  createEncryptedBackup: (passphrase: string) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["createEncryptedBackup"]>>>(
      "create_encrypted_backup",
      { token: getStoredTauriToken(), passphrase },
    ),
  importBackup: (filename: string, bytes: Uint8Array) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["importBackup"]>>>(
      "import_backup_file",
      {
        token: getStoredTauriToken(),
        filename,
        bytes: Array.from(bytes),
      },
    ),
  verifyBackup: (name: string) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["verifyBackup"]>>>(
      "verify_backup",
      { token: getStoredTauriToken(), name },
    ),
  verifyEncryptedBackup: (name: string, passphrase: string) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["verifyEncryptedBackup"]>>>(
      "verify_encrypted_backup",
      { token: getStoredTauriToken(), name, passphrase },
    ),
  restoreBackup: (name: string) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["restoreBackup"]>>>(
      "restore_backup",
      { token: getStoredTauriToken(), name },
    ),
  restoreEncryptedBackup: (name: string, passphrase: string) =>
    tauriInvoke<Awaited<ReturnType<ApiClient["restoreEncryptedBackup"]>>>(
      "restore_encrypted_backup",
      { token: getStoredTauriToken(), name, passphrase },
    ),
  downloadBackup: async (name: string) => {
    const bytes = await tauriInvoke<number[]>("download_backup", {
      token: getStoredTauriToken(),
      name,
    });
    return new Uint8Array(bytes);
  },
  generateDocumentPdf: async (doc: Record<string, unknown>) => {
    const bytes = await tauriInvoke<number[]>("generate_document_pdf", {
      token: getStoredTauriToken(),
      doc,
    });
    return new Uint8Array(bytes);
  },
  shutdownApp: async () => {
    await tauriInvoke("shutdown_app", {});
  },
};
