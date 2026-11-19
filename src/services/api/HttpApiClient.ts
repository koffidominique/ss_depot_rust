import { useUiStore } from '../../stores/uiStore.ts';
import type { SessionUser } from '../../types/erp.ts';
import {
  ApiError,
  type ApiClient,
  type CreateSaleReturnPayload,
  type ReceivePurchaseOrderPayload,
} from './ApiClient.ts';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useUiStore.getState().token;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && token !== 'cookie-session') {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-DepotPro-Token', token);
  }

  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    useUiStore.getState().setToken(null);
  }
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const err = (await res.json()) as { code?: string; message?: string };
      throw new ApiError(err.code || 'API_ERROR', err.message || 'Erreur lors de la requête.', res.status);
    }
    throw new ApiError('HTTP_ERROR', `Erreur HTTP ${res.status}`, res.status);
  }
  if (contentType.includes('text/csv')) {
    return (await res.text()) as unknown as T;
  }
  return (await res.json()) as T;
}

async function requestBytes(path: string, init: RequestInit = {}): Promise<Uint8Array> {
  const token = useUiStore.getState().token;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && token !== 'cookie-session') {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-DepotPro-Token', token);
  }
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    useUiStore.getState().setToken(null);
  }
  if (!res.ok) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const err = (await res.json()) as { code?: string; message?: string };
      throw new ApiError(err.code || 'API_ERROR', err.message || 'Erreur lors de la requête.', res.status);
    }
    throw new ApiError('HTTP_ERROR', `Erreur HTTP ${res.status}`, res.status);
  }
  return new Uint8Array(await res.arrayBuffer());
}

