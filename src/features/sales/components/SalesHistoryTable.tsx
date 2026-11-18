import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import { StatusBadge } from '../../../components/common/StatusBadge.tsx';
import type { SaleSummary } from '../../../types/erp.ts';
import { formatDateTime, formatFcfa } from '../../../utils/format.ts';

interface SalesHistoryTableProps {
  items: SaleSummary[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onOpenDetail: (id: number) => void;
}

export function SalesHistoryTable({
  items,
  page,
  totalPages,
  total,
  onPageChange,
  onOpenDetail,
}: SalesHistoryTableProps) {
  const columns = useMemo<ColumnDef<SaleSummary>[]>(
    () => [
      {
        accessorKey: 'reference',
        header: 'Référence',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs font-semibold">{row.original.reference}</span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: 'Date',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs text-[#667085] dark:text-slate-400">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: 'client_name',
        header: 'Client',
      },
      {
        accessorKey: 'total_amount',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-mono-num font-semibold">
            {formatFcfa(row.original.total_amount)}
          </span>
        ),
      },
      {
        accessorKey: 'paid_amount',
        header: 'Payé',
        cell: ({ row }) => (
          <span className="font-mono-num text-[#16A36A] dark:text-emerald-400">
            {formatFcfa(row.original.paid_amount)}
          </span>
        ),
      },
      {
        accessorKey: 'remaining_amount',
        header: 'Reste',
        cell: ({ row }) => (
          <span
            className={`font-mono-num ${
              row.original.remaining_amount > 0
                ? 'font-semibold text-[#D9901A]'
                : 'text-[#667085]'
            }`}
          >
            {formatFcfa(row.original.remaining_amount)}
          </span>
        ),
      },
      {
        accessorKey: 'payment_labels',
        header: 'Mode',
        cell: ({ row }) => (
          <span className="text-xs text-[#667085] dark:text-slate-400">
            {row.original.payment_labels || (row.original.sale_type === 'credit' ? 'Crédit' : '—')}
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
          <button
            type="button"
            onClick={() => onOpenDetail(row.original.id)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Eye className="h-3.5 w-3.5" />
            Détails
          </button>
        ),
      },
    ],
    [onOpenDetail]
  );

  return (
    <DataTable
      data={items}
      columns={columns as ColumnDef<SaleSummary, unknown>[]}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={onPageChange}
      emptyMessage="Aucune vente enregistrée."
    />
  );
}
