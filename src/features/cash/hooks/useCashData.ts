import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import { newRequestKey } from '../../../utils/format.ts';

export function useCashQuery() {
  return useQuery({
    queryKey: ['cash'],
    queryFn: () => apiClient.getCashStatus(),
  });
}

interface UseCashMutationsOptions {
  activeSessionId: number | null;
  onOpened: () => void;
  onClosed: () => void;
  onError: (msg: string) => void;
}

export function useCashMutations({
  activeSessionId,
  onOpened,
  onClosed,
  onError,
}: UseCashMutationsOptions) {
  const qc = useQueryClient();

  const openMut = useMutation({
    mutationFn: (openingCash: number) =>
      apiClient.openCashSession({
        opening_cash: openingCash,
        request_key: newRequestKey('open'),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onOpened();
    },
    onError: (err) =>
      onError(err instanceof Error ? err.message : 'Erreur ouverture caisse.'),
  });

  const closeMut = useMutation({
    mutationFn: (input: { physical_cash: number; closing_notes: string }) => {
      if (!activeSessionId) throw new Error('Aucune session ouverte');
      return apiClient.closeCashSession({
        session_id: activeSessionId,
        physical_cash: input.physical_cash,
        closing_notes: input.closing_notes.trim(),
        request_key: newRequestKey('close'),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClosed();
    },
    onError: (err) =>
      onError(err instanceof Error ? err.message : 'Erreur clôture caisse.'),
  });

  return { openMut, closeMut };
}
