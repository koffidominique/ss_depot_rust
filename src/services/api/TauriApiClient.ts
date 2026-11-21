import type {
  ApiClient,
  CreateSaleReturnPayload,
  ReceivePurchaseOrderPayload,
} from "./ApiClient.ts";
import {
  tauriAuthApi,
  tauriCatalogApi,
  tauriPurchasesApi,
  tauriSalesApi,
} from "./tauri/tauriCommerceCommands.ts";
import { tauriOrdersApi } from "./tauri/tauriOrdersCommands.ts";
import {
  tauriConsignmentsApi,
  tauriFinanceApi,
  tauriStockApi,
  tauriSystemApi,
} from "./tauri/tauriOperationsCommands.ts";

/* ============================================================================
 * Client Desktop Tauri (appels IPC natifs) implémentant ApiClient
 * ============================================================================ */

export class TauriApiClient implements ApiClient {
  /* --- Authentification & Tableau de bord --- */
  getAuthStatus = tauriAuthApi.getAuthStatus;
  setupPin = tauriAuthApi.setupPin;
  login = tauriAuthApi.login;
  lock = tauriAuthApi.lock;
  changePin = tauriAuthApi.changePin;
  getMe = tauriAuthApi.getMe;
  listUsers = tauriAuthApi.listUsers;
  createUser = tauriAuthApi.createUser;
  toggleUser = tauriAuthApi.toggleUser;
  getDashboard = tauriAuthApi.getDashboard;

  /* --- Catégories & Produits --- */
  listCategories = tauriCatalogApi.listCategories;
  createCategory = tauriCatalogApi.createCategory;
  updateCategory = tauriCatalogApi.updateCategory;
  listProducts = tauriCatalogApi.listProducts;
  createProduct = tauriCatalogApi.createProduct;
  updateProduct = tauriCatalogApi.updateProduct;
  deleteProduct = tauriCatalogApi.deleteProduct;
  upsertPackaging = tauriCatalogApi.upsertPackaging;
  listBreweries = tauriCatalogApi.listBreweries;
  createBrewery = tauriCatalogApi.createBrewery;
  listBrandsV4 = tauriCatalogApi.listBrandsV4;
  createBrandV4 = tauriCatalogApi.createBrandV4;
  listContainerTypesV4 = tauriCatalogApi.listContainerTypesV4;
  listPackagingTypesV4 = tauriCatalogApi.listPackagingTypesV4;
  listStockLocationsV4 = tauriCatalogApi.listStockLocationsV4;
  listSalesUnits = tauriCatalogApi.listSalesUnits;
  createSalesUnit = tauriCatalogApi.createSalesUnit;
  updateSalesUnit = tauriCatalogApi.updateSalesUnit;
  deleteSalesUnit = tauriCatalogApi.deleteSalesUnit;
  listProductSuppliers = tauriCatalogApi.listProductSuppliers;
  upsertProductSupplier = tauriCatalogApi.upsertProductSupplier;
  listDepositRules = tauriCatalogApi.listDepositRules;
  exportProductsCsv = tauriCatalogApi.exportProductsCsv;
  importProductsCsv = tauriCatalogApi.importProductsCsv;

  /* --- Clients, Ventes & Créances --- */
  listClients = tauriSalesApi.listClients;
  createClient = tauriSalesApi.createClient;
  updateClient = tauriSalesApi.updateClient;
  updateClientCredit = tauriSalesApi.updateClientCredit;
  listSales = tauriSalesApi.listSales;
  getSaleDetail = tauriSalesApi.getSaleDetail;
  createSale = tauriSalesApi.createSale;
  cancelSale = tauriSalesApi.cancelSale;
  createSaleReturn = (saleId: number, input: CreateSaleReturnPayload) =>
    tauriSalesApi.createSaleReturn(saleId, input);
  listReceivables = tauriSalesApi.listReceivables;
  payReceivable = tauriSalesApi.payReceivable;

  /* --- Fournisseurs, Commandes & Dettes --- */
  listSuppliers = tauriPurchasesApi.listSuppliers;
  createSupplier = tauriPurchasesApi.createSupplier;
  updateSupplier = tauriPurchasesApi.updateSupplier;
  listPurchases = tauriPurchasesApi.listPurchases;
  createPurchaseOrder = tauriPurchasesApi.createPurchaseOrder;
  receivePurchaseOrder = (orderId: number, input: ReceivePurchaseOrderPayload) =>
    tauriPurchasesApi.receivePurchaseOrder(orderId, input);
  cancelPurchaseOrder = tauriPurchasesApi.cancelPurchaseOrder;
  listSupplierDebts = tauriPurchasesApi.listSupplierDebts;
  paySupplierDebt = tauriPurchasesApi.paySupplierDebt;

