import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Eye, Image as ImageIcon, Plus, Receipt, Trash2, X } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { MetricCard } from '../components/common/MetricCard.tsx';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { ExpenseItem } from '../types/erp.ts';
import { exportExpensesCsv } from '../utils/csv.ts';
import { compressLocalImage } from '../utils/image.ts';
import { formatDate, formatFcfa, newRequestKey } from '../utils/format.ts';

const expenseSchema = z.object({
  category: z.string().trim().min(1, 'La catégorie est obligatoire.'),
  amount: z.number().int('Montant entier FCFA requis.').positive('Le montant doit être supérieur à 0 FCFA.'),
  method_code: z.string().trim().min(1, 'Choisissez un moyen de paiement.'),
  beneficiary: z.string().optional(),
  notes: z.string().optional(),
  receipt_path: z.string().nullable().optional(),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

export function ExpensesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<ExpenseItem | null>(null);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      category: 'Transport & Livraison',
      amount: 0,
      method_code: 'cash',
      beneficiary: '',
      notes: '',
      receipt_path: null,
    },
  });

  const currentReceipt = watch('receipt_path');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => apiClient.listExpenses(),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const activeMethods = (settingsData?.paymentMethods || []).filter((m) => m.active === 1);
  const allItems = data?.items || [];
  const categories = data?.categories || [];
  const items = allItems.filter((item) => {
    if (filterCategory !== 'ALL' && item.category !== filterCategory) return false;
    const day = item.expense_date.slice(0, 10);
    if (filterFrom && day < filterFrom) return false;
    if (filterTo && day > filterTo) return false;
    return true;
  });

  const createMut = useMutation({
    mutationFn: (values: ExpenseFormValues) =>
      apiClient.createExpense({
        request_key: newRequestKey('exp'),
        category: values.category,
        amount: values.amount,
        method_code: values.method_code,
        beneficiary: values.beneficiary?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
        receipt_path: values.receipt_path || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      setOpen(false);
      reset({
        category: categories[0]?.name || 'Transport & Livraison',
        amount: 0,
        method_code: activeMethods[0]?.code || 'cash',
        beneficiary: '',
        notes: '',
        receipt_path: null,
      });
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur enregistrement dépense.'),
  });

  const handleReceiptFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await compressLocalImage(file, { maxSide: 512, quality: 0.82 });
      setErrorMsg(null);
      setValue('receipt_path', dataUrl, { shouldDirty: true });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur chargement justificatif.');
    }
  };

  const totalExpenses = items.reduce((s, e) => s + e.amount, 0);

  const columns: ColumnDef<ExpenseItem>[] = [
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
    {
      id: 'receipt',
      header: 'Justificatif',
      cell: ({ row }) =>
        row.original.receipt_path ? (
          <button
            type="button"
            onClick={() => setReceiptPreview(row.original)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-[#2563EB] hover:bg-blue-50 dark:hover:bg-blue-950/30"
          >
            <Eye className="h-3.5 w-3.5" />
            Voir reçu
          </button>
        ) : (
          <span className="text-xs text-[#667085]">—</span>
        ),
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
            <div className="font-display text-sm font-semibold">Nouvelle dépense d&apos;exploitation</div>
            <p className="mt-1 text-xs text-[#667085] dark:text-slate-400">
              Liée automatiquement à la session de caisse ouverte.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              reset({
                category: categories[0]?.name || 'Frais généraux',
                amount: 0,
                method_code: activeMethods[0]?.code || 'cash',
                beneficiary: '',
                notes: '',
                receipt_path: null,
              });
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-[#667085]">Filtres :</span>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5"
          >
            <option value="ALL">Toutes catégories ({allItems.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            aria-label="Date de début"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
          />
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            aria-label="Date de fin"
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
          />
          {(filterCategory !== 'ALL' || filterFrom || filterTo) && (
            <button
              type="button"
              onClick={() => {
                setFilterCategory('ALL');
                setFilterFrom('');
                setFilterTo('');
              }}
              className="text-[#2563EB] hover:underline font-medium"
            >
              Réinitialiser
            </button>
          )}
        </div>
        <button
          type="button"
          disabled={items.length === 0}
          onClick={() => exportExpensesCsv(items)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Exporter CSV
        </button>
      </div>

      <DataTable
        data={items}
        columns={columns as ColumnDef<ExpenseItem, unknown>[]}
        emptyMessage="Aucune dépense enregistrée pour le moment."
      />

      {/* Modal Enregistrer une dépense (react-hook-form + zod + receipt_path) */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
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
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-[#DC4545]">
                {errorMsg}
              </div>
            )}
            <form
              onSubmit={handleSubmit((values) => createMut.mutate(values))}
              className="mt-4 space-y-3 text-xs"
            >
              <div>
                <label className="block font-medium">Catégorie *</label>
                <select
                  aria-label="Catégorie dépense"
                  {...register('category')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  {categories.length === 0 && <option value="Frais généraux">Frais généraux</option>}
                </select>
                {errors.category && <p className="mt-1 text-[#DC4545]">{errors.category.message}</p>}
              </div>

              <div>
                <Controller
                  name="amount"
                  control={control}
                  render={({ field }) => (
                    <MoneyInput
                      label="Montant de la dépense *"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                {errors.amount && <p className="mt-1 text-[#DC4545]">{errors.amount.message}</p>}
              </div>

              <div>
                <label className="block font-medium">Moyen de décaissement *</label>
                <select
                  aria-label="Moyen de décaissement"
                  {...register('method_code')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                >
                  {activeMethods.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.label}
                    </option>
                  ))}
                  {activeMethods.length === 0 && <option value="cash">Espèces</option>}
                </select>
                {errors.method_code && (
                  <p className="mt-1 text-[#DC4545]">{errors.method_code.message}</p>
                )}
              </div>

              <div>
                <label className="block font-medium">Bénéficiaire (optionnel)</label>
                <input
                  aria-label="Bénéficiaire dépense"
                  type="text"
                  {...register('beneficiary')}
                  placeholder="Ex : Chauffeur, CIE, Propriétaire"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                />
              </div>

              <div>
                <label className="block font-medium">Notes / Justificatif</label>
                <input
                  aria-label="Notes dépense"
                  type="text"
                  {...register('notes')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                />
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {currentReceipt ? (
                      <img
                        src={currentReceipt}
                        alt="Justificatif dépense"
                        className="h-12 w-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-white object-cover shrink-0"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[#667085] shrink-0">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                    )}
                    <div>
                      <div className="font-medium text-[#182230] dark:text-slate-100">
                        Photo du reçu / justificatif
                      </div>
                      <div className="text-[11px] text-[#667085] dark:text-slate-400">
                        PNG, JPEG ou WebP · stocké hors-ligne
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="cursor-pointer rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
                      Joindre reçu
                      <input
                        aria-label="Joindre un justificatif"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={(e) => handleReceiptFile(e.target.files?.[0])}
                      />
                    </label>
                    {currentReceipt && (
                      <button
                        type="button"
                        onClick={() => setValue('receipt_path', null)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[#DC4545] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        <Trash2 className="h-3 w-3" />
                        Retirer
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
                  >
                    Annuler
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={createMut.isPending}
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Valider la dépense
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Aperçu justificatif */}
      <Dialog.Root open={Boolean(receiptPreview)} onOpenChange={(o) => !o && setReceiptPreview(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/60" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            {receiptPreview && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Dialog.Title className="font-display text-base font-semibold">
                      Justificatif · {receiptPreview.reference}
                    </Dialog.Title>
                    <p className="mt-0.5 text-xs text-[#667085]">
                      {receiptPreview.category} · {formatFcfa(receiptPreview.amount)}
                      {receiptPreview.beneficiary ? ` · ${receiptPreview.beneficiary}` : ''}
                    </p>
                  </div>
                  <Dialog.Close className="rounded-lg p-1 text-slate-400">
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>
                {receiptPreview.receipt_path && (
                  <img
                    src={receiptPreview.receipt_path}
                    alt={`Reçu ${receiptPreview.reference}`}
                    className="w-full max-h-[65vh] rounded-lg border border-slate-200 dark:border-slate-800 object-contain bg-slate-50 dark:bg-slate-900"
                  />
                )}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
