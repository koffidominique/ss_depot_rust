import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search, ShieldAlert, X } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { Client, CreditPolicy } from '../types/erp.ts';
import { formatFcfa } from '../utils/format.ts';

export function ClientsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creditTarget, setCreditTarget] = useState<Client | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [clientType, setClientType] = useState<'particulier' | 'professionnel'>('particulier');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Abidjan');
  const [creditPolicy, setCreditPolicy] = useState<CreditPolicy>('forbidden');
  const [creditLimit, setCreditLimit] = useState(0);
  const [termsDays, setTermsDays] = useState(15);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['clients', search],
    queryFn: () => apiClient.listClients(search),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.createClient({
        name,
        client_type: clientType,
        phone,
        address,
        city,
        credit_policy: creditPolicy,
        credit_limit: creditPolicy === 'limited' ? creditLimit : null,
        payment_terms_days: creditPolicy === 'forbidden' ? 0 : termsDays,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      setCreateOpen(false);
      setName('');
      setPhone('');
      setAddress('');
      setErrorMsg(null);
    },
    onError: (err) => setErrorMsg(err instanceof Error ? err.message : 'Erreur création client.'),
  });

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
          <div className="font-medium">{row.original.name}</div>
          <div className="text-xs text-[#667085] dark:text-slate-400 capitalize">
            {row.original.client_type} {row.original.phone ? `· ${row.original.phone}` : ''}
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
            setCreditPolicy('forbidden');
            setCreditLimit(0);
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

      {/* Modal Nouveau client */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
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
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium">Nom ou raison sociale *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Type</label>
                <select
                  value={clientType}
                  onChange={(e) => setClientType(e.target.value as 'particulier' | 'professionnel')}
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
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Adresse</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Ville</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                <label className="block text-xs font-medium">Politique de crédit explicite</label>
                <select
                  value={creditPolicy}
                  onChange={(e) => setCreditPolicy(e.target.value as CreditPolicy)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="forbidden">Crédit interdit (Comptant uniquement)</option>
                  <option value="limited">Plafond limité</option>
                  <option value="unlimited">Crédit illimité autorisé</option>
                </select>
              </div>
              {creditPolicy === 'limited' && (
                <MoneyInput label="Plafond autorisé" value={creditLimit} onChange={setCreditLimit} />
              )}
              {creditPolicy !== 'forbidden' && (
                <div>
                  <label className="block text-xs font-medium">Échéance (jours)</label>
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
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Créer le client
              </button>
            </div>
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
                  <label className="block text-xs font-medium">Délai d'échéance (jours)</label>
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
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
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
    </div>
  );
}
