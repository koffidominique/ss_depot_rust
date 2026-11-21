import type { RefObject } from 'react';
import { motion } from 'motion/react';
import { Package, Plus } from 'lucide-react';
import { SearchInput } from '../../../components/forms/SearchInput.tsx';
import {
  DP_BUTTON_HOVER,
  DP_BUTTON_TAP,
  DP_SPRING_SNAPPY,
  MotionStaggerGrid,
  MotionStaggerItem,
} from '../../../components/motion/MotionPrimitives.tsx';
import { formatFcfa, formatQty } from '../../../utils/format.ts';
import type { Product, ProductPackaging } from '../../../types/erp.ts';
import { getTierPrice } from '../hooks/usePosData.ts';

interface PosCatalogPanelProps {
  searchInputRef: RefObject<HTMLInputElement | null>;
  search: string;
  onSearchChange: (value: string) => void;
  onScanEnter: (rawCode: string) => Promise<void>;
  products: Product[];
  onAddPackaging: (product: Product, pkg: ProductPackaging) => void;
}

export function PosCatalogPanel({
  searchInputRef,
  search,
  onSearchChange,
  onScanEnter,
  products,
  onAddPackaging,
}: PosCatalogPanelProps) {
  return (
    <div className="space-y-4 lg:col-span-7">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          ref={searchInputRef}
          value={search}
          onChange={onSearchChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void onScanEnter(search);
            }
          }}
          clearable
          placeholder="Scanner code-barres ou chercher (F2)..."
          className="flex-1 min-w-[220px]"
          inputClassName="py-2.5"
        />
        <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] dp-surface px-3 py-1.5 text-xs font-medium text-[#2563EB]">
          Tarif Détail · Casier uniquement
        </div>
      </div>

      <MotionStaggerGrid className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {products.map((prod) => (
          <MotionStaggerItem
            key={prod.id}
            interactive
            className="flex flex-col justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface-interactive p-4"
          >
            <div>
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5 min-w-0">
                  {prod.image_path ? (
                    <img
                      src={prod.image_path}
                      alt={prod.name}
                      loading="lazy"
                      className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-700 object-cover shrink-0 bg-slate-50 shadow-xs"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-400 shrink-0">
                      <Package className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
                      {prod.name}
                    </h3>
                    <p className="text-xs text-[#667085] dark:text-slate-400 truncate">
                      {prod.reference} · {prod.category_name}
                    </p>
                  </div>
                </div>
                <span
                  className={`font-mono-num text-xs font-semibold shrink-0 ${
                    prod.stock_milli <= 0
                      ? 'text-[#DC4545]'
                      : prod.stock_milli <= prod.min_stock_milli
                        ? 'text-[#D9901A]'
                        : 'text-[#16A36A] dark:text-emerald-400'
                  }`}
                >
                  {formatQty(prod.stock_milli, prod.base_unit)}
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {prod.packagings
                .filter((pk) => pk.is_active && pk.name === 'casier')
                .map((pk) => (
                  <motion.button
                    key={pk.id}
                    type="button"
                    whileHover={DP_BUTTON_HOVER}
                    whileTap={DP_BUTTON_TAP}
                    transition={DP_SPRING_SNAPPY}
                    onClick={() => onAddPackaging(prod, pk)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-[#182230] dark:text-slate-200 hover:border-[#2563EB] hover:text-[#2563EB] hover:shadow-sm transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    <span className="capitalize">{pk.name}</span>
                    <span className="font-mono-num text-[#667085] dark:text-slate-400">
                      {formatFcfa(getTierPrice(pk))}
                    </span>
                  </motion.button>
                ))}
            </div>
          </MotionStaggerItem>
        ))}
      </MotionStaggerGrid>
    </div>
  );
}
