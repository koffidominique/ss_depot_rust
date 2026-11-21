import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, PackageCheck, Printer } from 'lucide-react';
import type { PrintableDocumentData } from '../../../components/documents/DocumentPrintModal.tsx';
import { formatDateTime, formatFcfa, formatNumber } from '../../../utils/format.ts';
import type {
  ClientBalance,
  DepositReturnRow,
  OpenIssue,
  ReturnableMovementRow,
  ReturnableType,
} from '../types.ts';

export function useConsignmentColumns(options: {
  onAdjustType: (type: ReturnableType) => void;
  onStartReturn: (issue: OpenIssue) => void;
  onPrintReturn: (doc: PrintableDocumentData) => void;
}) {
  const { onAdjustType, onStartReturn, onPrintReturn } = options;

  const typeCols = useMemo<ColumnDef<ReturnableType>[]>(
    () => [
      {
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs font-semibold">{row.original.code}</span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Emballage réutilisable',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-[#667085]">
              {row.original.producer} ·{' '}
              {row.original.kind === 'crate' ? 'Casier' : 'Bouteille verre'}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'deposit_value',
        header: 'Tarif retour emballage',
        cell: ({ row }) => (
          <span className="font-mono-num">{formatFcfa(row.original.deposit_value)}</span>
        ),
      },
      {
        accessorKey: 'stock_quantity',
        header: 'Stock vides dépôt',
        cell: ({ row }) => (
          <span className="font-mono-num font-semibold">
            {formatNumber(row.original.stock_quantity)} pcs
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Mouvement',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onAdjustType(row.original)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Ajuster
          </button>
        ),
      },
    ],
    [onAdjustType]
  );

  const issueCols = useMemo<ColumnDef<OpenIssue>[]>(
    () => [
      {
        accessorKey: 'sale_reference',
        header: 'Vente',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs font-semibold">{row.original.sale_reference}</span>
        ),
      },
      {
        accessorKey: 'client_name',
        header: 'Client',
        cell: ({ row }) => row.original.client_name || 'Comptoir',
      },
      {
        accessorKey: 'packaging_name',
        header: 'Emballage & produits attendus',
        cell: ({ row }) => (
          <div>
            <div>
              {row.original.packaging_name} ({row.original.packaging_code})
            </div>
            {row.original.expected_products && (
              <div className="text-[11px] text-[#667085] dark:text-slate-400">
                Vides attendus : {row.original.expected_products}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'remaining',
        header: 'Vides chez client',
        cell: ({ row }) => {
          const rem = row.original.pieces - row.original.returned_pieces;
          return (
            <span className="font-mono-num font-semibold text-[#D9901A]">
              {rem} / {row.original.pieces} pcs
            </span>
          );
        },
      },
      {
        id: 'val',
        header: "Valeur d'emballage restante",
        cell: ({ row }) => {
          const rem =
            (row.original.pieces - row.original.returned_pieces) * row.original.unit_value;
          return <span className="font-mono-num">{formatFcfa(rem)}</span>;
        },
      },
      {
        id: 'actions',
        header: 'Retour',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onStartReturn(row.original)}
            className="inline-flex items-center gap-1 rounded-lg bg-[#16A36A] px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <PackageCheck className="h-3.5 w-3.5" />
            Enregistrer retour
          </button>
        ),
      },
    ],
    [onStartReturn]
  );

  const balanceCols = useMemo<ColumnDef<ClientBalance>[]>(
    () => [
      {
        accessorKey: 'client_name',
        header: 'Client',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.client_name}</div>
            <div className="font-mono-num text-[11px] text-[#667085]">
              {row.original.client_code}
            </div>
          </div>
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
        accessorKey: 'balance_pieces',
        header: 'Solde vides détenus',
        cell: ({ row }) => (
          <span className="font-mono-num font-semibold text-[#D9901A]">
            {formatNumber(row.original.balance_pieces)} pcs
          </span>
        ),
      },
      {
        accessorKey: 'deposit_held_amount',
        header: 'Dépôt de garantie retenu',
        cell: ({ row }) => (
          <span className="font-mono-num font-semibold">
            {formatFcfa(row.original.deposit_held_amount)}
          </span>
        ),
      },
    ],
    []
  );

  const movementCols = useMemo<ColumnDef<ReturnableMovementRow>[]>(
    () => [
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
        cell: ({ row }) => {
          const labels: Record<ReturnableMovementRow['movement_type'], string> = {
            initial: 'Stock initial',
            entry: 'Entrée (+)',
            exit: 'Sortie (-)',
            breakage: 'Casse (-)',
            loss: 'Perte (-)',
            correction_in: 'Correction (+)',
            correction_out: 'Correction (-)',
          };
          return (
            <span className="text-xs font-medium">
              {labels[row.original.movement_type] || row.original.movement_type}
            </span>
          );
        },
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
    ],
    []
  );

  const returnCols = useMemo<ColumnDef<DepositReturnRow>[]>(
    () => [
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
            onClick={() =>
              onPrintReturn({
                docType: 'REÇU RETOUR EMBALLAGES',
                reference: row.original.reference,
                date: row.original.created_at,
                partyTitle: 'Client',
                partyName: row.original.client_name || 'Client Comptoir',
                lines: [
                  {
                    label: row.original.packaging_name,
                    sublabel: `État : ${
                      row.original.condition_state === 'good'
                        ? 'Bon état (réintégré)'
                        : 'Endommagé / Cassé'
                    }`,
                    quantity: `${row.original.pieces} pcs`,
                    unitPrice: null,
                    total: row.original.refund_amount + row.original.credit_reduction,
                  },
                ],
                summaryRows: [
                  { label: 'Remboursement client', value: formatFcfa(row.original.refund_amount) },
                  { label: 'Déduction créance', value: formatFcfa(row.original.credit_reduction) },
                  {
                    label: 'Total régularisé',
                    value: formatFcfa(row.original.refund_amount + row.original.credit_reduction),
                    bold: true,
                  },
                ],
                payments:
                  row.original.refund_amount > 0
                    ? [{ label: row.original.method_label, amount: row.original.refund_amount }]
                    : undefined,
                notes: row.original.reason,
              })
            }
            className="inline-flex items-center gap-1 rounded border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="h-3.5 w-3.5" />
            Reçu
          </button>
        ),
      },
    ],
    [onPrintReturn]
  );

  return { typeCols, issueCols, balanceCols, movementCols, returnCols };
}
