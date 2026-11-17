import type {
  AppSettings,
  AuthStatus,
  BackupFile,
  CashStatus,
  Category,
  Client,
  CreditPolicy,
  DashboardData,
  ExpenseItem,
  PaginatedResult,
  PaymentMethodConfig,
  Product,
  PurchaseOrder,
  Receivable,
  ReportsOverview,
  SaleDetail,
  SaleSummary,
  Supplier,
  SupplierDebt,
} from '../../types/erp.ts';

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export interface ApiClient {
  // Auth
  getAuthStatus(): Promise<AuthStatus>;
  setupPin(pin: string): Promise<{ token: string }>;
  login(pin: string): Promise<{ token: string }>;
  lock(): Promise<void>;
  changePin(currentPin: string, newPin: string): Promise<void>;

  // Dashboard
  getDashboard(): Promise<DashboardData>;

  // Categories & Products
  listCategories(): Promise<Category[]>;
  createCategory(name: string, description?: string): Promise<Category>;
  listProducts(params?: {
    search?: string;
    categoryId?: number;
    includeArchived?: boolean;
    lowStockOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<Product>>;
  createProduct(input: Record<string, unknown>): Promise<Product>;
  updateProduct(id: number, input: Record<string, unknown>): Promise<Product>;
  upsertPackaging(productId: number, pkg: Record<string, unknown>): Promise<unknown>;
  exportProductsCsv(): Promise<string>;
  importProductsCsv(csv: string): Promise<{ created: number }>;

  // Clients & Sales
  listClients(search?: string): Promise<Client[]>;
  createClient(input: Record<string, unknown>): Promise<Client>;
  updateClient(clientId: number, input: Record<string, unknown>): Promise<Client>;
  updateClientCredit(
    clientId: number,
    input: { credit_policy: CreditPolicy; credit_limit?: number | null; payment_terms_days?: number }
  ): Promise<unknown>;
  listSales(params?: {
    search?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<SaleSummary>>;
  getSaleDetail(saleId: number): Promise<SaleDetail>;
  createSale(input: Record<string, unknown>): Promise<SaleDetail>;
  cancelSale(saleId: number, input: { reason: string; refund_method_code?: string; request_key: string }): Promise<SaleDetail>;
  createSaleReturn(saleId: number, input: Record<string, unknown>): Promise<SaleDetail>;

  // Receivables
  listReceivables(): Promise<Receivable[]>;
  payReceivable(
    receivableId: number,
    input: { request_key: string; note?: string; parts: Array<{ method_code: string; amount: number }> }
  ): Promise<unknown>;

  // Suppliers & Purchases
  listSuppliers(search?: string): Promise<Supplier[]>;
  createSupplier(input: Record<string, unknown>): Promise<Supplier>;
  updateSupplier(supplierId: number, input: Record<string, unknown>): Promise<Supplier>;
  listPurchases(): Promise<PurchaseOrder[]>;
  createPurchaseOrder(input: Record<string, unknown>): Promise<PurchaseOrder>;
  receivePurchaseOrder(orderId: number, input: Record<string, unknown>): Promise<unknown>;
  cancelPurchaseOrder(orderId: number, input: { reason: string }): Promise<PurchaseOrder>;
  listSupplierDebts(): Promise<SupplierDebt[]>;
  paySupplierDebt(
    debtId: number,
    input: { method_code: string; amount: number; request_key: string; note?: string }
  ): Promise<unknown>;

  // Stock & Inventories
  getStockOverview(): Promise<{
    products: Array<Record<string, unknown>>;
    movements: Array<Record<string, unknown>>;
  }>;
  adjustStock(input: {
    product_id: number;
    direction: 'in' | 'out';
    quantity: string | number;
    reason: string;
    request_key: string;
  }): Promise<Record<string, unknown>>;
  listInventories(): Promise<Array<Record<string, unknown>>>;
  createInventory(notes?: string): Promise<Record<string, unknown>>;
  validateInventory(
    inventoryId: number,
    lines: Array<{ product_id: number; counted_quantity: string | number; reason?: string }>
  ): Promise<Record<string, unknown>>;

  // Consignments
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

  // Cash & Expenses
  getCashStatus(): Promise<CashStatus>;
  openCashSession(input: { opening_cash: number; request_key: string }): Promise<unknown>;
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

  // Reports, Settings & Backups
  getReports(from?: string, to?: string): Promise<ReportsOverview>;
  getSettings(): Promise<{ settings: AppSettings; paymentMethods: PaymentMethodConfig[] }>;
  updateSettings(
    input: Partial<Omit<AppSettings, 'allow_negative_stock'>> & {
      allow_negative_stock?: boolean | number;
    }
  ): Promise<{ settings: AppSettings; paymentMethods: PaymentMethodConfig[] }>;
  addPaymentMethod(label: string): Promise<PaymentMethodConfig>;
  togglePaymentMethod(code: string, active: boolean): Promise<PaymentMethodConfig>;
  listBackups(): Promise<BackupFile[]>;
  createBackup(): Promise<BackupFile>;
  verifyBackup(name: string): Promise<{ name: string; integrity: string; foreignKeyErrors: number; schemaVersion: number }>;
  restoreBackup(name: string): Promise<{ restored: string }>;
  downloadBackup(name: string): Promise<Uint8Array>;
  generateDocumentPdf(doc: Record<string, unknown>): Promise<Uint8Array>;
}
