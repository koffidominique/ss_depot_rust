export type PackagingName = 'casier' | 'carton' | 'bouteille' | 'pack' | 'canette';
export type PriceTier = 'wholesale' | 'semi_wholesale' | 'retail';
export type CreditPolicy = 'forbidden' | 'limited' | 'unlimited';
export type UserRole = 'owner' | 'admin' | 'manager' | 'cashier' | 'stock_manager' | 'accountant';

export interface SessionUser {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  roleLabel: string;
  permissions: string[];
}

export interface UserAccount {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  roleLabel: string;
  active: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
}

export interface AuthStatus {
  needsSetup: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
  authenticated?: boolean;
  user?: SessionUser;
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  is_active: number;
}

export interface DepositComponent {
  returnable_id: number;
  pieces_per_pack: number;
  code: string;
  name: string;
  deposit_value: number;
  kind: 'bottle' | 'crate';
}

export interface ProductPackaging {
  id: number;
  product_id: number;
  name: PackagingName;
  base_unit: string;
  coefficient_milli: number;
  purchase_price: number | null;
  wholesale_price: number | null;
  semi_wholesale_price: number | null;
  retail_price: number | null;
  barcode: string | null;
  allow_fraction: number;
  is_active: number;
  deposit_mode: 'none' | 'deposit' | null;
  components: DepositComponent[];
}

export interface Product {
  id: number;
  reference: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  category_id: number;
  category_name: string;
  supplier_id: number | null;
  supplier_name: string | null;
  description: string | null;
  base_unit: string;
  stock_milli: number;
  min_stock_milli: number;
  max_stock_milli: number;
  average_cost_fcfa: number | null;
  purchase_price: number | null;
  wholesale_price: number | null;
  semi_wholesale_price: number | null;
  retail_price: number | null;
  image_path: string | null;
  is_active: number;
  packagings: ProductPackaging[];
}

export interface CatalogPresetComponent {
  returnable_code: string;
  returnable_name: string;
  pieces_per_pack: number;
}

export interface CatalogPresetPackaging {
  name: PackagingName;
  coefficient: string;
  purchase_price: number;
  wholesale_price: number;
  semi_wholesale_price: number;
  retail_price: number;
  barcode: string | null;
  allow_fraction: boolean;
  deposit_mode: 'none' | 'deposit';
  components: CatalogPresetComponent[];
}

export interface CatalogPresetItem {
  key: string;
  brewery: 'SOLIBRA' | 'BRASSIVOIRE';
  name: string;
  brand: string;
  barcode: string;
  category: string;
  base_unit: string;
  initial_stock: string;
  min_stock: string;
  purchase_price: number;
  wholesale_price: number;
  semi_wholesale_price: number;
  retail_price: number;
  description: string;
  packagings: CatalogPresetPackaging[];
  existing_product_id: number | null;
  existing_reference: string | null;
  existing_is_active: number | null;
}

export interface CatalogPresetList {
  items: CatalogPresetItem[];
}

