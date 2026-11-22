import type { DocumentArchiveFilter } from "../../../types/erp.ts";
import type { ApiClient } from "../ApiClient.ts";
import { getStoredTauriToken, tauriInvoke } from "./tauriTransport.ts";

function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return tauriInvoke<T>(cmd, { token: getStoredTauriToken(), ...args });
}

export const tauriDocumentsApi = {
  archiveSaleDocument: (saleId: number) =>
    invoke<Awaited<ReturnType<ApiClient["archiveSaleDocument"]>>>("archive_sale_document_v1", { id: saleId }),
  archiveOrderDocument: (orderId: number) =>
    invoke<Awaited<ReturnType<ApiClient["archiveOrderDocument"]>>>("archive_order_document_v1", { id: orderId }),
  listDocumentArchive: (filter: DocumentArchiveFilter = {}) =>
    invoke<Awaited<ReturnType<ApiClient["listDocumentArchive"]>>>("list_document_archive_v1", { filter }),
  getDocumentArchive: (id: number) =>
    invoke<Awaited<ReturnType<ApiClient["getDocumentArchive"]>>>("get_document_archive_v1", { id }),
};
