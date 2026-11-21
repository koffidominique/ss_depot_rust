import type {
  AppSettings,
  BackupFile,
  BackupRestoreResult,
  BackupVerifyResult,
  CashStatus,
  ExpenseItem,
  LocalDbStatus,
  PaymentMethodConfig,
  ReportsOverview,
} from "../../../types/erp.ts";

/* ============================================================================
 * Contrats API : Stock, Consignations, Caisse, Rapports & Système
 * ============================================================================ */

export interface StockApiClient {
  getStockOverview(): Promise<{
    products: Array<Record<string, unknown>>;
    movements: Array<Record<string, unknown>>;
  }>;
  adjustStock(input: {
    product_id: number;
    direction: "in" | "out";
    quantity: string | number;
    reason: string;
    request_key: string;
  }): Promise<Record<string, unknown>>;
  listInventories(): Promise<Array<Record<string, unknown>>>;
  createInventory(notes?: string): Promise<Record<string, unknown>>;
  validateInventory(
    inventoryId: number,
    lines: Array<{
      product_id: number;
      counted_quantity: string | number;
      reason?: string;
    }>,
  ): Promise<Record<string, unknown>>;
}

export interface ConsignmentsApiClient {
  getConsignmentsOverview(): Promise<{
    types: Array<Record<string, unknown>>;
    clientBalances: Array<Record<string, unknown>>;
    recentMovements: Array<Record<string, unknown>>;
    openIssues: Array<Record<string, unknown>>;
    returns: Array<Record<string, unknown>>;
  }>;
  createReturnableType(input: Record<string, unknown>): Promise<unknown>;
  adjustReturnableStock(input: Record<string, unknown>): Promise<unknown>;
  returnClientEmpties(input: Record<string, unknown>): Promise<unknown>;
  listPackagingObligations(clientId?: number): Promise<
    Array<{
      id: number;
      sale_id: number;
      sale_reference: string | null;
      client_id: number | null;
      returnable_id: number;
      pieces: number;
      returned_pieces: number;
      pending_pieces: number;
      unit_value: number;
      total_reference_value: number;
      due_date: string | null;
      overdue: boolean;
      status: string;
    }>
  >;
  getPackagingDashboard(clientId: number): Promise<{
    client_id: number;
    commercial_debt: number;
    packaging_financial_debt: number;
    pending_pieces: number;
    pending_reference_value: number;
    total_financial_due: number;
  }>;
  payPackagingDebt(input: {
    client_id: number;
    parts: Array<{ method_code: string; amount: number }>;
    request_key: string;
    note?: string;
  }): Promise<{ client_id: number; packaging_financial_balance: number }>;
  getProductCatalogueOverview(): Promise<Record<string, unknown>>;
  setCatalogueProductActive(id: number, is_active: boolean): Promise<unknown>;
  setCatalogueReferencePrice(
    id: number,
    input: { reference_price: number; reason?: string; request_key: string },
  ): Promise<unknown>;
  getCatalogueReferencePriceHistory(id: number): Promise<
    Array<{
      id: number;
      reference_price: number;
      reason: string | null;
      changed_by: string | null;
      created_at: string;
    }>
  >;
}

export interface FinanceApiClient {
  getCashStatus(): Promise<CashStatus>;
  openCashSession(input: {
    opening_cash: number;
    request_key: string;
  }): Promise<unknown>;
  closeCashSession(input: {
    session_id: number;
    physical_cash: number;
    closing_notes?: string;
    request_key: string;
  }): Promise<unknown>;
  listExpenses(): Promise<{
    categories: Array<{ id: number; name: string }>;
    items: ExpenseItem[];
  }>;
  createExpense(input: Record<string, unknown>): Promise<unknown>;
  getReports(from?: string, to?: string): Promise<ReportsOverview>;
}

export interface SystemApiClient {
  getSettings(): Promise<{
    settings: AppSettings;
    paymentMethods: PaymentMethodConfig[];
  }>;
  updateSettings(
    input: Partial<
      Omit<AppSettings, "allow_negative_stock" | "setup_completed">
    > & {
      allow_negative_stock?: boolean | number;
      setup_completed?: boolean | number;
    },
  ): Promise<{ settings: AppSettings; paymentMethods: PaymentMethodConfig[] }>;
  addPaymentMethod(label: string): Promise<PaymentMethodConfig>;
  togglePaymentMethod(
    code: string,
    active: boolean,
  ): Promise<PaymentMethodConfig>;
  listBackups(): Promise<BackupFile[]>;
  getLocalDbStatus(): Promise<LocalDbStatus>;
  createBackup(): Promise<BackupFile>;
  createEncryptedBackup(passphrase: string): Promise<BackupFile>;
  importBackup(filename: string, bytes: Uint8Array): Promise<BackupFile>;
  verifyBackup(name: string): Promise<BackupVerifyResult>;
  verifyEncryptedBackup(
    name: string,
    passphrase: string,
  ): Promise<BackupVerifyResult>;
  restoreBackup(name: string): Promise<BackupRestoreResult>;
  restoreEncryptedBackup(
    name: string,
    passphrase: string,
  ): Promise<BackupRestoreResult>;
  downloadBackup(name: string): Promise<Uint8Array>;
  generateDocumentPdf(doc: Record<string, unknown>): Promise<Uint8Array>;
  shutdownApp(): Promise<void>;
}
