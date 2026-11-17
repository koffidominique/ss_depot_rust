import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import {
  AlertCircle,
  BarChart3,
  Boxes,
  Download,
  Landmark,
  Printer,
  Repeat,
  Truck,
  WalletCards,
} from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { MetricCard } from '../components/common/MetricCard.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { ReportsOverview, SaleSummary } from '../types/erp.ts';
import {
  exportReceivablesCsv,
  exportSalesCsv,
  exportStockMovementsCsv,
  type StockMovementCsvRow,
} from '../utils/csv.ts';
import { formatDate, formatDateTime, formatFcfa, formatNumber, formatQty } from '../utils/format.ts';

interface StockProductReportRow {
  id: number;
  reference: string;
  name: string;
  base_unit: string;
  stock_milli: number;
  min_stock_milli: number;
  average_cost_fcfa: number | null;
  valuation_fcfa: number | null;
}

export function ReportsPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activeTab, setActiveTab] = useState('commercial');
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<ReportsOverview>({
    queryKey: ['reports', fromDate, toDate],
    queryFn: () => apiClient.getReports(fromDate || undefined, toDate || undefined),
  });

  const { data: stockData } = useQuery({
    queryKey: ['stock'],
    queryFn: () => apiClient.getStockOverview(),
    enabled: activeTab === 'stock',
  });

  const { data: cashData } = useQuery({
    queryKey: ['cash'],
    queryFn: () => apiClient.getCashStatus(),
    enabled: activeTab === 'cash',
  });

  const { data: receivablesData } = useQuery({
    queryKey: ['receivables'],
    queryFn: () => apiClient.listReceivables(),
    enabled: activeTab === 'receivables',
  });

  const { data: supplierDebtsData } = useQuery({
    queryKey: ['supplier-debts'],
    queryFn: () => apiClient.listSupplierDebts(),
    enabled: activeTab === 'suppliers',
  });

  const { data: consignmentsData } = useQuery({
    queryKey: ['consignments'],
    queryFn: () => apiClient.getConsignmentsOverview(),
    enabled: activeTab === 'consignments',
  });

  if (isLoading) return <LoadingState rows={6} />;
  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Erreur chargement rapports.'}
        onRetry={() => refetch()}
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const periodLabel = fromDate || toDate ? `${fromDate || 'Début'} → ${toDate || "Aujourd'hui"}` : 'Toutes périodes';

  const openStockPdf = () => {
    const prods = (stockData?.products || []) as unknown as StockProductReportRow[];
    setPrintDoc({
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
        { label: 'Valorisation connue totale', value: formatFcfa(data.stock.knownValuationFcfa), bold: true },
      ],
    });
  };

  const openReceivablesPdf = () => {
    const openRecs = (receivablesData || []).filter((r) => r.remaining_amount > 0 && r.status !== 'cancelled');
    const total = openRecs.reduce((s, r) => s + r.remaining_amount, 0);
    setPrintDoc({
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
    });
  };

  const openCommercialPdf = () => {
    setPrintDoc({
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
        { label: 'Marge brute connue', value: formatFcfa(data.profitability.knownGrossMargin), tone: 'success' },
        { label: 'Dépenses période', value: formatFcfa(data.profitability.expensesTotal), tone: 'danger' },
        {
          label: 'Résultat net connu',
          value: formatFcfa(data.profitability.netKnownResult),
          bold: true,
          tone: data.profitability.netKnownResult >= 0 ? 'success' : 'danger',
        },
      ],
    });
  };

  const openCashPdf = () => {
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
    setPrintDoc({
      docType: 'RAPPORT DE CAISSE',
      reference: `RAP-CAI-${today}`,
      date: new Date().toISOString(),
      statusLabel: active ? `Session active ${active.reference}` : `${history.length} session(s) clôturée(s)`,
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
    });
  };

  const openSuppliersPdf = () => {
    const debts = supplierDebtsData || [];
    const openDebts = debts.filter((d) => d.remaining_amount > 0 && d.status !== 'paid');
    const totalInitial = debts.reduce((s, d) => s + d.initial_amount, 0);
    const totalRemaining = openDebts.reduce((s, d) => s + d.remaining_amount, 0);
    setPrintDoc({
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
    });
  };

  const openConsignmentsPdf = () => {
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
    const lines = [
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
    ];
    setPrintDoc({
      docType: 'ÉTAT DES CONSIGNATIONS',
      reference: `RAP-CON-${today}`,
      date: new Date().toISOString(),
      statusLabel: `${types.length} emballage(s) · ${balances.length} client(s)`,
      lines,
      summaryRows: [
        { label: 'Stock de vides au dépôt', value: `${totalDepotVides} pièce(s)` },
        { label: 'Emballages détenus par les clients', value: `${totalClientPieces} pièce(s)`, tone: 'warning' },
        {
          label: 'Total cautions clients détenues',
          value: formatFcfa(totalCaution),
          bold: true,
        },
      ],
    });
  };

  const handleExportTabCsv = async () => {
    setExportingCsv(true);
    try {
      if (activeTab === 'receivables') {
        const recs = receivablesData || (await apiClient.listReceivables());
        exportReceivablesCsv(recs);
      } else if (activeTab === 'stock') {
        const stock = stockData || (await apiClient.getStockOverview());
        exportStockMovementsCsv((stock.movements || []) as unknown as StockMovementCsvRow[]);
      } else {
        const allSales: SaleSummary[] = [];
        let cur = 1;
        let pages = 1;
        do {
          const res = await apiClient.listSales({ page: cur, pageSize: 100 });
          allSales.push(...res.items);
          pages = res.totalPages || 1;
          cur += 1;
        } while (cur <= pages && cur <= 100);
        exportSalesCsv(allSales);
      }
    } finally {
      setExportingCsv(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-[#667085]">Du</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#667085]">Au</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono-num"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Réinitialiser
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <FormTipsButton topicId="reports" label="Logique des marges" />
          {(activeTab === 'commercial' || activeTab === 'stock' || activeTab === 'receivables') && (
            <button
              type="button"
              disabled={exportingCsv}
              onClick={handleExportTabCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              {activeTab === 'stock'
                ? 'CSV Mouvements'
                : activeTab === 'receivables'
                  ? 'CSV Créances'
                  : 'CSV Ventes'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (activeTab === 'stock') openStockPdf();
              else if (activeTab === 'cash') openCashPdf();
              else if (activeTab === 'receivables') openReceivablesPdf();
              else if (activeTab === 'suppliers') openSuppliersPdf();
              else if (activeTab === 'consignments') openConsignmentsPdf();
              else openCommercialPdf();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Printer className="h-3.5 w-3.5" />
            PDF / Imprimer
          </button>
        </div>
      </div>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <Tabs.List className="flex flex-wrap gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-1">
          {[
            { id: 'commercial', label: 'Commercial & Finances', icon: BarChart3 },
            { id: 'stock', label: 'Stock & Valorisation', icon: Boxes },
            { id: 'cash', label: 'Caisse & Trésorerie', icon: Landmark },
            { id: 'receivables', label: 'Créances clients', icon: WalletCards },
            { id: 'suppliers', label: 'Fournisseurs & Dettes', icon: Truck },
            { id: 'consignments', label: 'Consignations', icon: Repeat },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <Tabs.Trigger
                key={t.id}
                value={t.id}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[#667085] dark:text-slate-300 data-[state=active]:bg-[#2563EB] data-[state=active]:text-white transition-colors"
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>

        {/* Onglet 1 : Commercial & Rentabilité */}
        <Tabs.Content value="commercial" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="CA Marchandises (hors consignes)"
              value={formatFcfa(data.commercial.merchandise_revenue)}
              hint={`${formatNumber(data.commercial.count)} vente(s) validée(s)`}
              icon={<BarChart3 className="h-4 w-4" />}
            />
            <MetricCard
              label="Consignations facturées"
              value={formatFcfa(data.commercial.deposit_billed)}
              hint="Emballages consignés hors chiffre d'affaires"
            />
            <MetricCard
              label="Marge brute connue"
              value={formatFcfa(data.profitability.knownGrossMargin)}
              tone={data.profitability.knownGrossMargin >= 0 ? 'success' : 'danger'}
              hint={`Sur CA à coût connu : ${formatFcfa(data.profitability.knownCostRevenue)}`}
            />
            <MetricCard
              label="Valorisation stock connue"
              value={formatFcfa(data.stock.knownValuationFcfa)}
              hint={`${data.stock.product_count} produits actifs`}
            />
          </div>

          {(data.profitability.unknownCostLines > 0 || data.stock.unknown_cost_products > 0) && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-xs text-[#D9901A]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Transparence des coûts historiques</div>
                <p className="mt-0.5 text-[#667085] dark:text-slate-300">
                  {data.profitability.unknownCostLines} ligne(s) de vente et {data.stock.unknown_cost_products}{' '}
                  produit(s) ont un coût d'achat non encore renseigné (aucun CUMP inventé : ces lignes sont exclues du calcul de marge connue).
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold">Compte d'exploitation synthétique (coûts connus)</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                <div className="flex justify-between py-2.5">
                  <span className="text-[#667085]">Chiffre d'affaires marchandises à coût connu</span>
                  <span className="font-mono-num font-semibold">{formatFcfa(data.profitability.knownCostRevenue)}</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-[#667085]">Coût d'achat des marchandises vendues (COGS)</span>
                  <span className="font-mono-num text-[#DC4545]">- {formatFcfa(data.profitability.knownCostTotal)}</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="font-medium">Marge brute connue</span>
                  <span className="font-mono-num font-bold text-[#16A36A]">
                    {formatFcfa(data.profitability.knownGrossMargin)}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-[#667085]">Dépenses d'exploitation cumulées</span>
                  <span className="font-mono-num text-[#DC4545]">- {formatFcfa(data.profitability.expensesTotal)}</span>
                </div>
                <div className="flex justify-between py-2.5 text-sm">
                  <span className="font-semibold">Résultat net connu</span>
                  <span
                    className={`font-mono-num font-bold ${
                      data.profitability.netKnownResult >= 0 ? 'text-[#16A36A]' : 'text-[#DC4545]'
                    }`}
                  >
                    {formatFcfa(data.profitability.netKnownResult)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold">Ventilation des flux par moyen de paiement</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[#667085]">
                      <th className="py-2">Moyen</th>
                      <th className="py-2 text-right">Entrées</th>
                      <th className="py-2 text-right">Sorties</th>
                      <th className="py-2 text-right">Solde net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.paymentBreakdown.map((pm) => (
                      <tr key={pm.code}>
                        <td className="py-2.5 font-medium">
                          {pm.label}{' '}
                          <span className="text-[11px] text-[#667085]">
                            ({pm.is_cash === 1 ? 'Espèces' : 'Digital'})
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono-num text-[#16A36A]">{formatFcfa(pm.total_in)}</td>
                        <td className="py-2.5 text-right font-mono-num text-[#DC4545]">{formatFcfa(pm.total_out)}</td>
                        <td className="py-2.5 text-right font-mono-num font-semibold">
                          {formatFcfa(pm.total_in - pm.total_out)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {data.dailySales.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold">Détail journalier des ventes ({periodLabel})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[#667085]">
                      <th className="py-2">Journée</th>
                      <th className="py-2 text-right">Ventes</th>
                      <th className="py-2 text-right">CA Marchandises</th>
                      <th className="py-2 text-right">Consignes</th>
                      <th className="py-2 text-right">Encaissé</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.dailySales.map((d) => (
                      <tr key={d.day}>
                        <td className="py-2 font-mono-num">{formatDate(d.day)}</td>
                        <td className="py-2 text-right font-mono-num">{d.count}</td>
                        <td className="py-2 text-right font-mono-num font-semibold">{formatFcfa(d.revenue)}</td>
                        <td className="py-2 text-right font-mono-num text-[#D9901A]">{formatFcfa(d.deposit)}</td>
                        <td className="py-2 text-right font-mono-num text-[#16A36A]">{formatFcfa(d.collected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Tabs.Content>

        {/* Onglet 2 : Stock & Valorisation */}
        <Tabs.Content value="stock" className="space-y-4">
          {(() => {
            const prods = (stockData?.products || []) as unknown as StockProductReportRow[];
            return (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-semibold">
                    État du stock & valorisation CUMP ({prods.length} produits actifs)
                  </h3>
                  <span className="font-mono-num text-xs font-bold text-[#2563EB]">
                    Total connu : {formatFcfa(data.stock.knownValuationFcfa)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[#667085]">
                        <th className="py-2">Réf / Produit</th>
                        <th className="py-2 text-right">Stock</th>
                        <th className="py-2 text-right">CUMP</th>
                        <th className="py-2 text-right">Valorisation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {prods.slice(0, 100).map((p) => (
                        <tr key={p.id}>
                          <td className="py-2">
                            <span className="font-mono-num text-[#667085]">{p.reference}</span> ·{' '}
                            <span className="font-medium">{p.name}</span>
                          </td>
                          <td className="py-2 text-right font-mono-num">
                            {formatQty(p.stock_milli, p.base_unit)}
                          </td>
                          <td className="py-2 text-right font-mono-num">
                            {p.average_cost_fcfa !== null ? formatFcfa(p.average_cost_fcfa) : 'Inconnu'}
                          </td>
                          <td className="py-2 text-right font-mono-num font-semibold">
                            {p.valuation_fcfa !== null ? formatFcfa(p.valuation_fcfa) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </Tabs.Content>

        {/* Onglet 3 : Caisse & Trésorerie */}
        <Tabs.Content value="cash" className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold">Sessions de caisse récentes</h3>
            {cashData?.activeSession && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-xs flex justify-between">
                <span>
                  Session active : <strong className="font-mono-num">{cashData.activeSession.reference}</strong> (ouverte le{' '}
                  {formatDateTime(cashData.activeSession.opened_at)})
                </span>
                <span className="font-mono-num font-bold text-[#16A36A]">
                  Théorique espèces : {formatFcfa(cashData.summary?.theoreticalCash ?? cashData.activeSession.opening_cash)}
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[#667085]">
                    <th className="py-2">Session</th>
                    <th className="py-2">Clôture</th>
                    <th className="py-2 text-right">Théorique</th>
                    <th className="py-2 text-right">Physique</th>
                    <th className="py-2 text-right">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(cashData?.history || []).map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 font-mono-num font-semibold">{s.reference}</td>
                      <td className="py-2 font-mono-num text-[#667085]">{formatDateTime(s.closed_at)}</td>
                      <td className="py-2 text-right font-mono-num">{formatFcfa(s.theoretical_cash)}</td>
                      <td className="py-2 text-right font-mono-num">{formatFcfa(s.physical_cash)}</td>
                      <td className="py-2 text-right font-mono-num font-semibold">{formatFcfa(s.difference)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Tabs.Content>

        {/* Onglet 4 : Créances clients */}
        <Tabs.Content value="receivables" className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold">État des créances clients</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[#667085]">
                    <th className="py-2">Client</th>
                    <th className="py-2">Facture</th>
                    <th className="py-2">Échéance</th>
                    <th className="py-2 text-right">Initial</th>
                    <th className="py-2 text-right">Reste</th>
                    <th className="py-2 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(receivablesData || []).map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 font-medium">{r.client_name}</td>
                      <td className="py-2 font-mono-num">{r.sale_reference}</td>
                      <td className="py-2 font-mono-num text-[#667085]">{formatDate(r.due_date)}</td>
                      <td className="py-2 text-right font-mono-num">{formatFcfa(r.initial_amount)}</td>
                      <td className="py-2 text-right font-mono-num font-semibold text-[#D9901A]">
                        {formatFcfa(r.remaining_amount)}
                      </td>
                      <td className="py-2 text-right">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Tabs.Content>

        {/* Onglet 5 : Fournisseurs & Dettes */}
        <Tabs.Content value="suppliers" className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold">Engagements & dettes fournisseurs</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[#667085]">
                    <th className="py-2">Fournisseur</th>
                    <th className="py-2">Réception</th>
                    <th className="py-2">Échéance</th>
                    <th className="py-2 text-right">Initial</th>
                    <th className="py-2 text-right">Reste dû</th>
                    <th className="py-2 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(supplierDebtsData || []).map((d) => (
                    <tr key={d.id}>
                      <td className="py-2 font-medium">{d.supplier_name}</td>
                      <td className="py-2 font-mono-num">{d.receipt_reference}</td>
                      <td className="py-2 font-mono-num text-[#667085]">{formatDate(d.due_date)}</td>
                      <td className="py-2 text-right font-mono-num">{formatFcfa(d.initial_amount)}</td>
                      <td className="py-2 text-right font-mono-num font-semibold text-[#DC4545]">
                        {formatFcfa(d.remaining_amount)}
                      </td>
                      <td className="py-2 text-right">
                        <StatusBadge status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Tabs.Content>

        {/* Onglet 6 : Consignations */}
        <Tabs.Content value="consignments" className="space-y-4">
          {(() => {
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
            return (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
                  <h3 className="font-display text-sm font-semibold">Parc emballages dépôt</h3>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {types.map((t) => (
                      <div key={t.id} className="flex items-center justify-between py-2">
                        <div>
                          <div className="font-medium">{t.name}</div>
                          <div className="text-[#667085]">{t.code} · {t.producer}</div>
                        </div>
                        <div className="text-right font-mono-num">
                          <div className="font-semibold">{t.stock_quantity} vides</div>
                          <div className="text-[#667085]">{formatFcfa(t.deposit_value)} / u</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-3">
                  <h3 className="font-display text-sm font-semibold">Emballages détenus par les clients</h3>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {balances.length === 0 ? (
                      <p className="text-[#667085] py-2">Aucun emballage client en attente.</p>
                    ) : (
                      balances.map((b) => (
                        <div key={b.id} className="flex items-center justify-between py-2">
                          <div>
                            <div className="font-medium">{b.client_name}</div>
                            <div className="text-[#667085]">{b.packaging_name}</div>
                          </div>
                          <div className="text-right font-mono-num">
                            <div className="font-semibold text-[#D9901A]">{b.balance_pieces} pcs</div>
                            <div className="text-[#667085]">{formatFcfa(b.deposit_held_amount)}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </Tabs.Content>
      </Tabs.Root>

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
