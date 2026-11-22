import type { PrintableDocumentData } from "../../../components/documents/DocumentPrintModal.tsx";
import type { AppSettings, Client, CustomerOrderDetail } from "../../../types/erp.ts";
import { formatDateTime, formatFcfa, formatQty, packagingContentsLabel } from "../../../utils/format.ts";

/* ============================================================================
 * BON DE COMMANDE CLIENT – ACCUSÉ DE RÉCEPTION (conforme au modèle Recu.md)
 * Document commercial remis au client à l'enregistrement de la commande.
 * Ce document n'est ni une facture ni un reçu de paiement.
 * ============================================================================ */

const STATUS_LABELS: Record<string, string> = {
  draft: "BROUILLON",
  confirmed: "CONFIRMÉE",
  delivered: "LIVRÉE",
  invoiced: "FACTURÉE",
  paid: "SOLDÉE",
  cancelled: "ANNULÉE",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "ESPÈCES",
  mobile_money: "MOBILE MONEY",
  credit: "CRÉDIT",
  mixed: "MIXTE",
};

const REQUESTED_UNIT_LABELS: Record<string, string> = {
  unit: 'unité', bottle: 'bouteille', can: 'canette', half_crate: 'demi-casier',
  crate: 'casier', pack: 'pack', carton: 'carton', pallet: 'palette', custom: 'conditionnement personnalisé',
};

