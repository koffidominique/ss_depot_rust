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
  createCategory: (name: string, description?: string, parentId?: number | null) =>
    httpRequest<Awaited<ReturnType<ApiClient['createCategory']>>>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name, description, parent_id: parentId ?? null }),
    }),
  updateCategory: (id: number, input: Parameters<ApiClient['updateCategory']>[1]) =>
    httpRequest<Awaited<ReturnType<ApiClient['updateCategory']>>>(`/api/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
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
  deleteProduct: (id: number) =>
    httpRequest<Awaited<ReturnType<ApiClient['deleteProduct']>>>(`/api/products/${id}`, {
      method: 'DELETE',
    }),
  upsertPackaging: (productId: number, pkg: Record<string, unknown>) =>
    httpRequest(`/api/products/${productId}/packagings`, {
      method: 'POST',
      body: JSON.stringify(pkg),
    }),
  listBreweries: (search?: string) =>
    httpRequest<Awaited<ReturnType<ApiClient['listBreweries']>>>(`/api/breweries${buildQueryString({ search, pageSize: 200 })}`),
  createBrewery: (input: Parameters<ApiClient['createBrewery']>[0]) =>
    httpRequest<Awaited<ReturnType<ApiClient['createBrewery']>>>('/api/breweries', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listBrandsV4: (search?: string) =>
    httpRequest<Awaited<ReturnType<ApiClient['listBrandsV4']>>>(`/api/brands${buildQueryString({ search, pageSize: 200 })}`),
  createBrandV4: (input: Parameters<ApiClient['createBrandV4']>[0]) =>
    httpRequest<Awaited<ReturnType<ApiClient['createBrandV4']>>>('/api/brands', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listContainerTypesV4: () =>
    httpRequest<Awaited<ReturnType<ApiClient['listContainerTypesV4']>>>('/api/container-types?pageSize=200'),
  listPackagingTypesV4: () =>
    httpRequest<Awaited<ReturnType<ApiClient['listPackagingTypesV4']>>>('/api/packaging-types'),
  listStockLocationsV4: () =>
    httpRequest<Awaited<ReturnType<ApiClient['listStockLocationsV4']>>>('/api/stock-locations'),
  listSalesUnits: (productId: number) =>
    httpRequest<Awaited<ReturnType<ApiClient['listSalesUnits']>>>(`/api/sales-units?product_id=${productId}`),
  createSalesUnit: (input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['createSalesUnit']>>>('/api/sales-units', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateSalesUnit: (id: number, input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['updateSalesUnit']>>>(`/api/sales-units/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  deleteSalesUnit: async (id: number) => {
    await httpRequest(`/api/sales-units/${id}`, { method: 'DELETE' });
  },
  listProductSuppliers: (productId: number) =>
    httpRequest<Awaited<ReturnType<ApiClient['listProductSuppliers']>>>(`/api/products/${productId}/suppliers`),
  upsertProductSupplier: (productId: number, input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['upsertProductSupplier']>>>(`/api/products/${productId}/suppliers`, {
      method: 'POST',
      body: JSON.stringify({ ...input, product_id: productId }),
    }),
  listDepositRules: (productId?: number) =>
    httpRequest<Awaited<ReturnType<ApiClient['listDepositRules']>>>(
      `/api/deposit-rules${productId ? `?product_id=${productId}` : ''}`,
    ),
  exportProductsCsv: () => httpRequest<string>('/api/products/export/csv'),
  importProductsCsv: (csv: string) =>
    httpRequest<{ created: number }>('/api/products/import/csv', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    }),
  listCatalogPresets: () =>
    httpRequest<Awaited<ReturnType<ApiClient['listCatalogPresets']>>>('/api/products/presets'),
  applyCatalogPresets: (keys: string[], activate: boolean) =>
    httpRequest<Awaited<ReturnType<ApiClient['applyCatalogPresets']>>>('/api/products/presets/apply', {
      method: 'POST',
      body: JSON.stringify({ keys, activate }),
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
  updatePurchaseOrder: (orderId: number, input: Record<string, unknown>) =>
    httpRequest<Awaited<ReturnType<ApiClient['updatePurchaseOrder']>>>(`/api/purchases/${orderId}`, {
      method: 'PUT',
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
