import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import type { SaleDetail } from '../../../types/erp.ts';
import { newRequestKey } from '../../../utils/format.ts';

export function useSalesHistoryQueries(filters: {
  search: string;
  status: string;
  fromDate: string;
  toDate: string;
  page: number;
}) {
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const salesQuery = useQuery({
    queryKey: [
      'sales',
      filters.search,
      filters.status,
      filters.fromDate,
      filters.toDate,
      filters.page,
    ],
    queryFn: () =>
      apiClient.listSales({
        search: filters.search,
        status: filters.status,
        from: filters.fromDate || undefined,
        to: filters.toDate || undefined,
        page: filters.page,
        pageSize: 20,
      }),
  });

  const activePaymentMethods = (settingsQuery.data?.paymentMethods || []).filter(
    (m) => m.active === 1
  );
  const refundMethods =
    activePaymentMethods.length > 0
      ? activePaymentMethods
      : [{ code: 'cash', label: 'Espèces', is_cash: 1, active: 1 }];

  return { salesQuery, refundMethods };
}

export function useSalesHistoryMutations(options: {
  onCancelled: (updated: SaleDetail) => void;
  onReturned: (updated: SaleDetail) => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['cash'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['clients'] });
    qc.invalidateQueries({ queryKey: ['debts'] });
  };

  const cancelMutation = useMutation({
    mutationFn: (args: { saleId: number; reason: string; refund_method_code: string }) =>
      apiClient.cancelSale(args.saleId, {
        reason: args.reason,
        refund_method_code: args.refund_method_code,
        request_key: newRequestKey('cancel'),
      }),
    onSuccess: (updated) => {
      invalidateAll();
      options.onCancelled(updated);
    },
    onError: (err) =>
      options.onError(err instanceof Error ? err.message : 'Erreur annulation.'),
  });

  const returnMutation = useMutation({
    mutationFn: (args: {
      saleId: number;
      reason: string;
      restock_approved: boolean;
      refund_method_code: string;
      lines: Array<{ sale_line_id: number; base_quantity: string }>;
    }) =>
      apiClient.createSaleReturn(args.saleId, {
        request_key: newRequestKey('ret'),
        reason: args.reason,
        restock_approved: args.restock_approved,
        refund_method_code: args.refund_method_code,
        lines: args.lines,
      }),
    onSuccess: (updated) => {
      invalidateAll();
      options.onReturned(updated);
    },
    onError: (err) => options.onError(err instanceof Error ? err.message : 'Erreur retour.'),
  });

  return { cancelMutation, returnMutation };
}
