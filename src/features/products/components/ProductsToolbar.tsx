import { Download, PackagePlus, Plus, Upload } from 'lucide-react';
import { SearchInput } from '../../../components/forms/SearchInput.tsx';
import type { Category } from '../../../types/erp.ts';

/* ============================================================================
 * Barre d'outils Catalogue Produits (filtres, CSV & actions de création)
 * ============================================================================ */

interface ProductsToolbarProps {
  search: string;
  onSearchChange: (next: string) => void;
  categoryId: number | undefined;
  onCategoryChange: (next: number | undefined) => void;
  categories: Category[] | undefined;
  lowStockOnly: boolean;
  onToggleLowStock: () => void;
  includeArchived: boolean;
  onToggleArchived: () => void;
  onOpenNewCategory: () => void;
  onExportCsv: () => void;
  onOpenImportCsv: () => void;
  onOpenPresets: () => void;
  onOpenNewProduct: () => void;
}

export function ProductsToolbar({
  search,
  onSearchChange,
  categoryId,
  onCategoryChange,
  categories,
  lowStockOnly,
  onToggleLowStock,
  includeArchived,
  onToggleArchived,
  onOpenNewCategory,
  onExportCsv,
  onOpenImportCsv,
  onOpenPresets,
  onOpenNewProduct,
}: ProductsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Filtres de recherche et statut */}
      <div className="flex flex-wrap items-center gap-2.5">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder="Rechercher nom, réf, code-barres..."
          className="w-72"
          clearable
        />

        <select
          value={categoryId ?? ''}
          onChange={(e) => onCategoryChange(e.target.value ? Number(e.target.value) : undefined)}
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
          onClick={onToggleLowStock}
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
          onClick={onToggleArchived}
          className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
            includeArchived
              ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30 text-[#2563EB]'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-[#667085] dark:text-slate-300'
          }`}
        >
          Inclure archivés
        </button>
      </div>

      {/* Boutons d'action catalogue */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenNewCategory}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Catégorie
        </button>
        <button
          type="button"
          onClick={onExportCsv}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
        <button
          type="button"
          onClick={onOpenImportCsv}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <Upload className="h-3.5 w-3.5" />
          Import CSV
        </button>
        <button
          type="button"
          onClick={onOpenPresets}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-3.5 py-2 text-xs font-semibold text-[#2563EB] dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 whitespace-nowrap shrink-0"
        >
          <PackagePlus className="h-3.5 w-3.5" />
          Catalogue brasseries
        </button>
        <button
          type="button"
          onClick={onOpenNewProduct}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Nouveau produit
        </button>
      </div>
    </div>
  );
}
