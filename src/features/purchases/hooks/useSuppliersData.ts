import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import type { Supplier } from '../../../types/erp.ts';
import { newRequestKey } from '../../../utils/format.ts';
import type { CreateSupplierValues, EditSupplierValues } from '../utils/supplierSchemas.ts';

export function useSuppliersQueries(search: string, detailOpen: boolean) {
  const suppliersQuery = useQuery({
    queryKey: ['suppliers', search],
    queryFn: () => apiClient.listSuppliers(search),
  });
  const debtsQuery = useQuery({
    queryKey: ['supplier-debts'],
    queryFn: () => apiClient.listSupplierDebts(),
  });
  const purchasesQuery = useQuery({
    queryKey: ['purchases'],
    queryFn: () => apiClient.listPurchases(),
    enabled: detailOpen,
  });
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const activeMethods = (settingsQuery.data?.paymentMethods || []).filter((m) => m.active === 1);

  return { suppliersQuery, debtsQuery, purchasesQuery, activeMethods };
}

export function useSuppliersMutations(options: {
  onCreated: () => void;
  onUpdated: (updated: Supplier) => void;
  onDebtPaid: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();

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
      options.onCreated();
    },
    onError: (err) =>
      options.onError(err instanceof Error ? err.message : 'Erreur création fournisseur.'),
  });

  const updateSupplierMutation = useMutation({
    mutationFn: (args: { id: number; values: EditSupplierValues }) =>
      apiClient.updateSupplier(args.id, {
        name: args.values.name,
        company_name: args.values.company_name,
        phone: args.values.phone,
        address: args.values.address,
        email: args.values.email,
        contact_person: args.values.contact_person,
        payment_terms_days: args.values.payment_terms_days,
        is_active: args.values.is_active,
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      options.onUpdated(updated);
    },
    onError: (err) =>
      options.onError(err instanceof Error ? err.message : 'Erreur mise à jour fournisseur.'),
  });

  const payMutation = useMutation({
    mutationFn: (args: { debtId: number; method_code: string; amount: number }) =>
      apiClient.paySupplierDebt(args.debtId, {
        method_code: args.method_code,
        amount: args.amount,
        request_key: newRequestKey('suppay'),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['supplier-debts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      options.onDebtPaid();
    },
    onError: (err) => options.onError(err instanceof Error ? err.message : 'Erreur règlement.'),
  });

  return { createMutation, updateSupplierMutation, payMutation };
}
