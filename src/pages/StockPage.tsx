import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import * as Tabs from '@radix-ui/react-tabs';
import { AlertTriangle, Boxes, History, Printer, Search } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { MetricCard } from '../components/common/MetricCard.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import { formatDateTime, formatFcfa, formatQty } from '../utils/format.ts';

interface StockProductRow {
  id: number;
  reference: string;
  name: string;
  brand: string | null;
  category_name: string;
  base_unit: string;
  stock_milli: number;
  min_stock_milli: number;
  max_stock_milli: number;
  average_cost_fcfa: number | null;
  valuation_fcfa: number | null;
}

interface StockMovementRow {
  id: number;
  product_id: number;
  product_name: string;
  product_reference: string;
  base_unit: string;
  movement_type: string;
  quantity_milli: number;
  stock_before_milli: number;
  stock_after_milli: number;
  reason: string | null;
  reference_document: string | null;
  created_at: string;
}

const MOVEMENT_LABELS: Record<string, string> = {
  purchase_in: 'Réception achat',
  sale_out: 'Sortie vente',
  sale_cancel_in: 'Annulation vente',
  return_in: 'Retour client',
  inventory_adjust: 'Ajustement inventaire',
  manual_adjust: 'Ajustement manuel',
};

export function StockPage() {
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stock'],
    queryFn: () => apiClient.getStockOverview(),
  });

  const products = ((data?.products || []) as unknown as StockProductRow[]).filter((p) => {
    const q = search.trim().toLowerCase();
    if (q && !p.name.toLowerCase().includes(q) && !p.reference.toLowerCase().includes(q)) {
      return false;
    }
    if (onlyLow && p.stock_milli > p.min_stock_milli) {
      return false;
    }
    return true;
  });

  const movements = (data?.movements || []) as unknown as StockMovementRow[];
  const allProducts = (data?.products || []) as unknown as StockProductRow[];

  const totalKnownValuation = allProducts.reduce((s, p) => s + (p.valuation_fcfa ?? 0), 0);
  const unknownCostCount = allProducts.filter((p) => p.average_cost_fcfa === null).length;
  const lowCount = allProducts.filter((p) => p.stock_milli <= p.min_stock_milli).length;

  const productColumns: ColumnDef<StockProductRow>[] = [
    {
      accessorKey: 'reference',
      header: 'Référence',
      cell: ({ row }) => (
        <span className="font-mono-num text-xs font-semibold text-[#667085] dark:text-slate-400">
          {row.original.reference}
        </span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Produit',
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-[#182230] dark:text-slate-100">{row.original.name}</div>
          <div className="text-xs text-[#667085] dark:text-slate-400">
            {row.original.category_name}
            {row.original.brand ? ` · ${row.original.brand}` : ''}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'stock_milli',
      header: 'Stock actuel',
      cell: ({ row }) => {
        const isOut = row.original.stock_milli <= 0;
        const isLow = row.original.stock_milli <= row.original.min_stock_milli;
        return (
          <span
            className={`font-mono-num font-semibold ${
              isOut
                ? 'text-[#DC4545]'
                : isLow
                  ? 'text-[#D9901A]'
                  : 'text-[#182230] dark:text-slate-100'
            }`}
          >
            {formatQty(row.original.stock_milli, row.original.base_unit)}
          </span>
        );
      },
    },
    {
      accessorKey: 'min_stock_milli',
      header: 'Seuil alerte',
      cell: ({ row }) => (
        <span className="font-mono-num text-xs text-[#667085] dark:text-slate-400">
          {formatQty(row.original.min_stock_milli, row.original.base_unit)}
        </span>
      ),
    },
    {
      accessorKey: 'average_cost_fcfa',
      header: 'CUMP unitaire',
      cell: ({ row }) =>
        row.original.average_cost_fcfa !== null ? (
          <span className="font-mono-num">{formatFcfa(row.original.average_cost_fcfa)}</span>
        ) : (
          <span className="text-xs text-[#D9901A]">Coût non renseigné</span>
        ),
    },
    {
      accessorKey: 'valuation_fcfa',
      header: 'Valorisation stock',
      cell: ({ row }) =>
        row.original.valuation_fcfa !== null ? (
          <span className="font-mono-num font-semibold">{formatFcfa(row.original.valuation_fcfa)}</span>
        ) : (
          <span className="text-xs text-[#667085]">Non valorisable</span>
        ),
    },
  ];

  const movementColumns: ColumnDef<StockMovementRow>[] = [
    {
      accessorKey: 'created_at',
      header: 'Date & heure',
      cell: ({ row }) => (
        <span className="font-mono-num text-xs text-[#667085] dark:text-slate-400">
          {formatDateTime(row.original.created_at)}
        </span>
      ),
    },
    {
      accessorKey: 'product_name',
      header: 'Produit',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.product_name}</div>
          <div className="font-mono-num text-[11px] text-[#667085]">{row.original.product_reference}</div>
        </div>
      ),
    },
    {
      accessorKey: 'movement_type',
      header: 'Type',
      cell: ({ row }) => (
        <span className="text-xs font-medium text-[#182230] dark:text-slate-200">
          {MOVEMENT_LABELS[row.original.movement_type] || row.original.movement_type}
        </span>
      ),
    },
    {
      accessorKey: 'quantity_milli',
      header: 'Variation',
      cell: ({ row }) => {
        const pos = row.original.quantity_milli > 0;
        return (
          <span className={`font-mono-num font-semibold ${pos ? 'text-[#16A36A]' : 'text-[#DC4545]'}`}>
            {pos ? '+' : ''}
            {formatQty(row.original.quantity_milli, row.original.base_unit)}
          </span>
        );
      },
    },
    {
      id: 'solde',
      header: 'Avant → Après',
      cell: ({ row }) => (
        <span className="font-mono-num text-xs text-[#667085] dark:text-slate-400">
          {formatQty(row.original.stock_before_milli)} → {formatQty(row.original.stock_after_milli)}{' '}
          {row.original.base_unit}
        </span>
      ),
    },
    {
      accessorKey: 'reason',
      header: 'Motif / Document',
      cell: ({ row }) => (
        <div className="text-xs">
          <div className="text-[#182230] dark:text-slate-200">{row.original.reason || '—'}</div>
          {row.original.reference_document && (
            <div className="font-mono-num text-[11px] text-[#2563EB] dark:text-[#60A5FA]">
              {row.original.reference_document}
            </div>
          )}
        </div>
      ),
    },
  ];

  if (isLoading) return <LoadingState rows={6} />;
  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Erreur chargement stock.'}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
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

      <Tabs.Root defaultValue="balances" className="space-y-4">
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
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer un produit..."
                className="w-56 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs"
              />
            </div>
            <FormTipsButton topicId="stock" label="Règles CUMP" />
            <button
              type="button"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                setPrintDoc({
                  docType: 'RAPPORT DE STOCK & VALORISATION',
                  reference: `STK-${today}`,
                  date: new Date().toISOString(),
                  statusLabel: onlyLow ? 'Articles sous seuil uniquement' : `${products.length} article(s)`,
                  lines: products.slice(0, 100).map((p) => ({
                    label: `${p.reference} · ${p.name}`,
                    sublabel: p.average_cost_fcfa !== null ? `CUMP ${formatFcfa(p.average_cost_fcfa)}` : 'Coût inconnu',
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
          <DataTable
            data={products}
            columns={productColumns as ColumnDef<StockProductRow, unknown>[]}
            emptyMessage="Aucun produit ne correspond aux filtres."
          />
        </Tabs.Content>

        <Tabs.Content value="movements">
          <DataTable
            data={movements}
            columns={movementColumns as ColumnDef<StockMovementRow, unknown>[]}
            emptyMessage="Aucun mouvement de stock enregistré."
          />
        </Tabs.Content>
      </Tabs.Root>

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
