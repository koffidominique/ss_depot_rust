import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef } from '@tanstack/react-table';
import { Wallet, Plus, Trash2, Printer, History, X, Download } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { Receivable } from '../types/erp.ts';
import { exportReceivablesCsv } from '../utils/csv.ts';
import { formatDate, formatDateTime, formatFcfa, newRequestKey } from '../utils/format.ts';

export function DebtsPage() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<Receivable | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Receivable | null>(null);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [parts, setParts] = useState<Array<{ method_code: string; amount: number }>>([
    { method_code: 'cash', amount: 0 },
  ]);
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['receivables'],
    queryFn: () => apiClient.listReceivables(),
  });
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });
  const { data: historySale } = useQuery({
    queryKey: ['sale', historyTarget?.sale_id],
    queryFn: () => apiClient.getSaleDetail(historyTarget!.sale_id),
    enabled: Boolean(historyTarget),
  });

  const activeMethods = (settingsData?.paymentMethods || []).filter((m) => m.active === 1);

  const payMutation = useMutation({
    mutationFn: () => {
      if (!target) throw new Error('Créance non sélectionnée');
      return apiClient.payReceivable(target.id, {
        request_key: newRequestKey('recpay'),
        note,
        parts: parts.filter((p) => p.amount > 0),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receivables'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      setTarget(null);
      setNote('');
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur encaissement.'),
  });

  const totalOpen = (data || []).reduce((acc, r) => acc + r.remaining_amount, 0);

  const columns: ColumnDef<Receivable>[] = [
    {
      accessorKey: 'client_name',
      header: 'Client',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.client_name}</div>
          <div className="text-xs text-[#667085]">{row.original.client_code}</div>
        </div>
      ),
    },
    {
      accessorKey: 'sale_reference',
      header: 'Facture',
      cell: ({ row }) => (
        <span className="font-mono-num text-xs font-semibold">{row.original.sale_reference}</span>
      ),
    },
    {
      accessorKey: 'initial_amount',
      header: 'Total',
      cell: ({ row }) => <span className="font-mono-num">{formatFcfa(row.original.initial_amount)}</span>,
    },
    {
      id: 'paid_amount',
      header: 'Payé',
      cell: ({ row }) => {
        const paid = Math.max(0, row.original.initial_amount - row.original.remaining_amount);
        return <span className="font-mono-num text-[#16A36A]">{formatFcfa(paid)}</span>;
      },
    },
    {
      accessorKey: 'remaining_amount',
      header: 'Reste à encaisser',
      cell: ({ row }) => (
        <span
          className={`font-mono-num font-semibold ${
            row.original.remaining_amount > 0 ? 'text-[#D9901A]' : 'text-[#16A36A]'
          }`}
        >
          {formatFcfa(row.original.remaining_amount)}
        </span>
      ),
    },
    {
      accessorKey: 'due_date',
      header: 'Échéance / Retard',
      cell: ({ row }) => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const overdue =
          row.original.due_date &&
          row.original.remaining_amount > 0 &&
          row.original.due_date < todayStr;
        const lateDays = overdue
          ? Math.max(
              1,
              Math.floor(
                (Date.parse(`${todayStr}T00:00:00Z`) - Date.parse(`${row.original.due_date}T00:00:00Z`)) /
                  86_400_000
              )
            )
          : 0;
        return (
          <span className={`font-mono-num text-xs ${overdue ? 'font-semibold text-[#DC4545]' : ''}`}>
            {formatDate(row.original.due_date)}
            {overdue ? ` (+${lateDays} j retard)` : ''}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setHistoryTarget(row.original)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <History className="h-3.5 w-3.5" />
            Paiements
          </button>
          {row.original.remaining_amount > 0 && row.original.status !== 'cancelled' && (
            <button
              type="button"
              onClick={() => {
                setTarget(row.original);
                setParts([{ method_code: 'cash', amount: row.original.remaining_amount }]);
                setErrorMsg(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A36A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Wallet className="h-3.5 w-3.5" />
              Encaisser
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-[#667085] dark:text-slate-400">
            Total des créances clients en cours :{' '}
            <span className="font-mono-num font-bold text-[#D9901A]">{formatFcfa(totalOpen)}</span>
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
              const openRecs = (data || []).filter((r) => r.remaining_amount > 0 && r.status !== 'cancelled');
              const today = new Date().toISOString().slice(0, 10);
              const overdueCount = openRecs.filter((r) => r.due_date && r.due_date < today).length;
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
        <DataTable data={data} columns={columns as ColumnDef<Receivable, unknown>[]} />
      )}

      <Dialog.Root open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Encaisser créance · {target?.sale_reference}
              </Dialog.Title>
              <FormTipsButton topicId="debts" label="Aide" />
            </div>
            <p className="mt-1 text-xs text-[#667085] dark:text-slate-400">
              {target?.client_name} · Reste dû :{' '}
              <span className="font-mono-num font-semibold">{formatFcfa(target?.remaining_amount)}</span>
            </p>
            {errorMsg && (
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-[#DC4545]">
                {errorMsg}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Paiement (simple ou mixte)</span>
                <button
                  type="button"
                  onClick={() => setParts((p) => [...p, { method_code: 'wave', amount: 0 }])}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB]"
                >
                  <Plus className="h-3 w-3" />
                  Ajouter moyen
                </button>
              </div>
              {parts.map((part, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={part.method_code}
                    onChange={(e) =>
                      setParts((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, method_code: e.target.value } : p))
                      )
                    }
                    className="w-36 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs"
                  >
                    {activeMethods.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <MoneyInput
                    value={part.amount}
                    onChange={(amt) =>
                      setParts((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, amount: amt } : p))
                      )
                    }
                    className="flex-1"
                  />
                  {parts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setParts((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-[#DC4545]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium">Observation</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={payMutation.isPending}
                onClick={() => payMutation.mutate()}
                className="rounded-lg bg-[#16A36A] px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Valider l'encaissement
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Historique des paiements sur créance */}
      <Dialog.Root open={Boolean(historyTarget)} onOpenChange={(o) => !o && setHistoryTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <Dialog.Title className="font-display text-base font-semibold">
                  Paiements · {historyTarget?.sale_reference}
                </Dialog.Title>
                <p className="mt-0.5 text-xs text-[#667085] dark:text-slate-400">
                  {historyTarget?.client_name} · Initial : {formatFcfa(historyTarget?.initial_amount)} · Reste :{' '}
                  {formatFcfa(historyTarget?.remaining_amount)}
                </p>
              </div>
              <Dialog.Close className="rounded-lg p-1 text-slate-400">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              {!historySale ? (
                <p className="text-[#667085]">Chargement de l'historique...</p>
              ) : historySale.payments.length === 0 ? (
                <p className="text-[#667085]">Aucun versement encore enregistré sur cette facture.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                  {historySale.payments.map((p, idx) => (
                    <div key={`${p.id}-${idx}`} className="flex items-center justify-between px-3 py-2.5">
                      <div>
                        <div className="font-medium">
                          <span className="font-mono-num font-semibold">{p.reference}</span> · {p.method_label}
                        </div>
                        <div className="font-mono-num text-[11px] text-[#667085]">
                          {formatDateTime(p.created_at)}
                        </div>
                      </div>
                      <span className="font-mono-num font-semibold text-[#16A36A]">
                        {formatFcfa(p.part_amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
