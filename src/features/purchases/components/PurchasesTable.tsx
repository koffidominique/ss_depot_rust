import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, Eye, PackageCheck, Printer } from 'lucide-react';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import { StatusBadge } from '../../../components/common/StatusBadge.tsx';
import type { PrintableDocumentData } from '../../../components/documents/DocumentPrintModal.tsx';
import type { PurchaseOrder } from '../../../types/erp.ts';
import { formatDateTime, formatFcfa, formatQty } from '../../../utils/format.ts';

interface PurchasesTableProps {
  orders: PurchaseOrder[];
  onInspect: (order: PurchaseOrder) => void;
  onPrint: (doc: PrintableDocumentData) => void;
  onReceive: (order: PurchaseOrder) => void;
  onCancel: (order: PurchaseOrder) => void;
}

export function PurchasesTable({
  orders,
  onInspect,
  onPrint,
  onReceive,
  onCancel,
}: PurchasesTableProps) {
  const columns = useMemo<ColumnDef<PurchaseOrder>[]>(
    () => [
      {
        accessorKey: 'reference',
        header: 'Commande',
        cell: ({ row }) => (
          <div>
            <div className="font-mono-num text-xs font-semibold">{row.original.reference}</div>
            <div className="font-mono-num text-[11px] text-[#667085]">
              {formatDateTime(row.original.created_at)}
            </div>
          </div>
        ),
      },
      { accessorKey: 'supplier_name', header: 'Fournisseur' },
      {
        accessorKey: 'total_amount',
        header: 'Montant commandé',
        cell: ({ row }) => (
          <span className="font-mono-num">{formatFcfa(row.original.total_amount)}</span>
        ),
      },
      {
        accessorKey: 'received_amount',
        header: 'Montant réceptionné',
        cell: ({ row }) => (
          <span className="font-mono-num font-semibold text-[#16A36A]">
            {formatFcfa(row.original.received_amount)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Statut',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onInspect(row.original)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Eye className="h-3.5 w-3.5" />
              Écarts &amp; Dettes
            </button>
            <button
              type="button"
              onClick={() =>
                onPrint({
                  docType:
                    row.original.receipts.length > 0 ? 'BON DE RÉCEPTION' : 'BON DE COMMANDE',
                  reference: row.original.receipts[0]?.reference || row.original.reference,
                  date: row.original.receipts[0]?.created_at || row.original.created_at,
                  statusLabel: row.original.status,
                  partyTitle: 'Fournisseur',
                  partyName: row.original.supplier_name,
                  partyDetails: `Code ${row.original.supplier_code} · Commande ${row.original.reference}`,
                  lines: row.original.lines.map((l) => ({
                    label: l.product_name,
                    sublabel: `${l.packaging_name} (×${formatQty(l.coefficient_milli, l.base_unit)}) · Reçu : ${formatQty(l.received_quantity_milli)} / ${formatQty(l.ordered_quantity_milli)}`,
                    quantity: formatQty(l.ordered_quantity_milli),
                    unitPrice: l.unit_price,
                    total: l.line_total,
                  })),
                  summaryRows: [
                    { label: 'Total commandé', value: formatFcfa(row.original.total_amount) },
                    {
                      label: 'Total réceptionné',
                      value: formatFcfa(row.original.received_amount),
                      tone: 'success',
                      bold: true,
                    },
                  ],
                  notes: row.original.notes,
                })
              }
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Printer className="h-3.5 w-3.5" />
              Bon
            </button>
            {row.original.status !== 'received' && row.original.status !== 'cancelled' && (
              <button
                type="button"
                onClick={() => onReceive(row.original)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <PackageCheck className="h-3.5 w-3.5" />
                Réceptionner
              </button>
            )}
            {row.original.status !== 'received' &&
              row.original.status !== 'partial' &&
              row.original.status !== 'cancelled' &&
              row.original.receipts.length === 0 && (
                <button
                  type="button"
                  onClick={() => onCancel(row.original)}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/50 px-2.5 py-1.5 text-xs font-medium text-[#DC4545] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <Ban className="h-3.5 w-3.5" />
                  Annuler
                </button>
              )}
          </div>
        ),
      },
    ],
    [onInspect, onPrint, onReceive, onCancel]
  );

  return (
    <DataTable
      data={orders}
      columns={columns as ColumnDef<PurchaseOrder, unknown>[]}
      emptyMessage="Aucun bon de commande créé."
    />
  );
}
