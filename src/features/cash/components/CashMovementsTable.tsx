import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import type { CashStatus } from '../../../types/erp.ts';
import { exportCashMovementsCsv } from '../../../utils/csv.ts';
import { formatDateTime, formatFcfa } from '../../../utils/format.ts';

type CashMovementRow = NonNullable<CashStatus['summary']>['movements'][number];

interface CashMovementsTableProps {
  sessionReference: string;
  movements: CashMovementRow[];
}

export function CashMovementsTable({ sessionReference, movements }: CashMovementsTableProps) {
  const columns = useMemo<ColumnDef<CashMovementRow>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Heure',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs">{formatDateTime(row.original.created_at)}</span>
        ),
      },
      { accessorKey: 'description', header: 'Opération' },
      {
        accessorKey: 'method_label',
        header: 'Moyen',
        cell: ({ row }) => (
          <span className="text-xs font-medium">
            {row.original.method_label}{' '}
            {row.original.is_cash === 1 ? '(Espèces)' : '(Digital)'}
          </span>
        ),
      },
      {
        accessorKey: 'amount',
        header: 'Montant',
        cell: ({ row }) => (
          <span
            className={`font-mono-num font-semibold ${
              row.original.direction === 'in' ? 'text-[#16A36A]' : 'text-[#DC4545]'
            }`}
          >
            {row.original.direction === 'in' ? '+' : '-'}
            {formatFcfa(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: 'reference_document',
        header: 'Document',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs text-[#667085]">
            {row.original.reference_document || '—'}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold">Mouvements de la session en cours</h3>
        <button
          type="button"
          disabled={movements.length === 0}
          onClick={() => exportCashMovementsCsv(sessionReference, movements)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          CSV Mouvements
        </button>
      </div>
      <DataTable
        data={movements}
        columns={columns as ColumnDef<CashMovementRow, unknown>[]}
        emptyMessage="Aucun mouvement enregistré sur cette session."
      />
    </div>
  );
}