function qs(params: Record<string, unknown> = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export class HttpApiClient implements ApiClient {
  getAuthStatus() {
    return request<ReturnType<ApiClient['getAuthStatus']> extends Promise<infer R> ? R : never>('/api/auth/status');
  }
  setupPin(pin: string) {
    return request<{ token: string; user?: SessionUser }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  }
  login(pin: string, username?: string) {
    return request<{ token: string; user?: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ pin, username }),
    });
  }
  async lock() {
    try {
      await request('/api/auth/lock', { method: 'POST' });
    } finally {
      useUiStore.getState().setToken(null);
    }
  }
  async changePin(currentPin: string, newPin: string) {
    await request('/api/auth/change-pin', {
      method: 'POST',
      body: JSON.stringify({ currentPin, newPin }),
    });
  }
  getMe() {
    return request<Awaited<ReturnType<ApiClient['getMe']>>>('/api/auth/me');
  }
  listUsers() {
    return request<Awaited<ReturnType<ApiClient['listUsers']>>>('/api/auth/users');
  }
  createUser(input: Parameters<ApiClient['createUser']>[0]) {
    return request<Awaited<ReturnType<ApiClient['createUser']>>>('/api/auth/users', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  toggleUser(userId: number, active: boolean) {
    return request<Awaited<ReturnType<ApiClient['toggleUser']>>>(`/api/auth/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ active }),
    });
  }

  getDashboard() {
    return request<Awaited<ReturnType<ApiClient['getDashboard']>>>('/api/dashboard');
  }

  listCategories() {
    return request<Awaited<ReturnType<ApiClient['listCategories']>>>('/api/categories');
  }
  createCategory(name: string, description?: string) {
    return request<Awaited<ReturnType<ApiClient['createCategory']>>>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }
  listProducts(params = {}) {
    return request<Awaited<ReturnType<ApiClient['listProducts']>>>(`/api/products${qs(params)}`);
  }
  createProduct(input: Record<string, unknown>) {
    return request<Awaited<ReturnType<ApiClient['createProduct']>>>('/api/products', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  updateProduct(id: number, input: Record<string, unknown>) {
    return request<Awaited<ReturnType<ApiClient['updateProduct']>>>(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }
  upsertPackaging(productId: number, pkg: Record<string, unknown>) {
    return request(`/api/products/${productId}/packagings`, {
      method: 'POST',
      body: JSON.stringify(pkg),
    });
  }
  exportProductsCsv() {
    return request<string>('/api/products/export/csv');
  }
  importProductsCsv(csv: string) {
    return request<{ created: number }>('/api/products/import/csv', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    });
  }

  listClients(search?: string) {
    return request<Awaited<ReturnType<ApiClient['listClients']>>>(`/api/clients${qs({ search })}`);
  }
  createClient(input: Record<string, unknown>) {
    return request<Awaited<ReturnType<ApiClient['createClient']>>>('/api/clients', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  updateClient(clientId: number, input: Record<string, unknown>) {
    return request<Awaited<ReturnType<ApiClient['updateClient']>>>(`/api/clients/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }
  updateClientCredit(clientId: number, input: Record<string, unknown>) {
    return request(`/api/clients/${clientId}/credit`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  listSales(params = {}) {
    return request<Awaited<ReturnType<ApiClient['listSales']>>>(`/api/sales${qs(params)}`);
  }
  getSaleDetail(saleId: number) {
    return request<Awaited<ReturnType<ApiClient['getSaleDetail']>>>(`/api/sales/${saleId}`);
  }
  createSale(input: Record<string, unknown>) {
    return request<Awaited<ReturnType<ApiClient['createSale']>>>('/api/sales', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  cancelSale(saleId: number, input: Record<string, unknown>) {
    return request<Awaited<ReturnType<ApiClient['cancelSale']>>>(`/api/sales/${saleId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  createSaleReturn(saleId: number, input: CreateSaleReturnPayload) {
    return request<Awaited<ReturnType<ApiClient['createSaleReturn']>>>(`/api/sales/${saleId}/returns`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  listReceivables() {
    return request<Awaited<ReturnType<ApiClient['listReceivables']>>>('/api/receivables');
  }
  payReceivable(receivableId: number, input: Record<string, unknown>) {
    return request(`/api/receivables/${receivableId}/pay`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  listSuppliers(search?: string) {
    return request<Awaited<ReturnType<ApiClient['listSuppliers']>>>(`/api/suppliers${qs({ search })}`);
  }
  createSupplier(input: Record<string, unknown>) {
    return request<Awaited<ReturnType<ApiClient['createSupplier']>>>('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  updateSupplier(supplierId: number, input: Record<string, unknown>) {
    return request<Awaited<ReturnType<ApiClient['updateSupplier']>>>(`/api/suppliers/${supplierId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }
  listPurchases() {
    return request<Awaited<ReturnType<ApiClient['listPurchases']>>>('/api/purchases');
  }
  createPurchaseOrder(input: Record<string, unknown>) {
    return request<Awaited<ReturnType<ApiClient['createPurchaseOrder']>>>('/api/purchases', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  receivePurchaseOrder(orderId: number, input: ReceivePurchaseOrderPayload) {
    return request(`/api/purchases/${orderId}/receive`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  cancelPurchaseOrder(orderId: number, input: { reason: string }) {
    return request<Awaited<ReturnType<ApiClient['cancelPurchaseOrder']>>>(`/api/purchases/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  listSupplierDebts() {
    return request<Awaited<ReturnType<ApiClient['listSupplierDebts']>>>('/api/supplier-debts');
  }
  paySupplierDebt(debtId: number, input: Record<string, unknown>) {
    return request(`/api/supplier-debts/${debtId}/pay`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  getStockOverview() {
    return request<Awaited<ReturnType<ApiClient['getStockOverview']>>>('/api/stock');
  }
  adjustStock(input: {
    product_id: number;
    direction: 'in' | 'out';
    quantity: string | number;
    reason: string;
    request_key: string;
  }) {
    return request<Awaited<ReturnType<ApiClient['adjustStock']>>>('/api/stock/adjust', {
      method: 'POST',
      body: JSON.stringify({ ...input, quantity: String(input.quantity) }),
    });
  }
  listInventories() {
    return request<Awaited<ReturnType<ApiClient['listInventories']>>>('/api/inventories');
  }
  createInventory(notes?: string) {
    return request<Awaited<ReturnType<ApiClient['createInventory']>>>('/api/inventories', {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }
  validateInventory(inventoryId: number, lines: Array<Record<string, unknown>>) {
    return request<Awaited<ReturnType<ApiClient['validateInventory']>>>(`/api/inventories/${inventoryId}/validate`, {
      method: 'POST',
      body: JSON.stringify({ lines }),
    });
  }

  getConsignmentsOverview() {
    return request<Awaited<ReturnType<ApiClient['getConsignmentsOverview']>>>('/api/consignments');
  }
  createReturnableType(input: Record<string, unknown>) {
    return request('/api/consignments/types', { method: 'POST', body: JSON.stringify(input) });
  }
  adjustReturnableStock(input: Record<string, unknown>) {
    return request('/api/consignments/stock-movements', { method: 'POST', body: JSON.stringify(input) });
  }
  returnClientEmpties(input: Record<string, unknown>) {
    return request('/api/consignments/returns', { method: 'POST', body: JSON.stringify(input) });
  }

  getCashStatus() {
    return request<Awaited<ReturnType<ApiClient['getCashStatus']>>>('/api/cash');
  }
  openCashSession(input: Record<string, unknown>) {
    return request('/api/cash/open', { method: 'POST', body: JSON.stringify(input) });
  }
  closeCashSession(input: Record<string, unknown>) {
    return request('/api/cash/close', { method: 'POST', body: JSON.stringify(input) });
  }
  listExpenses() {
    return request<Awaited<ReturnType<ApiClient['listExpenses']>>>('/api/expenses');
  }
  createExpense(input: Record<string, unknown>) {
    return request('/api/expenses', { method: 'POST', body: JSON.stringify(input) });
  }

  getReports(from?: string, to?: string) {
    return request<Awaited<ReturnType<ApiClient['getReports']>>>(`/api/reports${qs({ from, to })}`);
  }
  getSettings() {
    return request<Awaited<ReturnType<ApiClient['getSettings']>>>('/api/settings');
  }
  updateSettings(input: Record<string, unknown>) {
    return request<Awaited<ReturnType<ApiClient['updateSettings']>>>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }
  addPaymentMethod(label: string) {
    return request<Awaited<ReturnType<ApiClient['addPaymentMethod']>>>('/api/payment-methods', {
      method: 'POST',
      body: JSON.stringify({ label }),
    });
  }
  togglePaymentMethod(code: string, active: boolean) {
    return request<Awaited<ReturnType<ApiClient['togglePaymentMethod']>>>(`/api/payment-methods/${code}`, {
      method: 'PUT',
      body: JSON.stringify({ active }),
    });
  }
  listBackups() {
    return request<Awaited<ReturnType<ApiClient['listBackups']>>>('/api/backups');
  }
  createBackup() {
    return request<Awaited<ReturnType<ApiClient['createBackup']>>>('/api/backups', { method: 'POST' });
  }
  createEncryptedBackup(passphrase: string) {
    return request<Awaited<ReturnType<ApiClient['createEncryptedBackup']>>>('/api/backups/encrypted', {
      method: 'POST',
      body: JSON.stringify({ passphrase }),
    });
  }
  verifyBackup(name: string) {
    return request<Awaited<ReturnType<ApiClient['verifyBackup']>>>(`/api/backups/${encodeURIComponent(name)}/verify`);
  }
  verifyEncryptedBackup(name: string, passphrase: string) {
    return request<Awaited<ReturnType<ApiClient['verifyEncryptedBackup']>>>(
      `/api/backups/${encodeURIComponent(name)}/verify-encrypted`,
      {
        method: 'POST',
        body: JSON.stringify({ passphrase }),
      }
    );
  }
  restoreBackup(name: string) {
    return request<Awaited<ReturnType<ApiClient['restoreBackup']>>>(`/api/backups/${encodeURIComponent(name)}/restore`, {
      method: 'POST',
    });
  }
  restoreEncryptedBackup(name: string, passphrase: string) {
    return request<Awaited<ReturnType<ApiClient['restoreEncryptedBackup']>>>(
      `/api/backups/${encodeURIComponent(name)}/restore-encrypted`,
      {
        method: 'POST',
        body: JSON.stringify({ passphrase }),
      }
    );
  }
  downloadBackup(name: string) {
    return requestBytes(`/api/backups/${encodeURIComponent(name)}/download`);
  }
  generateDocumentPdf(doc: Record<string, unknown>) {
    return requestBytes('/api/documents/pdf', {
      method: 'POST',
      body: JSON.stringify(doc),
    });
  }
  async shutdownApp() {
    // En mode web, la fermeture applicative est gérée par l'onglet/navigateur.
  }
}
