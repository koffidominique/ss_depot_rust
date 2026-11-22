import type { PrintableDocumentData } from "../../../components/documents/DocumentPrintModal.tsx";
import type { Client, CustomerOrderDetail } from "../../../types/erp.ts";
import { formatFcfa, formatQty } from "../../../utils/format.ts";

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

export function buildOrderReceiptDocument(
  order: CustomerOrderDetail,
  client: Client | null,
  agentName: string | null,
): PrintableDocumentData {
  const { order: o, lines, allocations, links } = order;
  const remainingToPay = Math.max(0, o.total_to_collect_xof - o.paid_xof);
  const paymentStatus =
    o.paid_xof <= 0 ? "NON PAYÉ" : remainingToPay <= 0 ? "SOLDÉ" : "PARTIEL";

  // Lignes produits : quantité commerciale + équivalent bouteilles (base)
  const productLines = lines.map((l) => ({
    label: `${l.product_name} · ${l.variant_name}`,
    sublabel:
      `Qté commandée : ${formatQty(l.requested_quantity)} ${l.requested_unit}` +
      ` · Équivalent : ${formatQty(l.base_quantity)} ${"btl"}`,
    quantity: `${formatQty(l.requested_quantity)} ${l.requested_unit}`,
    unitPrice: l.unit_price_xof,
    total: l.line_total_xof,
  }));

  // Tableau emballages & casiers
  const packagingLines = allocations.map((a) => {
    const remaining = Math.max(0, a.quantity - a.returned_quantity);
    return {
      label: `${a.packaging_name} (capacité ${formatQty(a.capacity)})`,
      sublabel:
        `Fourni par : ${a.provided_by || "SOUS-DÉPÔT"}` +
        ` · Consigné : ${a.is_consigned ? "Oui" : "Non"}` +
        ` · Déjà retournés : ${formatQty(a.returned_quantity)}` +
        ` · Restant à restituer : ${formatQty(remaining)}`,
      quantity: `${formatQty(a.quantity)} u.`,
      unitPrice: a.is_consigned ? a.deposit_amount_xof : 0,
      total: a.is_consigned ? a.quantity * a.deposit_amount_xof : 0,
    };
  });

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
    docType: "REÇU DE COMMANDE",
    reference: o.order_number,
    date: o.created_at,
    statusLabel: STATUS_LABELS[o.status] ?? o.status.toUpperCase(),
    partyTitle: "FACTURER À · CLIENT",
    partyName: client?.name || o.customer_name,
    partyDetails: clientDetails,
    partyPhone: client?.phone ?? null,
    secondaryPartyTitle: "LIVRER À",
    secondaryPartyName: client?.name || o.customer_name,
    secondaryPartyDetails: o.delivery_address || client?.address || "À retirer au sous-dépôt",
    deliveryDate: o.delivery_date,
    lines: [...productLines, ...packagingLines],
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
        o.order_type ? `Type : ${o.order_type.toUpperCase()}` : null,
        o.payment_method
          ? `Mode de règlement : ${PAYMENT_METHOD_LABELS[o.payment_method] ?? o.payment_method.toUpperCase()}`
          : null,
        `Statut du paiement : ${paymentStatus}`,
        o.delivery_address ? `Livraison : ${o.delivery_address}` : null,
        agentName ? `Commercial / Agent : ${agentName}` : null,
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
