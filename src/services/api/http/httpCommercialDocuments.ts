import type { CommercialApprovalEvent, CommercialDocumentDetail, CommercialDocumentType, CommercialDocumentsPage, CommercialDocumentsQuery } from '../../../types/erp.ts';
import { httpRequest } from './httpTransport.ts';

export const httpCommercialDocumentsApi = {
  listCommercialDocuments: (query: CommercialDocumentsQuery) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== false) params.set(key, String(value));
    });
    return httpRequest<CommercialDocumentsPage>(`/api/commercial-documents?${params.toString()}`);
  },
  getCommercialDocumentDetail: (documentType: CommercialDocumentType, documentId: number) =>
    httpRequest<CommercialDocumentDetail>(`/api/commercial-documents/${documentType}/${documentId}`),
  submitCommercialDocument: (documentType: 'customer_order' | 'purchase_order', documentId: number) =>
    httpRequest<void>(`/api/commercial-documents/${documentType}/${documentId}/submit`, { method: 'POST' }),
  reviewCommercialDocument: (
    documentType: 'customer_order' | 'purchase_order',
    documentId: number,
    action: 'approved' | 'rejected' | 'changes_requested',
    reason?: string,
  ) => httpRequest<void>(`/api/commercial-documents/${documentType}/${documentId}/review`, {
    method: 'POST',
    body: JSON.stringify({ action, reason }),
  }),
  getCommercialDocumentEvents: (documentType: 'customer_order' | 'purchase_order', documentId: number) =>
    httpRequest<CommercialApprovalEvent[]>(`/api/commercial-documents/${documentType}/${documentId}/events`),
};
