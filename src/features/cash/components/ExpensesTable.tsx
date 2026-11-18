import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import type { ExpenseItem } from '../../../types/erp.ts';
import { formatDate, formatFcfa } from '../../../utils/format.ts';

export function ExpensesTable({
  items,
  onPreviewReceipt,
}: {
  items: ExpenseItem[];
  onPreviewReceipt: (item: ExpenseItem) => void;
}) {
  const columns = useMemo<ColumnDef<ExpenseItem>[]>(
    () => [
      {
        accessorKey: 'reference',
        header: 'Référence',
        cell: ({ row }) => (
          <div>
            <div className="font-mono-num text-xs font-semibold">{row.original.reference}</div>
            <div className="font-mono-num text-[11px] text-[#667085]">
              {formatDate(row.original.expense_date)}
            </div>
          </div>
        ),
      },
      { accessorKey: 'category', header: 'Catégorie' },
      {
        accessorKey: 'beneficiary',
        header: 'Bénéficiaire',
        cell: ({ row }) => row.original.beneficiary || '—',
      },
      {
        accessorKey: 'method_label',
        header: 'Moyen de paiement',
        cell: ({ row }) => <span className="text-xs font-medium">{row.original.method_label}</span>,
      },
      {
        accessorKey: 'amount',
        header: 'Montant',
        cell: ({ row }) => (
          <span className="font-mono-num font-semibold text-[#DC4545]">
            {formatFcfa(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: 'notes',
        header: 'Notes',
        cell: ({ row }) => (
          <span className="text-xs text-[#667085]">{row.original.notes || '—'}</span>
        ),
      },
      {
        id: 'receipt',
        header: 'Justificatif',
        cell: ({ row }) =>
          row.original.receipt_path ? (
            <button
              type="button"
              onClick={() => onPreviewReceipt(row.original)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-[#2563EB] hover:bg-blue-50 dark:hover:bg-blue-950/30"
            >
              <Eye className="h-3.5 w-3.5" />
              Voir reçu
            </button>
          ) : (
            <span className="text-xs text-[#667085]">—</span>
          ),
      },
    ],
    [onPreviewReceipt]
  );

  return (
    <DataTable
      data={items}
      columns={columns as ColumnDef<ExpenseItem, unknown>[]}
      emptyMessage="Aucune dépense enregistrée pour le moment."
    />
  );
}
