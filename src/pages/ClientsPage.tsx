import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef } from '@tanstack/react-table';
import { Edit3, Eye, Plus, Search, ShieldAlert, X } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { Client, CreditPolicy } from '../types/erp.ts';
import { formatDate, formatDateTime, formatFcfa } from '../utils/format.ts';

const optionalEmailSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Adresse e-mail invalide.');

const createClientSchema = z.object({
  name: z.string().trim().min(1, 'Le nom ou la raison sociale est obligatoire.'),
  client_type: z.enum(['particulier', 'professionnel']),
  phone: z.string(),
  address: z.string(),
  city: z.string(),
  email: optionalEmailSchema,
  contact_person: z.string(),
  credit_policy: z.enum(['forbidden', 'limited', 'unlimited']),
  credit_limit: z.number().int().min(0, 'Plafond invalide.'),
  payment_terms_days: z.number().int('Nombre entier requis.').min(0, 'Délai positif ou nul requis.'),
});

const editClientSchema = z.object({
  name: z.string().trim().min(1, 'Le nom ou la raison sociale est obligatoire.'),
  client_type: z.enum(['particulier', 'professionnel']),
  phone: z.string(),
  address: z.string(),
  city: z.string(),
  email: optionalEmailSchema,
  contact_person: z.string(),
  is_active: z.boolean(),
});

type CreateClientValues = z.infer<typeof createClientSchema>;
type EditClientValues = z.infer<typeof editClientSchema>;

