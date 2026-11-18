import { useState } from 'react';
import { Lock, Printer, Unlock } from 'lucide-react';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import { formatDateTime, formatFcfa } from '../utils/format.ts';
import { useCashMutations, useCashQuery } from '../features/cash/hooks/useCashData.ts';
import { CashSummaryCards } from '../features/cash/components/CashSummaryCards.tsx';
import { CashMovementsTable } from '../features/cash/components/CashMovementsTable.tsx';
import { CashSessionsTable } from '../features/cash/components/CashSessionsTable.tsx';
import { OpenCashModal } from '../features/cash/components/OpenCashModal.tsx';
import { CloseCashModal } from '../features/cash/components/CloseCashModal.tsx';

export function CashPage() {
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useCashQuery();

  const { openMut, closeMut } = useCashMutations({
    activeSessionId: data?.activeSession?.id ?? null,
    onOpened: () => {
      setOpenModal(false);
      setErrorMsg(null);
    },
    onClosed: () => {
      setCloseModal(false);
      setErrorMsg(null);
    },
    onError: setErrorMsg,
  });

  if (isLoading) return <LoadingState rows={5} />;
  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Erreur chargement caisse.'}
        onRetry={() => refetch()}
      />
    );
  }

  const { activeSession, summary, history } = data;
  const theoreticalCash = summary?.theoreticalCash ?? 0;
  const digitalNetBig = (summary?.byMethod || [])
    .filter((m) => m.is_cash === 0)
    .reduce(
      (acc, m) => acc + (BigInt(Math.trunc(m.total_in)) - BigInt(Math.trunc(m.total_out))),
      0n
    );
  const digitalNet =
    digitalNetBig <= BigInt(Number.MAX_SAFE_INTEGER) &&
    digitalNetBig >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(digitalNetBig)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-base font-semibold">
              {activeSession
                ? `Session active · ${activeSession.reference}`
                : 'Aucune session de caisse ouverte'}
            </h2>
            <StatusBadge status={activeSession ? 'open' : 'closed'} />
          </div>
          <p className="mt-1 text-xs text-[#667085] dark:text-slate-400">
            {activeSession
              ? `Ouverte le ${formatDateTime(activeSession.opened_at)} · Fond initial ${formatFcfa(activeSession.opening_cash)}`
              : 'Ouvrez une session de caisse pour encaisser les ventes, règlements et dépenses.'}
          </p>
        </div>

        {activeSession ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setPrintDoc({
                  docType: 'RAPPORT DE CAISSE',
                  reference: activeSession.reference,
                  date: activeSession.opened_at,
                  statusLabel: 'Session ouverte',
                  lines: (summary?.byMethod || []).map((m) => ({
                    label: m.label,
                    sublabel:
                      m.is_cash === 1
                        ? 'Espèces physiques (tiroir)'
                        : 'Canal digital (hors tiroir)',
                    quantity: `Entrées ${formatFcfa(m.total_in)} · Sorties ${formatFcfa(m.total_out)}`,
                    unitPrice: null,
                    total: m.total_in - m.total_out,
                  })),
                  summaryRows: [
                    {
                      label: 'Fond de caisse initial',
                      value: formatFcfa(activeSession.opening_cash),
                    },
                    {
                      label: 'Espèces théoriques tiroir',
                      value: formatFcfa(theoreticalCash),
                      bold: true,
                      tone: 'success',
                    },
                    { label: 'Solde net canaux digitaux', value: formatFcfa(digitalNet) },
                  ],
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Printer className="h-3.5 w-3.5" />
              Rapport de caisse
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setCloseModal(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-[#182230] dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 hover:opacity-90"
            >
              <Lock className="h-3.5 w-3.5" />
              Clôturer la caisse
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setOpenModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Unlock className="h-3.5 w-3.5" />
            Ouvrir une session de caisse
          </button>
        )}
      </div>

      {activeSession && summary && (
        <>
          <CashSummaryCards
            summary={summary}
            theoreticalCash={theoreticalCash}
            digitalNet={digitalNet}
          />
          <CashMovementsTable
            sessionReference={activeSession.reference}
            movements={summary.movements}
          />
        </>
      )}

      <CashSessionsTable history={history} onPrintSession={setPrintDoc} />

      <OpenCashModal
        open={openModal}
        onOpenChange={setOpenModal}
        error={errorMsg}
        isPending={openMut.isPending}
        onSubmit={(openingCash) => openMut.mutate(openingCash)}
      />

      <CloseCashModal
        open={closeModal}
        onOpenChange={setCloseModal}
        sessionReference={activeSession?.reference}
        theoreticalCash={theoreticalCash}
        digitalNet={digitalNet}
        error={errorMsg}
        isPending={closeMut.isPending}
        onSubmit={(vals) => closeMut.mutate(vals)}
      />

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
