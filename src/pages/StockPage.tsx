import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { AlertTriangle, Boxes, Download, History, Printer, Search, SlidersHorizontal, X } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { MetricCard } from '../components/common/MetricCard.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import { exportStockBalancesCsv, exportStockMovementsCsv } from '../utils/csv.ts';
import { formatDateTime, formatFcfa, formatQty, newRequestKey } from '../utils/format.ts';

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

const REASON_PRESETS = [
  'Casse / bouteille brisée',
  'Perte / coulage',
  'Échantillon / don',
  'Surplus constaté',
];

function parsePreviewMilli(raw: string): number | null {
  const norm = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(norm)) return null;
  const [iPart, fPart = ''] = norm.split('.');
  const milli = Number(iPart) * 1000 + Number(fPart.padEnd(3, '0'));
  return Number.isSafeInteger(milli) && milli > 0 ? milli : null;
}

export function StockPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'balances' | 'movements'>('balances');
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjProductId, setAdjProductId] = useState<number>(0);
  const [adjDirection, setAdjDirection] = useState<'in' | 'out'>('out');
  const [adjQuantity, setAdjQuantity] = useState('1');
  const [adjReason, setAdjReason] = useState('');
  const [adjRequestKey, setAdjRequestKey] = useState(() => newRequestKey('adj'));
  const [adjError, setAdjError] = useState<string | null>(null);
  const [adjSuccess, setAdjSuccess] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stock'],
    queryFn: () => apiClient.getStockOverview(),
  });

  const adjustMut = useMutation({
    mutationFn: () =>
      apiClient.adjustStock({
        product_id: adjProductId,
        direction: adjDirection,
        quantity: adjQuantity.trim(),
        reason: adjReason.trim(),
        request_key: adjRequestKey,
      }),
    onSuccess: (mv) => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      setAdjustOpen(false);
      setAdjError(null);
      const refDoc = typeof mv.reference_document === 'string' ? mv.reference_document : '';
      const pName = typeof mv.product_name === 'string' ? mv.product_name : 'Produit';
      setAdjSuccess(
        refDoc
          ? `Ajustement ${refDoc} enregistré sur ${pName}.`
          : `Ajustement enregistré sur ${pName}.`
      );
    },
    onError: (err) => {
      setAdjError(err instanceof Error ? err.message : "Erreur lors de l'ajustement du stock.");
    },
  });

  const openAdjustModal = (targetProductId?: number) => {
    const firstId = allProducts[0]?.id ?? 0;
    setAdjProductId(targetProductId || firstId);
    setAdjDirection('out');
    setAdjQuantity('1');
    setAdjReason('');
    setAdjRequestKey(newRequestKey('adj'));
    setAdjError(null);
    setAdjustOpen(true);
  };

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
    {
      id: 'actions',
      header: 'Action',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => openAdjustModal(row.original.id)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          <SlidersHorizontal className="h-3 w-3" />
          Ajuster
        </button>
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

  const selectedProduct = allProducts.find((p) => p.id === adjProductId) || allProducts[0] || null;
  const parsedQtyMilli = parsePreviewMilli(adjQuantity);
  const projectedMilli =
    selectedProduct && parsedQtyMilli !== null
      ? selectedProduct.stock_milli + (adjDirection === 'out' ? -parsedQtyMilli : parsedQtyMilli)
      : null;

  return (
    <div className="space-y-5">
      {adjSuccess && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <span>{adjSuccess}</span>
          <button
            type="button"
            onClick={() => setAdjSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
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
                if (activeTab === 'movements') {
                  exportStockMovementsCsv(movements);
                } else {
                  exportStockBalancesCsv(products);
                }
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

      <Dialog.Root open={adjustOpen} onOpenChange={setAdjustOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[94vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <Dialog.Title className="text-base font-semibold text-[#182230] dark:text-slate-100">
                  Ajustement manuel du stock
                </Dialog.Title>
                <Dialog.Description className="text-xs text-[#667085] dark:text-slate-400">
                  Casse, perte, don, échantillon ou correction ponctuelle avec motif audité
                </Dialog.Description>
              </div>
              <Dialog.Close className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            {adjError && (
              <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-600 dark:text-red-300">
                {adjError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setAdjError(null);
                if (!selectedProduct) {
                  setAdjError('Sélectionnez un produit actif.');
                  return;
                }
                if (parsedQtyMilli === null) {
                  setAdjError('Saisissez une quantité positive valide (max 3 décimales).');
                  return;
                }
                if (adjReason.trim().length < 3) {
                  setAdjError('Veuillez indiquer un motif explicite (au moins 3 caractères).');
                  return;
                }
                adjustMut.mutate();
              }}
              className="space-y-3.5 text-sm"
            >
              <div>
                <label className="block text-xs font-medium text-[#667085] mb-1">
                  Produit concerné *
                </label>
                <select
                  aria-label="Produit concerné"
                  value={selectedProduct?.id ?? ''}
                  onChange={(e) => setAdjProductId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                >
                  {allProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.reference}) — Stock : {formatQty(p.stock_milli, p.base_unit)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#667085] mb-1">
                    Type d&apos;ajustement *
                  </label>
                  <div className="grid grid-cols-2 rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => setAdjDirection('out')}
                      className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                        adjDirection === 'out'
                          ? 'bg-[#DC4545] text-white'
                          : 'text-[#667085] hover:text-[#182230] dark:hover:text-slate-200'
                      }`}
                    >
                      Sortie (-)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjDirection('in')}
                      className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                        adjDirection === 'in'
                          ? 'bg-[#16A36A] text-white'
                          : 'text-[#667085] hover:text-[#182230] dark:hover:text-slate-200'
                      }`}
                    >
                      Entrée (+)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#667085] mb-1">
                    Quantité ({selectedProduct?.base_unit || 'unité'}) *
                  </label>
                  <input
                    aria-label="Quantité ajustée"
                    type="text"
                    inputMode="decimal"
                    required
                    value={adjQuantity}
                    onChange={(e) => setAdjQuantity(e.target.value)}
                    placeholder="Ex: 2 ou 0.5"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono-num"
                  />
                </div>
              </div>

              {selectedProduct && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs flex items-center justify-between">
                  <span className="text-[#667085] dark:text-slate-400">Impact sur le stock :</span>
                  <span className="font-mono-num font-semibold text-[#182230] dark:text-slate-100">
                    {formatQty(selectedProduct.stock_milli, selectedProduct.base_unit)} →{' '}
                    {projectedMilli !== null ? (
                      <span
                        className={
                          projectedMilli < 0
                            ? 'text-[#DC4545]'
                            : adjDirection === 'in'
                              ? 'text-[#16A36A]'
                              : 'text-[#D9901A]'
                        }
                      >
                        {formatQty(projectedMilli, selectedProduct.base_unit)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#667085] mb-1">
                  Motif obligatoire (tracé dans l&apos;audit) *
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {REASON_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAdjReason(preset)}
                      className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[11px] text-[#667085] hover:border-[#2563EB] hover:text-[#2563EB] dark:hover:text-[#60A5FA]"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="Motif d'ajustement"
                  type="text"
                  required
                  minLength={3}
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Ex: 2 bouteilles brisées lors de la manutention"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustOpen(false)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={adjustMut.isPending}
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {adjustMut.isPending ? 'Validation...' : "Valider l'ajustement"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
