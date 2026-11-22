import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Edit3, Image as ImageIcon, Layers, Power, Trash2 } from 'lucide-react';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import { StatusBadge } from '../../../components/common/StatusBadge.tsx';
import type { Product, ProductPackaging } from '../../../types/erp.ts';
import { formatFcfa, formatQty, packagingContentsLabel } from '../../../utils/format.ts';

interface ProductsTableProps {
  items: Product[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  onEdit: (product: Product) => void;
  onManagePackagings: (product: Product, targetPkg?: ProductPackaging) => void;
  onToggleArchive: (product: Product) => void;
  canDelete?: boolean;
  onDelete?: (product: Product) => void;
}

export function ProductsTable({
  items,
  page,
  totalPages,
  total,
  onPageChange,
  onEdit,
  onManagePackagings,
  onToggleArchive,
  canDelete = false,
  onDelete,
}: ProductsTableProps) {
  const columns: ColumnDef<Product>[] = [
    {
      accessorKey: 'reference',
      header: 'Référence',
      cell: ({ row }) => (
        <div>
          <div className="font-mono-num text-xs font-semibold text-[#182230] dark:text-slate-100">
            {row.original.reference}
          </div>
          {row.original.barcode && (
            <div className="font-mono-num text-[11px] text-[#667085] dark:text-slate-400">
              {row.original.barcode}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Produit',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.image_path ? (
            <img
              src={row.original.image_path}
              alt={row.original.name}
              loading="lazy"
              className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 object-cover shrink-0 bg-slate-50"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-400 shrink-0">
              <ImageIcon className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-medium text-[#182230] dark:text-slate-100 truncate">
              {row.original.name}
              {row.original.variant_label ? (
                <span className="ml-1.5 text-xs font-normal text-[#667085] dark:text-slate-400">
                  ({row.original.variant_label})
                </span>
              ) : null}
            </div>
            <div className="text-xs text-[#667085] dark:text-slate-400 truncate">
              {row.original.category_name}
              {row.original.brewery_name ? ` · ${row.original.brewery_name}` : ''}
              {row.original.brand ? ` · ${row.original.brand}` : ''}
              {row.original.supplier_name ? ` · ${row.original.supplier_name}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'stock_milli',
      header: 'Stock actuel',
      cell: ({ row }) => {
        const low = row.original.stock_milli <= row.original.min_stock_milli;
        return (
          <div className="font-mono-num">
            <span
              className={`font-semibold ${
                row.original.stock_milli <= 0
                  ? 'text-[#DC4545]'
                  : low
                    ? 'text-[#D9901A]'
                    : 'text-[#16A36A] dark:text-emerald-400'
              }`}
            >
              {formatQty(row.original.stock_milli, row.original.base_unit)}
            </span>
            <div className="text-[11px] text-[#667085] dark:text-slate-400">
              Seuil : {formatQty(row.original.min_stock_milli, row.original.base_unit)}
            </div>
          </div>
        );
      },
    },
    {
      id: 'packagings',
      header: 'Conditionnements & tarifs détail',
      cell: ({ row }) => (
        <div className="space-y-0.5 text-xs">
          {row.original.packagings.map((pk) => (
            <button
              key={pk.id}
              type="button"
              onClick={() => onManagePackagings(row.original, pk)}
              title={`Modifier ${pk.name}`}
              className={`flex items-center gap-2 rounded px-1 -mx-1 py-0.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                pk.is_active
                  ? 'text-[#182230] dark:text-slate-300'
                  : 'opacity-50 line-through text-[#667085]'
              }`}
            >
              <span className="font-medium capitalize">{pk.name}</span>
              <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 tabular-nums">
                {packagingContentsLabel(pk.name, row.original.base_unit, pk.coefficient_milli)}
              </span>
              <span className="font-mono-num text-[#2563EB] dark:text-[#60A5FA]">
                {formatFcfa(pk.retail_price)}
              </span>
              {pk.deposit_mode === 'deposit' && (
                <span className="text-[11px] text-[#D9901A] dark:text-amber-400">
                  Consigné
                  {((pk.bottle_deposit_amount ?? 0) > 0 || (pk.package_deposit_amount ?? 0) > 0)
                    ? ` (${formatFcfa((pk.bottle_deposit_amount ?? 0) + (pk.package_deposit_amount ?? 0))})`
                    : ''}
                </span>
              )}
            </button>
          ))}
          {row.original.sales_units && row.original.sales_units.length > 0 && (
            <div className="text-[11px] text-[#667085] dark:text-slate-400 pt-0.5">
              +{row.original.sales_units.length} unité{row.original.sales_units.length > 1 ? 's' : ''} de vente V4
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.is_active ? 'active' : 'archived'} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(row.original)}
            title="Modifier le produit"
            className="rounded-md border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onManagePackagings(row.original)}
            title="Configurer les conditionnements"
            className="rounded-md border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onToggleArchive(row.original)}
            title={row.original.is_active ? 'Archiver' : 'Réactiver'}
            className={`rounded-md border p-1.5 transition-colors ${
              row.original.is_active
                ? 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                : 'border-emerald-200 dark:border-emerald-800 text-[#16A36A] dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
            }`}
          >
            {row.original.is_active ? (
              <Archive className="h-3.5 w-3.5" />
            ) : (
              <Power className="h-3.5 w-3.5" />
            )}
          </button>
          {canDelete && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(row.original)}
              title="Supprimer définitivement (Owner)"
              aria-label={`Supprimer ${row.original.name}`}
              className="rounded-md border border-rose-200 dark:border-rose-900/60 p-1.5 text-[#DC4545] dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      data={items}
      columns={columns as ColumnDef<Product, unknown>[]}
      page={page}
      totalPages={totalPages}
      total={total}
      onPageChange={onPageChange}
      emptyMessage="Aucun produit ne correspond aux filtres sélectionnés."
    />
  );
}
