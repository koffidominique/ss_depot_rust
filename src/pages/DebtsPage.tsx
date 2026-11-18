import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { Receivable } from '../types/erp.ts';
import { exportReceivablesCsv } from '../utils/csv.ts';
import { formatDate, formatFcfa } from '../utils/format.ts';
import {
  useDebtsQueries,
  usePayReceivableMutation,
} from '../features/clients/hooks/useDebtsData.ts';
import { DebtsTable } from '../features/clients/components/DebtsTable.tsx';
import {
  DebtHistoryModal,
  DebtPayModal,
} from '../features/clients/components/DebtModals.tsx';

export function DebtsPage() {
  const [target, setTarget] = useState<Receivable | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Receivable | null>(null);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { receivablesQuery, historySaleQuery, activeMethods } = useDebtsQueries(
    historyTarget?.sale_id ?? null
  );

  const payMutation = usePayReceivableMutation({
    onSuccess: () => {
      setTarget(null);
      setErrorMsg(null);
    },
    onError: (msg) => setErrorMsg(msg),
  });

  const { data, isLoading, error, refetch } = receivablesQuery;
  const totalOpen = (data || []).reduce((acc, r) => acc + r.remaining_amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-[#667085] dark:text-slate-400">
            Total des créances clients en cours :{' '}
            <span className="font-mono-num font-bold text-[#D9901A]">
              {formatFcfa(totalOpen)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!data || data.length === 0}
            onClick={() => exportReceivablesCsv(data || [])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Exporter CSV
          </button>
          <button
            type="button"
            onClick={() => {
              const openRecs = (data || []).filter(
                (r) => r.remaining_amount > 0 && r.status !== 'cancelled'
              );
              const today = new Date().toISOString().slice(0, 10);
              const overdueCount = openRecs.filter(
                (r) => r.due_date && r.due_date < today
              ).length;
              setPrintDoc({
                docType: 'ÉTAT DES CRÉANCES CLIENTS',
                reference: `CRE-${today}`,
                date: new Date().toISOString(),
                statusLabel: `${openRecs.length} dossier(s) ouvert(s)`,
                lines: openRecs.map((r) => ({
                  label: r.client_name,
                  sublabel: `Facture ${r.sale_reference}${r.due_date ? ` · Échéance ${formatDate(r.due_date)}` : ''}`,
                  quantity: `Initial ${formatFcfa(r.initial_amount)}`,
                  unitPrice: null,
                  total: r.remaining_amount,
                })),
                summaryRows: [
                  { label: 'Dossiers ouverts', value: String(openRecs.length) },
                  {
                    label: 'Dossiers en retard',
                    value: String(overdueCount),
                    tone: overdueCount > 0 ? 'danger' : 'success',
                  },
                  {
                    label: 'Total restant à recouvrer',
                    value: formatFcfa(totalOpen),
                    bold: true,
                    tone: 'warning',
                  },
                ],
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimer état des créances
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Erreur chargement créances.'}
          onRetry={() => refetch()}
        />
      ) : (
        <DebtsTable
          receivables={data}
          onViewHistory={(rec) => setHistoryTarget(rec)}
          onOpenPay={(rec) => {
            setErrorMsg(null);
            setTarget(rec);
          }}
        />
      )}

      <DebtPayModal
        receivable={target}
        activeMethods={activeMethods}
        errorMsg={errorMsg}
        isPending={payMutation.isPending}
        onClose={() => setTarget(null)}
        onSubmit={(args) => payMutation.mutate(args)}
      />

      <DebtHistoryModal
        receivable={historyTarget}
        historySale={historySaleQuery.data}
        onClose={() => setHistoryTarget(null)}
      />

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
