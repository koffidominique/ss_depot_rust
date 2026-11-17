import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Search,
  Plus,
  Download,
  Upload,
  Archive,
  Layers,
  X,
  Edit3,
} from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { QuantityInput } from '../components/common/QuantityInput.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { PackagingName, Product } from '../types/erp.ts';
import { formatFcfa, formatQty } from '../utils/format.ts';

export function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pkgProduct, setPkgProduct] = useState<Product | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Formulaire produit
  const [pName, setPName] = useState('');
  const [pBrand, setPBrand] = useState('');
  const [pBarcode, setPBarcode] = useState('');
  const [pCategoryId, setPCategoryId] = useState<number>(1);
  const [pBaseUnit, setPBaseUnit] = useState('bouteille');
  const [pInitialStock, setPInitialStock] = useState('0');
  const [pMinStock, setPMinStock] = useState('24');
  const [pPurchasePrice, setPPurchasePrice] = useState(0);
  const [pWholesalePrice, setPWholesalePrice] = useState(0);
  const [pSemiPrice, setPSemiPrice] = useState(0);
  const [pRetailPrice, setPRetailPrice] = useState(0);

  // Formulaire conditionnement
  const [pkgName, setPkgName] = useState<PackagingName>('casier');
  const [pkgCoeff, setPkgCoeff] = useState('24');
  const [pkgWholesale, setPkgWholesale] = useState(0);
  const [pkgSemi, setPkgSemi] = useState(0);
  const [pkgRetail, setPkgRetail] = useState(0);
  const [pkgBarcode, setPkgBarcode] = useState('');
  const [pkgDepositMode, setPkgDepositMode] = useState<'none' | 'deposit'>('none');
  const [pkgReturnableId, setPkgReturnableId] = useState<number>(0);
  const [pkgReturnablePieces, setPkgReturnablePieces] = useState<number>(1);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.listCategories(),
  });

  const { data: consignments } = useQuery({
    queryKey: ['consignments'],
    queryFn: () => apiClient.getConsignmentsOverview(),
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['products', search, categoryId, includeArchived, lowStockOnly, page],
    queryFn: () =>
      apiClient.listProducts({
        search,
        categoryId,
        includeArchived,
        lowStockOnly,
        page,
        pageSize: 20,
      }),
  });

  const saveProductMutation = useMutation({
    mutationFn: async () => {
      if (editingProduct) {
        return apiClient.updateProduct(editingProduct.id, {
          name: pName,
          brand: pBrand,
          barcode: pBarcode || null,
          category_id: pCategoryId,
          min_stock: pMinStock,
          purchase_price: pPurchasePrice,
          wholesale_price: pWholesalePrice,
          semi_wholesale_price: pSemiPrice,
          retail_price: pRetailPrice,
        });
      }
      return apiClient.createProduct({
        name: pName,
        brand: pBrand,
        barcode: pBarcode || null,
        category_id: pCategoryId,
        base_unit: pBaseUnit,
        initial_stock: pInitialStock,
        min_stock: pMinStock,
        purchase_price: pPurchasePrice,
        wholesale_price: pWholesalePrice,
        semi_wholesale_price: pSemiPrice,
        retail_price: pRetailPrice,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setCreateOpen(false);
      setEditingProduct(null);
      setFormError(null);
      setFeedback('Produit enregistré avec succès.');
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Erreur de validation.'),
  });

  const archiveMutation = useMutation({
    mutationFn: (prod: Product) => apiClient.updateProduct(prod.id, { is_active: !prod.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setFeedback('Statut du produit mis à jour.');
    },
  });

  const upsertPkgMutation = useMutation({
    mutationFn: () => {
      if (!pkgProduct) throw new Error('Produit non sélectionné');
      return apiClient.upsertPackaging(pkgProduct.id, {
        name: pkgName,
        coefficient: pkgCoeff,
        wholesale_price: pkgWholesale,
        semi_wholesale_price: pkgSemi,
        retail_price: pkgRetail,
        barcode: pkgBarcode || null,
        deposit_mode: pkgDepositMode,
        components:
          pkgDepositMode === 'deposit' && pkgReturnableId > 0
            ? [{ returnable_id: pkgReturnableId, pieces_per_pack: pkgReturnablePieces }]
            : [],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setPkgProduct(null);
      setFormError(null);
      setFeedback('Conditionnement enregistré.');
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Erreur conditionnement.'),
  });

  const importCsvMutation = useMutation({
    mutationFn: () => apiClient.importProductsCsv(csvText),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setCsvOpen(false);
      setCsvText('');
      setFeedback(`${res.created} produit(s) importé(s) depuis le CSV.`);
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Erreur import CSV.'),
  });

  const openCreateModal = () => {
    setEditingProduct(null);
    setPName('');
    setPBrand('');
    setPBarcode('');
    setPCategoryId(categories?.[0]?.id ?? 1);
    setPBaseUnit('bouteille');
    setPInitialStock('0');
    setPMinStock('24');
    setPPurchasePrice(0);
    setPWholesalePrice(0);
    setPSemiPrice(0);
    setPRetailPrice(0);
    setFormError(null);
    setCreateOpen(true);
  };

  const openEditModal = (prod: Product) => {
    setEditingProduct(prod);
    setPName(prod.name);
    setPBrand(prod.brand || '');
    setPBarcode(prod.barcode || '');
    setPCategoryId(prod.category_id);
    setPBaseUnit(prod.base_unit);
    setPMinStock(String(prod.min_stock_milli / 1000));
    setPPurchasePrice(prod.purchase_price ?? 0);
    setPWholesalePrice(prod.wholesale_price ?? 0);
    setPSemiPrice(prod.semi_wholesale_price ?? 0);
    setPRetailPrice(prod.retail_price ?? 0);
    setFormError(null);
    setCreateOpen(true);
  };

  const handleExportCsv = async () => {
    const csv = await apiClient.exportProductsCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'depotpro_produits.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnDef<Product>[] = [
    {
      accessorKey: 'reference',
      header: 'Référence',
      cell: ({ row }) => (
        <div>
          <div className="font-mono-num text-xs font-semibold text-[#182230] dark:text-slate-100">
            {row.original.reference}
          </div>
          {row.original.barcode && (
            <div className="font-mono-num text-[11px] text-[#667085] dark:text-slate-400">
              {row.original.barcode}
            </div>
          )}
        </div>
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
        const low = row.original.stock_milli <= row.original.min_stock_milli;
        return (
          <div className="font-mono-num">
            <span
              className={`font-semibold ${
                row.original.stock_milli <= 0
                  ? 'text-[#DC4545]'
                  : low
                  ? 'text-[#D9901A]'
                  : 'text-[#16A36A] dark:text-emerald-400'
              }`}
            >
              {formatQty(row.original.stock_milli, row.original.base_unit)}
            </span>
            <div className="text-[11px] text-[#667085] dark:text-slate-400">
              Seuil : {formatQty(row.original.min_stock_milli, row.original.base_unit)}
            </div>
          </div>
        );
      },
    },
    {
      id: 'packagings',
      header: 'Conditionnements & tarifs détail',
      cell: ({ row }) => (
        <div className="space-y-0.5 text-xs">
          {row.original.packagings.map((pk) => (
            <div key={pk.id} className="flex items-center gap-2 text-[#182230] dark:text-slate-300">
              <span className="font-medium capitalize">{pk.name}</span>
              <span className="text-[#667085] dark:text-slate-400 tabular-nums">
                ×{pk.coefficient_milli / 1000}
              </span>
              <span className="font-mono-num text-[#2563EB] dark:text-[#60A5FA]">
                {formatFcfa(pk.retail_price)}
              </span>
              {pk.deposit_mode === 'deposit' && (
                <span className="text-[11px] text-[#D9901A] dark:text-amber-400">Consigné</span>
              )}
            </div>
          ))}
        </div>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'Statut',
      cell: ({ row }) => <StatusBadge status={row.original.is_active ? 'active' : 'archived'} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openEditModal(row.original)}
            title="Modifier le produit"
            className="rounded-md border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPkgProduct(row.original);
              setPkgName('casier');
              setPkgCoeff('24');
              setPkgWholesale(0);
              setPkgSemi(0);
              setPkgRetail(0);
              setPkgBarcode('');
              setPkgDepositMode('none');
              setFormError(null);
            }}
            title="Configurer les conditionnements"
            className="rounded-md border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => archiveMutation.mutate(row.original)}
            title={row.original.is_active ? 'Archiver' : 'Réactiver'}
            className="rounded-md border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {feedback && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 px-4 py-2.5 text-xs font-medium text-[#16A36A] dark:text-emerald-400">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Rechercher nom, réf, code-barres..."
              className="w-72 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] py-2 pl-9 pr-3 text-sm text-[#182230] dark:text-slate-100 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <select
            value={categoryId ?? ''}
            onChange={(e) => {
              setCategoryId(e.target.value ? Number(e.target.value) : undefined);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3 py-2 text-xs font-medium text-[#182230] dark:text-slate-200"
          >
            <option value="">Toutes les catégories</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setLowStockOnly((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              lowStockOnly
                ? 'border-[#D9901A] bg-amber-50 dark:bg-amber-950/30 text-[#D9901A]'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-[#667085] dark:text-slate-300'
            }`}
          >
            Stock faible
          </button>

          <button
            type="button"
            onClick={() => setIncludeArchived((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              includeArchived
                ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30 text-[#2563EB]'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-[#667085] dark:text-slate-300'
            }`}
          >
            Inclure archivés
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setCsvOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nouveau produit
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Erreur de chargement.'}
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable
          data={data.items}
          columns={columns as ColumnDef<Product, unknown>[]}
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          onPageChange={setPage}
          emptyMessage="Aucun produit ne correspond aux filtres sélectionnés."
        />
      )}

      {/* Modal Création / Édition Produit */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold text-[#182230] dark:text-slate-100">
                {editingProduct ? `Modifier ${editingProduct.name}` : 'Nouveau produit'}
              </Dialog.Title>
              <div className="flex items-center gap-2">
                <FormTipsButton topicId="products" label="Aide champs" />
                <Dialog.Close className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
            </div>

            {formError && (
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-[#DC4545]">
                {formError}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Nom du produit *
                </label>
                <input
                  type="text"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Marque
                </label>
                <input
                  type="text"
                  value={pBrand}
                  onChange={(e) => setPBrand(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Code-barres
                </label>
                <input
                  type="text"
                  value={pBarcode}
                  onChange={(e) => setPBarcode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Catégorie
                </label>
                <select
                  value={pCategoryId}
                  onChange={(e) => setPCategoryId(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {!editingProduct && (
                <div>
                  <label className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                    Unité de base
                  </label>
                  <select
                    value={pBaseUnit}
                    onChange={(e) => setPBaseUnit(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  >
                    <option value="bouteille">bouteille</option>
                    <option value="canette">canette</option>
                    <option value="pack">pack</option>
                    <option value="carton">carton</option>
                  </select>
                </div>
              )}
              {!editingProduct && (
                <QuantityInput
                  label="Stock initial"
                  value={pInitialStock}
                  onChange={setPInitialStock}
                  unit={pBaseUnit}
                />
              )}
              <QuantityInput
                label="Seuil d'alerte minimum"
                value={pMinStock}
                onChange={setPMinStock}
                unit={pBaseUnit}
              />
              <MoneyInput label="Prix d'achat (unité base)" value={pPurchasePrice} onChange={setPPurchasePrice} />
              <MoneyInput label="Prix gros" value={pWholesalePrice} onChange={setPWholesalePrice} />
              <MoneyInput label="Prix demi-gros" value={pSemiPrice} onChange={setPSemiPrice} />
              <MoneyInput label="Prix détail" value={pRetailPrice} onChange={setPRetailPrice} />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
                >
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={saveProductMutation.isPending}
                onClick={() => saveProductMutation.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saveProductMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Conditionnement */}
      <Dialog.Root open={Boolean(pkgProduct)} onOpenChange={(o) => !o && setPkgProduct(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Conditionnement · {pkgProduct?.name}
              </Dialog.Title>
              <div className="flex items-center gap-2">
                <FormTipsButton topicId="products" label="Aide coeff. & consigne" />
                <Dialog.Close className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
            </div>

            {formError && (
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-[#DC4545]">
                {formError}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium">Type de conditionnement</label>
                <select
                  value={pkgName}
                  onChange={(e) => setPkgName(e.target.value as PackagingName)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="bouteille">bouteille</option>
                  <option value="canette">canette</option>
                  <option value="pack">pack</option>
                  <option value="carton">carton</option>
                  <option value="casier">casier</option>
                </select>
              </div>
              <QuantityInput
                label={`Coefficient (en ${pkgProduct?.base_unit})`}
                value={pkgCoeff}
                onChange={setPkgCoeff}
                unit={pkgProduct?.base_unit}
              />
              <MoneyInput label="Prix gros" value={pkgWholesale} onChange={setPkgWholesale} />
              <MoneyInput label="Prix demi-gros" value={pkgSemi} onChange={setPkgSemi} />
              <MoneyInput label="Prix détail" value={pkgRetail} onChange={setPkgRetail} />
              <div>
                <label className="block text-xs font-medium">Code-barres conditionnement</label>
                <input
                  type="text"
                  value={pkgBarcode}
                  onChange={(e) => setPkgBarcode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
                />
              </div>
              <div className="col-span-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                <label className="block text-xs font-medium">Régime de consigne</label>
                <select
                  value={pkgDepositMode}
                  onChange={(e) => setPkgDepositMode(e.target.value as 'none' | 'deposit')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="none">Sans consigne</option>
                  <option value="deposit">Avec emballage consigné</option>
                </select>
              </div>
              {pkgDepositMode === 'deposit' && (
                <>
                  <div>
                    <label className="block text-xs font-medium">Emballage consigné</label>
                    <select
                      value={pkgReturnableId}
                      onChange={(e) => setPkgReturnableId(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    >
                      <option value={0}>Sélectionner...</option>
                      {consignments?.types.map((t) => (
                        <option key={Number(t.id)} value={Number(t.id)}>
                          {String(t.name)} ({formatFcfa(Number(t.deposit_value))})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium">Nombre d'emballages / pack</label>
                    <input
                      type="number"
                      min={1}
                      value={pkgReturnablePieces}
                      onChange={(e) => setPkgReturnablePieces(Math.max(1, Number(e.target.value)))}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={upsertPkgMutation.isPending}
                onClick={() => upsertPkgMutation.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Enregistrer le conditionnement
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Import CSV */}
      <Dialog.Root open={csvOpen} onOpenChange={setCsvOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <Dialog.Title className="font-display text-base font-semibold">
              Importer des produits (CSV)
            </Dialog.Title>
            <p className="mt-1 text-xs text-[#667085] dark:text-slate-400">
              Colonnes attendues : name;base_unit;category;brand;barcode;stock;min_stock;purchase_price;wholesale_price;semi_wholesale_price;retail_price
            </p>
            {formError && (
              <div className="mt-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-[#DC4545]">
                {formError}
              </div>
            )}
            <textarea
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'name;base_unit;category;stock;retail_price\nSprite 33cl;canette;Boissons gazeuses;120;450'}
              className="mt-3 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 font-mono-num text-xs"
            />
            <div className="mt-4 flex justify-end gap-3">
              <Dialog.Close asChild>
                <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={!csvText.trim() || importCsvMutation.isPending}
                onClick={() => importCsvMutation.mutate()}
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                Lancer l'import
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
