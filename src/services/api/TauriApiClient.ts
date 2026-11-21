import type { SessionUser } from '../../types/erp.ts';
import {
  ApiError,
  type ApiClient,
  type CreateSaleReturnPayload,
  type ReceivePurchaseOrderPayload,
} from './ApiClient.ts';

interface TauriInternals {
  invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

const TAURI_TOKEN_KEY = 'depotpro_tauri_token';

function getStoredToken(): string {
  return sessionStorage.getItem(TAURI_TOKEN_KEY) || '';
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  if (!internals?.invoke) {
    throw new ApiError('TAURI_UNAVAILABLE', 'Le runtime desktop Tauri n’est pas disponible.');
  }
  try {
    return await internals.invoke<T>(cmd, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ApiError('TAURI_COMMAND_ERROR', message);
  }
}

export class TauriApiClient implements ApiClient {
  getAuthStatus() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['getAuthStatus']>>>('auth_status');
  }
  async setupPin(pin: string) {
    const res = await tauriInvoke<{ token: string; user?: SessionUser }>('auth_setup_pin', { pin });
    sessionStorage.setItem(TAURI_TOKEN_KEY, res.token);
    return res;
  }
  async login(pin: string, username?: string) {
    const res = await tauriInvoke<{ token: string; user?: SessionUser }>('auth_login', { pin, username });
    sessionStorage.setItem(TAURI_TOKEN_KEY, res.token);
    return res;
  }
  async lock() {
    const token = getStoredToken();
    if (token) {
      await tauriInvoke('auth_lock', { token });
    }
    sessionStorage.removeItem(TAURI_TOKEN_KEY);
  }
  async changePin(currentPin: string, newPin: string) {
    await tauriInvoke('change_owner_pin', { token: getStoredToken(), currentPin, newPin });
  }
  getMe() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['getMe']>>>('auth_me', { token: getStoredToken() });
  }
  listUsers() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['listUsers']>>>('auth_list_users', {
      token: getStoredToken(),
    });
  }
  createUser(input: Parameters<ApiClient['createUser']>[0]) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['createUser']>>>('auth_create_user', {
      token: getStoredToken(),
      payload: input,
    });
  }
  toggleUser(userId: number, active: boolean) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['toggleUser']>>>('auth_toggle_user', {
      token: getStoredToken(),
      userId,
      active,
    });
  }
  getDashboard() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['getDashboard']>>>('get_dashboard', { token: getStoredToken() });
  }
  listCategories() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['listCategories']>>>('list_categories', { token: getStoredToken() });
  }
  createCategory(name: string, description?: string) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['createCategory']>>>('create_category', {
      token: getStoredToken(),
      name,
      description,
    });
  }
  listProducts(params: {
    search?: string;
    categoryId?: number;
    includeArchived?: boolean;
    lowStockOnly?: boolean;
    page?: number;
    pageSize?: number;
  } = {}) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['listProducts']>>>('list_products', {
      token: getStoredToken(),
      search: params.search,
      categoryId: params.categoryId,
      includeArchived: params.includeArchived,
      lowStockOnly: params.lowStockOnly,
      page: params.page,
      pageSize: params.pageSize,
    });
  }
  createProduct(input: Record<string, unknown>) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['createProduct']>>>('create_product', {
      token: getStoredToken(),
      payload: input,
    });
  }
  updateProduct(id: number, input: Record<string, unknown>) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['updateProduct']>>>('update_product', {
      token: getStoredToken(),
      id,
      payload: input,
    });
  }
  deleteProduct(id: number) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['deleteProduct']>>>('delete_product', {
      token: getStoredToken(),
      id,
    });
  }
  upsertPackaging(productId: number, pkg: Record<string, unknown>) {
    return tauriInvoke('upsert_packaging', { token: getStoredToken(), productId, pkg });
  }
  exportProductsCsv() {
    return tauriInvoke<string>('export_products_csv', { token: getStoredToken() });
  }
  importProductsCsv(csv: string) {
    return tauriInvoke<{ created: number }>('import_products_csv', { token: getStoredToken(), csv });
  }
  listCatalogPresets() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['listCatalogPresets']>>>(
      'list_catalog_presets',
      { token: getStoredToken() }
    );
  }
  applyCatalogPresets(input: { keys: string[]; activate?: boolean }) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['applyCatalogPresets']>>>(
      'apply_catalog_presets',
      { token: getStoredToken(), payload: input }
    );
  }
  listClients(search?: string) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['listClients']>>>('list_clients', {
      token: getStoredToken(),
      search,
    });
  }
  createClient(input: Record<string, unknown>) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['createClient']>>>('create_client', {
      token: getStoredToken(),
      payload: input,
    });
  }
  updateClient(clientId: number, input: Record<string, unknown>) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['updateClient']>>>('update_client', {
      token: getStoredToken(),
      clientId,
      payload: input,
    });
  }
  updateClientCredit(clientId: number, input: Record<string, unknown>) {
    return tauriInvoke('update_client_credit', {
      token: getStoredToken(),
      clientId,
      payload: input,
    });
  }
  listSales(
    params: {
      search?: string;
      status?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {}
  ) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['listSales']>>>('list_sales', {
      token: getStoredToken(),
      search: params.search,
      status: params.status,
      from: params.from,
      to: params.to,
      page: params.page,
      pageSize: params.pageSize,
    });
  }
  getSaleDetail(saleId: number) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['getSaleDetail']>>>('get_sale_detail', {
      token: getStoredToken(),
      saleId,
    });
  }
  createSale(input: Record<string, unknown>) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['createSale']>>>('create_sale', {
      token: getStoredToken(),
      payload: input,
    });
  }
  cancelSale(saleId: number, input: Record<string, unknown>) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['cancelSale']>>>('cancel_sale', {
      token: getStoredToken(),
      saleId,
      payload: input,
    });
  }
  createSaleReturn(saleId: number, input: CreateSaleReturnPayload) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['createSaleReturn']>>>('create_sale_return', {
      token: getStoredToken(),
      saleId,
      payload: input,
    });
  }
  listReceivables() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['listReceivables']>>>('list_receivables', {
      token: getStoredToken(),
    });
  }
  payReceivable(receivableId: number, input: Record<string, unknown>) {
    return tauriInvoke('pay_receivable', { token: getStoredToken(), receivableId, payload: input });
  }
  listSuppliers(search?: string) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['listSuppliers']>>>('list_suppliers', {
      token: getStoredToken(),
      search,
    });
  }
  createSupplier(input: Record<string, unknown>) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['createSupplier']>>>('create_supplier', {
      token: getStoredToken(),
      payload: input,
    });
  }
  updateSupplier(supplierId: number, input: Record<string, unknown>) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['updateSupplier']>>>('update_supplier', {
      token: getStoredToken(),
      supplierId,
      payload: input,
    });
  }
  listPurchases() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['listPurchases']>>>('list_purchases', {
      token: getStoredToken(),
    });
  }
  createPurchaseOrder(input: Record<string, unknown>) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['createPurchaseOrder']>>>('create_purchase_order', {
      token: getStoredToken(),
      payload: input,
    });
  }
  receivePurchaseOrder(orderId: number, input: ReceivePurchaseOrderPayload) {
    return tauriInvoke('receive_purchase_order', {
      token: getStoredToken(),
      purchaseOrderId: orderId,
      payload: input,
    });
  }
  cancelPurchaseOrder(orderId: number, input: { reason: string }) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['cancelPurchaseOrder']>>>('cancel_purchase_order', {
      token: getStoredToken(),
      purchaseOrderId: orderId,
      payload: input,
    });
  }
  listSupplierDebts() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['listSupplierDebts']>>>('list_supplier_debts', {
      token: getStoredToken(),
    });
  }
  paySupplierDebt(debtId: number, input: Record<string, unknown>) {
    return tauriInvoke('pay_supplier_debt', { token: getStoredToken(), debtId, payload: input });
  }
  getStockOverview() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['getStockOverview']>>>('get_stock_overview', {
      token: getStoredToken(),
    });
  }
  adjustStock(input: {
    product_id: number;
    direction: 'in' | 'out';
    quantity: string | number;
    reason: string;
    request_key: string;
  }) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['adjustStock']>>>('adjust_stock', {
      token: getStoredToken(),
      payload: { ...input, quantity: String(input.quantity) },
    });
  }
  listInventories() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['listInventories']>>>('list_inventories', {
      token: getStoredToken(),
    });
  }
  createInventory(notes?: string) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['createInventory']>>>('create_inventory', {
      token: getStoredToken(),
      notes,
    });
  }
  validateInventory(inventoryId: number, lines: Array<Record<string, unknown>>) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['validateInventory']>>>('validate_inventory', {
      token: getStoredToken(),
      inventoryId,
      lines,
    });
  }
  getConsignmentsOverview() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['getConsignmentsOverview']>>>('get_consignments_overview', {
      token: getStoredToken(),
    });
  }
  createReturnableType(input: Record<string, unknown>) {
    return tauriInvoke('create_returnable_type', { token: getStoredToken(), payload: input });
  }
  adjustReturnableStock(input: Record<string, unknown>) {
    return tauriInvoke('adjust_returnable_stock', { token: getStoredToken(), payload: input });
  }
  returnClientEmpties(input: Record<string, unknown>) {
    return tauriInvoke('return_client_empties', { token: getStoredToken(), payload: input });
  }
  getCashStatus() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['getCashStatus']>>>('get_cash_status', {
      token: getStoredToken(),
    });
  }
  openCashSession(input: Record<string, unknown>) {
    return tauriInvoke('open_cash_session', { token: getStoredToken(), payload: input });
  }
  closeCashSession(input: Record<string, unknown>) {
    return tauriInvoke('close_cash_session', { token: getStoredToken(), payload: input });
  }
  listExpenses() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['listExpenses']>>>('list_expenses', {
      token: getStoredToken(),
    });
  }
  createExpense(input: Record<string, unknown>) {
    return tauriInvoke('create_expense', { token: getStoredToken(), payload: input });
  }
  getReports(from?: string, to?: string) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['getReports']>>>('get_reports', {
      token: getStoredToken(),
      from,
      to,
    });
  }
  getSettings() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['getSettings']>>>('get_settings', {
      token: getStoredToken(),
    });
  }
  updateSettings(input: Record<string, unknown>) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['updateSettings']>>>('update_settings', {
      token: getStoredToken(),
      payload: input,
    });
  }
  addPaymentMethod(label: string) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['addPaymentMethod']>>>('add_payment_method', {
      token: getStoredToken(),
      label,
    });
  }
  togglePaymentMethod(code: string, active: boolean) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['togglePaymentMethod']>>>('toggle_payment_method', {
      token: getStoredToken(),
      code,
      active,
    });
  }
  listBackups() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['listBackups']>>>('list_backups', {
      token: getStoredToken(),
    });
  }
  createBackup() {
    return tauriInvoke<Awaited<ReturnType<ApiClient['createBackup']>>>('create_backup', {
      token: getStoredToken(),
    });
  }
  createEncryptedBackup(passphrase: string) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['createEncryptedBackup']>>>('create_encrypted_backup', {
      token: getStoredToken(),
      passphrase,
    });
  }
  verifyBackup(name: string) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['verifyBackup']>>>('verify_backup', {
      token: getStoredToken(),
      name,
    });
  }
  verifyEncryptedBackup(name: string, passphrase: string) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['verifyEncryptedBackup']>>>('verify_encrypted_backup', {
      token: getStoredToken(),
      name,
      passphrase,
    });
  }
  restoreBackup(name: string) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['restoreBackup']>>>('restore_backup', {
      token: getStoredToken(),
      name,
    });
  }
  restoreEncryptedBackup(name: string, passphrase: string) {
    return tauriInvoke<Awaited<ReturnType<ApiClient['restoreEncryptedBackup']>>>('restore_encrypted_backup', {
      token: getStoredToken(),
      name,
      passphrase,
    });
  }
  async downloadBackup(name: string) {
    const bytes = await tauriInvoke<number[]>('download_backup', {
      token: getStoredToken(),
      name,
    });
    return new Uint8Array(bytes);
  }
  async generateDocumentPdf(doc: Record<string, unknown>) {
    const bytes = await tauriInvoke<number[]>('generate_document_pdf', {
      token: getStoredToken(),
      doc,
    });
    return new Uint8Array(bytes);
  }
}