export interface ApplyCatalogPresetsResult {
  created: number;
  reactivated: number;
  skipped: number;
  activate: boolean;
  products: Product[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Client {
  id: number;
  code: string;
  name: string;
  client_type: 'particulier' | 'professionnel';
  phone: string | null;
  address: string | null;
  city: string | null;
  email: string | null;
  contact_person: string | null;
  is_active: number;
  credit_policy: CreditPolicy;
  credit_limit: number | null;
  payment_terms_days: number;
  unpaid_balance: number;
  returnable_pieces_due: number;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  company_name: string | null;
  phone: string;
  address: string | null;
  email: string | null;
  contact_person: string | null;
  payment_terms_days: number;
  total_purchases: number;
  balance_due: number;
  is_active: number;
}

export interface SaleSummary {
  id: number;
  reference: string;
  client_id: number | null;
  client_name: string;
  sale_type: 'cash' | 'credit';
  price_tier: PriceTier;
  subtotal_merchandise: number;
  discount_amount: number;
  total_merchandise: number;
  total_deposit: number;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_labels: string | null;
  status: 'validated' | 'cancelled' | 'partially_returned' | 'returned';
  created_at: string;
}

export interface SaleDetail extends SaleSummary {
  client_code: string | null;
  client_phone: string | null;
  receivable_id: number | null;
  due_date: string | null;
  notes: string | null;
  lines: Array<{
    id: number;
    product_id: number;
    packaging_id: number;
    product_name: string;
    packaging_name: string;
    base_unit: string;
    coefficient_milli: number;
    quantity_milli: number;
    base_quantity_milli: number;
    unit_price: number;
    discount_amount: number;
    line_total: number;
    returned_base_milli: number;
  }>;
  payments: Array<{
    id: number;
    reference: string;
    method_code: string;
    method_label: string;
    part_amount: number;
    created_at: string;
  }>;
  deposits: Array<{
    id: number;
    returnable_id: number;
    packaging_name: string;
    packaging_code: string;
    pieces: number;
    returned_pieces: number;
    unit_value: number;
    amount: number;
  }>;
  cancellation: {
    id: number;
    reason: string;
    refunded_amount: number;
    created_at: string;
  } | null;
  returns: Array<{
    id: number;
    reference: string;
    credit_note_ref: string;
    total_amount: number;
    credit_reduction: number;
    refund_amount: number;
    reason: string;
    created_at: string;
  }>;
}

export interface Receivable {
  id: number;
  sale_id: number;
  sale_reference: string;
  sale_date: string;
  sale_total: number;
  client_id: number;
  client_name: string;
  client_code: string;
  client_phone: string | null;
  initial_amount: number;
  remaining_amount: number;
  due_date: string | null;
  status: 'open' | 'partial' | 'paid' | 'cancelled';
  created_at: string;
}

export interface PurchaseOrder {
  id: number;
  reference: string;
  supplier_id: number;
  supplier_name: string;
  supplier_code: string;
  status: 'draft' | 'confirmed' | 'partial' | 'received' | 'cancelled';
  total_amount: number;
  received_amount: number;
  expected_date: string | null;
  notes: string | null;
  created_at: string;
  lines: Array<{
    id: number;
    product_id: number;
    packaging_id: number;
    product_name: string;
    packaging_name: string;
    base_unit: string;
    coefficient_milli: number;
    ordered_quantity_milli: number;
    received_quantity_milli: number;
    unit_price: number;
    line_total: number;
  }>;
  receipts: Array<{
    id: number;
    reference: string;
    total_amount: number;
    created_at: string;
  }>;
}

export interface SupplierDebt {
  id: number;
  receipt_id: number;
  receipt_reference: string;
  order_reference: string;
  supplier_id: number;
  supplier_name: string;
  supplier_code: string;
  initial_amount: number;
  remaining_amount: number;
  due_date: string | null;
  status: 'open' | 'partial' | 'paid';
  created_at: string;
}

export interface CashSession {
  id: number;
  reference: string;
  opened_at: string;
  closed_at: string | null;
  status: 'open' | 'closed';
  opening_cash: number;
  theoretical_cash: number | null;
  physical_cash: number | null;
  difference: number | null;
  closing_notes: string | null;
}

export interface CashStatus {
  activeSession: CashSession | null;
  summary: {
    theoreticalCash: number;
    byMethod: Array<{
      method_code: string;
      label: string;
      is_cash: number;
      total_in: number;
      total_out: number;
    }>;
    movements: Array<{
      id: number;
      kind: string;
      method_code: string;
      method_label: string;
      is_cash: number;
      direction: 'in' | 'out';
      amount: number;
      description: string;
      reference_document: string | null;
      created_at: string;
    }>;
  } | null;
  history: CashSession[];
}

export interface DashboardData {
  kpis: {
    revenueMerchandise: number;
    depositsTotal: number;
    salesCount: number;
    collectionsTotal: number;
    receivablesTotal: number;
    receivablesCount: number;
    overdueReceivablesTotal?: number;
    overdueReceivablesCount?: number;
    supplierDebtsTotal: number;
    supplierDebtsCount: number;
    overdueSupplierDebtsTotal?: number;
    overdueSupplierDebtsCount?: number;
    expensesTotal: number;
    cashSessionOpen: boolean;
    cashSessionReference: string | null;
    cashPhysicalTheoretical: number;
    digitalSessionTotal: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  lowStockProducts: Array<{
    id: number;
    reference: string;
    name: string;
    base_unit: string;
    stock_milli: number;
    min_stock_milli: number;
  }>;
  topProducts: Array<{
    product_id: number;
    product_name: string;
    base_unit: string;
    total_base_milli: number;
    total_revenue: number;
  }>;
  salesSeries: Array<{
    day: string;
    count: number;
    revenue: number;
    collected: number;
  }>;
  recentAudit: Array<{
    id: number;
    action: string;
    entity_type: string;
    details: string;
    created_at: string;
  }>;
}

export interface PaymentMethodConfig {
  code: string;
  label: string;
  is_cash: number;
  active: number;
}

export interface AppSettings {
  company_name: string;
  company_legal_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
  currency: string;
  allow_negative_stock: number;
  invoice_prefix: string;
  sale_prefix: string;
  purchase_prefix: string;
  order_prefix: string;
  receipt_prefix: string;
  credit_note_prefix: string;
  theme: 'light' | 'dark';
  logo_path?: string | null;
  setup_completed?: number;
}

export interface ExpenseItem {
  id: number;
  reference: string;
  category: string;
  amount: number;
  method_code: string;
  method_label: string;
  session_id: number;
  beneficiary: string | null;
  notes: string | null;
  receipt_path: string | null;
  expense_date: string;
  created_at?: string;
}

export interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
  integrity?: string | null;
  sha256?: string | null;
  encrypted?: boolean;
}

export interface BackupEntityCounts {
  products: number;
  stockMovements: number;
  clients: number;
  suppliers: number;
  sales: number;
  salesReturns: number;
  customerReceivables: number;
  purchaseOrders: number;
  purchaseReceipts: number;
  supplierDebts: number;
  returnableStockMovements: number;
  cashMovements: number;
  expenses: number;
  auditLogs: number;
}

export interface BackupVerifyResult {
  name: string;
  integrity: string;
  foreignKeyErrors: number;
  schemaVersion: number;
  appliedVersions?: number[];
  backupFormat?: string;
  minAppVersion?: string;
  compatible?: boolean;
  compatibilityReason?: string | null;
  sha256?: string;
  counts?: BackupEntityCounts | null;
}

export interface BackupRestoreResult {
  restored: string;
  safetyBackup?: string;
  restoredSha256?: string;
  integrity?: string;
  foreignKeyErrors?: number;
  schemaVersion?: number;
  counts?: BackupEntityCounts;
}

export interface DailySalePoint {
  day: string;
  count: number;
  revenue: number;
  deposit?: number;
  collected: number;
}

export interface ReportsOverview {
  commercial: {
    count: number;
    merchandise_revenue: number;
    deposit_billed: number;
    paid_amount: number;
  };
  profitability: {
    knownCostTotal: number;
    knownCostRevenue: number;
    knownGrossMargin: number;
    unknownCostLines: number;
    expensesTotal: number;
    netKnownResult: number;
  };
  paymentBreakdown: Array<{
    code: string;
    label: string;
    is_cash: number;
    total_in: number;
    total_out: number;
  }>;
  stock: {
    product_count: number;
    unknown_cost_products: number;
    knownValuationFcfa: number;
  };
  dailySales: DailySalePoint[];
}
