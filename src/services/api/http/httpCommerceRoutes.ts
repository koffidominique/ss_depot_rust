import { useUiStore } from '../../../stores/uiStore.ts';
import type { SessionUser } from '../../../types/erp.ts';
import type {
  ApiClient,
  CreateSaleReturnPayload,
  ReceivePurchaseOrderPayload,
} from '../ApiClient.ts';
import { buildQueryString, httpRequest } from './httpTransport.ts';

/* ============================================================================
 * Routes HTTP : Authentification, Catalogue, Ventes, Clients & Approvisionnements
 * ============================================================================ */

export const httpAuthApi = {
  getAuthStatus: () =>
    httpRequest<Awaited<ReturnType<ApiClient['getAuthStatus']>>>('/api/auth/status'),
  setupPin: (pin: string) =>
    httpRequest<{ token: string; user?: SessionUser }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
  login: (pin: string, username?: string) =>
    httpRequest<{ token: string; user?: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ pin, username }),
    }),
  lock: async () => {
    try {
      await httpRequest('/api/auth/lock', { method: 'POST' });
    } finally {
      useUiStore.getState().setToken(null);
    }
  },
  changePin: async (currentPin: string, newPin: string) => {
    await httpRequest('/api/auth/change-pin', {
      method: 'POST',
      body: JSON.stringify({ currentPin, newPin }),
    });
  },
  getMe: () => httpRequest<Awaited<ReturnType<ApiClient['getMe']>>>('/api/auth/me'),
  listUsers: () => httpRequest<Awaited<ReturnType<ApiClient['listUsers']>>>('/api/auth/users'),
  createUser: (input: Parameters<ApiClient['createUser']>[0]) =>
    httpRequest<Awaited<ReturnType<ApiClient['createUser']>>>('/api/auth/users', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  toggleUser: (userId: number, active: boolean) =>
    httpRequest<Awaited<ReturnType<ApiClient['toggleUser']>>>(`/api/auth/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ active }),
    }),
  getDashboard: () => httpRequest<Awaited<ReturnType<ApiClient['getDashboard']>>>('/api/dashboard'),
};

export const httpCatalogApi = {
  listCategories: () => httpRequest<Awaited<ReturnType<ApiClient['listCategories']>>>('/api/categories'),
  createCategory: (name: string, description?: string) =>
    httpRequest<Awaited<ReturnType<ApiClient['createCategory']>>>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  listProducts: (params = {}) =>
    httpRequest<Awaited<ReturnType<ApiClient['listProducts']>>>(`/api/products${buildQueryString(params)}`),
  createProduct: (input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['createProduct']>>>('/api/products', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateProduct: (id: number, input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['updateProduct']>>>(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  upsertPackaging: (productId: number, pkg: Record<string, unknown>) =>
    httpRequest(`/api/products/${productId}/packagings`, {
      method: 'POST',
      body: JSON.stringify(pkg),
    }),
  exportProductsCsv: () => httpRequest<string>('/api/products/export/csv'),
  importProductsCsv: (csv: string) =>
    httpRequest<{ created: number }>('/api/products/import/csv', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    }),
};

export const httpSalesApi = {
  listClients: (search?: string) =>
    httpRequest<Awaited<ReturnType<ApiClient['listClients']>>>(`/api/clients${buildQueryString({ search })}`),
  createClient: (input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['createClient']>>>('/api/clients', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateClient: (clientId: number, input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['updateClient']>>>(`/api/clients/${clientId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  updateClientCredit: (clientId: number, input: Record<string, unknown>) =>
    httpRequest(`/api/clients/${clientId}/credit`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  listSales: (params = {}) =>
    httpRequest<Awaited<ReturnType<ApiClient['listSales']>>>(`/api/sales${buildQueryString(params)}`),
  getSaleDetail: (saleId: number) =>
    httpRequest<Awaited<ReturnType<ApiClient['getSaleDetail']>>>(`/api/sales/${saleId}`),
  createSale: (input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['createSale']>>>('/api/sales', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  cancelSale: (saleId: number, input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['cancelSale']>>>(`/api/sales/${saleId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  createSaleReturn: (saleId: number, input: CreateSaleReturnPayload) =>
    httpRequest<Awaited<ReturnType<ApiClient['createSaleReturn']>>>(`/api/sales/${saleId}/returns`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listReceivables: () => httpRequest<Awaited<ReturnType<ApiClient['listReceivables']>>>('/api/receivables'),
  payReceivable: (receivableId: number, input: Record<string, unknown>) =>
    httpRequest(`/api/receivables/${receivableId}/pay`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

export const httpPurchasesApi = {
  listSuppliers: (search?: string) =>
    httpRequest<Awaited<ReturnType<ApiClient['listSuppliers']>>>(`/api/suppliers${buildQueryString({ search })}`),
  createSupplier: (input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['createSupplier']>>>('/api/suppliers', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateSupplier: (supplierId: number, input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['updateSupplier']>>>(`/api/suppliers/${supplierId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  listPurchases: () => httpRequest<Awaited<ReturnType<ApiClient['listPurchases']>>>('/api/purchases'),
  createPurchaseOrder: (input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['createPurchaseOrder']>>>('/api/purchases', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  receivePurchaseOrder: (orderId: number, input: ReceivePurchaseOrderPayload) =>
    httpRequest(`/api/purchases/${orderId}/receive`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  cancelPurchaseOrder: (orderId: number, input: { reason: string }) =>
    httpRequest<Awaited<ReturnType<ApiClient['cancelPurchaseOrder']>>>(`/api/purchases/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listSupplierDebts: () =>
    httpRequest<Awaited<ReturnType<ApiClient['listSupplierDebts']>>>('/api/supplier-debts'),
  paySupplierDebt: (debtId: number, input: Record<string, unknown>) =>
    httpRequest(`/api/supplier-debts/${debtId}/pay`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
