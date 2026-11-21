import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, PackageCheck } from 'lucide-react';
import { formatFcfa, formatNumber } from '../../../utils/format.ts';
import type { ClientBalance, OpenIssue, ReturnableType } from '../types.ts';

/* ============================================================================
 * Colonnes TanStack Table : Emballages réutilisables, Retours ouverts & Soldes
 * ============================================================================ */

export function buildTypeColumns(
  onAdjustType: (type: ReturnableType) => void
): ColumnDef<ReturnableType>[] {
  return [
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
  ];
}

export function buildIssueColumns(
  onStartReturn: (issue: OpenIssue) => void
): ColumnDef<OpenIssue>[] {
  return [
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
  ];
}

export function buildBalanceColumns(): ColumnDef<ClientBalance>[] {
  return [
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
  ];
}
