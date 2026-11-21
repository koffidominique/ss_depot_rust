import type { PrintableDocumentData } from '../../../components/documents/DocumentPrintModal.tsx';
import { formatFcfa } from '../../../utils/format.ts';
import type { DepositReturnRow } from '../types.ts';

/* ============================================================================
 * Constructeur de reçu imprimable pour retour d'emballages
 * ============================================================================ */

export function buildReturnPrintDocument(row: DepositReturnRow): PrintableDocumentData {
  return {
    docType: 'REÇU RETOUR EMBALLAGES',
    reference: row.reference,
    date: row.created_at,
    partyTitle: 'Client',
    partyName: row.client_name || 'Client Comptoir',
    lines: [
      {
        label: row.packaging_name,
        sublabel: `État : ${
          row.condition_state === 'good'
            ? 'Bon état (réintégré)'
            : 'Endommagé / Cassé'
        }`,
        quantity: `${row.pieces} pcs`,
        unitPrice: null,
        total: row.refund_amount + row.credit_reduction,
      },
    ],
    summaryRows: [
      { label: 'Remboursement client', value: formatFcfa(row.refund_amount) },
      { label: 'Déduction créance', value: formatFcfa(row.credit_reduction) },
      {
        label: 'Total régularisé',
        value: formatFcfa(row.refund_amount + row.credit_reduction),
        bold: true,
      },
    ],
    payments:
      row.refund_amount > 0
        ? [{ label: row.method_label, amount: row.refund_amount }]
        : undefined,
    notes: row.reason,
  };
}
