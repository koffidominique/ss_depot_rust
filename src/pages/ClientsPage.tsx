import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { SearchInput } from '../components/forms/SearchInput.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { Client } from '../types/erp.ts';
import {
  createClientSchema,
  editClientSchema,
  type CreateClientValues,
  type EditClientValues,
} from '../features/clients/utils/clientSchemas.ts';
import {
  useClientsMutations,
  useClientsQueries,
} from '../features/clients/hooks/useClientsData.ts';
import { ClientsTable } from '../features/clients/components/ClientsTable.tsx';
import { ClientCreateModal } from '../features/clients/components/ClientCreateModal.tsx';
import { ClientEditModal } from '../features/clients/components/ClientEditModal.tsx';
import { ClientCreditModal } from '../features/clients/components/ClientCreditModal.tsx';
import { ClientDetailModal } from '../features/clients/components/ClientDetailModal.tsx';

export function ClientsPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Client | null>(null);
  const [creditTarget, setCreditTarget] = useState<Client | null>(null);
  const [detailTarget, setDetailTarget] = useState<Client | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const { clientsQuery, salesQuery, receivablesQuery, consignmentsQuery } = useClientsQueries(
    search,
    Boolean(detailTarget)
  );

  const { createMutation, updateClientMutation, updateCreditMutation } = useClientsMutations({
    onCreated: () => {
      setCreateOpen(false);
      createForm.reset();
      setErrorMsg(null);
    },
    onUpdated: (updated) => {
      if (detailTarget && detailTarget.id === updated.id) {
        setDetailTarget(updated);
      }
      setEditTarget(null);
      setErrorMsg(null);
    },
    onUpdatedCredit: () => {
      setCreditTarget(null);
      setErrorMsg(null);
    },
    onError: setErrorMsg,
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

  const { data, isLoading, error, refetch } = clientsQuery;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher un client..."
          className="w-72"
          clearable
        />
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
        <ClientsTable
          clients={data}
          onEdit={openEditModal}
          onDetail={setDetailTarget}
          onEditCredit={(client) => {
            setCreditTarget(client);
            setErrorMsg(null);
          }}
        />
      )}

      <ClientCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        form={createForm}
        error={errorMsg}
        isPending={createMutation.isPending}
        onSubmit={(values) => createMutation.mutate(values)}
      />

      <ClientEditModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
        form={editForm}
        error={errorMsg}
        isPending={updateClientMutation.isPending}
        onSubmit={(values) => {
          if (!editTarget) return;
          updateClientMutation.mutate({ id: editTarget.id, values });
        }}
      />

      <ClientCreditModal
        target={creditTarget}
        onClose={() => setCreditTarget(null)}
        error={errorMsg}
        isPending={updateCreditMutation.isPending}
        onSubmit={(values) => updateCreditMutation.mutate(values)}
      />

      <ClientDetailModal
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        onEdit={openEditModal}
        sales={salesQuery.data?.items || []}
        receivables={receivablesQuery.data || []}
        consignmentBalances={
          (consignmentsQuery.data?.clientBalances || []) as Array<{
            id: number;
            client_id: number;
            packaging_name: string;
            packaging_code: string;
            balance_pieces: number;
            deposit_held_amount: number;
          }>
        }
      />
    </div>
  );
}