export function ClientsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Client | null>(null);
  const [creditTarget, setCreditTarget] = useState<Client | null>(null);
  const [detailTarget, setDetailTarget] = useState<Client | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [creditPolicy, setCreditPolicy] = useState<CreditPolicy>('forbidden');
  const [creditLimit, setCreditLimit] = useState(0);
  const [termsDays, setTermsDays] = useState(15);

  const createForm = useForm<CreateClientValues>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      name: '',
      client_type: 'particulier',
      phone: '',
      address: '',
      city: 'Abidjan',
      email: '',
      contact_person: '',
      credit_policy: 'forbidden',
      credit_limit: 0,
      payment_terms_days: 15,
    },
  });

  const editForm = useForm<EditClientValues>({
    resolver: zodResolver(editClientSchema),
    defaultValues: {
      name: '',
      client_type: 'particulier',
      phone: '',
      address: '',
      city: '',
      email: '',
      contact_person: '',
      is_active: true,
    },
  });

  const watchCreatePolicy = createForm.watch('credit_policy');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['clients', search],
    queryFn: () => apiClient.listClients(search),
  });

  const { data: salesRes } = useQuery({
    queryKey: ['sales', 'client-history'],
    queryFn: () => apiClient.listSales({ page: 1, pageSize: 100 }),
    enabled: Boolean(detailTarget),
  });

  const { data: receivables } = useQuery({
    queryKey: ['receivables'],
    queryFn: () => apiClient.listReceivables(),
    enabled: Boolean(detailTarget),
  });

  const { data: consignments } = useQuery({
    queryKey: ['consignments'],
    queryFn: () => apiClient.getConsignmentsOverview(),
    enabled: Boolean(detailTarget),
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateClientValues) =>
      apiClient.createClient({
        name: values.name,
        client_type: values.client_type,
        phone: values.phone,
        address: values.address,
        city: values.city,
        email: values.email,
        contact_person: values.contact_person,
        credit_policy: values.credit_policy,
        credit_limit: values.credit_policy === 'limited' ? values.credit_limit : null,
        payment_terms_days: values.credit_policy === 'forbidden' ? 0 : values.payment_terms_days,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      setCreateOpen(false);
      createForm.reset();
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur création client.'),
  });

  const updateClientMutation = useMutation({
    mutationFn: (values: EditClientValues) => {
      if (!editTarget) throw new Error('Client non sélectionné');
      return apiClient.updateClient(editTarget.id, {
        name: values.name,
        client_type: values.client_type,
        phone: values.phone,
        address: values.address,
        city: values.city,
        email: values.email,
        contact_person: values.contact_person,
        is_active: values.is_active,
      });
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      if (detailTarget && detailTarget.id === updated.id) {
        setDetailTarget(updated);
      }
      setEditTarget(null);
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur mise à jour client.'),
  });

  const openEditModal = (client: Client) => {
    setEditTarget(client);
    editForm.reset({
      name: client.name,
      client_type: client.client_type,
      phone: client.phone || '',
      address: client.address || '',
      city: client.city || '',
      email: client.email || '',
      contact_person: client.contact_person || '',
      is_active: client.is_active === 1,
    });
    setErrorMsg(null);
  };

  const updateCreditMutation = useMutation({
    mutationFn: () => {
      if (!creditTarget) throw new Error('Client non sélectionné');
      return apiClient.updateClientCredit(creditTarget.id, {
        credit_policy: creditPolicy,
        credit_limit: creditPolicy === 'limited' ? creditLimit : null,
        payment_terms_days: creditPolicy === 'forbidden' ? 0 : termsDays,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      setCreditTarget(null);
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur mise à jour crédit.'),
  });

  const columns: ColumnDef<Client>[] = [
    {
      accessorKey: 'code',
      header: 'Code',
      cell: ({ row }) => <span className="font-mono-num text-xs font-semibold">{row.original.code}</span>,
    },
    {
      accessorKey: 'name',
      header: 'Client',
      cell: ({ row }) => (
        <div>
          <div className="flex items-center gap-2 font-medium">
            <span>{row.original.name}</span>
            {row.original.is_active === 0 && <StatusBadge status="archived" />}
          </div>
          <div className="text-xs text-[#667085] dark:text-slate-400 capitalize">
            {row.original.client_type}
            {row.original.phone ? ` · ${row.original.phone}` : ''}
            {row.original.city ? ` · ${row.original.city}` : ''}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'credit_policy',
      header: 'Politique de crédit',
      cell: ({ row }) => {
        const p = row.original.credit_policy;
        if (p === 'forbidden') return <span className="text-xs text-[#667085]">Crédit interdit</span>;
        if (p === 'unlimited')
          return <span className="text-xs font-medium text-[#2563EB]">Crédit sans plafond</span>;
        return (
          <span className="font-mono-num text-xs font-medium text-[#182230] dark:text-slate-200">
            Plafond {formatFcfa(row.original.credit_limit)} · {row.original.payment_terms_days}j
          </span>
        );
      },
    },
    {
      accessorKey: 'unpaid_balance',
      header: 'Solde créances',
      cell: ({ row }) => (
        <span
          className={`font-mono-num font-semibold ${
            row.original.unpaid_balance > 0 ? 'text-[#D9901A]' : 'text-[#667085]'
          }`}
        >
          {formatFcfa(row.original.unpaid_balance)}
        </span>
      ),
    },
    {
      accessorKey: 'returnable_pieces_due',
      header: 'Vides dus',
      cell: ({ row }) => (
        <span className="font-mono-num text-xs">
          {row.original.returnable_pieces_due} pièce(s)
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
            <Eye className="h-3.5 w-3.5" />
            Fiche
          </button>
          <button
            type="button"
            onClick={() => {
              setCreditTarget(row.original);
              setCreditPolicy(row.original.credit_policy);
              setCreditLimit(row.original.credit_limit ?? 0);
              setTermsDays(row.original.payment_terms_days ?? 15);
              setErrorMsg(null);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Crédit
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un client..."
            className="w-72 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            createForm.reset({
              name: '',
              client_type: 'particulier',
              phone: '',
              address: '',
              city: 'Abidjan',
              email: '',
              contact_person: '',
              credit_policy: 'forbidden',
              credit_limit: 0,
              payment_terms_days: 15,
            });
            setErrorMsg(null);
            setCreateOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nouveau client
        </button>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Erreur chargement clients.'}
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable data={data} columns={columns as ColumnDef<Client, unknown>[]} />
      )}

      {/* Modal Nouveau client (react-hook-form + zod) */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">Nouveau client</Dialog.Title>
              <div className="flex items-center gap-2">
                <FormTipsButton topicId="clients" label="Règles crédit" />
                <Dialog.Close className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
            </div>
            {errorMsg && (
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-[#DC4545]">
                {errorMsg}
              </div>
            )}
            <form
              onSubmit={createForm.handleSubmit((values) => createMutation.mutate(values))}
              className="mt-4 grid grid-cols-2 gap-4"
            >
              <div className="col-span-2">
                <label className="block text-xs font-medium">Nom ou raison sociale *</label>
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
                <label className="block text-xs font-medium">Type</label>
                <select
                  {...createForm.register('client_type')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="particulier">Particulier</option>
                  <option value="professionnel">Professionnel (Maquis / Hôtel / Bar)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium">Téléphone</label>
                <input
                  type="text"
                  {...createForm.register('phone')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
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
                <label className="block text-xs font-medium">Ville</label>
                <input
                  type="text"
                  {...createForm.register('city')}
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
              <div className="col-span-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                <label className="block text-xs font-medium">Politique de crédit explicite</label>
                <select
                  {...createForm.register('credit_policy')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="forbidden">Crédit interdit (Comptant uniquement)</option>
                  <option value="limited">Plafond limité</option>
                  <option value="unlimited">Crédit illimité autorisé</option>
                </select>
              </div>
              {watchCreatePolicy === 'limited' && (
                <div>
                  <Controller
                    name="credit_limit"
                    control={createForm.control}
                    render={({ field }) => (
                      <MoneyInput label="Plafond autorisé" value={field.value} onChange={field.onChange} />
                    )}
                  />
                  {createForm.formState.errors.credit_limit && (
                    <p className="mt-1 text-xs text-[#DC4545]">
                      {createForm.formState.errors.credit_limit.message}
                    </p>
                  )}
                </div>
              )}
              {watchCreatePolicy !== 'forbidden' && (
                <div>
                  <label className="block text-xs font-medium">Échéance (jours)</label>
                  <input
                    type="number"
                    min={0}
                    {...createForm.register('payment_terms_days', { valueAsNumber: true })}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
                  />
                </div>
              )}
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
                  disabled={createMutation.isPending}
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Créer le client
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Modification Fiche Client (react-hook-form + zod) */}
      <Dialog.Root open={Boolean(editTarget)} onOpenChange={(o) => !o && setEditTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Modifier client · {editTarget?.code}
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
              onSubmit={editForm.handleSubmit((values) => updateClientMutation.mutate(values))}
              className="mt-4 grid grid-cols-2 gap-4"
            >
              <div className="col-span-2">
                <label className="block text-xs font-medium">Nom ou raison sociale *</label>
                <input
                  aria-label="Nom du client"
                  type="text"
                  {...editForm.register('name')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
                {editForm.formState.errors.name && (
                  <p className="mt-1 text-xs text-[#DC4545]">{editForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium">Type</label>
                <select
                  aria-label="Type client"
                  {...editForm.register('client_type')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="particulier">Particulier</option>
                  <option value="professionnel">Professionnel (Maquis / Hôtel / Bar)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium">Téléphone</label>
                <input
                  aria-label="Téléphone client"
                  type="text"
                  {...editForm.register('phone')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Adresse</label>
                <input
                  aria-label="Adresse client"
                  type="text"
                  {...editForm.register('address')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Ville</label>
                <input
                  aria-label="Ville client"
                  type="text"
                  {...editForm.register('city')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">E-mail</label>
                <input
                  aria-label="E-mail client"
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
                  aria-label="Contact client"
                  type="text"
                  {...editForm.register('contact_person')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  {...editForm.register('is_active')}
                  className="rounded border-slate-300 text-[#2563EB]"
                />
                Fiche client active
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
                  disabled={updateClientMutation.isPending}
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateClientMutation.isPending ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Politique Crédit */}
      <Dialog.Root open={Boolean(creditTarget)} onOpenChange={(o) => !o && setCreditTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Politique de crédit · {creditTarget?.name}
              </Dialog.Title>
              <FormTipsButton topicId="clients" label="Aide" />
            </div>
            {errorMsg && (
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-[#DC4545]">
                {errorMsg}
              </div>
            )}
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium">État du crédit</label>
                <select
                  value={creditPolicy}
                  onChange={(e) => setCreditPolicy(e.target.value as CreditPolicy)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="forbidden">Crédit interdit</option>
                  <option value="limited">Plafond limité</option>
                  <option value="unlimited">Crédit illimité autorisé</option>
                </select>
              </div>
              {creditPolicy === 'limited' && (
                <MoneyInput label="Plafond de crédit" value={creditLimit} onChange={setCreditLimit} />
              )}
              {creditPolicy !== 'forbidden' && (
                <div>
                  <label className="block text-xs font-medium">Délai d&apos;échéance (jours)</label>
                  <input
                    type="number"
                    min={0}
                    value={termsDays}
                    onChange={(e) => setTermsDays(Math.max(0, Number(e.target.value)))}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
                  />
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
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
                disabled={updateCreditMutation.isPending}
                onClick={() => updateCreditMutation.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Mettre à jour
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Fiche, Échéances, Historique & Consignes client */}
      <Dialog.Root open={Boolean(detailTarget)} onOpenChange={(o) => !o && setDetailTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            {detailTarget && (() => {
              const clientSales = (salesRes?.items || []).filter((s) => s.client_id === detailTarget.id);
              const clientRecs = (receivables || []).filter((r) => r.client_id === detailTarget.id);
              const clientBalances = (
                (consignments?.clientBalances || []) as Array<{
                  id: number;
                  client_id: number;
                  packaging_name: string;
                  packaging_code: string;
                  balance_pieces: number;
                  deposit_held_amount: number;
                }>
              ).filter((b) => b.client_id === detailTarget.id);
              const today = new Date().toISOString().slice(0, 10);

              return (
                <div className="space-y-5 text-xs">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div>
                      <Dialog.Title className="font-display text-base font-bold text-[#182230] dark:text-slate-100">
                        {detailTarget.name} · {detailTarget.code}
                      </Dialog.Title>
                      <p className="mt-0.5 text-[#667085] dark:text-slate-400 capitalize">
                        {detailTarget.client_type}
                        {detailTarget.phone ? ` · ${detailTarget.phone}` : ''}
                        {detailTarget.address ? ` · ${detailTarget.address}` : ''}
                        {detailTarget.city ? ` · ${detailTarget.city}` : ''}
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
                      <Dialog.Close className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <X className="h-4 w-4" />
                      </Dialog.Close>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <div className="text-[#667085]">Solde créances</div>
                      <div className="mt-1 font-mono-num text-sm font-bold text-[#D9901A]">
                        {formatFcfa(detailTarget.unpaid_balance)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <div className="text-[#667085]">Politique crédit</div>
                      <div className="mt-1 font-semibold">
                        {detailTarget.credit_policy === 'forbidden'
                          ? 'Interdit'
                          : detailTarget.credit_policy === 'unlimited'
                          ? 'Illimité'
                          : `Plafond ${formatFcfa(detailTarget.credit_limit)}`}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <div className="text-[#667085]">Emballages dus</div>
                      <div className="mt-1 font-mono-num text-sm font-bold">
                        {detailTarget.returnable_pieces_due} pièce(s)
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-display font-semibold mb-2">Échéances & créances ({clientRecs.length})</h4>
                    {clientRecs.length === 0 ? (
                      <p className="text-[#667085]">Aucune créance enregistrée.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                        {clientRecs.map((r) => {
                          const overdue = r.due_date && r.remaining_amount > 0 && r.due_date < today;
                          return (
                            <div key={r.id} className="flex items-center justify-between px-3 py-2">
                              <div>
                                <span className="font-mono-num font-semibold">{r.sale_reference}</span>
                                <span className={`ml-2 font-mono-num ${overdue ? 'text-[#DC4545] font-semibold' : 'text-[#667085]'}`}>
                                  Échéance : {formatDate(r.due_date)} {overdue ? '(En retard)' : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-mono-num font-semibold">{formatFcfa(r.remaining_amount)}</span>
                                <StatusBadge status={r.status} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="font-display font-semibold mb-2">Consignes détenues ({clientBalances.length})</h4>
                    {clientBalances.length === 0 ? (
                      <p className="text-[#667085]">Aucun emballage consigné en attente de retour.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                        {clientBalances.map((b) => (
                          <div key={b.id} className="flex items-center justify-between px-3 py-2">
                            <span>
                              {b.packaging_name} <span className="font-mono-num text-[#667085]">({b.packaging_code})</span>
                            </span>
                            <span className="font-mono-num font-semibold">
                              {b.balance_pieces} pcs · Caution {formatFcfa(b.deposit_held_amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="font-display font-semibold mb-2">Historique récent des ventes ({clientSales.length})</h4>
                    {clientSales.length === 0 ? (
                      <p className="text-[#667085]">Aucune vente liée à ce client.</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                        {clientSales.map((s) => (
                          <div key={s.id} className="flex items-center justify-between px-3 py-2">
                            <div>
                              <span className="font-mono-num font-semibold">{s.reference}</span>
                              <span className="ml-2 font-mono-num text-[#667085]">{formatDateTime(s.created_at)}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono-num font-semibold">{formatFcfa(s.total_amount)}</span>
                              <StatusBadge status={s.status} />
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
