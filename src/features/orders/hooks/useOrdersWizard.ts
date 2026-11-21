import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import type { CustomerOrderDetail } from '../../../types/erp.ts';
import {
  clearOrderDraft,
  computeLocalComposition,
  extractVariantOptions,
  loadOrderDraft,
  saveOrderDraft,
  type OrderDraftState,
} from '../utils/orderComposition.ts';

export const EMPTY_ORDER_DRAFT: OrderDraftState = {
  customer_id: null,
  payment_method: 'cash',
  discount_xof: 0,
  delivery_address: '',
  notes: '',
  lines: [],
  custom_allocations: null,
};

export function useOrdersWizard() {
  const qc = useQueryClient();
  const [step, setStep] = useState<number>(1);
  const [draft, setDraft] = useState<OrderDraftState>(() => loadOrderDraft() ?? EMPTY_ORDER_DRAFT);
  const [activeOrder, setActiveOrder] = useState<CustomerOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveOrderDraft(draft);
  }, [draft]);

  const clientsQuery = useQuery({ queryKey: ['clients'], queryFn: () => apiClient.listClients() });
  const productsQuery = useQuery({
    queryKey: ['products-orders'],
    queryFn: () => apiClient.listProducts({ page: 1, pageSize: 200 }),
  });
  const assetsQuery = useQuery({
    queryKey: ['packaging-assets'],
    queryFn: () => apiClient.listPackagingAssets(),
  });
  const ordersQuery = useQuery({
    queryKey: ['customer-orders'],
    queryFn: () => apiClient.listCustomerOrders(),
  });
  const depositsQuery = useQuery({
    queryKey: ['customer-deposits', draft.customer_id],
    enabled: Boolean(draft.customer_id),
    queryFn: () => apiClient.getCustomerDeposits(draft.customer_id!),
  });

  const variantOptions = useMemo(
    () => extractVariantOptions(productsQuery.data?.items),
    [productsQuery.data?.items],
  );

  const localPreview = useMemo(
    () =>
      computeLocalComposition(
        draft.lines,
        variantOptions,
        assetsQuery.data ?? [],
        draft.discount_xof,
      ),
    [draft.lines, draft.discount_xof, variantOptions, assetsQuery.data],
  );

  const effectivePreview = useMemo(() => {
    if (!draft.custom_allocations) return localPreview;
    const depositTotal = draft.custom_allocations
      .filter((a) => a.is_consigned)
      .reduce((acc, a) => acc + a.quantity * a.deposit_amount_xof, 0);
    return {
      ...localPreview,
      allocations: draft.custom_allocations,
      totals: {
        ...localPreview.totals,
        deposit_total_xof: depositTotal,
        deposit_due_xof: depositTotal,
        total_to_collect_xof: localPreview.totals.total_xof + depositTotal,
      },
    };
  }, [localPreview, draft.custom_allocations]);

  const refreshAll = (detail: CustomerOrderDetail) => {
    setActiveOrder(detail);
    qc.invalidateQueries({ queryKey: ['customer-orders'] });
    qc.invalidateQueries({ queryKey: ['customer-deposits'] });
    qc.invalidateQueries({ queryKey: ['products-orders'] });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (!draft.customer_id) throw new Error('Veuillez sélectionner un client.');
      const validLines = draft.lines.filter((l) => l.variant_id && l.requested_quantity > 0);
      if (validLines.length === 0) throw new Error('Ajoutez au moins une ligne produit.');
      return apiClient.createCustomerOrder({
        customer_id: draft.customer_id,
        order_type: validLines.length > 1 ? 'mixte' : 'vente',
        payment_method: draft.payment_method,
        discount_xof: draft.discount_xof,
        notes: draft.notes.trim() || null,
        lines: validLines.map((l) => ({
          variant_id: l.variant_id!,
          requested_unit: l.requested_unit,
          requested_quantity: l.requested_quantity,
          unit_price_xof: l.unit_price_xof,
        })),
        allocations: draft.custom_allocations
          ? draft.custom_allocations.map((a) => ({
              packaging_asset_id: a.packaging_asset_id,
              quantity: a.quantity,
              is_consigned: a.is_consigned,
              deposit_amount_xof: a.deposit_amount_xof,
            }))
          : null,
      });
    },
    onSuccess: (detail) => {
      setError(null);
      clearOrderDraft();
      setDraft(EMPTY_ORDER_DRAFT);
      refreshAll(detail);
      setStep(5);
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erreur création commande.'),
  });

  const actionMutation = useMutation({
    mutationFn: async (fn: () => Promise<CustomerOrderDetail>) => fn(),
    onSuccess: (detail) => {
      setError(null);
      refreshAll(detail);
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erreur opération commande.'),
  });

  return {
    step,
    setStep,
    draft,
    setDraft,
    activeOrder,
    setActiveOrder,
    error,
    setError,
    clients: clientsQuery.data ?? [],
    deposits: depositsQuery.data ?? [],
    orders: ordersQuery.data ?? [],
    variantOptions,
    effectivePreview,
    createMutation,
    actionMutation,
  };
}
