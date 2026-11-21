import { useMemo } from 'react';
import type { PrintableDocumentData } from '../../../components/documents/DocumentPrintModal.tsx';
import type { OpenIssue, ReturnableType } from '../types.ts';
import {
  buildBalanceColumns,
  buildIssueColumns,
  buildTypeColumns,
} from './consignmentSupplyColumns.tsx';
import {
  buildMovementColumns,
  buildReturnColumns,
} from './consignmentHistoryColumns.tsx';

/* ============================================================================
 * Hook de mémoïsation des colonnes de tableaux Consignations
 * ============================================================================ */

export function useConsignmentColumns(options: {
  onAdjustType: (type: ReturnableType) => void;
  onStartReturn: (issue: OpenIssue) => void;
  onPrintReturn: (doc: PrintableDocumentData) => void;
}) {
  const { onAdjustType, onStartReturn, onPrintReturn } = options;

  const typeCols = useMemo(() => buildTypeColumns(onAdjustType), [onAdjustType]);
  const issueCols = useMemo(() => buildIssueColumns(onStartReturn), [onStartReturn]);
  const balanceCols = useMemo(() => buildBalanceColumns(), []);
  const movementCols = useMemo(() => buildMovementColumns(), []);
  const returnCols = useMemo(() => buildReturnColumns(onPrintReturn), [onPrintReturn]);

  return { typeCols, issueCols, balanceCols, movementCols, returnCols };
}
