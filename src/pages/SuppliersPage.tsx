import { useState } from 'react';
import { Plus } from 'lucide-react';
import { SearchInput } from '../components/forms/SearchInput.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { Supplier, SupplierDebt } from '../types/erp.ts';
import {
  useSuppliersMutations,
  useSuppliersQueries,
} from '../features/purchases/hooks/useSuppliersData.ts';
import {
  SupplierDebtsTable,
  SuppliersTable,
} from '../features/purchases/components/SuppliersTables.tsx';
import {
  SupplierCreateModal,
  SupplierEditModal,
} from '../features/purchases/components/SupplierFormModals.tsx';
import {
  SupplierDebtPayModal,
  SupplierDetailModal,
} from '../features/purchases/components/SupplierDebtAndDetailModals.tsx';

export function SuppliersPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [detailTarget, setDetailTarget] = useState<Supplier | null>(null);
  const [payDebtTarget, setPayDebtTarget] = useState<SupplierDebt | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { suppliersQuery, debtsQuery, purchasesQuery, activeMethods } = useSuppliersQueries(
    search,
    Boolean(detailTarget)
  );

  const { createMutation, updateSupplierMutation, payMutation } = useSuppliersMutations({
    onCreated: () => {
      setCreateOpen(false);
      setErrorMsg(null);
    },
    onUpdated: (updated) => {
      if (detailTarget && detailTarget.id === updated.id) {
        setDetailTarget(updated);
      }
      setEditTarget(null);
      setErrorMsg(null);
    },
    onDebtPaid: () => {
      setPayDebtTarget(null);
      setErrorMsg(null);
    },
    onError: (msg) => setErrorMsg(msg),
  });

  const { data: suppliers, isLoading, error, refetch } = suppliersQuery;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher un fournisseur..."
          ariaLabel="Rechercher un fournisseur"
          className="w-72"
        />
        <button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            setCreateOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nouveau fournisseur
        </button>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error || !suppliers ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Erreur chargement fournisseurs.'}
          onRetry={() => refetch()}
        />
      ) : (
        <SuppliersTable
          suppliers={suppliers}
          onEdit={(s) => {
            setErrorMsg(null);
            setEditTarget(s);
          }}
          onDetail={(s) => setDetailTarget(s)}
        />
      )}

      <div className="space-y-3">
        <h3 className="font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
          Dettes fournisseurs issues des réceptions
        </h3>
        <SupplierDebtsTable
          debts={debtsQuery.data || []}
          onPayDebt={(debt) => {
            setErrorMsg(null);
            setPayDebtTarget(debt);
          }}
        />
      </div>

      <SupplierCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        errorMsg={errorMsg}
        isPending={createMutation.isPending}
        onSubmit={(values) => createMutation.mutate(values)}
      />

      <SupplierEditModal
        supplier={editTarget}
        onClose={() => setEditTarget(null)}
        errorMsg={errorMsg}
        isPending={updateSupplierMutation.isPending}
        onSubmit={(id, values) => updateSupplierMutation.mutate({ id, values })}
      />

      <SupplierDebtPayModal
        debt={payDebtTarget}
        activeMethods={activeMethods}
        errorMsg={errorMsg}
        isPending={payMutation.isPending}
        onClose={() => setPayDebtTarget(null)}
        onConfirm={(args) => payMutation.mutate(args)}
      />

      <SupplierDetailModal
        supplier={detailTarget}
        purchases={purchasesQuery.data || []}
        debts={debtsQuery.data || []}
        onClose={() => setDetailTarget(null)}
        onEdit={(s) => {
          setErrorMsg(null);
          setEditTarget(s);
        }}
      />
    </div>
  );
}
