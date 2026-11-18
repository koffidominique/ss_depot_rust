import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Edit3, History, Wallet } from 'lucide-react';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import { StatusBadge } from '../../../components/common/StatusBadge.tsx';
import type { Supplier, SupplierDebt } from '../../../types/erp.ts';
import { formatDate, formatFcfa } from '../../../utils/format.ts';

export function SuppliersTable({
  suppliers,
  onEdit,
  onDetail,
}: {
  suppliers: Supplier[];
  onEdit: (supplier: Supplier) => void;
  onDetail: (supplier: Supplier) => void;
}) {
  const columns = useMemo<ColumnDef<Supplier>[]>(
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
        header: 'Fournisseur',
        cell: ({ row }) => (
          <div>
            <div className="flex items-center gap-2 font-medium">
              <span>{row.original.name}</span>
              {row.original.is_active === 0 && <StatusBadge status="archived" />}
            </div>
            <div className="text-xs text-[#667085]">
              {row.original.phone}
              {row.original.payment_terms_days
                ? ` · Délai ${row.original.payment_terms_days}j`
                : ''}
              {row.original.email ? ` · ${row.original.email}` : ''}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'total_purchases',
        header: 'Total réceptionné',
        cell: ({ row }) => (
          <span className="font-mono-num">{formatFcfa(row.original.total_purchases)}</span>
        ),
      },
      {
        accessorKey: 'balance_due',
        header: 'Dette restante',
        cell: ({ row }) => (
          <span
            className={`font-mono-num font-semibold ${
              row.original.balance_due > 0 ? 'text-[#DC4545]' : 'text-[#16A36A]'
            }`}
          >
            {formatFcfa(row.original.balance_due)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onEdit(row.original)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Modifier
            </button>
            <button
              type="button"
              onClick={() => onDetail(row.original)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <History className="h-3.5 w-3.5" />
              Historique
            </button>
          </div>
        ),
      },
    ],
    [onEdit, onDetail]
  );

  return <DataTable data={suppliers} columns={columns as ColumnDef<Supplier, unknown>[]} />;
}

export function SupplierDebtsTable({
  debts,
  onPayDebt,
}: {
  debts: SupplierDebt[];
  onPayDebt: (debt: SupplierDebt) => void;
}) {
  const columns = useMemo<ColumnDef<SupplierDebt>[]>(
    () => [
      {
        accessorKey: 'receipt_reference',
        header: 'Réception / CMD',
        cell: ({ row }) => (
          <div>
            <div className="font-mono-num text-xs font-semibold">
              {row.original.receipt_reference}
            </div>
            <div className="font-mono-num text-[11px] text-[#667085]">
              {row.original.order_reference}
            </div>
          </div>
        ),
      },
      { accessorKey: 'supplier_name', header: 'Fournisseur' },
      {
        accessorKey: 'initial_amount',
        header: 'Montant reçu',
        cell: ({ row }) => (
          <span className="font-mono-num">{formatFcfa(row.original.initial_amount)}</span>
        ),
      },
      {
        accessorKey: 'remaining_amount',
        header: 'Reste à payer',
        cell: ({ row }) => (
          <span className="font-mono-num font-semibold text-[#DC4545]">
            {formatFcfa(row.original.remaining_amount)}
          </span>
        ),
      },
      {
        accessorKey: 'due_date',
        header: 'Échéance',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs">{formatDate(row.original.due_date)}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Statut',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: 'Action',
        cell: ({ row }) =>
          row.original.remaining_amount > 0 ? (
            <button
              type="button"
              onClick={() => onPayDebt(row.original)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Wallet className="h-3.5 w-3.5" />
              Régler
            </button>
          ) : null,
      },
    ],
    [onPayDebt]
  );

  return (
    <DataTable
      data={debts}
      columns={columns as ColumnDef<SupplierDebt, unknown>[]}
      emptyMessage="Aucune dette fournisseur enregistrée."
    />
  );
}
