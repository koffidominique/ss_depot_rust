import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import type { Client, CreditPolicy } from '../../../types/erp.ts';
import type { CreateClientValues, EditClientValues } from '../utils/clientSchemas.ts';

export function useClientsQueries(search: string, detailOpen: boolean) {
  const clientsQuery = useQuery({
    queryKey: ['clients', search],
    queryFn: () => apiClient.listClients(search),
  });

  const salesQuery = useQuery({
    queryKey: ['sales', 'client-history'],
    queryFn: () => apiClient.listSales({ page: 1, pageSize: 100 }),
    enabled: detailOpen,
  });

  const receivablesQuery = useQuery({
    queryKey: ['receivables'],
    queryFn: () => apiClient.listReceivables(),
    enabled: detailOpen,
  });

  const consignmentsQuery = useQuery({
    queryKey: ['consignments'],
    queryFn: () => apiClient.getConsignmentsOverview(),
    enabled: detailOpen,
  });

  return { clientsQuery, salesQuery, receivablesQuery, consignmentsQuery };
}

interface UseClientsMutationsOptions {
  onCreated: () => void;
  onUpdated: (updated: Client) => void;
  onUpdatedCredit: () => void;
  onError: (msg: string) => void;
}

export function useClientsMutations({
  onCreated,
  onUpdated,
  onUpdatedCredit,
  onError,
}: UseClientsMutationsOptions) {
  const qc = useQueryClient();

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
      onCreated();
    },
    onError: (err) => onError(err instanceof Error ? err.message : 'Erreur création client.'),
  });

  const updateClientMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: EditClientValues }) =>
      apiClient.updateClient(id, {
        name: values.name,
        client_type: values.client_type,
        phone: values.phone,
        address: values.address,
        city: values.city,
        email: values.email,
        contact_person: values.contact_person,
        is_active: values.is_active,
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      onUpdated(updated);
    },
    onError: (err) => onError(err instanceof Error ? err.message : 'Erreur mise à jour client.'),
  });

  const updateCreditMutation = useMutation({
    mutationFn: (input: {
      id: number;
      credit_policy: CreditPolicy;
      credit_limit: number;
      payment_terms_days: number;
    }) =>
      apiClient.updateClientCredit(input.id, {
        credit_policy: input.credit_policy,
        credit_limit: input.credit_policy === 'limited' ? input.credit_limit : null,
        payment_terms_days:
          input.credit_policy === 'forbidden' ? 0 : input.payment_terms_days,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      onUpdatedCredit();
    },
    onError: (err) => onError(err instanceof Error ? err.message : 'Erreur mise à jour crédit.'),
  });

  return { createMutation, updateClientMutation, updateCreditMutation };
}
