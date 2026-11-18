import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import { formatFcfa, newRequestKey } from '../../../utils/format.ts';
import { toNonNegativeIntFcfaBigInt } from '../../sales/utils/saleCalculations.ts';
import type { OpenIssue } from '../types.ts';

export function useConsignmentsQueries() {
  const overviewQuery = useQuery({
    queryKey: ['consignments'],
    queryFn: () => apiClient.getConsignmentsOverview(),
  });

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const activeMethods = useMemo(
    () => (settingsQuery.data?.paymentMethods || []).filter((m) => m.active === 1),
    [settingsQuery.data]
  );

  return { overviewQuery, activeMethods };
}

interface UseConsignmentsMutationsOptions {
  onTypeCreated: () => void;
  onAdjusted: () => void;
  onReturned: () => void;
  onError: (msg: string) => void;
}

export function useConsignmentsMutations({
  onTypeCreated,
  onAdjusted,
  onReturned,
  onError,
}: UseConsignmentsMutationsOptions) {
  const qc = useQueryClient();

  const createTypeMut = useMutation({
    mutationFn: (payload: {
      code: string;
      name: string;
      producer: string;
      kind: 'bottle' | 'crate';
      deposit_value: number;
      initial_stock: number;
    }) => apiClient.createReturnableType(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consignments'] });
      onTypeCreated();
    },
    onError: (err) => onError(err instanceof Error ? err.message : 'Erreur création emballage.'),
  });

  const adjustMut = useMutation({
    mutationFn: (payload: {
      packaging_id: number;
      movement_type: 'entry' | 'breakage' | 'loss' | 'exit';
      quantity: number;
      reason: string;
    }) =>
      apiClient.adjustReturnableStock({
        ...payload,
        request_key: newRequestKey('ret-adj'),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consignments'] });
      onAdjusted();
    },
    onError: (err) => onError(err instanceof Error ? err.message : 'Erreur ajustement.'),
  });

  const returnMut = useMutation({
    mutationFn: (input: {
      target: OpenIssue;
      pieces: number;
      condition_state: 'good' | 'damaged';
      refund_amount: number;
      credit_reduction: number;
      method_code: string;
      reason: string;
    }) => {
      const remPieces = Math.max(0, input.target.pieces - input.target.returned_pieces);
      if (!Number.isSafeInteger(input.pieces) || input.pieces <= 0 || input.pieces > remPieces) {
        throw new Error(`Nombre de pièces retournées invalide (max ${remPieces}).`);
      }
      const refundCheck = toNonNegativeIntFcfaBigInt(input.refund_amount, 'Remboursement client');
      if (!refundCheck.ok) throw new Error(refundCheck.error);
      const creditCheck = toNonNegativeIntFcfaBigInt(input.credit_reduction, 'Déduction créance');
      if (!creditCheck.ok) throw new Error(creditCheck.error);
      const unitCheck = toNonNegativeIntFcfaBigInt(input.target.unit_value, 'Tarif consigne');
      if (!unitCheck.ok) throw new Error(unitCheck.error);
      const maxValBig = BigInt(input.pieces) * unitCheck.fcfa;
      if (refundCheck.fcfa + creditCheck.fcfa > maxValBig) {
        throw new Error(
          `La contrepartie (${formatFcfa(Number(refundCheck.fcfa + creditCheck.fcfa))}) dépasse la valeur consignée (${maxValBig <= BigInt(Number.MAX_SAFE_INTEGER) ? formatFcfa(Number(maxValBig)) : String(maxValBig)}).`
        );
      }
      return apiClient.returnClientEmpties({
        issue_id: input.target.id,
        pieces: input.pieces,
        condition_state: input.condition_state,
        refund_amount: input.refund_amount,
        credit_reduction: input.credit_reduction,
        method_code: input.method_code,
        reason: input.reason,
        request_key: newRequestKey('ret-cli'),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consignments'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
      qc.invalidateQueries({ queryKey: ['receivables'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      onReturned();
    },
    onError: (err) => onError(err instanceof Error ? err.message : 'Erreur retour client.'),
  });

  return { createTypeMut, adjustMut, returnMut };
}
