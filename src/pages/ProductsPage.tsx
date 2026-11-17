import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';
import { MoneyInput } from '../components/common/MoneyInput.tsx';
import { QuantityInput } from '../components/common/QuantityInput.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { PackagingName, Product, ProductPackaging } from '../types/erp.ts';
import { formatFcfa, formatQty } from '../utils/format.ts';
import { compressLocalImage } from '../utils/image.ts';

const qtyPattern = /^\d+(\.\d{1,3})?$/;

const productSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du produit est obligatoire.'),
  brand: z.string().trim(),
  barcode: z.string().trim(),
  category_id: z.number().int().min(1, 'Catégorie obligatoire.'),
  base_unit: z.string().min(1),
  initial_stock: z
    .string()
    .trim()
    .refine((v) => v === '' || qtyPattern.test(v), 'Quantité invalide (3 décimales max).'),
  min_stock: z
    .string()
    .trim()
    .refine((v) => v === '' || qtyPattern.test(v), 'Seuil invalide (3 décimales max).'),
  purchase_price: z.number().int().min(0, 'Montant positif ou nul requis.'),
  wholesale_price: z.number().int().min(0, 'Montant positif ou nul requis.'),
  semi_wholesale_price: z.number().int().min(0, 'Montant positif ou nul requis.'),
  retail_price: z.number().int().min(0, 'Montant positif ou nul requis.'),
  image_path: z.string().nullable(),
});
type ProductFormValues = z.infer<typeof productSchema>;

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Le nom de la catégorie est obligatoire.'),
  description: z.string().trim(),
});
type CategoryFormValues = z.infer<typeof categorySchema>;

