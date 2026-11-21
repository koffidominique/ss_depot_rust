import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import type { CartItem } from '../../../stores/uiStore.ts';
import type {
  PriceTier,
  ProductPackaging,
  ProductSalesUnit,
  SaleDetail,
} from '../../../types/erp.ts';
import type { SaleCalculationResult } from '../utils/saleCalculations.ts';

export function getTierPrice(
  pkg: ProductPackaging,
  tier: PriceTier = 'retail'
): number {
  if (tier === 'wholesale') {
    return pkg.wholesale_price ?? pkg.retail_price ?? 0;
  }
  if (tier === 'semi_wholesale') {
    return pkg.semi_wholesale_price ?? pkg.retail_price ?? 0;
  }
  return pkg.retail_price ?? 0;
}

export function getSalesUnitTierPrice(
  unit: ProductSalesUnit,
  tier: PriceTier = 'retail'
): number {
  if (tier === 'wholesale') {
    return unit.wholesale_price ?? unit.retail_price ?? 0;
  }
  if (tier === 'semi_wholesale') {
    return unit.semi_wholesale_price ?? unit.retail_price ?? 0;
  }
  return unit.retail_price ?? 0;
}

export function usePosQueries(search: string) {
  const productsQuery = useQuery({
    queryKey: ['products-pos', search],
    queryFn: () => apiClient.listProducts({ search, page: 1, pageSize: 50 }),
    placeholderData: (prev) => prev,
  });

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiClient.listClients(),
  });

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const cashQuery = useQuery({
    queryKey: ['cash'],
    queryFn: () => apiClient.getCashStatus(),
  });

  const activeMethods = useMemo(
    () => (settingsQuery.data?.paymentMethods || []).filter((m) => m.active === 1),
    [settingsQuery.data]
  );

  return {
    productsRes: productsQuery.data,
    clients: clientsQuery.data,
    cashStatus: cashQuery.data,
    activeMethods,
  };
}

interface UsePosMutationsOptions {
  requestKey: string;
  posClientId: number | null;
  posPriceTier: PriceTier;
  posSaleType: 'cash' | 'credit';
  globalDiscount: number;
  dueDate: string;
  posCart: CartItem[];
  paymentRows: Array<{ method_code: string; amount: number }>;
  totals: SaleCalculationResult;
  onSaleSuccess: (sale: SaleDetail) => void;
  onSaleError: (message: string) => void;
  onQuickClientSuccess: (clientId: number) => void;
  onQuickClientError: (message: string) => void;
}

export function usePosMutations({
  requestKey,
  posClientId,
  posPriceTier,
  posSaleType,
  globalDiscount,
  dueDate,
  posCart,
  paymentRows,
  totals,
  onSaleSuccess,
  onSaleError,
  onQuickClientSuccess,
  onQuickClientError,
}: UsePosMutationsOptions) {
  const qc = useQueryClient();

  const createSaleMutation = useMutation({
    mutationFn: () => {
      if (!totals.isValid) {
        throw new Error(totals.errors[0] || 'Panier invalide : corrigez les quantités ou montants.');
      }
      const filteredPayments = paymentRows.filter((p) => p.amount > 0);
      return apiClient.createSale({
        request_key: requestKey,
        client_id: posClientId,
        sale_type: posSaleType,
        price_tier: posPriceTier,
        discount_amount: globalDiscount,
        due_date: posSaleType === 'credit' && dueDate ? dueDate : undefined,
        lines: posCart.map((c) => ({
          product_id: c.productId,
          packaging_id: c.packagingId,
          sales_unit_id: c.salesUnitId ?? undefined,
          quantity: c.quantity,
          support_quantity: c.supportQuantity,
          discount_amount: c.discountAmount,
        })),
        payments: filteredPayments,
      });
    },
    onSuccess: (sale) => {
      onSaleSuccess(sale);
      qc.invalidateQueries({ queryKey: ['products-pos'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['receivables'] });
    },
    onError: (err) =>
      onSaleError(err instanceof Error ? err.message : 'Erreur lors de la validation.'),
  });

  const quickClientMutation = useMutation({
    mutationFn: (input: {
      name: string;
      client_type: 'particulier' | 'professionnel';
      phone: string;
    }) =>
      apiClient.createClient({
        name: input.name.trim(),
        client_type: input.client_type,
        phone: input.phone.trim() || undefined,
        credit_policy: 'forbidden',
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      onQuickClientSuccess(created.id);
    },
    onError: (err) =>
      onQuickClientError(err instanceof Error ? err.message : 'Erreur création client.'),
  });

  return { createSaleMutation, quickClientMutation };
}
