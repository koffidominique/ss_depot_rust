import type { ApiClient } from '../ApiClient.ts';
import { buildQueryString, httpRequest, httpRequestBytes } from './httpTransport.ts';

/* ============================================================================
 * Routes HTTP : Stock, Consignations, Caisse, Rapports, Paramètres & Backups
 * ============================================================================ */

export const httpStockApi = {
  getStockOverview: () =>
    httpRequest<Awaited<ReturnType<ApiClient['getStockOverview']>>>('/api/stock'),
  adjustStock: (input: Parameters<ApiClient['adjustStock']>[0]) =>
    httpRequest<Awaited<ReturnType<ApiClient['adjustStock']>>>('/api/stock/adjust', {
      method: 'POST',
      body: JSON.stringify({ ...input, quantity: String(input.quantity) }),
    }),
  listInventories: () =>
    httpRequest<Awaited<ReturnType<ApiClient['listInventories']>>>('/api/inventories'),
  createInventory: (notes?: string) =>
    httpRequest<Awaited<ReturnType<ApiClient['createInventory']>>>('/api/inventories', {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),
  validateInventory: (inventoryId: number, lines: Array<Record<string, unknown>>) =>
    httpRequest<Awaited<ReturnType<ApiClient['validateInventory']>>>(`/api/inventories/${inventoryId}/validate`, {
      method: 'POST',
      body: JSON.stringify({ lines }),
    }),
};

export const httpConsignmentsApi = {
  getConsignmentsOverview: () =>
    httpRequest<Awaited<ReturnType<ApiClient['getConsignmentsOverview']>>>('/api/consignments'),
  createReturnableType: (input: Record<string, unknown>) =>
    httpRequest('/api/consignments/types', { method: 'POST', body: JSON.stringify(input) }),
  adjustReturnableStock: (input: Record<string, unknown>) =>
    httpRequest('/api/consignments/stock-movements', { method: 'POST', body: JSON.stringify(input) }),
  returnClientEmpties: (input: Record<string, unknown>) =>
    httpRequest('/api/consignments/returns', { method: 'POST', body: JSON.stringify(input) }),
  listPackagingObligations: (clientId?: number) => {
    const query = clientId ? `?client_id=${clientId}` : '';
    return httpRequest<Awaited<ReturnType<ApiClient['listPackagingObligations']>>>(
      `/api/packaging-obligations${query}`,
    );
  },
  getPackagingDashboard: (clientId: number) =>
    httpRequest<Awaited<ReturnType<ApiClient['getPackagingDashboard']>>>(
      `/api/packaging-obligations/dashboard/${clientId}`,
    ),
  payPackagingDebt: (input: Parameters<ApiClient['payPackagingDebt']>[0]) =>
    httpRequest<Awaited<ReturnType<ApiClient['payPackagingDebt']>>>('/api/packaging-obligations/pay', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getCatalogueReferencePriceHistory: (id: number) =>
    httpRequest<Awaited<ReturnType<ApiClient['getCatalogueReferencePriceHistory']>>>(
      `/api/catalogue-products/${id}/reference-price`,
    ),
  setCatalogueProductActive: (id: number, is_active: boolean) =>
    httpRequest(`/api/catalogue-products/${id}/active`, {
      method: 'PUT',
      body: JSON.stringify({ is_active }),
    }),
  setCatalogueReferencePrice: (
    id: number,
    input: { reference_price: number; reason?: string; request_key: string },
  ) =>
    httpRequest(`/api/catalogue-products/${id}/reference-price`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  getProductCatalogueOverview: () =>
    httpRequest<Awaited<ReturnType<ApiClient['getProductCatalogueOverview']>>>('/api/catalogue-v3/products'),
};

export const httpFinanceApi = {
  getCashStatus: () => httpRequest<Awaited<ReturnType<ApiClient['getCashStatus']>>>('/api/cash'),
  openCashSession: (input: Record<string, unknown>) =>
    httpRequest('/api/cash/open', { method: 'POST', body: JSON.stringify(input) }),
  closeCashSession: (input: Record<string, unknown>) =>
    httpRequest('/api/cash/close', { method: 'POST', body: JSON.stringify(input) }),
  listExpenses: () => httpRequest<Awaited<ReturnType<ApiClient['listExpenses']>>>('/api/expenses'),
  createExpense: (input: Record<string, unknown>) =>
    httpRequest('/api/expenses', { method: 'POST', body: JSON.stringify(input) }),
  getReports: (from?: string, to?: string) =>
    httpRequest<Awaited<ReturnType<ApiClient['getReports']>>>(`/api/reports${buildQueryString({ from, to })}`),
};

export const httpSystemApi = {
  getSettings: () => httpRequest<Awaited<ReturnType<ApiClient['getSettings']>>>('/api/settings'),
  updateSettings: (input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['updateSettings']>>>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  addPaymentMethod: (label: string) =>
    httpRequest<Awaited<ReturnType<ApiClient['addPaymentMethod']>>>('/api/payment-methods', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),
  togglePaymentMethod: (code: string, active: boolean) =>
    httpRequest<Awaited<ReturnType<ApiClient['togglePaymentMethod']>>>(`/api/payment-methods/${code}`, {
      method: 'PUT',
      body: JSON.stringify({ active }),
    }),
  listBackups: () => httpRequest<Awaited<ReturnType<ApiClient['listBackups']>>>('/api/backups'),
  getLocalDbStatus: () =>
    httpRequest<Awaited<ReturnType<ApiClient['getLocalDbStatus']>>>('/api/backups/db-status'),
  createBackup: () =>
    httpRequest<Awaited<ReturnType<ApiClient['createBackup']>>>('/api/backups', { method: 'POST' }),
  createEncryptedBackup: (passphrase: string) =>
    httpRequest<Awaited<ReturnType<ApiClient['createEncryptedBackup']>>>('/api/backups/encrypted', {
      method: 'POST',
      body: JSON.stringify({ passphrase }),
    }),
  importBackup: (filename: string, bytes: Uint8Array) =>
    httpRequest<Awaited<ReturnType<ApiClient['importBackup']>>>('/api/backups/import', {
      method: 'POST',
      body: JSON.stringify({ filename, bytes: Array.from(bytes) }),
    }),
  verifyBackup: (name: string) =>
    httpRequest<Awaited<ReturnType<ApiClient['verifyBackup']>>>(`/api/backups/${encodeURIComponent(name)}/verify`),
  verifyEncryptedBackup: (name: string, passphrase: string) =>
    httpRequest<Awaited<ReturnType<ApiClient['verifyEncryptedBackup']>>>(
      `/api/backups/${encodeURIComponent(name)}/verify-encrypted`,
      { method: 'POST', body: JSON.stringify({ passphrase }) },
    ),
  restoreBackup: (name: string) =>
    httpRequest<Awaited<ReturnType<ApiClient['restoreBackup']>>>(`/api/backups/${encodeURIComponent(name)}/restore`, {
      method: 'POST',
    }),
  restoreEncryptedBackup: (name: string, passphrase: string) =>
    httpRequest<Awaited<ReturnType<ApiClient['restoreEncryptedBackup']>>>(
      `/api/backups/${encodeURIComponent(name)}/restore-encrypted`,
      { method: 'POST', body: JSON.stringify({ passphrase }) },
    ),
  downloadBackup: (name: string) => httpRequestBytes(`/api/backups/${encodeURIComponent(name)}/download`),
  generateDocumentPdf: (doc: Record<string, unknown>) =>
    httpRequestBytes('/api/documents/pdf', { method: 'POST', body: JSON.stringify(doc) }),
  shutdownApp: async () => {
    // En mode web, la fermeture applicative est gérée par l'onglet/navigateur.
  },
};
