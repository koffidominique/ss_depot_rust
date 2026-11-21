import { Archive, ArchiveRestore, History, PencilLine } from 'lucide-react';
import { formatFcfa } from '../../../utils/format.ts';

/* ============================================================================
 * Types & Colonnes d'administration du catalogue central
 * ============================================================================ */

export interface CatalogueBrand {
  id: number;
  code: string;
  name: string;
}

export interface CatalogueProduct {
  id: number;
  code: string;
  name: string;
  barcode: string | null;
  brand_id: number | null;
  brand_name: string | null;
  family_name: string | null;
  crate_type_name: string | null;
  unit_price: number;
  is_active: number;
  is_sellable: number;
}

export interface PriceHistoryEntry {
  id: number;
  reference_price: number;
  reason: string | null;
  changed_by: string | null;
  created_at: string;
}

export type EditCataloguePriceState = {
  id: number;
  code: string;
  name: string;
  price: number;
};

export function buildCatalogueColumns(options: {
  archivePending: boolean;
  onEditPrice: (product: CatalogueProduct) => void;
  onShowHistory: (product: CatalogueProduct) => void;
  onToggleActive: (id: number, active: boolean) => void;
}) {
  const { archivePending, onEditPrice, onShowHistory, onToggleActive } = options;

  return [
    { header: 'Code', accessorKey: 'code' },
    { header: 'Référence', accessorKey: 'name' },
    { header: 'Marque', accessorKey: 'brand_name' },
    { header: 'Famille', accessorKey: 'family_name' },
    {
      header: 'Prix de référence',
      accessorKey: 'unit_price',
      cell: ({ row }: { row: { original: CatalogueProduct } }) =>
        formatFcfa(row.original.unit_price),
    },
    {
      header: 'Statut',
      accessorKey: 'is_active',
      cell: ({ row }: { row: { original: CatalogueProduct } }) => (
        <span
          className={
            row.original.is_active === 1
              ? 'rounded px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700'
              : 'rounded px-2 py-0.5 text-xs bg-slate-200 text-slate-600'
          }
        >
          {row.original.is_active === 1 ? 'Active' : 'Archivée'}
        </span>
      ),
    },
    {
      header: 'Actions',
      id: 'actions',
      cell: ({ row }: { row: { original: CatalogueProduct } }) => {
        const p = row.original;
        return (
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Modifier le prix de référence"
              onClick={() => onEditPrice(p)}
              className="rounded p-1.5 hover:bg-slate-100"
            >
              <PencilLine className="h-3.5 w-3.5 text-blue-600" />
            </button>
            <button
              type="button"
              title="Historique des prix"
              onClick={() => onShowHistory(p)}
              className="rounded p-1.5 hover:bg-slate-100"
            >
              <History className="h-3.5 w-3.5 text-slate-500" />
            </button>
            {p.is_active === 1 ? (
              <button
                type="button"
                title="Archiver"
                disabled={archivePending}
                onClick={() => onToggleActive(p.id, false)}
                className="rounded p-1.5 hover:bg-slate-100"
              >
                <Archive className="h-3.5 w-3.5 text-amber-600" />
              </button>
            ) : (
              <button
                type="button"
                title="Réactiver"
                disabled={archivePending}
                onClick={() => onToggleActive(p.id, true)}
                className="rounded p-1.5 hover:bg-slate-100"
              >
                <ArchiveRestore className="h-3.5 w-3.5 text-emerald-600" />
              </button>
            )}
          </div>
        );
      },
    },
  ];
}
