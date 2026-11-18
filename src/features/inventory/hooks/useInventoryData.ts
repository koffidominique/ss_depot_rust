import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import type { InventoryRecord } from '../types.ts';

export function useStockOverviewQuery() {
  return useQuery({
    queryKey: ['stock'],
    queryFn: () => apiClient.getStockOverview(),
  });
}

export function useAdjustStockMutation(options: {
  onSuccessMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      product_id: number;
      direction: 'in' | 'out';
      quantity: string;
      reason: string;
      request_key: string;
    }) => apiClient.adjustStock(payload),
    onSuccess: (mv) => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      const refDoc = typeof mv.reference_document === 'string' ? mv.reference_document : '';
      const pName = typeof mv.product_name === 'string' ? mv.product_name : 'Produit';
      options.onSuccessMessage(
        refDoc
          ? `Ajustement ${refDoc} enregistré sur ${pName}.`
          : `Ajustement enregistré sur ${pName}.`
      );
    },
    onError: (err) => {
      options.onError(
        err instanceof Error ? err.message : "Erreur lors de l'ajustement du stock."
      );
    },
  });
}

export function useInventoriesQuery() {
  return useQuery({
    queryKey: ['inventories'],
    queryFn: () => apiClient.listInventories(),
  });
}

export function useInventoryMutations(options: {
  onCreated: (created: InventoryRecord) => void;
  onValidated: () => void;
  onError: (msg: string) => void;
}) {
  const qc = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (notes: string) => apiClient.createInventory(notes),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['inventories'] });
      options.onCreated(created as unknown as InventoryRecord);
    },
    onError: (err) =>
      options.onError(err instanceof Error ? err.message : 'Erreur création inventaire.'),
  });

  const validateMutation = useMutation({
    mutationFn: (args: {
      id: number;
      lines: Array<{ product_id: number; counted_quantity: string; reason?: string }>;
    }) => apiClient.validateInventory(args.id, args.lines),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventories'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      options.onValidated();
    },
    onError: (err) =>
      options.onError(err instanceof Error ? err.message : 'Erreur validation inventaire.'),
  });

  return { createMutation, validateMutation };
}
