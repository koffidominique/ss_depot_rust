/* ============================================================================
 * Types métier : Tableau de bord, Rapports, Paramètres & Sauvegardes
 * ============================================================================ */

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
  theme: "light" | "dark";
  logo_path?: string | null;
  setup_completed?: number;
  inactivity_timeout_minutes?: number;
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
