import type { ApiClient } from "../ApiClient.ts";
import type { DocumentArchiveFilter } from "../../../types/erp.ts";
import { buildQueryString, httpRequest } from "./httpTransport.ts";

export const httpDocumentsApi = {
  archiveSaleDocument: (saleId: number) =>
    httpRequest<Awaited<ReturnType<ApiClient["archiveSaleDocument"]>>>(
      `/api/document-archive/sales/${saleId}`,
      { method: "POST" },
    ),
  archiveOrderDocument: (orderId: number) =>
    httpRequest<Awaited<ReturnType<ApiClient["archiveOrderDocument"]>>>(
      `/api/document-archive/orders/${orderId}`,
      { method: "POST" },
    ),
  listDocumentArchive: (filter: DocumentArchiveFilter = {}) =>
    httpRequest<Awaited<ReturnType<ApiClient["listDocumentArchive"]>>>(
      `/api/document-archive${buildQueryString(filter as unknown as Record<string, unknown>)}`,
    ),
  getDocumentArchive: (id: number) =>
    httpRequest<Awaited<ReturnType<ApiClient["getDocumentArchive"]>>>(`/api/document-archive/${id}`),
};
