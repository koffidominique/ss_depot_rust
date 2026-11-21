import type {
  ApiClient,
  CreateSaleReturnPayload,
  ReceivePurchaseOrderPayload,
} from './ApiClient.ts';
import {
  httpAuthApi,
  httpCatalogApi,
  httpPurchasesApi,
  httpSalesApi,
} from './http/httpCommerceRoutes.ts';
import { httpOrdersApi } from './http/httpOrdersRoutes.ts';
import {
  httpConsignmentsApi,
  httpFinanceApi,
  httpStockApi,
  httpSystemApi,
} from './http/httpOperationsRoutes.ts';

/* ============================================================================
 * Client HTTP (mode navigateur / serveur Axum) implémentant ApiClient
 * ============================================================================ */

export class HttpApiClient implements ApiClient {
  /* --- Authentification & Tableau de bord --- */
  getAuthStatus = httpAuthApi.getAuthStatus;
  setupPin = httpAuthApi.setupPin;
  login = httpAuthApi.login;
  lock = httpAuthApi.lock;
  changePin = httpAuthApi.changePin;
  getMe = httpAuthApi.getMe;
  listUsers = httpAuthApi.listUsers;
  createUser = httpAuthApi.createUser;
  toggleUser = httpAuthApi.toggleUser;
  getDashboard = httpAuthApi.getDashboard;

  /* --- Catégories & Produits --- */
  listCategories = httpCatalogApi.listCategories;
  createCategory = httpCatalogApi.createCategory;
  updateCategory = httpCatalogApi.updateCategory;
  listProducts = httpCatalogApi.listProducts;
  createProduct = httpCatalogApi.createProduct;
  updateProduct = httpCatalogApi.updateProduct;
  deleteProduct = httpCatalogApi.deleteProduct;
  upsertPackaging = httpCatalogApi.upsertPackaging;
  listBreweries = httpCatalogApi.listBreweries;
  createBrewery = httpCatalogApi.createBrewery;
  listBrandsV4 = httpCatalogApi.listBrandsV4;
  createBrandV4 = httpCatalogApi.createBrandV4;
  listContainerTypesV4 = httpCatalogApi.listContainerTypesV4;
  listPackagingTypesV4 = httpCatalogApi.listPackagingTypesV4;
  listStockLocationsV4 = httpCatalogApi.listStockLocationsV4;
  listSalesUnits = httpCatalogApi.listSalesUnits;
  createSalesUnit = httpCatalogApi.createSalesUnit;
  updateSalesUnit = httpCatalogApi.updateSalesUnit;
  deleteSalesUnit = httpCatalogApi.deleteSalesUnit;
  listProductSuppliers = httpCatalogApi.listProductSuppliers;
  upsertProductSupplier = httpCatalogApi.upsertProductSupplier;
  listDepositRules = httpCatalogApi.listDepositRules;
  exportProductsCsv = httpCatalogApi.exportProductsCsv;
  importProductsCsv = httpCatalogApi.importProductsCsv;

  /* --- Clients, Ventes & Créances --- */
  listClients = httpSalesApi.listClients;
  createClient = httpSalesApi.createClient;
  updateClient = httpSalesApi.updateClient;
  updateClientCredit = httpSalesApi.updateClientCredit;
  listSales = httpSalesApi.listSales;
  getSaleDetail = httpSalesApi.getSaleDetail;
  createSale = httpSalesApi.createSale;
  cancelSale = httpSalesApi.cancelSale;
  createSaleReturn = (saleId: number, input: CreateSaleReturnPayload) =>
    httpSalesApi.createSaleReturn(saleId, input);
  listReceivables = httpSalesApi.listReceivables;
  payReceivable = httpSalesApi.payReceivable;

  /* --- Fournisseurs, Commandes & Dettes --- */
  listSuppliers = httpPurchasesApi.listSuppliers;
  createSupplier = httpPurchasesApi.createSupplier;
  updateSupplier = httpPurchasesApi.updateSupplier;
  listPurchases = httpPurchasesApi.listPurchases;
  createPurchaseOrder = httpPurchasesApi.createPurchaseOrder;
  receivePurchaseOrder = (orderId: number, input: ReceivePurchaseOrderPayload) =>
    httpPurchasesApi.receivePurchaseOrder(orderId, input);
  cancelPurchaseOrder = httpPurchasesApi.cancelPurchaseOrder;
  listSupplierDebts = httpPurchasesApi.listSupplierDebts;
  paySupplierDebt = httpPurchasesApi.paySupplierDebt;

