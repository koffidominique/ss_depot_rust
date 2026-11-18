import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { BarChart3, Boxes, Download, Landmark, Printer, Repeat, Truck, WalletCards } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { SaleSummary } from '../types/erp.ts';
import {
  exportReceivablesCsv,
  exportSalesCsv,
  exportStockMovementsCsv,
  type StockMovementCsvRow,
} from '../utils/csv.ts';
import { useReportsQueries } from '../features/reports/hooks/useReportsData.ts';
import {
  buildCashPdfDoc,
  buildCommercialPdfDoc,
  buildConsignmentsPdfDoc,
  buildReceivablesPdfDoc,
  buildStockPdfDoc,
  buildSuppliersPdfDoc,
  type StockProductReportRow,
} from '../features/reports/utils/reportPdfBuilders.ts';
import { CommercialReportTab } from '../features/reports/components/CommercialReportTab.tsx';
import {
  CashReportTab,
  ConsignmentsReportTab,
  ReceivablesReportTab,
  StockReportTab,
  SuppliersReportTab,
} from '../features/reports/components/ReportDomainTabs.tsx';

export function ReportsPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activeTab, setActiveTab] = useState('commercial');
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);

  const {
    reportsQuery,
    stockQuery,
    cashQuery,
    receivablesQuery,
    supplierDebtsQuery,
    consignmentsQuery,
  } = useReportsQueries(fromDate, toDate, activeTab);

  const { data, isLoading, error, refetch } = reportsQuery;

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
  const periodLabel =
    fromDate || toDate ? `${fromDate || 'Début'} → ${toDate || "Aujourd'hui"}` : 'Toutes périodes';

  const handleExportTabCsv = async () => {
    setExportingCsv(true);
    try {
      if (activeTab === 'receivables') {
        const recs = receivablesQuery.data || (await apiClient.listReceivables());
        exportReceivablesCsv(recs);
      } else if (activeTab === 'stock') {
        const stock = stockQuery.data || (await apiClient.getStockOverview());
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

  const handleOpenPdf = () => {
    if (activeTab === 'stock') setPrintDoc(buildStockPdfDoc(data, stockQuery.data, today));
    else if (activeTab === 'cash') setPrintDoc(buildCashPdfDoc(cashQuery.data, today));
    else if (activeTab === 'receivables')
      setPrintDoc(buildReceivablesPdfDoc(receivablesQuery.data, today));
    else if (activeTab === 'suppliers')
      setPrintDoc(buildSuppliersPdfDoc(supplierDebtsQuery.data, today));
    else if (activeTab === 'consignments')
      setPrintDoc(buildConsignmentsPdfDoc(consignmentsQuery.data, today));
    else setPrintDoc(buildCommercialPdfDoc(data, periodLabel, today));
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
            onClick={handleOpenPdf}
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

        <Tabs.Content value="commercial" className="space-y-6">
          <CommercialReportTab data={data} periodLabel={periodLabel} />
        </Tabs.Content>

        <Tabs.Content value="stock" className="space-y-4">
          <StockReportTab
            products={(stockQuery.data?.products || []) as unknown as StockProductReportRow[]}
            knownValuationFcfa={data.stock.knownValuationFcfa}
          />
        </Tabs.Content>

        <Tabs.Content value="cash" className="space-y-4">
          <CashReportTab cashData={cashQuery.data} />
        </Tabs.Content>

        <Tabs.Content value="receivables" className="space-y-4">
          <ReceivablesReportTab receivables={receivablesQuery.data || []} />
        </Tabs.Content>

        <Tabs.Content value="suppliers" className="space-y-4">
          <SuppliersReportTab supplierDebts={supplierDebtsQuery.data || []} />
        </Tabs.Content>

        <Tabs.Content value="consignments" className="space-y-4">
          <ConsignmentsReportTab
            types={
              (consignmentsQuery.data?.types || []) as Array<{
                id: number;
                code: string;
                name: string;
                producer: string;
                deposit_value: number;
                stock_quantity: number;
              }>
            }
            balances={
              (consignmentsQuery.data?.clientBalances || []) as Array<{
                id: number;
                client_name: string;
                packaging_name: string;
                balance_pieces: number;
                deposit_held_amount: number;
              }>
            }
          />
        </Tabs.Content>
      </Tabs.Root>

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
