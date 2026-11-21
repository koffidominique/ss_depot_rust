import { CheckCircle2, Printer } from 'lucide-react';
import type { PrintableDocumentData } from '../../../components/documents/DocumentPrintModal.tsx';
import type { SaleDetail } from '../../../types/erp.ts';
import { formatFcfa, formatQty } from '../../../utils/format.ts';

export function buildSalePrintableDoc(sale: SaleDetail): PrintableDocumentData {
  return {
    docType: sale.sale_type === 'credit' ? 'FACTURE' : 'REÇU DE VENTE',
    reference: sale.reference,
    date: sale.created_at,
    statusLabel:
      sale.status === 'validated'
        ? 'Validée'
        : sale.status === 'cancelled'
          ? 'Annulée'
          : sale.status === 'partially_returned'
            ? 'Retour partiel'
            : 'Retournée',
    partyTitle: 'Client',
    partyName: sale.client_name || 'Client Comptoir',
    partyDetails: [sale.client_code, sale.client_phone].filter(Boolean).join(' · ') || undefined,
    lines: [
      ...sale.lines.map((l) => ({
        label: l.product_name,
        sublabel: `${l.packaging_name} (×${formatQty(l.coefficient_milli, l.base_unit)})`,
        quantity: formatQty(l.quantity_milli),
        unitPrice: l.unit_price,
        total: l.line_total,
      })),
      ...sale.deposits.map((d) => ({
        label: `Retour emballage : ${d.packaging_name}`,
        sublabel: d.expected_products
          ? `Code ${d.packaging_code} · Bouteilles attendues : ${d.expected_products}`
          : `Code ${d.packaging_code}`,
        quantity: `${d.pieces} pcs`,
        unitPrice: d.unit_value,
        total: d.amount,
      })),
    ],
    summaryRows: [
      { label: 'Total marchandises', value: formatFcfa(sale.total_merchandise) },
      { label: 'Remise', value: formatFcfa(sale.discount_amount) },
      { label: 'Retour emballages', value: formatFcfa(sale.total_deposit) },
      { label: 'Total TTC', value: formatFcfa(sale.total_amount), bold: true },
      { label: 'Encaissé', value: formatFcfa(sale.paid_amount), tone: 'success' },
      {
        label: 'Reste à payer',
        value: formatFcfa(sale.remaining_amount),
        tone: sale.remaining_amount > 0 ? 'warning' : 'default',
      },
    ],
    payments: sale.payments.map((p) => ({
      label: `${p.method_label} (${p.reference})`,
      amount: p.part_amount,
    })),
    notes: sale.due_date ? `Échéance crédit : ${sale.due_date}` : sale.notes,
  };
}

interface ValidatedSaleBannerProps {
  sale: SaleDetail;
  onPrint: (doc: PrintableDocumentData) => void;
  onClose: () => void;
}

export function ValidatedSaleBanner({ sale, onPrint, onClose }: ValidatedSaleBannerProps) {
  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-[#111A2E] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-[#16A36A]" />
          <div>
            <h3 className="font-display text-base font-semibold">
              Vente validée · {sale.reference}
            </h3>
            <p className="text-xs text-[#667085] dark:text-slate-400">
              Client : {sale.client_name} · Total : {formatFcfa(sale.total_amount)} · Encaissé :{' '}
              {formatFcfa(sale.paid_amount)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 no-print">
          <button
            type="button"
            onClick={() => onPrint(buildSalePrintableDoc(sale))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimer / PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
