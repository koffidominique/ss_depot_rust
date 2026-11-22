export type CommercialDocumentType =
  | 'customer_order'
  | 'sales_receipt'
  | 'purchase_order'
  | 'supplier_reception'
  | 'payment_receipt'
  | 'credit_note'
  | 'cancellation';

export type CommercialApprovalStatus =
  | 'draft'
  | 'pending_owner_approval'
  | 'approved'
  | 'rejected'
  | 'changes_requested'
  | null;

export interface CommercialDocument {
  documentType: CommercialDocumentType;
  documentId: number;
  documentNumber: string;
  counterparty: string;
  status: string;
  approvalStatus: CommercialApprovalStatus;
  amountXof: number;
  createdAt: string;
}

export interface CommercialDocumentsQuery {
  search?: string;
  documentType?: string;
  status?: string;
  from?: string;
  to?: string;
  sort?: 'newest' | 'oldest' | 'amount';
  page?: number;
  pageSize?: number;
  approvalsOnly?: boolean;
}

export interface CommercialDocumentsPage {
  rows: CommercialDocument[];
  total: number;
  pendingCount: number;
  page: number;
  pageSize: number;
}

export interface CommercialDocumentDetail {
  documentType: CommercialDocumentType;
  documentId: number;
  documentNumber: string;
  counterparty: string;
  status: string;
  amountXof: number;
  createdAt: string;
  notes: string | null;
  lines: Array<{
    label: string;
    detail: string | null;
    quantityMilli: number;
    unit: string;
    unitPriceXof: number;
    amountXof: number;
  }>;
  payments: Array<{ label: string; amountXof: number }>;
}

export interface CommercialApprovalEvent {
  id: number;
  documentType: 'customer_order' | 'purchase_order';
  documentId: number;
  action: 'submitted' | 'approved' | 'rejected' | 'changes_requested';
  actorUserId: number | null;
  actorRole: string | null;
  reason: string | null;
  snapshotJson: string;
  createdAt: string;
}
