import type { DocumentArchiveDetail } from "../../../types/erp.ts";
import { formatFcfa } from "../../../utils/format.ts";
import type {
  PrintableDocumentData,
  PrintableDocumentPackagingRow,
} from "../../../components/documents/DocumentPrintModal.tsx";
import { buildSalePrintableDoc } from "../../sales/components/ValidatedSaleBanner.tsx";

const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  confirmed: "Confirmée",
  preparing: "En préparation",
  delivered: "Livrée",
  invoiced: "Facturée",
  paid: "Soldée",
  cancelled: "Annulée",
};

const UNIT_LABELS: Record<string, string> = {
  unit: "unité",
  bottle: "bouteille",
  can: "canette",
  half_crate: "demi-casier",
  crate: "casier",
  pack: "pack",
  carton: "carton",
  pallet: "palette",
  custom: "unité personnalisée",
};

export function buildArchivedDocumentPrintable(
  archived: DocumentArchiveDetail,
): PrintableDocumentData {
  const snapshot = archived.snapshot;
  if (snapshot.sale) {
    const doc = buildSalePrintableDoc(snapshot.sale);
    return {
      ...doc,
      reference: archived.document.documentReference,
      date: archived.document.documentDate,
      statusLabel: archived.document.sourceStatus,
      partyName: archived.document.customerName,
      partyDetails: [
        snapshot.customer?.code,
        snapshot.customer?.phone,
        snapshot.customer?.address,
        snapshot.customer?.city,
      ].filter(Boolean).join(" · ") || doc.partyDetails,
    };
  }

  const detail = snapshot.orderDetail;
  if (!detail) {
    throw new Error("L'instantané archivé ne contient pas les lignes du document.");
  }
  const order = detail.order;
  const customer = snapshot.customer;
  const packagingRows: PrintableDocumentPackagingRow[] = detail.allocations.map((allocation) => ({
    label: allocation.packaging_name,
    capacity: allocation.capacity,
    quantity: allocation.quantity,
    isConsigned: allocation.is_consigned === 1,
    depositUnit: allocation.deposit_amount_xof,
    depositTotal: allocation.is_consigned === 1
      ? allocation.quantity * allocation.deposit_amount_xof
      : 0,
    providedBy: allocation.provided_by,
    returnedQuantity: allocation.returned_quantity,
  }));

  const notes = [
    order.delivery_date ? `Livraison prévue : ${order.delivery_date}` : null,
    order.delivery_address ? `Adresse de livraison : ${order.delivery_address}` : null,
    order.payment_method ? `Mode prévu : ${order.payment_method}` : null,
    order.notes,
  ].filter(Boolean).join(" · ");

  return {
    docType: "BON DE COMMANDE",
    reference: archived.document.documentReference,
    date: archived.document.documentDate,
    statusLabel: ORDER_STATUS_LABELS[archived.document.sourceStatus] ?? archived.document.sourceStatus,
    partyTitle: "Client",
    partyName: archived.document.customerName,
    partyDetails: [
      customer?.code,
      customer?.phone ?? archived.document.customerPhone,
      customer?.address,
      customer?.city,
    ].filter(Boolean).join(" · ") || undefined,
    lines: detail.lines.map((line) => ({
      label: line.product_name,
      sublabel: line.variant_name,
      quantity: `${line.requested_quantity} ${UNIT_LABELS[line.requested_unit] ?? line.requested_unit}`,
      unitPrice: line.unit_price_xof,
      total: line.line_total_xof,
    })),
    packagingRows,
    summaryRows: [
      { label: "Sous-total marchandises", value: formatFcfa(order.subtotal_xof) },
      { label: "Remise commerciale", value: formatFcfa(order.discount_xof) },
      { label: "Taxes", value: formatFcfa(order.tax_xof) },
      { label: "Total marchandises", value: formatFcfa(order.total_xof) },
      { label: "Consignes des emballages", value: formatFcfa(order.deposit_due_xof), tone: "warning" },
      { label: "Net à percevoir", value: formatFcfa(order.total_to_collect_xof), bold: true },
      { label: "Déjà réglé", value: formatFcfa(order.paid_xof), tone: "success" },
      {
        label: "Reste à payer",
        value: formatFcfa(Math.max(0, order.total_to_collect_xof - order.paid_xof)),
        tone: order.total_to_collect_xof > order.paid_xof ? "warning" : "success",
      },
    ],
    notes: notes || "Bon de commande : ce document ne constitue pas une preuve de paiement.",
  };
}
