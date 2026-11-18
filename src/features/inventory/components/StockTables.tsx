import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { SlidersHorizontal } from 'lucide-react';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import { formatDateTime, formatFcfa, formatQty } from '../../../utils/format.ts';
import {
  MOVEMENT_LABELS,
  type StockMovementRow,
  type StockProductRow,
} from '../types.ts';

export function StockBalancesTable({
  products,
  onAdjustProduct,
}: {
  products: StockProductRow[];
  onAdjustProduct: (productId: number) => void;
}) {
  const columns = useMemo<ColumnDef<StockProductRow>[]>(
    () => [
      {
        accessorKey: 'reference',
        header: 'Référence',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs font-semibold text-[#667085] dark:text-slate-400">
            {row.original.reference}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Produit',
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-[#182230] dark:text-slate-100">
              {row.original.name}
            </div>
            <div className="text-xs text-[#667085] dark:text-slate-400">
              {row.original.category_name}
              {row.original.brand ? ` · ${row.original.brand}` : ''}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'stock_milli',
        header: 'Stock actuel',
        cell: ({ row }) => {
          const isOut = row.original.stock_milli <= 0;
          const isLow = row.original.stock_milli <= row.original.min_stock_milli;
          return (
            <span
              className={`font-mono-num font-semibold ${
                isOut
                  ? 'text-[#DC4545]'
                  : isLow
                    ? 'text-[#D9901A]'
                    : 'text-[#182230] dark:text-slate-100'
              }`}
            >
              {formatQty(row.original.stock_milli, row.original.base_unit)}
            </span>
          );
        },
      },
      {
        accessorKey: 'min_stock_milli',
        header: 'Seuil alerte',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs text-[#667085] dark:text-slate-400">
            {formatQty(row.original.min_stock_milli, row.original.base_unit)}
          </span>
        ),
      },
      {
        accessorKey: 'average_cost_fcfa',
        header: 'CUMP unitaire',
        cell: ({ row }) =>
          row.original.average_cost_fcfa !== null ? (
            <span className="font-mono-num">{formatFcfa(row.original.average_cost_fcfa)}</span>
          ) : (
            <span className="text-xs text-[#D9901A]">Coût non renseigné</span>
          ),
      },
      {
        accessorKey: 'valuation_fcfa',
        header: 'Valorisation stock',
        cell: ({ row }) =>
          row.original.valuation_fcfa !== null ? (
            <span className="font-mono-num font-semibold">
              {formatFcfa(row.original.valuation_fcfa)}
            </span>
          ) : (
            <span className="text-xs text-[#667085]">Non valorisable</span>
          ),
      },
      {
        id: 'actions',
        header: 'Action',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onAdjustProduct(row.original.id)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <SlidersHorizontal className="h-3 w-3" />
            Ajuster
          </button>
        ),
      },
    ],
    [onAdjustProduct]
  );

  return (
    <DataTable
      data={products}
      columns={columns as ColumnDef<StockProductRow, unknown>[]}
      emptyMessage="Aucun produit ne correspond aux filtres."
    />
  );
}

export function StockMovementsTable({ movements }: { movements: StockMovementRow[] }) {
  const columns = useMemo<ColumnDef<StockMovementRow>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Date & heure',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs text-[#667085] dark:text-slate-400">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: 'product_name',
        header: 'Produit',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.product_name}</div>
            <div className="font-mono-num text-[11px] text-[#667085]">
              {row.original.product_reference}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'movement_type',
        header: 'Type',
        cell: ({ row }) => (
          <span className="text-xs font-medium text-[#182230] dark:text-slate-200">
            {MOVEMENT_LABELS[row.original.movement_type] || row.original.movement_type}
          </span>
        ),
      },
      {
        accessorKey: 'quantity_milli',
        header: 'Variation',
        cell: ({ row }) => {
          const pos = row.original.quantity_milli > 0;
          return (
            <span
              className={`font-mono-num font-semibold ${pos ? 'text-[#16A36A]' : 'text-[#DC4545]'}`}
            >
              {pos ? '+' : ''}
              {formatQty(row.original.quantity_milli, row.original.base_unit)}
            </span>
          );
        },
      },
      {
        id: 'solde',
        header: 'Avant → Après',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs text-[#667085] dark:text-slate-400">
            {formatQty(row.original.stock_before_milli)} →{' '}
            {formatQty(row.original.stock_after_milli)} {row.original.base_unit}
          </span>
        ),
      },
      {
        accessorKey: 'reason',
        header: 'Motif / Document',
        cell: ({ row }) => (
          <div className="text-xs">
            <div className="text-[#182230] dark:text-slate-200">{row.original.reason || '—'}</div>
            {row.original.reference_document && (
              <div className="font-mono-num text-[11px] text-[#2563EB] dark:text-[#60A5FA]">
                {row.original.reference_document}
              </div>
            )}
          </div>
        ),
      },
    ],
    []
  );

  return (
    <DataTable
      data={movements}
      columns={columns as ColumnDef<StockMovementRow, unknown>[]}
      emptyMessage="Aucun mouvement de stock enregistré."
    />
  );
}
