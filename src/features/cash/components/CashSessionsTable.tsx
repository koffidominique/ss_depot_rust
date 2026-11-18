import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Printer } from 'lucide-react';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import type { PrintableDocumentData } from '../../../components/documents/DocumentPrintModal.tsx';
import type { CashSession } from '../../../types/erp.ts';
import { exportCashSessionsCsv } from '../../../utils/csv.ts';
import { formatDateTime, formatFcfa } from '../../../utils/format.ts';

interface CashSessionsTableProps {
  history: CashSession[];
  onPrintSession: (doc: PrintableDocumentData) => void;
}

export function CashSessionsTable({ history, onPrintSession }: CashSessionsTableProps) {
  const columns = useMemo<ColumnDef<CashSession>[]>(
    () => [
      {
        accessorKey: 'reference',
        header: 'Session',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs font-semibold">{row.original.reference}</span>
        ),
      },
      {
        accessorKey: 'opened_at',
        header: 'Période',
        cell: ({ row }) => (
          <div className="font-mono-num text-xs text-[#667085]">
            {formatDateTime(row.original.opened_at)} → {formatDateTime(row.original.closed_at)}
          </div>
        ),
      },
      {
        accessorKey: 'opening_cash',
        header: 'Fond initial',
        cell: ({ row }) => (
          <span className="font-mono-num">{formatFcfa(row.original.opening_cash)}</span>
        ),
      },
      {
        accessorKey: 'theoretical_cash',
        header: 'Théorique',
        cell: ({ row }) => (
          <span className="font-mono-num">{formatFcfa(row.original.theoretical_cash)}</span>
        ),
      },
      {
        accessorKey: 'physical_cash',
        header: 'Compté',
        cell: ({ row }) => (
          <span className="font-mono-num font-semibold">
            {formatFcfa(row.original.physical_cash)}
          </span>
        ),
      },
      {
        accessorKey: 'difference',
        header: 'Écart',
        cell: ({ row }) => {
          const d = row.original.difference ?? 0;
          return (
            <span
              className={`font-mono-num font-semibold ${
                d === 0 ? 'text-[#16A36A]' : 'text-[#D9901A]'
              }`}
            >
              {d > 0 ? '+' : ''}
              {formatFcfa(d)}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const s = row.original;
          const d = s.difference ?? 0;
          return (
            <button
              type="button"
              onClick={() =>
                onPrintSession({
                  docType: 'RAPPORT DE CAISSE',
                  reference: s.reference,
                  date: s.closed_at || s.opened_at,
                  statusLabel: 'Session clôturée',
                  notes: s.closing_notes,
                  lines: [
                    {
                      label: 'Fond de caisse initial',
                      sublabel: `Ouverte le ${formatDateTime(s.opened_at)}`,
                      quantity: 'Ouverture',
                      unitPrice: null,
                      total: s.opening_cash,
                    },
                    {
                      label: 'Espèces théoriques attendues',
                      sublabel: 'Hors canaux digitaux',
                      quantity: 'Calculé',
                      unitPrice: null,
                      total: s.theoretical_cash ?? 0,
                    },
                    {
                      label: 'Espèces physiques comptées',
                      sublabel: `Clôturée le ${formatDateTime(s.closed_at)}`,
                      quantity: 'Comptage',
                      unitPrice: null,
                      total: s.physical_cash ?? 0,
                    },
                  ],
                  summaryRows: [
                    { label: 'Théorique tiroir', value: formatFcfa(s.theoretical_cash) },
                    { label: 'Physique compté', value: formatFcfa(s.physical_cash), bold: true },
                    {
                      label: 'Écart constaté',
                      value: `${d > 0 ? '+' : ''}${formatFcfa(d)}`,
                      bold: true,
                      tone: d === 0 ? 'success' : 'warning',
                    },
                  ],
                })
              }
              className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 px-2 py-1 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Printer className="h-3 w-3" />
              Rapport
            </button>
          );
        },
      },
    ],
    [onPrintSession]
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold">Historique des sessions clôturées</h3>
        <button
          type="button"
          disabled={history.length === 0}
          onClick={() => exportCashSessionsCsv(history)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          CSV Sessions
        </button>
      </div>
      <DataTable
        data={history}
        columns={columns as ColumnDef<CashSession, unknown>[]}
        emptyMessage="Aucune session clôturée pour le moment."
      />
    </div>
  );
}
