import type { PrintableDocumentData } from '../../../components/documents/DocumentPrintModal.tsx';
import type {
  CashStatus,
  Receivable,
  ReportsOverview,
  SupplierDebt,
} from '../../../types/erp.ts';
import { formatDate, formatDateTime, formatFcfa, formatQty } from '../../../utils/format.ts';

export interface StockProductReportRow {
  id: number;
  reference: string;
  name: string;
  base_unit: string;
  stock_milli: number;
  min_stock_milli: number;
  average_cost_fcfa: number | null;
  valuation_fcfa: number | null;
}

export function buildStockPdfDoc(
  data: ReportsOverview,
  stockData: { products?: unknown[] } | undefined,
  today: string
): PrintableDocumentData {
  const prods = (stockData?.products || []) as StockProductReportRow[];
  return {
    docType: 'RAPPORT DE STOCK & VALORISATION',
    reference: `RAP-STK-${today}`,
    date: new Date().toISOString(),
    statusLabel: `${prods.length} produit(s) actifs`,
    lines: prods.slice(0, 100).map((p) => ({
      label: `${p.reference} · ${p.name}`,
      sublabel: p.average_cost_fcfa !== null ? `CUMP ${formatFcfa(p.average_cost_fcfa)}` : 'Coût inconnu',
      quantity: formatQty(p.stock_milli, p.base_unit),
      unitPrice: p.average_cost_fcfa,
      total: p.valuation_fcfa ?? 0,
    })),
    summaryRows: [
      { label: 'Produits actifs', value: String(data.stock.product_count) },
      { label: 'Produits sans coût connu', value: String(data.stock.unknown_cost_products) },
      {
        label: 'Valorisation connue totale',
        value: formatFcfa(data.stock.knownValuationFcfa),
        bold: true,
      },
    ],
  };
}

export function buildReceivablesPdfDoc(
  receivablesData: Receivable[] | undefined,
  today: string
): PrintableDocumentData {
  const openRecs = (receivablesData || []).filter(
    (r) => r.remaining_amount > 0 && r.status !== 'cancelled'
  );
  const total = openRecs.reduce((s, r) => s + r.remaining_amount, 0);
  return {
    docType: 'ÉTAT DES CRÉANCES CLIENTS',
    reference: `RAP-CRE-${today}`,
    date: new Date().toISOString(),
    statusLabel: `${openRecs.length} dossier(s) ouvert(s)`,
    lines: openRecs.map((r) => ({
      label: r.client_name,
      sublabel: `Facture ${r.sale_reference}${r.due_date ? ` · Échéance ${formatDate(r.due_date)}` : ''}`,
      quantity: `Initial ${formatFcfa(r.initial_amount)}`,
      unitPrice: null,
      total: r.remaining_amount,
    })),
    summaryRows: [
      { label: 'Dossiers ouverts', value: String(openRecs.length) },
      { label: 'Total à recouvrer', value: formatFcfa(total), bold: true, tone: 'warning' },
    ],
  };
}

export function buildCommercialPdfDoc(
  data: ReportsOverview,
  periodLabel: string,
  today: string
): PrintableDocumentData {
  return {
    docType: 'BILAN COMMERCIAL & FINANCES',
    reference: `RAP-COM-${today}`,
    date: new Date().toISOString(),
    statusLabel: periodLabel,
    lines: data.paymentBreakdown.map((pm) => ({
      label: pm.label,
      sublabel: `${pm.is_cash === 1 ? 'Espèces' : 'Digital'} · Entrées ${formatFcfa(pm.total_in)} / Sorties ${formatFcfa(pm.total_out)}`,
      quantity: pm.code,
      unitPrice: null,
      total: pm.total_in - pm.total_out,
    })),
    summaryRows: [
      { label: 'CA Marchandises', value: formatFcfa(data.commercial.merchandise_revenue) },
      { label: 'Consignes facturées', value: formatFcfa(data.commercial.deposit_billed) },
      {
        label: 'Marge brute connue',
        value: formatFcfa(data.profitability.knownGrossMargin),
        tone: 'success',
      },
      {
        label: 'Dépenses période',
        value: formatFcfa(data.profitability.expensesTotal),
        tone: 'danger',
      },
      {
        label: 'Résultat net connu',
        value: formatFcfa(data.profitability.netKnownResult),
        bold: true,
        tone: data.profitability.netKnownResult >= 0 ? 'success' : 'danger',
      },
    ],
  };
}