export function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pkgProduct, setPkgProduct] = useState<Product | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const productForm = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      brand: '',
      barcode: '',
      category_id: 1,
      base_unit: 'bouteille',
      initial_stock: '0',
      min_stock: '24',
      purchase_price: 0,
      wholesale_price: 0,
      semi_wholesale_price: 0,
      retail_price: 0,
      image_path: null,
    },
  });

  const categoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', description: '' },
  });

  // Formulaire conditionnement
  const [pkgId, setPkgId] = useState<number | undefined>(undefined);
  const [pkgName, setPkgName] = useState<PackagingName>('casier');
  const [pkgCoeff, setPkgCoeff] = useState('24');
  const [pkgPurchase, setPkgPurchase] = useState(0);
  const [pkgWholesale, setPkgWholesale] = useState(0);
  const [pkgSemi, setPkgSemi] = useState(0);
  const [pkgRetail, setPkgRetail] = useState(0);
  const [pkgBarcode, setPkgBarcode] = useState('');
  const [pkgAllowFraction, setPkgAllowFraction] = useState(false);
  const [pkgIsActive, setPkgIsActive] = useState(true);
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
    mutationFn: async (vals: ProductFormValues) => {
      if (editingProduct) {
        return apiClient.updateProduct(editingProduct.id, {
          name: vals.name.trim(),
          brand: vals.brand.trim(),
          barcode: vals.barcode.trim() || null,
          category_id: vals.category_id,
          min_stock: vals.min_stock || '0',
          purchase_price: vals.purchase_price,
          wholesale_price: vals.wholesale_price,
          semi_wholesale_price: vals.semi_wholesale_price,
          retail_price: vals.retail_price,
          image_path: vals.image_path,
        });
      }
      return apiClient.createProduct({
        name: vals.name.trim(),
        brand: vals.brand.trim(),
        barcode: vals.barcode.trim() || null,
        category_id: vals.category_id,
        base_unit: vals.base_unit,
        initial_stock: vals.initial_stock || '0',
        min_stock: vals.min_stock || '0',
        purchase_price: vals.purchase_price,
        wholesale_price: vals.wholesale_price,
        semi_wholesale_price: vals.semi_wholesale_price,
        retail_price: vals.retail_price,
        image_path: vals.image_path,
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
        id: pkgId,
        name: pkgName,
        coefficient: pkgCoeff,
        purchase_price: pkgPurchase,
        wholesale_price: pkgWholesale,
        semi_wholesale_price: pkgSemi,
        retail_price: pkgRetail,
        barcode: pkgBarcode || null,
        allow_fraction: pkgAllowFraction,
        is_active: pkgIsActive,
        deposit_mode: pkgDepositMode,
        components:
          pkgDepositMode === 'deposit' && pkgReturnableId > 0
            ? [{ returnable_id: pkgReturnableId, pieces_per_pack: pkgReturnablePieces }]
            : [],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      setPkgProduct(null);
      setPkgId(undefined);
      setFormError(null);
      setFeedback(pkgId ? 'Conditionnement mis à jour.' : 'Conditionnement enregistré.');
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Erreur conditionnement.'),
  });

  const formatCoeffDot = (milli: number) => {
    const intPart = Math.floor(milli / 1000);
    const fracPart = milli % 1000;
    if (fracPart === 0) return String(intPart);
    return `${intPart}.${String(fracPart).padStart(3, '0').replace(/0+$/, '')}`;
  };

  const loadPackagingIntoForm = (pk: ProductPackaging) => {
    setPkgId(pk.id);
    setPkgName(pk.name);
    setPkgCoeff(formatCoeffDot(pk.coefficient_milli));
    setPkgPurchase(pk.purchase_price ?? 0);
    setPkgWholesale(pk.wholesale_price ?? 0);
    setPkgSemi(pk.semi_wholesale_price ?? 0);
    setPkgRetail(pk.retail_price ?? 0);
    setPkgBarcode(pk.barcode || '');
    setPkgAllowFraction(pk.allow_fraction === 1);
    setPkgIsActive(pk.is_active === 1);
    setPkgDepositMode(pk.deposit_mode === 'deposit' ? 'deposit' : 'none');
    setPkgReturnableId(pk.components?.[0]?.returnable_id ?? 0);
    setPkgReturnablePieces(pk.components?.[0]?.pieces_per_pack ?? 1);
    setFormError(null);
  };

  const startNewPackagingForm = (prod: Product) => {
    const candidateNames: PackagingName[] = ['casier', 'pack', 'carton', 'bouteille', 'canette'];
    const nextName =
      candidateNames.find((n) => !prod.packagings.some((p) => p.name === n)) || 'casier';
    const defaultCoeff =
      nextName === 'casier' ? '24' : nextName === 'carton' ? '12' : nextName === 'pack' ? '6' : '1';
    setPkgId(undefined);
    setPkgName(nextName);
    setPkgCoeff(defaultCoeff);
    setPkgPurchase(prod.purchase_price ?? 0);
    setPkgWholesale(0);
    setPkgSemi(0);
    setPkgRetail(0);
    setPkgBarcode('');
    setPkgAllowFraction(false);
    setPkgIsActive(true);
    setPkgDepositMode('none');
    setPkgReturnableId(0);
    setPkgReturnablePieces(1);
    setFormError(null);
  };

  const openPackagingModal = (prod: Product, targetPkg?: ProductPackaging) => {
    setPkgProduct(prod);
    if (targetPkg) {
      loadPackagingIntoForm(targetPkg);
    } else if (prod.packagings.length > 0) {
      loadPackagingIntoForm(prod.packagings[0]);
    } else {
      startNewPackagingForm(prod);
    }
  };

  const createCategoryMutation = useMutation({
    mutationFn: (vals: CategoryFormValues) =>
      apiClient.createCategory(vals.name.trim(), vals.description.trim() || undefined),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      setCatOpen(false);
      categoryForm.reset({ name: '', description: '' });
      setFormError(null);
      productForm.setValue('category_id', created.id);
      setFeedback(`Catégorie « ${created.name} » créée.`);
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Erreur création catégorie.'),
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
    productForm.reset({
      name: '',
      brand: '',
      barcode: '',
      category_id: categories?.[0]?.id ?? 1,
      base_unit: 'bouteille',
      initial_stock: '0',
      min_stock: '24',
      purchase_price: 0,
      wholesale_price: 0,
      semi_wholesale_price: 0,
      retail_price: 0,
      image_path: null,
    });
    setFormError(null);
    setCreateOpen(true);
  };

  const openEditModal = (prod: Product) => {
    setEditingProduct(prod);
    productForm.reset({
      name: prod.name,
      brand: prod.brand || '',
      barcode: prod.barcode || '',
      category_id: prod.category_id,
      base_unit: prod.base_unit,
      initial_stock: '0',
      min_stock: String(prod.min_stock_milli / 1000),
      purchase_price: prod.purchase_price ?? 0,
      wholesale_price: prod.wholesale_price ?? 0,
      semi_wholesale_price: prod.semi_wholesale_price ?? 0,
      retail_price: prod.retail_price ?? 0,
      image_path: prod.image_path ?? null,
    });
    setFormError(null);
    setCreateOpen(true);
  };

  const handleImageFileChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await compressLocalImage(file, { maxSide: 256, quality: 0.82, maxLength: 350_000 });
      setFormError(null);
      productForm.setValue('image_path', dataUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur chargement photo produit.');
    }
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
        <div className="flex items-center gap-3">
          {row.original.image_path ? (
            <img
              src={row.original.image_path}
              alt={row.original.name}
              loading="lazy"
              className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 object-cover shrink-0 bg-slate-50"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-400 shrink-0">
              <ImageIcon className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-medium text-[#182230] dark:text-slate-100 truncate">
              {row.original.name}
            </div>
            <div className="text-xs text-[#667085] dark:text-slate-400 truncate">
              {row.original.category_name}
              {row.original.brand ? ` · ${row.original.brand}` : ''}
            </div>
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
            <button
              key={pk.id}
              type="button"
              onClick={() => openPackagingModal(row.original, pk)}
              title={`Modifier ${pk.name}`}
              className={`flex items-center gap-2 rounded px-1 -mx-1 py-0.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
                pk.is_active ? 'text-[#182230] dark:text-slate-300' : 'opacity-50 line-through text-[#667085]'
              }`}
            >
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
            </button>
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
            onClick={() => openPackagingModal(row.original)}
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
            onClick={() => {
              categoryForm.reset({ name: '', description: '' });
              setFormError(null);
              setCatOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Catégorie
          </button>
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

            <form
              onSubmit={productForm.handleSubmit((vals) => saveProductMutation.mutate(vals))}
              noValidate
            >
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="product-name"
                    className="block text-xs font-medium text-[#182230] dark:text-slate-200"
                  >
                    Nom du produit *
                  </label>
                  <input
                    id="product-name"
                    type="text"
                    aria-invalid={Boolean(productForm.formState.errors.name)}
                    {...productForm.register('name')}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                  {productForm.formState.errors.name && (
                    <p className="mt-1 text-[11px] text-[#DC4545]" role="alert">
                      {productForm.formState.errors.name.message}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="product-brand"
                    className="block text-xs font-medium text-[#182230] dark:text-slate-200"
                  >
                    Marque
                  </label>
                  <input
                    id="product-brand"
                    type="text"
                    {...productForm.register('brand')}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="product-barcode"
                    className="block text-xs font-medium text-[#182230] dark:text-slate-200"
                  >
                    Code-barres
                  </label>
                  <input
                    id="product-barcode"
                    type="text"
                    {...productForm.register('barcode')}
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="product-category"
                    className="block text-xs font-medium text-[#182230] dark:text-slate-200"
                  >
                    Catégorie
                  </label>
                  <Controller
                    control={productForm.control}
                    name="category_id"
                    render={({ field }) => (
                      <select
                        id="product-category"
                        value={field.value}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                      >
                        {categories?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                  />
                </div>
                {!editingProduct && (
                  <div>
                    <label
                      htmlFor="product-base-unit"
                      className="block text-xs font-medium text-[#182230] dark:text-slate-200"
                    >
                      Unité de base
                    </label>
                    <select
                      id="product-base-unit"
                      {...productForm.register('base_unit')}
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
                  <Controller
                    control={productForm.control}
                    name="initial_stock"
                    render={({ field, fieldState }) => (
                      <QuantityInput
                        label="Stock initial"
                        value={field.value}
                        onChange={field.onChange}
                        unit={productForm.watch('base_unit')}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                )}
                <Controller
                  control={productForm.control}
                  name="min_stock"
                  render={({ field, fieldState }) => (
                    <QuantityInput
                      label="Seuil d'alerte minimum"
                      value={field.value}
                      onChange={field.onChange}
                      unit={productForm.watch('base_unit')}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={productForm.control}
                  name="purchase_price"
                  render={({ field, fieldState }) => (
                    <MoneyInput
                      label="Prix d'achat (unité base)"
                      value={field.value}
                      onChange={field.onChange}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={productForm.control}
                  name="wholesale_price"
                  render={({ field, fieldState }) => (
                    <MoneyInput
                      label="Prix gros"
                      value={field.value}
                      onChange={field.onChange}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={productForm.control}
                  name="semi_wholesale_price"
                  render={({ field, fieldState }) => (
                    <MoneyInput
                      label="Prix demi-gros"
                      value={field.value}
                      onChange={field.onChange}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={productForm.control}
                  name="retail_price"
                  render={({ field, fieldState }) => (
                    <MoneyInput
                      label="Prix détail"
                      value={field.value}
                      onChange={field.onChange}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <div className="sm:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <label className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                    Photo produit (optionnelle, redimensionnée automatiquement)
                  </label>
                  <div className="mt-2 flex items-center gap-3">
                    {productForm.watch('image_path') ? (
                      <img
                        src={productForm.watch('image_path') || undefined}
                        alt={productForm.watch('name') || 'Aperçu produit'}
                        className="h-14 w-14 rounded-lg border border-slate-200 dark:border-slate-700 object-cover shrink-0"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 shrink-0">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                        Choisir une photo
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(e) => void handleImageFileChange(e.target.files?.[0])}
                        />
                      </label>
                      {productForm.watch('image_path') && (
                        <button
                          type="button"
                          onClick={() => productForm.setValue('image_path', null)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/50 px-2.5 py-1.5 text-xs font-medium text-[#DC4545] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Retirer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
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
                  type="submit"
                  disabled={saveProductMutation.isPending}
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saveProductMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Conditionnement */}
      <Dialog.Root
        open={Boolean(pkgProduct)}
        onOpenChange={(o) => {
          if (!o) {
            setPkgProduct(null);
            setPkgId(undefined);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Conditionnements · {pkgProduct?.name}
              </Dialog.Title>
              <div className="flex items-center gap-2">
                <FormTipsButton topicId="products" label="Aide coeff. & consigne" />
                <Dialog.Close className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
            </div>

            {pkgProduct && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
                {pkgProduct.packagings.map((pk) => {
                  const selected = pkgId === pk.id;
                  return (
                    <button
                      key={pk.id}
                      type="button"
                      onClick={() => loadPackagingIntoForm(pk)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                        selected
                          ? 'border-[#2563EB] bg-[#2563EB] text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[#182230] dark:text-slate-200 hover:border-[#2563EB]'
                      }`}
                    >
                      <span>
                        {pk.name} ×{formatCoeffDot(pk.coefficient_milli)}
                      </span>
                      {!pk.is_active && (
                        <span className="text-[10px] opacity-80">(Inactif)</span>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => startNewPackagingForm(pkgProduct)}
                  className={`inline-flex items-center gap-1 rounded-lg border border-dashed px-2.5 py-1 text-xs font-medium transition-colors ${
                    pkgId === undefined
                      ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/40 text-[#2563EB]'
                      : 'border-slate-300 dark:border-slate-700 text-[#667085] hover:border-[#2563EB] hover:text-[#2563EB]'
                  }`}
                >
                  <Plus className="h-3 w-3" />
                  Nouveau
                </button>
              </div>
            )}

            {formError && (
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-[#DC4545]">
                {formError}
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium">Type de conditionnement</label>
                <select
                  aria-label="Type de conditionnement"
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
              <MoneyInput label="Prix d'achat" value={pkgPurchase} onChange={setPkgPurchase} />
              <MoneyInput label="Prix gros" value={pkgWholesale} onChange={setPkgWholesale} />
              <MoneyInput label="Prix demi-gros" value={pkgSemi} onChange={setPkgSemi} />
              <MoneyInput label="Prix détail" value={pkgRetail} onChange={setPkgRetail} />
              <div className="col-span-2">
                <label className="block text-xs font-medium">Code-barres conditionnement</label>
                <input
                  aria-label="Code-barres conditionnement"
                  type="text"
                  value={pkgBarcode}
                  onChange={(e) => setPkgBarcode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={pkgAllowFraction}
                  onChange={(e) => setPkgAllowFraction(e.target.checked)}
                  className="rounded border-slate-300 text-[#2563EB]"
                />
                Autoriser quantités fractionnaires
              </label>
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={pkgIsActive}
                  onChange={(e) => setPkgIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-[#2563EB]"
                />
                Conditionnement actif
              </label>
              <div className="col-span-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                <label className="block text-xs font-medium">Régime de consigne</label>
                <select
                  aria-label="Régime de consigne"
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
                      aria-label="Emballage consigné"
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
                      aria-label="Nombre d'emballages / pack"
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
                className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pkgId ? 'Mettre à jour le conditionnement' : 'Enregistrer le conditionnement'}
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

      {/* Modal Nouvelle Catégorie */}
      <Dialog.Root open={catOpen} onOpenChange={setCatOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <Dialog.Title className="font-display text-base font-semibold">
                Nouvelle catégorie produit
              </Dialog.Title>
              <Dialog.Close className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            {formError && (
              <div className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-[#DC4545]">
                {formError}
              </div>
            )}
            <form
              onSubmit={categoryForm.handleSubmit((vals) => createCategoryMutation.mutate(vals))}
              noValidate
            >
              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <label htmlFor="category-name" className="block font-medium">
                    Nom de la catégorie *
                  </label>
                  <input
                    id="category-name"
                    type="text"
                    aria-invalid={Boolean(categoryForm.formState.errors.name)}
                    {...categoryForm.register('name')}
                    placeholder="Ex : Jus & Nectars"
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                  {categoryForm.formState.errors.name && (
                    <p className="mt-1 text-[11px] text-[#DC4545]" role="alert">
                      {categoryForm.formState.errors.name.message}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="category-desc" className="block font-medium">
                    Description (optionnelle)
                  </label>
                  <input
                    id="category-desc"
                    type="text"
                    {...categoryForm.register('description')}
                    placeholder="Conditionnements et formats associés"
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <Dialog.Close asChild>
                  <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
                    Annuler
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={createCategoryMutation.isPending}
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  Créer la catégorie
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