  /* --- Stocks & Inventaires --- */
  getStockOverview = httpStockApi.getStockOverview;
  adjustStock = httpStockApi.adjustStock;
  listInventories = httpStockApi.listInventories;
  createInventory = httpStockApi.createInventory;
  validateInventory = httpStockApi.validateInventory;

  /* --- Consignations & Catalogue central --- */
  getConsignmentsOverview = httpConsignmentsApi.getConsignmentsOverview;
  createReturnableType = httpConsignmentsApi.createReturnableType;
  adjustReturnableStock = httpConsignmentsApi.adjustReturnableStock;
  returnClientEmpties = httpConsignmentsApi.returnClientEmpties;
  listPackagingObligations = httpConsignmentsApi.listPackagingObligations;
  getPackagingDashboard = httpConsignmentsApi.getPackagingDashboard;
  payPackagingDebt = httpConsignmentsApi.payPackagingDebt;
  getProductCatalogueOverview = httpConsignmentsApi.getProductCatalogueOverview;
  setCatalogueProductActive = httpConsignmentsApi.setCatalogueProductActive;
  setCatalogueReferencePrice = httpConsignmentsApi.setCatalogueReferencePrice;
  getCatalogueReferencePriceHistory = httpConsignmentsApi.getCatalogueReferencePriceHistory;

  /* --- Caisse, Dépenses & Rapports --- */
  getCashStatus = httpFinanceApi.getCashStatus;
  openCashSession = httpFinanceApi.openCashSession;
  closeCashSession = httpFinanceApi.closeCashSession;
  listExpenses = httpFinanceApi.listExpenses;
  createExpense = httpFinanceApi.createExpense;
  getReports = httpFinanceApi.getReports;

  /* --- Commandes mixtes & consignes --- */
  composeOrderPreview = httpOrdersApi.composeOrderPreview;
  listCustomerOrders = httpOrdersApi.listCustomerOrders;
  getCustomerOrder = httpOrdersApi.getCustomerOrder;
  createCustomerOrder = httpOrdersApi.createCustomerOrder;
  updateCustomerOrder = httpOrdersApi.updateCustomerOrder;
  confirmCustomerOrder = httpOrdersApi.confirmCustomerOrder;
  deliverCustomerOrder = httpOrdersApi.deliverCustomerOrder;
  invoiceCustomerOrder = httpOrdersApi.invoiceCustomerOrder;
  payCustomerOrder = httpOrdersApi.payCustomerOrder;
  cancelCustomerOrder = httpOrdersApi.cancelCustomerOrder;
  returnOrderPackaging = httpOrdersApi.returnOrderPackaging;
  listPackagingAssets = httpOrdersApi.listPackagingAssets;
  getCustomerDeposits = httpOrdersApi.getCustomerDeposits;
  getCustomerDepositHistory = httpOrdersApi.getCustomerDepositHistory;
  returnCustomerDeposits = httpOrdersApi.returnCustomerDeposits;

  /* --- Paramètres, Sauvegardes & PDF --- */
  getSettings = httpSystemApi.getSettings;
  updateSettings = httpSystemApi.updateSettings;
  addPaymentMethod = httpSystemApi.addPaymentMethod;
  togglePaymentMethod = httpSystemApi.togglePaymentMethod;
  listBackups = httpSystemApi.listBackups;
  createBackup = httpSystemApi.createBackup;
  createEncryptedBackup = httpSystemApi.createEncryptedBackup;
  verifyBackup = httpSystemApi.verifyBackup;
  verifyEncryptedBackup = httpSystemApi.verifyEncryptedBackup;
  restoreBackup = httpSystemApi.restoreBackup;
  restoreEncryptedBackup = httpSystemApi.restoreEncryptedBackup;
  downloadBackup = httpSystemApi.downloadBackup;
  generateDocumentPdf = httpSystemApi.generateDocumentPdf;
  shutdownApp = httpSystemApi.shutdownApp;
}