export function buildCashPdfDoc(
  cashData: CashStatus | undefined,
  today: string
): PrintableDocumentData {
  const active = cashData?.activeSession;
  const history = cashData?.history || [];
  const lines = [
    ...(active
      ? [
          {
            label: `${active.reference} (Session ouverte)`,
            sublabel: `Ouverte le ${formatDateTime(active.opened_at)} · Fond initial ${formatFcfa(active.opening_cash)}`,
            quantity: 'En cours',
            unitPrice: null,
            total: cashData?.summary?.theoreticalCash ?? active.opening_cash,
          },
        ]
      : []),
    ...history.map((s) => ({
      label: s.reference,
      sublabel: `Clôturée le ${formatDateTime(s.closed_at)} · Théorique ${formatFcfa(s.theoretical_cash)} / Physique ${formatFcfa(s.physical_cash)}`,
      quantity: s.difference === 0 ? 'Conforme' : `Écart ${formatFcfa(s.difference)}`,
      unitPrice: s.theoretical_cash ?? null,
      total: s.physical_cash ?? s.theoretical_cash ?? 0,
    })),
  ];
  const totalDiff = history.reduce((acc, s) => acc + (s.difference ?? 0), 0);
  return {
    docType: 'RAPPORT DE CAISSE',
    reference: `RAP-CAI-${today}`,
    date: new Date().toISOString(),
    statusLabel: active
      ? `Session active ${active.reference}`
      : `${history.length} session(s) clôturée(s)`,
    lines,
    summaryRows: [
      ...(active
        ? [
            {
              label: 'Solde théorique espèces actif',
              value: formatFcfa(cashData?.summary?.theoreticalCash ?? active.opening_cash),
              tone: 'success' as const,
            },
          ]
        : []),
      { label: 'Sessions clôturées listées', value: String(history.length) },
      {
        label: 'Cumul des écarts clôture',
        value: formatFcfa(totalDiff),
        bold: true,
        tone: totalDiff === 0 ? 'success' : 'warning',
      },
    ],
  };
}

export function buildSuppliersPdfDoc(
  supplierDebtsData: SupplierDebt[] | undefined,
  today: string
): PrintableDocumentData {
  const debts = supplierDebtsData || [];
  const openDebts = debts.filter((d) => d.remaining_amount > 0 && d.status !== 'paid');
  const totalInitial = debts.reduce((s, d) => s + d.initial_amount, 0);
  const totalRemaining = openDebts.reduce((s, d) => s + d.remaining_amount, 0);
  return {
    docType: 'ÉTAT DES DETTES FOURNISSEURS',
    reference: `RAP-FRN-${today}`,
    date: new Date().toISOString(),
    statusLabel: `${openDebts.length} dette(s) ouverte(s)`,
    lines: debts.map((d) => ({
      label: d.supplier_name,
      sublabel: `Réception ${d.receipt_reference} (${d.order_reference})${d.due_date ? ` · Échéance ${formatDate(d.due_date)}` : ''}`,
      quantity: `Initial ${formatFcfa(d.initial_amount)}`,
      unitPrice: null,
      total: d.remaining_amount,
    })),
    summaryRows: [
      { label: 'Total facturé réceptions', value: formatFcfa(totalInitial) },
      { label: 'Dossiers ouverts / partiels', value: String(openDebts.length) },
      {
        label: 'Total dettes fournisseurs dues',
        value: formatFcfa(totalRemaining),
        bold: true,
        tone: totalRemaining > 0 ? 'danger' : 'success',
      },
    ],
  };
}

export function buildConsignmentsPdfDoc(
  consignmentsData: { types?: unknown[]; clientBalances?: unknown[] } | undefined,
  today: string
): PrintableDocumentData {
  const types = (consignmentsData?.types || []) as Array<{
    id: number;
    code: string;
    name: string;
    producer: string;
    deposit_value: number;
    stock_quantity: number;
  }>;
  const balances = (consignmentsData?.clientBalances || []) as Array<{
    id: number;
    client_name: string;
    packaging_name: string;
    balance_pieces: number;
    deposit_held_amount: number;
  }>;
  const totalDepotVides = types.reduce((s, t) => s + t.stock_quantity, 0);
  const totalClientPieces = balances.reduce((s, b) => s + b.balance_pieces, 0);
  const totalCaution = balances.reduce((s, b) => s + b.deposit_held_amount, 0);
  return {
    docType: 'ÉTAT DES CONSIGNATIONS',
    reference: `RAP-CON-${today}`,
    date: new Date().toISOString(),
    statusLabel: `${types.length} emballage(s) · ${balances.length} client(s)`,
    lines: [
      ...types.map((t) => ({
        label: `Dépôt · ${t.name} (${t.code})`,
        sublabel: `Producteur : ${t.producer} · Tarif consigne ${formatFcfa(t.deposit_value)}`,
        quantity: `${t.stock_quantity} vides`,
        unitPrice: t.deposit_value,
        total: t.stock_quantity * t.deposit_value,
      })),
      ...balances.map((b) => ({
        label: `Client · ${b.client_name}`,
        sublabel: `Emballage : ${b.packaging_name}`,
        quantity: `${b.balance_pieces} pcs détenues`,
        unitPrice: null,
        total: b.deposit_held_amount,
      })),
    ],
    summaryRows: [
      { label: 'Stock de vides au dépôt', value: `${totalDepotVides} pièce(s)` },
      {
        label: 'Emballages détenus par les clients',
        value: `${totalClientPieces} pièce(s)`,
        tone: 'warning',
      },
      {
        label: 'Total cautions clients détenues',
        value: formatFcfa(totalCaution),
        bold: true,
      },
    ],
  };
}