  /* --- Stocks & Inventaires --- */
  getStockOverview = tauriStockApi.getStockOverview;
  adjustStock = tauriStockApi.adjustStock;
  listInventories = tauriStockApi.listInventories;
  createInventory = tauriStockApi.createInventory;
  validateInventory = tauriStockApi.validateInventory;

  /* --- Consignations & Catalogue central --- */
  getConsignmentsOverview = tauriConsignmentsApi.getConsignmentsOverview;
  createReturnableType = tauriConsignmentsApi.createReturnableType;
  adjustReturnableStock = tauriConsignmentsApi.adjustReturnableStock;
  returnClientEmpties = tauriConsignmentsApi.returnClientEmpties;
  listPackagingObligations = tauriConsignmentsApi.listPackagingObligations;
  getPackagingDashboard = tauriConsignmentsApi.getPackagingDashboard;
  payPackagingDebt = tauriConsignmentsApi.payPackagingDebt;
  getProductCatalogueOverview = tauriConsignmentsApi.getProductCatalogueOverview;
  setCatalogueProductActive = tauriConsignmentsApi.setCatalogueProductActive;
  setCatalogueReferencePrice = tauriConsignmentsApi.setCatalogueReferencePrice;
  getCatalogueReferencePriceHistory =
    tauriConsignmentsApi.getCatalogueReferencePriceHistory;

  /* --- Caisse, Dépenses & Rapports --- */
  getCashStatus = tauriFinanceApi.getCashStatus;
  openCashSession = tauriFinanceApi.openCashSession;
  closeCashSession = tauriFinanceApi.closeCashSession;
  listExpenses = tauriFinanceApi.listExpenses;
  createExpense = tauriFinanceApi.createExpense;
  getReports = tauriFinanceApi.getReports;

  /* --- Commandes mixtes & consignes --- */
  composeOrderPreview = tauriOrdersApi.composeOrderPreview;
  listCustomerOrders = tauriOrdersApi.listCustomerOrders;
  getCustomerOrder = tauriOrdersApi.getCustomerOrder;
  createCustomerOrder = tauriOrdersApi.createCustomerOrder;
  updateCustomerOrder = tauriOrdersApi.updateCustomerOrder;
  confirmCustomerOrder = tauriOrdersApi.confirmCustomerOrder;
  deliverCustomerOrder = tauriOrdersApi.deliverCustomerOrder;
  invoiceCustomerOrder = tauriOrdersApi.invoiceCustomerOrder;
  payCustomerOrder = tauriOrdersApi.payCustomerOrder;
  cancelCustomerOrder = tauriOrdersApi.cancelCustomerOrder;
  returnOrderPackaging = tauriOrdersApi.returnOrderPackaging;
  listPackagingAssets = tauriOrdersApi.listPackagingAssets;
  getCustomerDeposits = tauriOrdersApi.getCustomerDeposits;
  getCustomerDepositHistory = tauriOrdersApi.getCustomerDepositHistory;
  returnCustomerDeposits = tauriOrdersApi.returnCustomerDeposits;

  /* --- Paramètres, Sauvegardes & PDF --- */
  getSettings = tauriSystemApi.getSettings;
  updateSettings = tauriSystemApi.updateSettings;
  addPaymentMethod = tauriSystemApi.addPaymentMethod;
  togglePaymentMethod = tauriSystemApi.togglePaymentMethod;
  listBackups = tauriSystemApi.listBackups;
  getLocalDbStatus = tauriSystemApi.getLocalDbStatus;
  createBackup = tauriSystemApi.createBackup;
  createEncryptedBackup = tauriSystemApi.createEncryptedBackup;
  importBackup = tauriSystemApi.importBackup;
  verifyBackup = tauriSystemApi.verifyBackup;
  verifyEncryptedBackup = tauriSystemApi.verifyEncryptedBackup;
  restoreBackup = tauriSystemApi.restoreBackup;
  restoreEncryptedBackup = tauriSystemApi.restoreEncryptedBackup;
  downloadBackup = tauriSystemApi.downloadBackup;
  generateDocumentPdf = tauriSystemApi.generateDocumentPdf;
  shutdownApp = tauriSystemApi.shutdownApp;
}
