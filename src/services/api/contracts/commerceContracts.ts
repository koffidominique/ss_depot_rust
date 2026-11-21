import type {
  AuthStatus,
  Category,
  Client,
  CreditPolicy,
  DashboardData,
  PaginatedResult,
  Product,
  PurchaseOrder,
  Receivable,
  SaleDetail,
  SaleSummary,
  SessionUser,
  Supplier,
  SupplierDebt,
  UserAccount,
  UserRole,
} from "../../../types/erp.ts";
import type {
  CreateSaleReturnPayload,
  ReceivePurchaseOrderPayload,
} from "./shared.ts";

/* ============================================================================
 * Contrats API : Authentification, Catalogue produits, Ventes & Achats
 * ============================================================================ */

export interface AuthApiClient {
  getAuthStatus(): Promise<AuthStatus>;
  setupPin(pin: string): Promise<{ token: string; user?: SessionUser }>;
  login(
    pin: string,
    username?: string,
  ): Promise<{ token: string; user?: SessionUser }>;
  lock(): Promise<void>;
  changePin(currentPin: string, newPin: string): Promise<void>;
  getMe(): Promise<{ user: SessionUser }>;
  listUsers(): Promise<UserAccount[]>;
  createUser(input: {
    username: string;
    displayName: string;
    role: UserRole;
    pin: string;
  }): Promise<UserAccount>;
  toggleUser(userId: number, active: boolean): Promise<UserAccount>;
  getDashboard(): Promise<DashboardData>;
}

export interface CatalogApiClient {
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
  upsertPackaging(
    productId: number,
    pkg: Record<string, unknown>,
  ): Promise<unknown>;
  exportProductsCsv(): Promise<string>;
  importProductsCsv(csv: string): Promise<{ created: number }>;
}

export interface SalesApiClient {
  listClients(search?: string): Promise<Client[]>;
  createClient(input: Record<string, unknown>): Promise<Client>;
  updateClient(
    clientId: number,
    input: Record<string, unknown>,
  ): Promise<Client>;
  updateClientCredit(
    clientId: number,
    input: {
      credit_policy: CreditPolicy;
      credit_limit?: number | null;
      payment_terms_days?: number;
    },
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
  cancelSale(
    saleId: number,
    input: { reason: string; refund_method_code?: string; request_key: string },
  ): Promise<SaleDetail>;
  createSaleReturn(
    saleId: number,
    input: CreateSaleReturnPayload,
  ): Promise<SaleDetail>;
  listReceivables(): Promise<Receivable[]>;
  payReceivable(
    receivableId: number,
    input: {
      request_key: string;
      note?: string;
      parts: Array<{ method_code: string; amount: number }>;
    },
  ): Promise<unknown>;
}

export interface PurchasesApiClient {
  listSuppliers(search?: string): Promise<Supplier[]>;
  createSupplier(input: Record<string, unknown>): Promise<Supplier>;
  updateSupplier(
    supplierId: number,
    input: Record<string, unknown>,
  ): Promise<Supplier>;
  listPurchases(): Promise<PurchaseOrder[]>;
  createPurchaseOrder(input: Record<string, unknown>): Promise<PurchaseOrder>;
  receivePurchaseOrder(
    orderId: number,
    input: ReceivePurchaseOrderPayload,
  ): Promise<unknown>;
  cancelPurchaseOrder(
    orderId: number,
    input: { reason: string },
  ): Promise<PurchaseOrder>;
  listSupplierDebts(): Promise<SupplierDebt[]>;
  paySupplierDebt(
    debtId: number,
    input: {
      method_code: string;
      amount: number;
      request_key: string;
      note?: string;
    },
  ): Promise<unknown>;
}
