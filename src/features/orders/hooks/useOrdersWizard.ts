import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import type {
  CustomerOrderDetail,
  OrderRequestedUnit,
} from '../../../types/erp.ts';
import {
  clearOrderDraft,
  computeLocalComposition,
  extractVariantOptions,
  loadOrderDraft,
  saveOrderDraft,
  type OrderDraftState,
} from '../utils/orderComposition.ts';
import { buildOrderReceiptDocument } from '../utils/orderPrintDocument.ts';
import type { PrintableDocumentData } from '../../../components/documents/DocumentPrintModal.tsx';

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
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [activeOrder, setActiveOrder] = useState<CustomerOrderDetail | null>(null);
  const [receiptDoc, setReceiptDoc] = useState<PrintableDocumentData | null>(null);
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
  const depositHistoryQuery = useQuery({
    queryKey: ['customer-deposit-history', draft.customer_id],
    enabled: Boolean(draft.customer_id),
    queryFn: () => apiClient.getCustomerDepositHistory(draft.customer_id!),
  });

  const validLineInputs = useMemo(
    () =>
      draft.lines
        .filter((l) => l.variant_id && l.requested_quantity > 0)
        .map((l) => ({
          variant_id: l.variant_id!,
          requested_unit: l.requested_unit,
          requested_quantity: l.requested_quantity,
          unit_price_xof: l.unit_price_xof,
        })),
    [draft.lines],
  );

  const serverPreviewQuery = useQuery({
    queryKey: ['order-compose-preview', validLineInputs, draft.discount_xof],
    enabled: validLineInputs.length > 0,
    retry: false,
    queryFn: () =>
      apiClient.composeOrderPreview({
        lines: validLineInputs,
        discount_xof: draft.discount_xof,
      }),
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

  const basePreview =
    validLineInputs.length > 0 && serverPreviewQuery.data
      ? serverPreviewQuery.data
      : localPreview;

  const effectivePreview = useMemo(() => {
    if (!draft.custom_allocations) return basePreview;
    const depositTotal = draft.custom_allocations
      .filter((a) => a.is_consigned)
      .reduce((acc, a) => acc + a.quantity * a.deposit_amount_xof, 0);
    return {
      ...basePreview,
      allocations: draft.custom_allocations,
      totals: {
        ...basePreview.totals,
        deposit_total_xof: depositTotal,
        deposit_due_xof: depositTotal,
        total_to_collect_xof: basePreview.totals.total_xof + depositTotal,
      },
    };
  }, [basePreview, draft.custom_allocations]);

  const refreshAll = (detail: CustomerOrderDetail) => {
    setActiveOrder(detail);
    qc.invalidateQueries({ queryKey: ['customer-orders'] });
    qc.invalidateQueries({ queryKey: ['customer-deposits'] });
    qc.invalidateQueries({ queryKey: ['customer-deposit-history'] });
    qc.invalidateQueries({ queryKey: ['products-orders'] });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (!draft.customer_id) throw new Error('Veuillez sélectionner un client.');
      if (validLineInputs.length === 0) throw new Error('Ajoutez au moins une ligne produit.');
      const payload = {
        customer_id: draft.customer_id,
        order_type: (validLineInputs.length > 1 ? 'mixte' : 'vente') as 'mixte' | 'vente',
        payment_method: draft.payment_method,
        discount_xof: Math.max(0, draft.discount_xof),
        delivery_address: draft.delivery_address.trim() || null,
        notes: draft.notes.trim() || null,
        lines: validLineInputs,
        allocations: draft.custom_allocations
          ? draft.custom_allocations.map((a) => ({
              packaging_asset_id: a.packaging_asset_id,
              quantity: a.quantity,
              is_consigned: a.is_consigned,
              deposit_amount_xof: a.deposit_amount_xof,
            }))
          : null,
      };
      return editingOrderId
        ? apiClient.updateCustomerOrder(editingOrderId, payload)
        : apiClient.createCustomerOrder(payload);
    },
    onSuccess: (detail) => {
      setError(null);
      setEditingOrderId(null);
      clearOrderDraft();
      setDraft(EMPTY_ORDER_DRAFT);
      refreshAll(detail);
      const client =
        clientsQuery.data?.find((c) => c.id === detail.order.customer_id) ?? null;
      setReceiptDoc(buildOrderReceiptDocument(detail, client, null));
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

  const startEditingDraft = (detail: CustomerOrderDetail) => {
    if (detail.order.status !== 'draft') return;
    setEditingOrderId(detail.order.id);
    setDraft({
      customer_id: detail.order.customer_id,
      payment_method: (detail.order.payment_method as OrderDraftState['payment_method']) ?? 'cash',
      discount_xof: detail.order.discount_xof,
      delivery_address: detail.order.delivery_address ?? '',
      notes: detail.order.notes ?? '',
      lines: detail.lines.map((l, idx) => ({
        key: `edit-${l.id}-${idx}`,
        product_id: l.product_id,
        variant_id: l.variant_id,
        requested_unit: l.requested_unit as OrderRequestedUnit,
        requested_quantity: l.requested_quantity,
        unit_price_xof: l.unit_price_xof,
      })),
      custom_allocations: null,
    });
    setStep(2);
  };

  return {
    step,
    setStep,
    draft,
    setDraft,
    editingOrderId,
    setEditingOrderId,
    activeOrder,
    setActiveOrder,
    receiptDoc,
    closeReceiptDoc: () => setReceiptDoc(null),
    error,
    setError,
    clients: clientsQuery.data ?? [],
    deposits: depositsQuery.data ?? [],
    depositHistory: depositHistoryQuery.data ?? [],
    orders: ordersQuery.data ?? [],
    variantOptions,
    effectivePreview,
    isServerPreview: Boolean(validLineInputs.length > 0 && serverPreviewQuery.data),
    createMutation,
    actionMutation,
    startEditingDraft,
  };
}
