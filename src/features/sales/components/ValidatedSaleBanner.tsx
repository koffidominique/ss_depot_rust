import { motion } from 'motion/react';
import { CheckCircle2, Printer } from 'lucide-react';
import type { PrintableDocumentData } from '../../../components/documents/DocumentPrintModal.tsx';
import { DP_BUTTON_HOVER, DP_BUTTON_TAP, DP_SPRING_SNAPPY } from '../../../components/motion/MotionPrimitives.tsx';
import type { SaleDetail } from '../../../types/erp.ts';
import { formatFcfa, formatQty, packagingContentsLabel } from '../../../utils/format.ts';

function saleLineSnapshotDescription(line: SaleDetail['lines'][number]): string {
  let product = { brand: '', brewery: '', variant: '', volumeMl: 0 };
  let regime: string | undefined;
  try {
    const snapshot = JSON.parse(line.product_snapshot_json || '{}') as typeof product;
    product = { ...product, ...snapshot };
  } catch { /* Ancien snapshot inconnu, ne jamais consulter le catalogue courant. */ }
  try {
    const snapshot = JSON.parse(line.packaging_snapshot_json || '{}') as { depositRegime?: string };
    regime = snapshot.depositRegime === 'deposit'
      ? 'Régime emballage : retournable / consigné'
      : snapshot.depositRegime === 'none'
        ? 'Non retournable — aucun emballage consigné'
        : undefined;
  } catch { /* Ancien snapshot inconnu. */ }
  const complement = product.brand || product.brewery || product.variant || product.volumeMl
    ? [product.brewery, product.brand, product.variant, product.volumeMl ? product.volumeMl % 10 === 0 ? `${product.volumeMl / 10} cl` : `${product.volumeMl} ml` : ''].filter(Boolean).join(' · ')
    : 'Caractéristiques complémentaires non disponibles sur cette opération historique';
  const unit = line.sales_unit_label || line.packaging_name;
  const conversion = `Conditionnement : ${unit} · ${packagingContentsLabel(unit, line.base_unit, line.coefficient_milli)} · conversion ${formatQty(line.quantity_milli)} ${unit} = ${formatQty(line.base_quantity_milli)} ${line.base_unit}`;
  return [complement, conversion, regime].filter(Boolean).join(' · ');
}

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
        sublabel: saleLineSnapshotDescription(l),
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
    packagingLines: sale.deposits.map((deposit) => ({
      label: `${deposit.packaging_name} (${deposit.packaging_code})`,
      kind: deposit.kind,
      expectedQuantity: deposit.pieces,
      issuedQuantity: deposit.pieces,
      returnedQuantity: deposit.returned_pieces,
      statusLabel: deposit.pieces - deposit.returned_pieces > 0
        ? `${deposit.pieces - deposit.returned_pieces} à restituer`
        : 'Restitution complète',
      detail: deposit.expected_products || undefined,
      amount: deposit.amount,
    })),
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
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={DP_SPRING_SNAPPY}
      className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-[#111A2E] dp-surface-interactive p-6"
    >
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
          <motion.button
            type="button"
            whileHover={DP_BUTTON_HOVER}
            whileTap={DP_BUTTON_TAP}
            transition={DP_SPRING_SNAPPY}
            onClick={() => onPrint(buildSalePrintableDoc(sale))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-xs transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimer / PDF
          </motion.button>
          <motion.button
            type="button"
            whileHover={DP_BUTTON_HOVER}
            whileTap={DP_BUTTON_TAP}
            transition={DP_SPRING_SNAPPY}
            onClick={onClose}
            className="rounded-lg bg-[#2563EB] dp-btn-elevated px-3.5 py-2 text-xs font-semibold text-white"
          >
            Fermer
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