export function buildOrderReceiptDocument(
  order: CustomerOrderDetail,
  client: Client | null,
  agentName: string | null,
  receiptSnapshot?: {
    receiptNumber: string;
    issuedAt: string;
    company: AppSettings;
    payments?: Array<{ reference: string; paidAt: string; methodLabel: string; amountXof: number }>;
    revisionReason?: string;
  },
): PrintableDocumentData {
  const { order: o, lines, allocations, links } = order;
  const remainingToPay = Math.max(0, o.total_to_collect_xof - o.paid_xof);
  const paymentStatus =
    o.paid_xof <= 0 ? "NON PAYÉ" : remainingToPay <= 0 ? "SOLDÉ" : "PARTIEL";

  // Afficher le type de conditionnement commandé et sa conversion physique.
  const productLines = lines.map((line) => {
    const unitLabel = REQUESTED_UNIT_LABELS[line.requested_unit] || line.requested_unit;
    const assignedPackagings = links
      .filter((link) => link.order_line_id === line.id)
      .map((link) => {
        const allocation = allocations.find((item) => item.id === link.order_packaging_allocation_id);
        return allocation
          ? `${allocation.packaging_name} · ${formatQty(link.units_in_packaging)} ${unitLabel} par emballage`
          : null;
      })
      .filter(Boolean);
    return {
      label: `${line.product_name} · ${line.variant_name}`,
      sublabel: [
        `Conditionnement commandé : ${packagingContentsLabel(unitLabel, line.base_unit, Math.round(line.base_quantity * 1000 / line.requested_quantity))} · ${formatQty(line.requested_quantity)} ${unitLabel} = ${formatQty(line.base_quantity)} ${line.base_unit}`,
        ...assignedPackagings,
      ].join(' · '),
      quantity: `${formatQty(line.requested_quantity)} ${unitLabel}`,
      unitPrice: line.unit_price_xof,
      discount: line.discount_xof,
      total: line.line_total_xof,
    };
  });

  // Allocation planifiée distincte de la remise physique. La quantité remise
  // n'est affichée que lorsque le cycle de commande a effectivement livré.
  const packagingLines = allocations.map((a) => ({
    label: `${a.packaging_name} · capacité ${formatQty(a.capacity)} unité(s) de base`,
    kind: 'other' as const,
    expectedQuantity: a.quantity,
    issuedQuantity: ['delivered', 'invoiced', 'paid'].includes(o.status) ? a.quantity : undefined,
    returnedQuantity: a.returned_quantity,
    unitDepositXof: a.is_consigned ? a.deposit_amount_xof : null,
    statusLabel: a.is_consigned ? 'Consigné — suivi séparé des boissons' : 'Emballage non consigné',
    detail: `Fourni par : ${a.provided_by || 'SOUS-DÉPÔT'} · Composition mixte liée aux lignes de commande`,
    amount: a.is_consigned ? a.quantity * a.deposit_amount_xof : 0,
  }));

  // Composition des casiers mixtes (lien ligne produit ↔ casier)
  const mixedCompositionRows: string[] = [];
  for (const link of links) {
    const line = lines.find((l) => l.id === link.order_line_id);
    const alloc = allocations.find(
      (a) => a.id === link.order_packaging_allocation_id,
    );
    if (line && alloc) {
      mixedCompositionRows.push(
        `${line.product_name} ${line.variant_name} : ${formatQty(link.units_in_packaging)} u. dans ${alloc.packaging_name}`,
      );
    }
  }

  const clientDetails = client
    ? [
        `Code : ${client.code}`,
        client.phone ? `Tél : ${client.phone}` : null,
        client.address ? `Adresse : ${client.address}` : null,
        client.city ? `Ville : ${client.city}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return {
    docType: "BON DE COMMANDE CLIENT – ACCUSÉ DE RÉCEPTION",
    reference: receiptSnapshot?.receiptNumber || o.order_number,
    orderReference: o.order_number,
    date: receiptSnapshot?.issuedAt || o.created_at,
    companySnapshot: receiptSnapshot?.company,
    statusLabel: STATUS_LABELS[o.status] ?? o.status.toUpperCase(),
    partyTitle: "FACTURER À · CLIENT",
    partyName: client?.name || o.customer_name,
    partyDetails: clientDetails,
    partyPhone: client?.phone ?? null,
    secondaryPartyTitle: "LIVRER À",
    secondaryPartyName: client?.name || o.customer_name,
    secondaryPartyDetails: o.delivery_address || "À retirer au sous-dépôt",
    deliveryDate: o.delivery_date,
    lines: productLines,
    packagingLines,
    payments: receiptSnapshot?.payments?.map((payment) => ({
      label: `${payment.methodLabel} · Réf. interne ${payment.reference} · ${formatDateTime(payment.paidAt)}`,
      amount: payment.amountXof,
    })),
    summaryRows: [
      { label: "SOUS-TOTAL DES LIGNES", value: formatFcfa(o.subtotal_xof) },
      { label: "REMISE COMMERCIALE", value: `- ${formatFcfa(o.discount_xof)}` },
      { label: "Taxes", value: formatFcfa(o.tax_xof) },
      {
        label: "TOTAL MARCHANDISES",
        value: formatFcfa(o.total_xof),
      },
      {
        label: "Consignes des emballages",
        value: formatFcfa(o.deposit_due_xof),
        tone: "warning",
      },
      {
        label: "TOTAL NET À PERCEVOIR",
        value: formatFcfa(o.total_to_collect_xof),
        bold: true,
      },
      {
        label: "Acomptes / paiements enregistrés",
        value: `- ${formatFcfa(o.paid_xof)}`,
        tone: "success",
      },
      {
        label: "RESTE À PAYER",
        value: formatFcfa(remainingToPay),
        bold: true,
        tone: remainingToPay > 0 ? "danger" : "default",
      },
    ],
    notes:
      [
        `Commande : ${o.order_number}`,
        `Type : ${o.order_type.toUpperCase()}`,
        o.payment_method
          ? `Mode de règlement prévu : ${PAYMENT_METHOD_LABELS[o.payment_method] ?? o.payment_method.toUpperCase()}`
          : null,
        `Statut du paiement : ${paymentStatus}`,
        receiptSnapshot?.revisionReason ? `VERSION CORRIGÉE — Motif : ${receiptSnapshot.revisionReason}` : null,
        o.delivery_address ? `Livraison : ${o.delivery_address}` : null,
        agentName ? `Émis par : ${agentName}` : null,
        mixedCompositionRows.length > 0
          ? `Casiers mixtes — ${mixedCompositionRows.join(" ; ")}`
          : null,
        o.notes,
        "Les consignes correspondent à des emballages récupérables, suivies séparément de la valeur des boissons et régularisées selon les emballages effectivement restitués.",
        "IMPORTANT : Ce document est un accusé de réception de commande. Il ne remplace pas une facture ni un reçu de paiement. Seuls les encaissements enregistrés par le sous-dépôt font foi.",
      ]
        .filter(Boolean)
        .join("\n") || null,
  };
}
