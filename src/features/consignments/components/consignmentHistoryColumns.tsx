import type { ColumnDef } from '@tanstack/react-table';
import { Printer } from 'lucide-react';
import type { PrintableDocumentData } from '../../../components/documents/DocumentPrintModal.tsx';
import { formatDateTime, formatFcfa, formatNumber } from '../../../utils/format.ts';
import type { DepositReturnRow, ReturnableMovementRow } from '../types.ts';
import { buildReturnPrintDocument } from './consignmentPrintHelpers.ts';

/* ============================================================================
 * Colonnes TanStack Table : Historique des mouvements & retours d'emballages
 * ============================================================================ */

const MOVEMENT_TYPE_LABELS: Record<ReturnableMovementRow['movement_type'], string> = {
  initial: 'Stock initial',
  entry: 'Entrée (+)',
  exit: 'Sortie (-)',
  breakage: 'Casse (-)',
  loss: 'Perte (-)',
  correction_in: 'Correction (+)',
  correction_out: 'Correction (-)',
};

export function buildMovementColumns(): ColumnDef<ReturnableMovementRow>[] {
  return [
    {
      accessorKey: 'created_at',
      header: 'Date',
      cell: ({ row }) => (
        <span className="font-mono-num text-xs">{formatDateTime(row.original.created_at)}</span>
      ),
    },
    {
      accessorKey: 'packaging_name',
      header: 'Emballage',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.packaging_name}</div>
          <div className="font-mono-num text-[11px] text-[#667085]">
            {row.original.packaging_code}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'movement_type',
      header: 'Type',
      cell: ({ row }) => (
        <span className="text-xs font-medium">
          {MOVEMENT_TYPE_LABELS[row.original.movement_type] || row.original.movement_type}
        </span>
      ),
    },
    {
      accessorKey: 'quantity',
      header: 'Quantité',
      cell: ({ row }) => {
        const isIn = ['initial', 'entry', 'correction_in'].includes(row.original.movement_type);
        return (
          <span
            className={`font-mono-num font-semibold ${isIn ? 'text-[#16A36A]' : 'text-[#DC4545]'}`}
          >
            {isIn ? '+' : '-'}
            {formatNumber(row.original.quantity)} pcs
          </span>
        );
      },
    },
    {
      accessorKey: 'stock_after',
      header: 'Stock avant → après',
      cell: ({ row }) => (
        <span className="font-mono-num text-xs">
          {row.original.stock_before ?? 0} → <strong>{row.original.stock_after}</strong> pcs
        </span>
      ),
    },
    {
      accessorKey: 'reason',
      header: 'Motif / Référence',
      cell: ({ row }) => (
        <div className="text-xs">
          <div>{row.original.reason}</div>
          {row.original.reference_document && (
            <div className="font-mono-num text-[11px] text-[#667085]">
              {row.original.reference_document}
            </div>
          )}
        </div>
      ),
    },
  ];
}

export function buildReturnColumns(
  onPrintReturn: (doc: PrintableDocumentData) => void
): ColumnDef<DepositReturnRow>[] {
  return [
    {
      accessorKey: 'reference',
      header: 'Référence',
      cell: ({ row }) => (
        <div>
          <div className="font-mono-num text-xs font-semibold">{row.original.reference}</div>
          <div className="font-mono-num text-[11px] text-[#667085]">
            {formatDateTime(row.original.created_at)}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'client_name',
      header: 'Client',
      cell: ({ row }) => row.original.client_name || 'Comptoir',
    },
    { accessorKey: 'packaging_name', header: 'Emballage' },
    {
      accessorKey: 'pieces',
      header: 'Quantité',
      cell: ({ row }) => (
        <span className="font-mono-num">
          {row.original.pieces} pcs (
          {row.original.condition_state === 'good' ? 'Bon état' : 'Cassé'})
        </span>
      ),
    },
    {
      accessorKey: 'refund_amount',
      header: 'Remboursé',
      cell: ({ row }) => (
        <span className="font-mono-num">{formatFcfa(row.original.refund_amount)}</span>
      ),
    },
    {
      accessorKey: 'credit_reduction',
      header: 'Déduit créance',
      cell: ({ row }) => (
        <span className="font-mono-num">{formatFcfa(row.original.credit_reduction)}</span>
      ),
    },
    {
      id: 'print',
      header: 'Reçu',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onPrintReturn(buildReturnPrintDocument(row.original))}
          className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Printer className="h-3.5 w-3.5" />
          Reçu
        </button>
      ),
    },
  ];
}
