import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, Layers, PackagePlus, Sparkles } from 'lucide-react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { SearchInput } from '../../../components/forms/SearchInput.tsx';
import type { CatalogPresetItem } from '../../../types/erp.ts';
import { formatFcfa } from '../../../utils/format.ts';

interface CatalogPresetsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items?: CatalogPresetItem[];
  isLoading: boolean;
  loadError: string | null;
  submitError: string | null;
  isPending: boolean;
  onApply: (keys: string[], activate: boolean) => void;
}

type BreweryFilter = 'ALL' | 'SOLIBRA' | 'BRASSIVOIRE';

function CatalogPresetsDialogContent({
  open,
  onOpenChange,
  items = [],
  isLoading,
  loadError,
  submitError,
  isPending,
  onApply,
}: CatalogPresetsModalProps) {
  const [breweryFilter, setBreweryFilter] = useState<BreweryFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [activateMode, setActivateMode] = useState(true);

  const counts = useMemo(() => {
    const sol = items.filter((i) => i.brewery === 'SOLIBRA').length;
    const brv = items.filter((i) => i.brewery === 'BRASSIVOIRE').length;
    return { all: items.length, solibra: sol, brassivoire: brv };
  }, [items]);

  const categoriesList = useMemo(() => {
    const seen = new Set<string>();
    for (const item of items) seen.add(item.category);
    return Array.from(seen);
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (breweryFilter !== 'ALL' && item.brewery !== breweryFilter) return false;
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.barcode.includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [items, breweryFilter, categoryFilter, search]);

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectFiltered = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const item of filteredItems) next.add(item.key);
      return next;
    });
  };

  const selectBrewery = (brewery: 'SOLIBRA' | 'BRASSIVOIRE') => {
    setBreweryFilter(brewery);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (item.brewery === brewery) next.add(item.key);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedKeys(new Set());

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Catalogue brasseries Côte d'Ivoire (SOLIBRA & BRASSIVOIRE)"
      subtitle="Activez des fiches produits pré-configurées avec codes EAN-13, conditionnements (casiers, packs, cartons), consignes et tarifs FCFA indicatifs éditables."
      tipsTopicId="products"
      tipsLabel="Aide catalogue"
      maxWidthClass="max-w-4xl"
      scrollable
      error={submitError || loadError}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-medium text-[#182230] dark:text-slate-200">
              Mode d&apos;import :
            </span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[#182230] dark:text-slate-200">
              <input
                type="radio"
                name="preset-activate-mode"
                checked={activateMode}
                onChange={() => setActivateMode(true)}
                className="text-[#2563EB]"
              />
              Activer immédiatement
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[#667085] dark:text-slate-300">
              <input
                type="radio"
                name="preset-activate-mode"
                checked={!activateMode}
                onChange={() => setActivateMode(false)}
                className="text-[#2563EB]"
              />
              Charger en inactif (archivé)
            </label>
          </div>
          <div className="flex items-center gap-2.5">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
              >
                Fermer
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={selectedKeys.size === 0 || isPending}
              onClick={() => onApply(Array.from(selectedKeys), activateMode)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <PackagePlus className="h-4 w-4" />
              {isPending
                ? 'Application en cours...'
                : activateMode
                  ? `Activer la sélection (${selectedKeys.size})`
                  : `Charger en inactif (${selectedKeys.size})`}
            </button>
          </div>
        </div>
      }
    >
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `Toutes (${counts.all})` },
                { id: 'SOLIBRA', label: `SOLIBRA (${counts.solibra})` },
                { id: 'BRASSIVOIRE', label: `BRASSIVOIRE (${counts.brassivoire})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setBreweryFilter(tab.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  breweryFilter === tab.id
                    ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/40 text-[#2563EB] dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-[#667085] dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Filtrer par produit, marque, EAN..."
            className="w-64"
            clearable
          />
        </div>

        {categoriesList.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCategoryFilter('ALL')}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                categoryFilter === 'ALL'
                  ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/40 text-[#2563EB] dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 text-[#667085] dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              Toutes familles
            </button>
            {categoriesList.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  categoryFilter === cat
                    ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/40 text-[#2563EB] dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 text-[#667085] dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => selectBrewery('SOLIBRA')}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              + Sélectionner SOLIBRA ({counts.solibra})
            </button>
            <button
              type="button"
              onClick={() => selectBrewery('BRASSIVOIRE')}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              + Sélectionner BRASSIVOIRE ({counts.brassivoire})
            </button>
            <button
              type="button"
              onClick={selectFiltered}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Tout cocher (affichés)
            </button>
            {selectedKeys.size > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-md px-2 py-1 text-[#667085] hover:text-[#182230] dark:text-slate-400 dark:hover:text-slate-200"
              >
                Vider ({selectedKeys.size})
              </button>
            )}
          </div>
          <span className="text-[11px] text-[#667085] dark:text-slate-400">
            Stock initial : 0 (réception d&apos;achat requise pour alimenter le stock)
          </span>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-xs text-[#667085]">
            Chargement du catalogue brasseries...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#667085]">
            Aucun produit prédéfini ne correspond à ce filtre.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
            {filteredItems.map((item) => {
              const checked = selectedKeys.has(item.key);
              const isExisting = item.existing_product_id !== null;
              const isActive = item.existing_is_active === 1;
              const isArchived = isExisting && item.existing_is_active === 0;

              return (
                <div
                  key={item.key}
                  className={`flex flex-col gap-2.5 p-3.5 transition-colors sm:flex-row sm:items-start sm:justify-between ${
                    checked ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${item.name}`}
                      checked={checked}
                      onChange={() => toggleKey(item.key)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#182230] dark:text-slate-100">
                          {item.name}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            item.brewery === 'SOLIBRA'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}
                        >
                          {item.brewery}
                        </span>
                        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-[#667085] dark:text-slate-300">
                          {item.category}
                        </span>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-[#16A36A] dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Actif ({item.existing_reference})
                          </span>
                        )}
                        {isArchived && (
                          <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-semibold text-[#D9901A] dark:text-amber-400">
                            Archivé ({item.existing_reference})
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#667085] dark:text-slate-400">
                        <span className="font-mono-num">EAN : {item.barcode}</span>
                        <span>Marque : {item.brand}</span>
                        <span>
                          Unité : {item.base_unit} · Seuil min : {item.min_stock}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono-num text-[#182230] dark:text-slate-200">
                        <span>Achat : {formatFcfa(item.purchase_price)}</span>
                        <span>Gros : {formatFcfa(item.wholesale_price)}</span>
                        <span>Demi-gros : {formatFcfa(item.semi_wholesale_price)}</span>
                        <span className="font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                          Détail : {formatFcfa(item.retail_price)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {item.packagings.map((pk) => (
                          <span
                            key={pk.name}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] text-[#182230] dark:text-slate-300"
                          >
                            <Layers className="h-3 w-3 text-slate-400" />
                            <span className="capitalize font-medium">{pk.name}</span>
                            <span className="font-mono-num text-[#667085]">×{pk.coefficient}</span>
                            <span className="font-mono-num text-[#2563EB] dark:text-[#60A5FA]">
                              {formatFcfa(pk.retail_price)}
                            </span>
                            {pk.deposit_mode === 'deposit' && (
                              <span className="text-[10px] font-medium text-[#D9901A]">
                                · Consigné
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 sm:pl-2">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 dark:border-emerald-900/50 px-2.5 py-1.5 text-[11px] font-medium text-[#16A36A] dark:text-emerald-400">
                        Déjà au catalogue
                      </span>
                    ) : isArchived ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => onApply([item.key], true)}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 text-[11px] font-semibold text-[#D9901A] hover:bg-amber-100 disabled:opacity-50"
                      >
                        <Sparkles className="h-3 w-3" />
                        Réactiver
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => onApply([item.key], activateMode)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#2563EB]/30 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1.5 text-[11px] font-semibold text-[#2563EB] dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50"
                      >
                        <PackagePlus className="h-3 w-3" />
                        {activateMode ? 'Activer' : 'Charger inactif'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModalDialog>
  );
}

export function CatalogPresetsModal(props: CatalogPresetsModalProps) {
  if (!props.open) return null;
  return <CatalogPresetsDialogContent {...props} />;
}
