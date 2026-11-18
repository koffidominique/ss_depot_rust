import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  AlertTriangle,
  Boxes,
  Download,
  History,
  Printer,
  SlidersHorizontal,
} from 'lucide-react';
import { MetricCard } from '../components/common/MetricCard.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { InlineAlert } from '../components/common/InlineAlert.tsx';
import { SearchInput } from '../components/forms/SearchInput.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import { exportStockBalancesCsv, exportStockMovementsCsv } from '../utils/csv.ts';
import { formatFcfa, formatQty } from '../utils/format.ts';
import type { StockMovementRow, StockProductRow } from '../features/inventory/types.ts';
import {
  useAdjustStockMutation,
  useStockOverviewQuery,
} from '../features/inventory/hooks/useInventoryData.ts';
import {
  StockBalancesTable,
  StockMovementsTable,
} from '../features/inventory/components/StockTables.tsx';
import { StockAdjustModal } from '../features/inventory/components/StockAdjustModal.tsx';

export function StockPage() {
  const [activeTab, setActiveTab] = useState<'balances' | 'movements'>('balances');
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjProductId, setAdjProductId] = useState<number>(0);
  const [adjError, setAdjError] = useState<string | null>(null);
  const [adjSuccess, setAdjSuccess] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useStockOverviewQuery();

  const adjustMut = useAdjustStockMutation({
    onSuccessMessage: (msg) => {
      setAdjustOpen(false);
      setAdjError(null);
      setAdjSuccess(msg);
    },
    onError: (msg) => setAdjError(msg),
  });

  if (isLoading) return <LoadingState rows={6} />;
  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Erreur chargement stock.'}
        onRetry={() => refetch()}
      />
    );
  }

  const allProducts = (data.products || []) as unknown as StockProductRow[];
  const movements = (data.movements || []) as unknown as StockMovementRow[];
  const products = allProducts.filter((p) => {
    const q = search.trim().toLowerCase();
    if (q && !p.name.toLowerCase().includes(q) && !p.reference.toLowerCase().includes(q)) {
      return false;
    }
    if (onlyLow && p.stock_milli > p.min_stock_milli) {
      return false;
    }
    return true;
  });

  const totalKnownValuation = allProducts.reduce((s, p) => s + (p.valuation_fcfa ?? 0), 0);
  const unknownCostCount = allProducts.filter((p) => p.average_cost_fcfa === null).length;
  const lowCount = allProducts.filter((p) => p.stock_milli <= p.min_stock_milli).length;

  const openAdjustModal = (targetProductId?: number) => {
    setAdjProductId(targetProductId || allProducts[0]?.id || 0);
    setAdjError(null);
    setAdjustOpen(true);
  };

  return (
    <div className="space-y-5">
      {adjSuccess && (
        <InlineAlert
          variant="success"
          message={adjSuccess}
          onDismiss={() => setAdjSuccess(null)}
        />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Valorisation connue du stock"
          value={formatFcfa(totalKnownValuation)}
          hint={
            unknownCostCount > 0
              ? `${unknownCostCount} produit(s) sans CUMP connu exclus`
              : 'Calculée au CUMP exact sur tous les articles'
          }
          icon={<Boxes className="h-4 w-4" />}
        />
        <MetricCard
          label="Articles suivis en stock"
          value={String(allProducts.length)}
          hint="Stock consolidé en unité de base"
        />
        <MetricCard
          label="Articles sous seuil d'alerte"
          value={String(lowCount)}
          tone={lowCount > 0 ? 'warning' : 'success'}
          icon={<AlertTriangle className="h-4 w-4" />}
          hint="Inclut les ruptures et stocks critiques"
        />
      </div>

      <Tabs.Root
        value={activeTab}
        onValueChange={(v) => setActiveTab(v === 'movements' ? 'movements' : 'balances')}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs.List className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-1">
            <Tabs.Trigger
              value="balances"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] data-[state=active]:bg-[#2563EB] data-[state=active]:text-white transition-colors"
            >
              <Boxes className="h-3.5 w-3.5" />
              Niveaux & valorisation
            </Tabs.Trigger>
            <Tabs.Trigger
              value="movements"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[#667085] data-[state=active]:bg-[#2563EB] data-[state=active]:text-white transition-colors"
            >
              <History className="h-3.5 w-3.5" />
              Journal des mouvements ({movements.length})
            </Tabs.Trigger>
          </Tabs.List>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#182230] dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyLow}
                onChange={(e) => setOnlyLow(e.target.checked)}
                className="rounded border-slate-300 text-[#2563EB]"
              />
              Alertes uniquement
            </label>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Filtrer un produit..."
              ariaLabel="Filtrer un produit"
              className="w-56"
              inputClassName="py-1.5 text-xs bg-white dark:bg-slate-900"
            />
            <FormTipsButton topicId="stock" label="Règles CUMP" />
            <button
              type="button"
              disabled={allProducts.length === 0}
              onClick={() => openAdjustModal()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Ajuster le stock
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeTab === 'movements') exportStockMovementsCsv(movements);
                else exportStockBalancesCsv(products);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              {activeTab === 'movements' ? 'CSV Mouvements' : 'CSV Stock'}
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                setPrintDoc({
                  docType: 'RAPPORT DE STOCK & VALORISATION',
                  reference: `STK-${today}`,
                  date: new Date().toISOString(),
                  statusLabel: onlyLow
                    ? 'Articles sous seuil uniquement'
                    : `${products.length} article(s)`,
                  lines: products.slice(0, 100).map((p) => ({
                    label: `${p.reference} · ${p.name}`,
                    sublabel:
                      p.average_cost_fcfa !== null
                        ? `CUMP ${formatFcfa(p.average_cost_fcfa)}`
                        : 'Coût inconnu',
                    quantity: formatQty(p.stock_milli, p.base_unit),
                    unitPrice: p.average_cost_fcfa,
                    total: p.valuation_fcfa ?? 0,
                  })),
                  summaryRows: [
                    { label: 'Articles suivis', value: String(allProducts.length) },
                    {
                      label: 'Articles sous seuil / rupture',
                      value: String(lowCount),
                      tone: lowCount > 0 ? 'warning' : 'success',
                    },
                    {
                      label: 'Valorisation connue totale (CUMP)',
                      value: formatFcfa(totalKnownValuation),
                      bold: true,
                    },
                  ],
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5" />
              Rapport de stock
            </button>
          </div>
        </div>

        <Tabs.Content value="balances">
          <StockBalancesTable products={products} onAdjustProduct={(id) => openAdjustModal(id)} />
        </Tabs.Content>

        <Tabs.Content value="movements">
          <StockMovementsTable movements={movements} />
        </Tabs.Content>
      </Tabs.Root>

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />

      <StockAdjustModal
        open={adjustOpen}
        initialProductId={adjProductId}
        products={allProducts}
        isPending={adjustMut.isPending}
        serverError={adjError}
        onClose={() => setAdjustOpen(false)}
        onSubmit={(payload) => adjustMut.mutate(payload)}
      />
    </div>
  );
}
