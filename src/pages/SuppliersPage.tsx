import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef } from '@tanstack/react-table';
import { Edit3, History, Plus, Search, Wallet, X } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { Supplier, SupplierDebt } from '../types/erp.ts';
import { formatDate, formatDateTime, formatFcfa, newRequestKey } from '../utils/format.ts';

const optionalEmailSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Adresse e-mail invalide.');

const createSupplierSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du fournisseur est obligatoire.'),
  company_name: z.string(),
  phone: z.string().trim().min(1, 'Le téléphone du fournisseur est obligatoire.'),
  address: z.string(),
  email: optionalEmailSchema,
  contact_person: z.string(),
  payment_terms_days: z.number().int('Nombre entier requis.').min(0, 'Délai positif ou nul requis.'),
});

const editSupplierSchema = createSupplierSchema.extend({
  is_active: z.boolean(),
});

type CreateSupplierValues = z.infer<typeof createSupplierSchema>;
type EditSupplierValues = z.infer<typeof editSupplierSchema>;

export function SuppliersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [detailTarget, setDetailTarget] = useState<Supplier | null>(null);
  const [payDebtTarget, setPayDebtTarget] = useState<SupplierDebt | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('cash');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createForm = useForm<CreateSupplierValues>({
    resolver: zodResolver(createSupplierSchema),
    defaultValues: {
      name: '',
      company_name: '',
      phone: '',
      address: '',
      email: '',
      contact_person: '',
      payment_terms_days: 30,
    },
  });

  const editForm = useForm<EditSupplierValues>({
    resolver: zodResolver(editSupplierSchema),
    defaultValues: {
      name: '',
      company_name: '',
      phone: '',
      address: '',
      email: '',
      contact_person: '',
      payment_terms_days: 30,
      is_active: true,
    },
  });

  const { data: suppliers, isLoading, error, refetch } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: () => apiClient.listSuppliers(search),
  });
  const { data: debts } = useQuery({
    queryKey: ['supplier-debts'],
    queryFn: () => apiClient.listSupplierDebts(),
  });
  const { data: purchases } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => apiClient.listPurchases(),
    enabled: Boolean(detailTarget),
  });
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const activeMethods = (settingsData?.paymentMethods || []).filter((m) => m.active === 1);

  const createMutation = useMutation({
    mutationFn: (values: CreateSupplierValues) =>
      apiClient.createSupplier({
        name: values.name,
        company_name: values.company_name,
        phone: values.phone,
        address: values.address,
        email: values.email,
        contact_person: values.contact_person,
        payment_terms_days: values.payment_terms_days,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      setCreateOpen(false);
      createForm.reset();
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur création fournisseur.'),
  });

  const updateSupplierMutation = useMutation({
    mutationFn: (values: EditSupplierValues) => {
      if (!editTarget) throw new Error('Fournisseur non sélectionné');
      return apiClient.updateSupplier(editTarget.id, {
        name: values.name,
        company_name: values.company_name,
        phone: values.phone,
        address: values.address,
        email: values.email,
        contact_person: values.contact_person,
        payment_terms_days: values.payment_terms_days,
        is_active: values.is_active,
      });
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      if (detailTarget && detailTarget.id === updated.id) {
        setDetailTarget(updated);
      }
      setEditTarget(null);
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur mise à jour fournisseur.'),
  });

  const openEditModal = (supplier: Supplier) => {
    setEditTarget(supplier);
    editForm.reset({
      name: supplier.name,
      company_name: supplier.company_name || '',
      phone: supplier.phone,
      address: supplier.address || '',
      email: supplier.email || '',
      contact_person: supplier.contact_person || '',
      payment_terms_days: supplier.payment_terms_days ?? 30,
      is_active: supplier.is_active === 1,
    });
    setErrorMsg(null);
  };

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
          <div className="flex items-center gap-2 font-medium">
            <span>{row.original.name}</span>
            {row.original.is_active === 0 && <StatusBadge status="archived" />}
          </div>
          <div className="text-xs text-[#667085]">
            {row.original.phone}
            {row.original.payment_terms_days ? ` · Délai ${row.original.payment_terms_days}j` : ''}
            {row.original.email ? ` · ${row.original.email}` : ''}
          </div>
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
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openEditModal(row.original)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Modifier
          </button>
          <button
            type="button"
            onClick={() => setDetailTarget(row.original)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <History className="h-3.5 w-3.5" />
            Historique
          </button>
        </div>
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
            createForm.reset({
              name: '',
              company_name: '',
              phone: '',
              address: '',
              email: '',
              contact_person: '',
              payment_terms_days: 30,
            });
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

      {/* Modal Nouveau fournisseur (react-hook-form + zod) */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
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
            <form
              onSubmit={createForm.handleSubmit((values) => createMutation.mutate(values))}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="block text-xs font-medium">Nom fournisseur *</label>
                <input
                  type="text"
                  {...createForm.register('name')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                {createForm.formState.errors.name && (
                  <p className="mt-1 text-xs text-[#DC4545]">{createForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium">Raison sociale</label>
                <input
                  type="text"
                  {...createForm.register('company_name')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Téléphone *</label>
                <input
                  type="text"
                  {...createForm.register('phone')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                {createForm.formState.errors.phone && (
                  <p className="mt-1 text-xs text-[#DC4545]">{createForm.formState.errors.phone.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium">Adresse</label>
                <input
                  type="text"
                  {...createForm.register('address')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">E-mail</label>
                <input
                  type="email"
                  {...createForm.register('email')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                {createForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-[#DC4545]">{createForm.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium">Interlocuteur / Contact</label>
                <input
                  type="text"
                  {...createForm.register('contact_person')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Délai de règlement (jours)</label>
                <input
                  type="number"
                  min={0}
                  {...createForm.register('payment_terms_days', { valueAsNumber: true })}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
                />
              </div>
              <div className="mt-5 flex justify-end gap-3 pt-2">
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
                  disabled={createMutation.isPending}
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Modification Fournisseur (react-hook-form + zod) */}
      <Dialog.Root open={Boolean(editTarget)} onOpenChange={(o) => !o && setEditTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Modifier fournisseur · {editTarget?.code}
              </Dialog.Title>
              <Dialog.Close className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            {errorMsg && (
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-[#DC4545]">
                {errorMsg}
              </div>
            )}
            <form
              onSubmit={editForm.handleSubmit((values) => updateSupplierMutation.mutate(values))}
              className="mt-4 grid grid-cols-2 gap-3"
            >
              <div className="col-span-2">
                <label className="block text-xs font-medium">Nom fournisseur *</label>
                <input
                  aria-label="Nom fournisseur"
                  type="text"
                  {...editForm.register('name')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                {editForm.formState.errors.name && (
                  <p className="mt-1 text-xs text-[#DC4545]">{editForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium">Raison sociale</label>
                <input
                  aria-label="Raison sociale fournisseur"
                  type="text"
                  {...editForm.register('company_name')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Téléphone *</label>
                <input
                  aria-label="Téléphone fournisseur"
                  type="text"
                  {...editForm.register('phone')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                {editForm.formState.errors.phone && (
                  <p className="mt-1 text-xs text-[#DC4545]">{editForm.formState.errors.phone.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium">Adresse</label>
                <input
                  aria-label="Adresse fournisseur"
                  type="text"
                  {...editForm.register('address')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">E-mail</label>
                <input
                  aria-label="E-mail fournisseur"
                  type="email"
                  {...editForm.register('email')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                {editForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-[#DC4545]">{editForm.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium">Interlocuteur / Contact</label>
                <input
                  aria-label="Contact fournisseur"
                  type="text"
                  {...editForm.register('contact_person')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Délai de règlement (jours)</label>
                <input
                  aria-label="Délai fournisseur"
                  type="number"
                  min={0}
                  {...editForm.register('payment_terms_days', { valueAsNumber: true })}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
                />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  {...editForm.register('is_active')}
                  className="rounded border-slate-300 text-[#2563EB]"
                />
                Fiche fournisseur active
              </label>
              <div className="col-span-2 mt-2 flex justify-end gap-3">
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
                  disabled={updateSupplierMutation.isPending}
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateSupplierMutation.isPending ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </button>
              </div>
            </form>
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
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
                >
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

      {/* Modal Historique achats & dettes fournisseur */}
      <Dialog.Root open={Boolean(detailTarget)} onOpenChange={(o) => !o && setDetailTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            {detailTarget && (() => {
              const supOrders = (purchases || []).filter((p) => p.supplier_id === detailTarget.id);
              const supDebts = (debts || []).filter((d) => d.supplier_id === detailTarget.id);
              return (
                <div className="space-y-5 text-xs">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div>
                      <Dialog.Title className="font-display text-base font-bold">
                        {detailTarget.name} · {detailTarget.code}
                      </Dialog.Title>
                      <p className="mt-0.5 text-[#667085]">
                        Tél : {detailTarget.phone} · Délai : {detailTarget.payment_terms_days} jour(s)
                        {detailTarget.company_name ? ` · ${detailTarget.company_name}` : ''}
                        {detailTarget.address ? ` · ${detailTarget.address}` : ''}
                        {detailTarget.email ? ` · ${detailTarget.email}` : ''}
                        {detailTarget.contact_person ? ` · Contact : ${detailTarget.contact_person}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(detailTarget)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Modifier
                      </button>
                      <Dialog.Close className="rounded-lg p-1 text-slate-400">
                        <X className="h-4 w-4" />
                      </Dialog.Close>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <div className="text-[#667085]">Total réceptionné</div>
                      <div className="mt-1 font-mono-num text-sm font-bold text-[#16A36A]">
                        {formatFcfa(detailTarget.total_purchases)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <div className="text-[#667085]">Solde dû</div>
                      <div className="mt-1 font-mono-num text-sm font-bold text-[#DC4545]">
                        {formatFcfa(detailTarget.balance_due)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-display font-semibold mb-2">Commandes & réceptions ({supOrders.length})</h4>
                    {supOrders.length === 0 ? (
                      <p className="text-[#667085]">Aucune commande passée à ce fournisseur.</p>
                    ) : (
                      <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                        {supOrders.map((po) => (
                          <div key={po.id} className="flex items-center justify-between px-3 py-2">
                            <div>
                              <span className="font-mono-num font-semibold">{po.reference}</span>
                              <span className="ml-2 font-mono-num text-[#667085]">
                                {formatDateTime(po.created_at)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono-num">
                                Reçu {formatFcfa(po.received_amount)} / {formatFcfa(po.total_amount)}
                              </span>
                              <StatusBadge status={po.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="font-display font-semibold mb-2">Dettes & règlements ({supDebts.length})</h4>
                    {supDebts.length === 0 ? (
                      <p className="text-[#667085]">Aucune dette enregistrée.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                        {supDebts.map((d) => (
                          <div key={d.id} className="flex items-center justify-between px-3 py-2">
                            <div>
                              <span className="font-mono-num font-semibold">{d.receipt_reference}</span>
                              <span className="ml-2 text-[#667085]">Éch. {formatDate(d.due_date)}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono-num font-semibold">
                                Reste {formatFcfa(d.remaining_amount)}
                              </span>
                              <StatusBadge status={d.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
