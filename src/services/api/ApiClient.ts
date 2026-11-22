/* ============================================================================
 * Contrat unifié ApiClient — agrégation des domaines métier
 * ============================================================================ */

import type {
  AuthApiClient,
  CatalogApiClient,
  PurchasesApiClient,
  SalesApiClient,
} from "./contracts/commerceContracts.ts";
import type { OrdersApiClient } from "./contracts/ordersContracts.ts";
import type { CommercialDocumentsApiClient } from "./contracts/commercialDocumentsContracts.ts";
import type {
  ConsignmentsApiClient,
  FinanceApiClient,
  StockApiClient,
  SystemApiClient,
} from "./contracts/operationsContracts.ts";

export {
  ApiError,
  type CreateSaleReturnPayload,
  type ReceivePurchaseOrderPayload,
} from "./contracts/shared.ts";

export interface ApiClient
  extends AuthApiClient,
    CatalogApiClient,
    SalesApiClient,
    OrdersApiClient,
    CommercialDocumentsApiClient,
    PurchasesApiClient,
    StockApiClient,
    ConsignmentsApiClient,
    FinanceApiClient,
    SystemApiClient {}
