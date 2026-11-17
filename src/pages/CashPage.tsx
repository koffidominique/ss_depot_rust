import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef } from '@tanstack/react-table';
import { Banknote, Download, Landmark, Lock, Printer, Smartphone, Unlock, X } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { MetricCard } from '../components/common/MetricCard.tsx';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { CashSession } from '../types/erp.ts';
import { exportCashMovementsCsv, exportCashSessionsCsv } from '../utils/csv.ts';
import { formatDateTime, formatFcfa, newRequestKey } from '../utils/format.ts';

const openCashSchema = z.object({
  opening_cash: z.number().int().min(0, 'Le fond de caisse doit être positif ou nul.'),
});
type OpenCashFormValues = z.infer<typeof openCashSchema>;

type CloseCashFormValues = {
  physical_cash: number;
  closing_notes: string;
};

export function CashPage() {
  const qc = useQueryClient();
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const theoreticalCashRef = useRef(0);

  const openForm = useForm<OpenCashFormValues>({
    resolver: zodResolver(openCashSchema),
    defaultValues: { opening_cash: 0 },
  });

  const closeCashSchema = useRef(
    z
      .object({
        physical_cash: z.number().int().min(0, 'Le montant physique doit être positif ou nul.'),
        closing_notes: z.string(),
      })
      .superRefine((vals, ctx) => {
        if (vals.physical_cash !== theoreticalCashRef.current && !vals.closing_notes.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['closing_notes'],
            message: 'Un commentaire justificatif est obligatoire lorsque la caisse présente un écart.',
          });
        }
      })
  ).current;

  const closeForm = useForm<CloseCashFormValues>({
    resolver: zodResolver(closeCashSchema),
    defaultValues: { physical_cash: 0, closing_notes: '' },
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cash'],
    queryFn: () => apiClient.getCashStatus(),
  });

  const openMut = useMutation({
    mutationFn: (vals: OpenCashFormValues) =>
      apiClient.openCashSession({ opening_cash: vals.opening_cash, request_key: newRequestKey('open') }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setOpenModal(false);
      openForm.reset({ opening_cash: 0 });
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur ouverture caisse.'),
  });

  const closeMut = useMutation({
    mutationFn: (vals: CloseCashFormValues) => {
      if (!data?.activeSession) throw new Error('Aucune session ouverte');
      return apiClient.closeCashSession({
        session_id: data.activeSession.id,
        physical_cash: vals.physical_cash,
        closing_notes: vals.closing_notes.trim(),
        request_key: newRequestKey('close'),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setCloseModal(false);
      closeForm.reset({ physical_cash: 0, closing_notes: '' });
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur clôture caisse.'),
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
  theoreticalCashRef.current = theoreticalCash;
  const digitalNet = (summary?.byMethod || [])
    .filter((m) => m.is_cash === 0)
    .reduce((acc, m) => acc + (m.total_in - m.total_out), 0);
  const physicalCashWatched = closeForm.watch('physical_cash');
  const diffPreview = physicalCashWatched - theoreticalCash;

  const movementCols: ColumnDef<NonNullable<typeof summary>['movements'][number]>[] = [
    {
      accessorKey: 'created_at',
      header: 'Heure',
      cell: ({ row }) => <span className="font-mono-num text-xs">{formatDateTime(row.original.created_at)}</span>,
    },
    { accessorKey: 'description', header: 'Opération' },
    {
      accessorKey: 'method_label',
      header: 'Moyen',
      cell: ({ row }) => (
        <span className="text-xs font-medium">
          {row.original.method_label} {row.original.is_cash === 1 ? '(Espèces)' : '(Digital)'}
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
        <span className="font-mono-num text-xs text-[#667085]">{row.original.reference_document || '—'}</span>
      ),
    },
  ];

  const historyCols: ColumnDef<CashSession>[] = [
    {
      accessorKey: 'reference',
      header: 'Session',
      cell: ({ row }) => <span className="font-mono-num text-xs font-semibold">{row.original.reference}</span>,
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
      cell: ({ row }) => <span className="font-mono-num">{formatFcfa(row.original.opening_cash)}</span>,
    },
    {
      accessorKey: 'theoretical_cash',
      header: 'Théorique',
      cell: ({ row }) => <span className="font-mono-num">{formatFcfa(row.original.theoretical_cash)}</span>,
    },
    {
      accessorKey: 'physical_cash',
      header: 'Compté',
      cell: ({ row }) => <span className="font-mono-num font-semibold">{formatFcfa(row.original.physical_cash)}</span>,
    },
    {
      accessorKey: 'difference',
      header: 'Écart',
      cell: ({ row }) => {
        const d = row.original.difference ?? 0;
        return (
          <span className={`font-mono-num font-semibold ${d === 0 ? 'text-[#16A36A]' : 'text-[#D9901A]'}`}>
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
              setPrintDoc({
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
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-base font-semibold">
              {activeSession ? `Session active · ${activeSession.reference}` : 'Aucune session de caisse ouverte'}
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
                    sublabel: m.is_cash === 1 ? 'Espèces physiques (tiroir)' : 'Canal digital (hors tiroir)',
                    quantity: `Entrées ${formatFcfa(m.total_in)} · Sorties ${formatFcfa(m.total_out)}`,
                    unitPrice: null,
                    total: m.total_in - m.total_out,
                  })),
                  summaryRows: [
                    { label: 'Fond de caisse initial', value: formatFcfa(activeSession.opening_cash) },
                    { label: 'Espèces théoriques tiroir', value: formatFcfa(theoreticalCash), bold: true, tone: 'success' },
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
                closeForm.reset({ physical_cash: theoreticalCash, closing_notes: '' });
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
              openForm.reset({ opening_cash: 0 });
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard
              label="Espèces théoriques en tiroir"
              value={formatFcfa(theoreticalCash)}
              hint="Fond initial + entrées espèces - sorties espèces"
              icon={<Banknote className="h-4 w-4" />}
              tone="success"
            />
            <MetricCard
              label="Encaissements digitaux (session)"
              value={formatFcfa(digitalNet)}
              hint="Wave, Orange Money, MTN Money, Virement — hors tiroir espèces"
              icon={<Smartphone className="h-4 w-4" />}
            />
            <MetricCard
              label="Moyens actifs sur la session"
              value={String(summary.byMethod.length)}
              hint="Ventilation stricte espèces vs mobile money"
              icon={<Landmark className="h-4 w-4" />}
            />
          </div>

          {summary.byMethod.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {summary.byMethod.map((m) => (
                <div
                  key={m.method_code}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4"
                >
                  <div className="flex items-center justify-between text-xs text-[#667085] dark:text-slate-400">
                    <span className="font-medium text-[#182230] dark:text-slate-200">{m.label}</span>
                    <span>{m.is_cash === 1 ? 'Espèces' : 'Digital'}</span>
                  </div>
                  <div className="mt-2 font-mono-num text-lg font-bold text-[#182230] dark:text-slate-100">
                    {formatFcfa(m.total_in - m.total_out)}
                  </div>
                  <div className="mt-1 flex justify-between font-mono-num text-[11px] text-[#667085]">
                    <span>Entrées : {formatFcfa(m.total_in)}</span>
                    <span>Sorties : {formatFcfa(m.total_out)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold">Mouvements de la session en cours</h3>
              <button
                type="button"
                disabled={summary.movements.length === 0}
                onClick={() => exportCashMovementsCsv(activeSession.reference, summary.movements)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                CSV Mouvements
              </button>
            </div>
            <DataTable
              data={summary.movements}
              columns={movementCols as ColumnDef<NonNullable<typeof summary>['movements'][number], unknown>[]}
              emptyMessage="Aucun mouvement enregistré sur cette session."
            />
          </div>
        </>
      )}

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
          columns={historyCols as ColumnDef<CashSession, unknown>[]}
          emptyMessage="Aucune session clôturée pour le moment."
        />
      </div>

      {/* Modal ouverture */}
      <Dialog.Root open={openModal} onOpenChange={setOpenModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">Ouvrir la caisse</Dialog.Title>
              <div className="flex items-center gap-2">
                <FormTipsButton topicId="cash" label="Aide caisse" />
                <Dialog.Close className="rounded-lg p-1 text-slate-400">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
            </div>
            {errorMsg && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-[#DC4545]">{errorMsg}</div>}
            <form onSubmit={openForm.handleSubmit((vals) => openMut.mutate(vals))} noValidate>
              <div className="mt-4">
                <Controller
                  control={openForm.control}
                  name="opening_cash"
                  render={({ field, fieldState }) => (
                    <MoneyInput
                      label="Fond de caisse initial en espèces"
                      value={field.value}
                      onChange={field.onChange}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Dialog.Close asChild>
                  <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                    Annuler
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={openMut.isPending}
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Confirmer l'ouverture
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal clôture */}
      <Dialog.Root open={closeModal} onOpenChange={setCloseModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Clôture de caisse · {activeSession?.reference}
              </Dialog.Title>
              <div className="flex items-center gap-2">
                <FormTipsButton topicId="cash" label="Règle clôture" />
                <Dialog.Close className="rounded-lg p-1 text-slate-400">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
            </div>
            {errorMsg && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-[#DC4545]">{errorMsg}</div>}
            <form onSubmit={closeForm.handleSubmit((vals) => closeMut.mutate(vals))} noValidate>
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#667085]">Espèces théoriques attendues</span>
                    <span className="font-mono-num font-semibold">{formatFcfa(theoreticalCash)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#667085]">Encaissements digitaux (contrôle)</span>
                    <span className="font-mono-num">{formatFcfa(digitalNet)}</span>
                  </div>
                </div>
                <Controller
                  control={closeForm.control}
                  name="physical_cash"
                  render={({ field, fieldState }) => (
                    <MoneyInput
                      label="Espèces physiques comptées *"
                      value={field.value}
                      onChange={field.onChange}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <div className="flex justify-between text-xs">
                  <span className="text-[#667085]">Écart constaté</span>
                  <span className={`font-mono-num font-semibold ${diffPreview === 0 ? 'text-[#16A36A]' : 'text-[#D9901A]'}`}>
                    {diffPreview > 0 ? '+' : ''}
                    {formatFcfa(diffPreview)}
                  </span>
                </div>
                <div>
                  <label htmlFor="cash-closing-notes" className="block text-xs font-medium">
                    Commentaire de clôture {diffPreview !== 0 ? '(obligatoire car écart != 0) *' : '(optionnel)'}
                  </label>
                  <textarea
                    id="cash-closing-notes"
                    rows={2}
                    aria-invalid={Boolean(closeForm.formState.errors.closing_notes)}
                    {...closeForm.register('closing_notes')}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                  />
                  {closeForm.formState.errors.closing_notes && (
                    <p className="mt-1 text-[11px] text-[#DC4545]" role="alert">
                      {closeForm.formState.errors.closing_notes.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Dialog.Close asChild>
                  <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                    Annuler
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={closeMut.isPending}
                  className="rounded-lg bg-[#182230] dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-50"
                >
                  Clôturer définitivement
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
