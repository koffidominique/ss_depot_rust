import type {
  DocumentArchiveDetail,
  DocumentArchiveFilter,
  DocumentArchivePage,
} from "../../../types/erp.ts";

export interface DocumentsApiClient {
  archiveSaleDocument(saleId: number): Promise<DocumentArchiveDetail>;
  archiveOrderDocument(orderId: number): Promise<DocumentArchiveDetail>;
  listDocumentArchive(filter?: DocumentArchiveFilter): Promise<DocumentArchivePage>;
  getDocumentArchive(id: number): Promise<DocumentArchiveDetail>;
}
