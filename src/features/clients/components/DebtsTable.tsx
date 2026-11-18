import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { History, Wallet } from 'lucide-react';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import { StatusBadge } from '../../../components/common/StatusBadge.tsx';
import type { Receivable } from '../../../types/erp.ts';
import { formatDate, formatFcfa } from '../../../utils/format.ts';

export function DebtsTable({
  receivables,
  onViewHistory,
  onOpenPay,
}: {
  receivables: Receivable[];
  onViewHistory: (receivable: Receivable) => void;
  onOpenPay: (receivable: Receivable) => void;
}) {
  const columns = useMemo<ColumnDef<Receivable>[]>(
    () => [
      {
        accessorKey: 'client_name',
        header: 'Client',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.client_name}</div>
            <div className="text-xs text-[#667085]">{row.original.client_code}</div>
          </div>
        ),
      },
      {
        accessorKey: 'sale_reference',
        header: 'Facture',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs font-semibold">
            {row.original.sale_reference}
          </span>
        ),
      },
      {
        accessorKey: 'initial_amount',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-mono-num">{formatFcfa(row.original.initial_amount)}</span>
        ),
      },
      {
        id: 'paid_amount',
        header: 'Payé',
        cell: ({ row }) => {
          const paid = Math.max(0, row.original.initial_amount - row.original.remaining_amount);
          return <span className="font-mono-num text-[#16A36A]">{formatFcfa(paid)}</span>;
        },
      },
      {
        accessorKey: 'remaining_amount',
        header: 'Reste à encaisser',
        cell: ({ row }) => (
          <span
            className={`font-mono-num font-semibold ${
              row.original.remaining_amount > 0 ? 'text-[#D9901A]' : 'text-[#16A36A]'
            }`}
          >
            {formatFcfa(row.original.remaining_amount)}
          </span>
        ),
      },
      {
        accessorKey: 'due_date',
        header: 'Échéance / Retard',
        cell: ({ row }) => {
          const todayStr = new Date().toISOString().slice(0, 10);
          const overdue =
            row.original.due_date &&
            row.original.remaining_amount > 0 &&
            row.original.due_date < todayStr;
          const lateDays = overdue
            ? Math.max(
                1,
                Math.floor(
                  (Date.parse(`${todayStr}T00:00:00Z`) -
                    Date.parse(`${row.original.due_date}T00:00:00Z`)) /
                    86_400_000
                )
              )
            : 0;
          return (
            <span
              className={`font-mono-num text-xs ${
                overdue ? 'font-semibold text-[#DC4545]' : ''
              }`}
            >
              {formatDate(row.original.due_date)}
              {overdue ? ` (+${lateDays} j retard)` : ''}
            </span>
          );
        },
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
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onViewHistory(row.original)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <History className="h-3.5 w-3.5" />
              Paiements
            </button>
            {row.original.remaining_amount > 0 && row.original.status !== 'cancelled' && (
              <button
                type="button"
                onClick={() => onOpenPay(row.original)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A36A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Wallet className="h-3.5 w-3.5" />
                Encaisser
              </button>
            )}
          </div>
        ),
      },
    ],
    [onViewHistory, onOpenPay]
  );

  return <DataTable data={receivables} columns={columns as ColumnDef<Receivable, unknown>[]} />;
}
