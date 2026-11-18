import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Edit3, Eye, ShieldAlert } from 'lucide-react';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import { StatusBadge } from '../../../components/common/StatusBadge.tsx';
import type { Client } from '../../../types/erp.ts';
import { formatFcfa } from '../../../utils/format.ts';

interface ClientsTableProps {
  clients: Client[];
  onEdit: (client: Client) => void;
  onDetail: (client: Client) => void;
  onEditCredit: (client: Client) => void;
}

export function ClientsTable({
  clients,
  onEdit,
  onDetail,
  onEditCredit,
}: ClientsTableProps) {
  const columns = useMemo<ColumnDef<Client>[]>(
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
        header: 'Client',
        cell: ({ row }) => (
          <div>
            <div className="flex items-center gap-2 font-medium">
              <span>{row.original.name}</span>
              {row.original.is_active === 0 && <StatusBadge status="archived" />}
            </div>
            <div className="text-xs text-[#667085] dark:text-slate-400 capitalize">
              {row.original.client_type}
              {row.original.phone ? ` · ${row.original.phone}` : ''}
              {row.original.city ? ` · ${row.original.city}` : ''}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'credit_policy',
        header: 'Politique de crédit',
        cell: ({ row }) => {
          const p = row.original.credit_policy;
          if (p === 'forbidden') return <span className="text-xs text-[#667085]">Crédit interdit</span>;
          if (p === 'unlimited')
            return <span className="text-xs font-medium text-[#2563EB]">Crédit sans plafond</span>;
          return (
            <span className="font-mono-num text-xs font-medium text-[#182230] dark:text-slate-200">
              Plafond {formatFcfa(row.original.credit_limit)} · {row.original.payment_terms_days}j
            </span>
          );
        },
      },
      {
        accessorKey: 'unpaid_balance',
        header: 'Solde créances',
        cell: ({ row }) => (
          <span
            className={`font-mono-num font-semibold ${
              row.original.unpaid_balance > 0 ? 'text-[#D9901A]' : 'text-[#667085]'
            }`}
          >
            {formatFcfa(row.original.unpaid_balance)}
          </span>
        ),
      },
      {
        accessorKey: 'returnable_pieces_due',
        header: 'Vides dus',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs">
            {row.original.returnable_pieces_due} pièce(s)
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
              <Eye className="h-3.5 w-3.5" />
              Fiche
            </button>
            <button
              type="button"
              onClick={() => onEditCredit(row.original)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              Crédit
            </button>
          </div>
        ),
      },
    ],
    [onEdit, onDetail, onEditCredit]
  );

  return <DataTable data={clients} columns={columns as ColumnDef<Client, unknown>[]} />;
}
