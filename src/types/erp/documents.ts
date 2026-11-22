import type { CustomerOrderDetail } from "./orders.ts";
import type { SaleDetail } from "./sales.ts";

export type ArchivedDocumentType = "sales_receipt" | "sales_invoice" | "order_confirmation";

export interface DocumentArchiveFilter {
  search?: string;
  documentType?: ArchivedDocumentType | "all";
  sourceStatus?: string;
  paymentStatus?: "unpaid" | "partial" | "paid" | "all";
  customerId?: number;
  from?: string;
  to?: string;
  minTotalXof?: number;
  maxTotalXof?: number;
  page?: number;
  pageSize?: number;
}

export interface DocumentArchiveSummary {
  id: number;
  documentType: ArchivedDocumentType;
  sourceType: "sale" | "order";
  sourceId: number;
  sourceReference: string;
  documentReference: string;
  customerId: number | null;
  customerName: string;
  customerPhone: string | null;
  sourceStatus: string;
  paymentStatus: "unpaid" | "partial" | "paid";
  subtotalXof: number;
  depositXof: number;
  totalToCollectXof: number;
  paidXof: number;
  balanceXof: number;
  documentDate: string;
  generatedAt: string;
}

export interface DocumentArchiveSnapshot {
  version: number;
  documentType: ArchivedDocumentType;
  sourceType: "sale" | "order";
  sale?: SaleDetail;
  orderDetail?: CustomerOrderDetail;
  customer?: {
    id: number | null;
    code: string | null;
    name: string;
    phone: string | null;
    address: string | null;
    city: string | null;
    email: string | null;
  };
}

export interface DocumentArchiveDetail {
  document: DocumentArchiveSummary;
  snapshot: DocumentArchiveSnapshot;
}

export interface DocumentArchiveTotals {
  documentCount: number;
  totalToCollectXof: number;
  depositXof: number;
  paidXof: number;
  balanceXof: number;
}

export interface DocumentArchivePage {
  items: DocumentArchiveSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: DocumentArchiveTotals;
}
