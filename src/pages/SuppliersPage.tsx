import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search, Wallet, X } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { Supplier, SupplierDebt } from '../types/erp.ts';
import { formatDate, formatFcfa, newRequestKey } from '../utils/format.ts';

export function SuppliersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [payDebtTarget, setPayDebtTarget] = useState<SupplierDebt | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('cash');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [termsDays, setTermsDays] = useState(30);

  const { data: suppliers, isLoading, error, refetch } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: () => apiClient.listSuppliers(search),
  });
  const { data: debts } = useQuery({
    queryKey: ['supplier-debts'],
    queryFn: () => apiClient.listSupplierDebts(),
  });
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const activeMethods = (settingsData?.paymentMethods || []).filter((m) => m.active === 1);

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.createSupplier({
        name,
        company_name: companyName,
        phone,
        address,
        payment_terms_days: termsDays,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      setCreateOpen(false);
      setName('');
      setCompanyName('');
      setPhone('');
      setAddress('');
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur création fournisseur.'),
  });

  const payMutation = useMutation({
    mutationFn: () => {
      if (!payDebtTarget) throw new Error('Dette non sélectionnée');
      return apiClient.paySupplierDebt(payDebtTarget.id, {
        method_code: payMethod,
        amount: payAmount,
        request_key: newRequestKey('suppay'),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['supplier-debts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      setPayDebtTarget(null);
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur règlement.'),
  });

  const supplierColumns: ColumnDef<Supplier>[] = [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => <span className="font-mono-num text-xs font-semibold">{row.original.code}</span>,
    },
    {
      accessorKey: 'name',
      header: 'Fournisseur',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-[#667085]">{row.original.phone}</div>
        </div>
      ),
    },
    {
      accessorKey: 'total_purchases',
      header: 'Total réceptionné',
      cell: ({ row }) => <span className="font-mono-num">{formatFcfa(row.original.total_purchases)}</span>,
    },
    {
      accessorKey: 'balance_due',
      header: 'Dette restante',
      cell: ({ row }) => (
        <span
          className={`font-mono-num font-semibold ${
            row.original.balance_due > 0 ? 'text-[#DC4545]' : 'text-[#16A36A]'
          }`}
        >
          {formatFcfa(row.original.balance_due)}
        </span>
      ),
    },
  ];

  const debtColumns: ColumnDef<SupplierDebt>[] = [
    {
      accessorKey: 'receipt_reference',
      header: 'Réception / CMD',
      cell: ({ row }) => (
        <div>
          <div className="font-mono-num text-xs font-semibold">{row.original.receipt_reference}</div>
          <div className="font-mono-num text-[11px] text-[#667085]">{row.original.order_reference}</div>
        </div>
      ),
    },
    { accessorKey: 'supplier_name', header: 'Fournisseur' },
    {
      accessorKey: 'initial_amount',
      header: 'Montant reçu',
      cell: ({ row }) => <span className="font-mono-num">{formatFcfa(row.original.initial_amount)}</span>,
    },
    {
      accessorKey: 'remaining_amount',
      header: 'Reste à payer',
      cell: ({ row }) => (
        <span className="font-mono-num font-semibold text-[#DC4545]">
          {formatFcfa(row.original.remaining_amount)}
        </span>
      ),
    },
    {
      accessorKey: 'due_date',
      header: 'Échéance',
      cell: ({ row }) => <span className="font-mono-num text-xs">{formatDate(row.original.due_date)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: 'Action',
      cell: ({ row }) =>
        row.original.remaining_amount > 0 ? (
          <button
            type="button"
            onClick={() => {
              setPayDebtTarget(row.original);
              setPayAmount(row.original.remaining_amount);
              setErrorMsg(null);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Wallet className="h-3.5 w-3.5" />
            Régler
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un fournisseur..."
            className="w-72 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] py-2 pl-9 pr-3 text-sm"
          />
        </div>
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
        <DataTable data={suppliers} columns={supplierColumns as ColumnDef<Supplier, unknown>[]} />
      )}

      <div className="space-y-3">
        <h3 className="font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
          Dettes fournisseurs issues des réceptions
        </h3>
        <DataTable
          data={debts || []}
          columns={debtColumns as ColumnDef<SupplierDebt, unknown>[]}
          emptyMessage="Aucune dette fournisseur enregistrée."
        />
      </div>

      {/* Modal Nouveau fournisseur */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">Nouveau fournisseur</Dialog.Title>
              <div className="flex items-center gap-2">
                <FormTipsButton topicId="suppliers" label="Aide" />
                <Dialog.Close className="rounded-lg p-1 text-slate-400">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
            </div>
            {errorMsg && (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-[#DC4545]">{errorMsg}</div>
            )}
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium">Nom fournisseur *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Raison sociale</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Téléphone *</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Délai de règlement (jours)</label>
                <input
                  type="number"
                  min={0}
                  value={termsDays}
                  onChange={(e) => setTermsDays(Math.max(0, Number(e.target.value)))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white"
              >
                Enregistrer
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Règlement dette fournisseur */}
      <Dialog.Root open={Boolean(payDebtTarget)} onOpenChange={(o) => !o && setPayDebtTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Régler {payDebtTarget?.supplier_name}
              </Dialog.Title>
              <FormTipsButton topicId="suppliers" label="Aide" />
            </div>
            <p className="mt-1 text-xs text-[#667085]">
              Réception {payDebtTarget?.receipt_reference} · Reste dû :{' '}
              {formatFcfa(payDebtTarget?.remaining_amount)}
            </p>
            {errorMsg && (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-[#DC4545]">{errorMsg}</div>
            )}
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium">Moyen de paiement</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  {activeMethods.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <MoneyInput label="Montant versé" value={payAmount} onChange={setPayAmount} />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={payMutation.isPending}
                onClick={() => payMutation.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white"
              >
                Confirmer règlement
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
