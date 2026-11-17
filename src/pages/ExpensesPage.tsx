import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Receipt, X } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { MetricCard } from '../components/common/MetricCard.tsx';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import { formatDate, formatFcfa, newRequestKey } from '../utils/format.ts';

interface ExpenseRow {
  id: number;
  reference: string;
  category: string;
  amount: number;
  method_code: string;
  method_label: string;
  beneficiary: string | null;
  notes: string | null;
  expense_date: string;
}

export function ExpensesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('Transport & Livraison');
  const [amount, setAmount] = useState(0);
  const [methodCode, setMethodCode] = useState('cash');
  const [beneficiary, setBeneficiary] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => apiClient.listExpenses(),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const activeMethods = (settingsData?.paymentMethods || []).filter((m) => m.active === 1);
  const items = (data?.items || []) as unknown as ExpenseRow[];
  const categories = data?.categories || [];

  const createMut = useMutation({
    mutationFn: () =>
      apiClient.createExpense({
        request_key: newRequestKey('exp'),
        category,
        amount,
        method_code: methodCode,
        beneficiary: beneficiary || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      setOpen(false);
      setAmount(0);
      setBeneficiary('');
      setNotes('');
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur enregistrement dépense.'),
  });

  const totalExpenses = items.reduce((s, e) => s + e.amount, 0);

  const columns: ColumnDef<ExpenseRow>[] = [
    {
      accessorKey: 'reference',
      header: 'Référence',
      cell: ({ row }) => (
        <div>
          <div className="font-mono-num text-xs font-semibold">{row.original.reference}</div>
          <div className="font-mono-num text-[11px] text-[#667085]">{formatDate(row.original.expense_date)}</div>
        </div>
      ),
    },
    { accessorKey: 'category', header: 'Catégorie' },
    {
      accessorKey: 'beneficiary',
      header: 'Bénéficiaire',
      cell: ({ row }) => row.original.beneficiary || '—',
    },
    {
      accessorKey: 'method_label',
      header: 'Moyen de paiement',
      cell: ({ row }) => <span className="text-xs font-medium">{row.original.method_label}</span>,
    },
    {
      accessorKey: 'amount',
      header: 'Montant',
      cell: ({ row }) => (
        <span className="font-mono-num font-semibold text-[#DC4545]">{formatFcfa(row.original.amount)}</span>
      ),
    },
    {
      accessorKey: 'notes',
      header: 'Notes',
      cell: ({ row }) => <span className="text-xs text-[#667085]">{row.original.notes || '—'}</span>,
    },
  ];

  if (isLoading) return <LoadingState rows={5} />;
  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Erreur chargement dépenses.'}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard
          label="Total des dépenses enregistrées"
          value={formatFcfa(totalExpenses)}
          hint={`${items.length} opération(s) imputée(s) en caisse`}
          icon={<Receipt className="h-4 w-4" />}
        />
        <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
          <div>
            <div className="font-display text-sm font-semibold">Nouvelle dépense d'exploitation</div>
            <p className="mt-1 text-xs text-[#667085] dark:text-slate-400">
              Liée automatiquement à la session de caisse ouverte.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (categories.length > 0) setCategory(categories[0].name);
              setAmount(0);
              setErrorMsg(null);
              setOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            Ajouter une dépense
          </button>
        </div>
      </div>

      <DataTable
        data={items}
        columns={columns as ColumnDef<ExpenseRow, unknown>[]}
        emptyMessage="Aucune dépense enregistrée pour le moment."
      />

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Enregistrer une dépense
              </Dialog.Title>
              <div className="flex items-center gap-2">
                <FormTipsButton topicId="expenses" label="Aide dépense" />
                <Dialog.Close className="rounded-lg p-1 text-slate-400">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
            </div>
            {errorMsg && (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-[#DC4545]">{errorMsg}</div>
            )}
            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-medium">Catégorie *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  {categories.length === 0 && <option value="Frais généraux">Frais généraux</option>}
                </select>
              </div>
              <MoneyInput label="Montant de la dépense *" value={amount} onChange={setAmount} />
              <div>
                <label className="block font-medium">Moyen de décaissement *</label>
                <select
                  value={methodCode}
                  onChange={(e) => setMethodCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                >
                  {activeMethods.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium">Bénéficiaire (optionnel)</label>
                <input
                  type="text"
                  value={beneficiary}
                  onChange={(e) => setBeneficiary(e.target.value)}
                  placeholder="Ex : Chauffeur, CIE, Propriétaire"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-medium">Notes / Justificatif</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
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
                disabled={createMut.isPending || amount <= 0}
                onClick={() => createMut.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                Valider la dépense
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
