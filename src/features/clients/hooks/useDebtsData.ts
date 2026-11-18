import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import { newRequestKey } from '../../../utils/format.ts';

export function useDebtsQueries(historySaleId: number | null) {
  const receivablesQuery = useQuery({
    queryKey: ['receivables'],
    queryFn: () => apiClient.listReceivables(),
  });
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });
  const historySaleQuery = useQuery({
    queryKey: ['sale', historySaleId],
    queryFn: () => apiClient.getSaleDetail(historySaleId!),
    enabled: Boolean(historySaleId),
  });

  const activeMethods = (settingsQuery.data?.paymentMethods || []).filter((m) => m.active === 1);
  return { receivablesQuery, historySaleQuery, activeMethods };
}

export function usePayReceivableMutation(options: {
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      receivableId: number;
      note: string;
      parts: Array<{ method_code: string; amount: number }>;
    }) =>
      apiClient.payReceivable(args.receivableId, {
        request_key: newRequestKey('recpay'),
        note: args.note,
        parts: args.parts.filter((p) => p.amount > 0),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receivables'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['sales'] });
      options.onSuccess();
    },
    onError: (err) => options.onError(err instanceof Error ? err.message : 'Erreur encaissement.'),
  });
}
