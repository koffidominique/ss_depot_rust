import { useState } from 'react';
import { Download, Plus, Receipt } from 'lucide-react';
import { MetricCard } from '../components/common/MetricCard.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { ExpenseItem } from '../types/erp.ts';
import { exportExpensesCsv } from '../utils/csv.ts';
import { formatFcfa } from '../utils/format.ts';
import {
  useCreateExpenseMutation,
  useExpensesQueries,
} from '../features/cash/hooks/useExpensesData.ts';
import { ExpensesTable } from '../features/cash/components/ExpensesTable.tsx';
import {
  ExpenseCreateModal,
  ExpenseReceiptModal,
} from '../features/cash/components/ExpenseModals.tsx';

export function ExpensesPage() {
  const [open, setOpen] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<ExpenseItem | null>(null);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { expensesQuery, activeMethods } = useExpensesQueries();
  const createMut = useCreateExpenseMutation({
    onSuccess: () => {
      setOpen(false);
      setErrorMsg(null);
    },
    onError: (msg) => setErrorMsg(msg),
  });

  const { data, isLoading, error, refetch } = expensesQuery;

  if (isLoading) return <LoadingState rows={5} />;
  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Erreur chargement dépenses.'}
        onRetry={() => refetch()}
      />
    );
  }

  const allItems = data.items || [];
  const categories = data.categories || [];
  const items = allItems.filter((item) => {
    if (filterCategory !== 'ALL' && item.category !== filterCategory) return false;
    const day = item.expense_date.slice(0, 10);
    if (filterFrom && day < filterFrom) return false;
    if (filterTo && day > filterTo) return false;
    return true;
  });

  const totalExpenses = items.reduce((s, e) => s + e.amount, 0);

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
            <div className="font-display text-sm font-semibold">
              Nouvelle dépense d&apos;exploitation
            </div>
            <p className="mt-1 text-xs text-[#667085] dark:text-slate-400">
              Liée automatiquement à la session de caisse ouverte.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
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

      <ExpensesTable items={items} onPreviewReceipt={(item) => setReceiptPreview(item)} />

      <ExpenseCreateModal
        open={open}
        onOpenChange={setOpen}
        categories={categories}
        activeMethods={activeMethods}
        errorMsg={errorMsg}
        onSetError={setErrorMsg}
        isPending={createMut.isPending}
        onSubmit={(values) => createMut.mutate(values)}
      />

      <ExpenseReceiptModal item={receiptPreview} onClose={() => setReceiptPreview(null)} />
    </div>
  );
}
