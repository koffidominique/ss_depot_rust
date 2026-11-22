import type { CommercialApprovalEvent, CommercialDocumentDetail, CommercialDocumentsPage, CommercialDocumentsQuery, CommercialDocumentType } from '../../../types/erp.ts';

export interface CommercialDocumentsApiClient {
  listCommercialDocuments(query: CommercialDocumentsQuery): Promise<CommercialDocumentsPage>;
  getCommercialDocumentDetail(documentType: CommercialDocumentType, documentId: number): Promise<CommercialDocumentDetail>;
  submitCommercialDocument(documentType: 'customer_order' | 'purchase_order', documentId: number): Promise<void>;
  reviewCommercialDocument(
    documentType: 'customer_order' | 'purchase_order',
    documentId: number,
    action: 'approved' | 'rejected' | 'changes_requested',
    reason?: string,
  ): Promise<void>;
  getCommercialDocumentEvents(documentType: 'customer_order' | 'purchase_order', documentId: number): Promise<CommercialApprovalEvent[]>;
}
