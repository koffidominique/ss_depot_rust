import type { CommercialApprovalEvent, CommercialDocumentDetail, CommercialDocumentType, CommercialDocumentsPage, CommercialDocumentsQuery } from '../../../types/erp.ts';
import { getStoredTauriToken, tauriInvoke } from './tauriTransport.ts';

function call<T>(cmd: string, args: Record<string, unknown> = {}) {
  return tauriInvoke<T>(cmd, { token: getStoredTauriToken(), ...args });
}

export const tauriCommercialDocumentsApi = {
  listCommercialDocuments: (query: CommercialDocumentsQuery) => call<CommercialDocumentsPage>('list_commercial_documents', { query }),
  getCommercialDocumentDetail: (documentType: CommercialDocumentType, documentId: number) =>
    call<CommercialDocumentDetail>('get_commercial_document_detail', { documentType, documentId }),
  submitCommercialDocument: (documentType: 'customer_order' | 'purchase_order', documentId: number) =>
    call<void>('submit_commercial_document', { documentType, documentId }),
  reviewCommercialDocument: (
    documentType: 'customer_order' | 'purchase_order',
    documentId: number,
    action: 'approved' | 'rejected' | 'changes_requested',
    reason?: string,
  ) => call<void>('review_commercial_document', { documentType, documentId, payload: { action, reason } }),
  getCommercialDocumentEvents: (documentType: 'customer_order' | 'purchase_order', documentId: number) =>
    call<CommercialApprovalEvent[]>('commercial_document_events', { documentType, documentId }),
};
