import * as Dialog from '@radix-ui/react-dialog';
import { Plus } from 'lucide-react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import { QuantityInput } from '../../../components/common/QuantityInput.tsx';
import type { PackagingName, Product, ProductPackaging } from '../../../types/erp.ts';
import { formatFcfa, packagingContentsLabel } from '../../../utils/format.ts';
import {
  PACKAGING_OPTIONS,
  type PackagingFormState,
} from '../utils/productSchemas.ts';

interface ReturnableTypeOption {
  id: number;
  name: string;
  deposit_value: number;
}

interface PackagingModalProps {
  product: Product | null;
  state: PackagingFormState;
  onChangeState: (updater: (prev: PackagingFormState) => PackagingFormState) => void;
  onSelectExisting: (pk: ProductPackaging) => void;
  onStartNew: (product: Product) => void;
  returnableTypes?: ReturnableTypeOption[];
  error: string | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export function PackagingModal({
  product,
  state,
  onChangeState,
  onSelectExisting,
  onStartNew,
  returnableTypes,
  error,
  isPending,
  onClose,
  onSubmit,
}: PackagingModalProps) {
  const canAddMore = (product?.packagings.length ?? 0) < PACKAGING_OPTIONS.length;

  return (
    <ModalDialog
      open={Boolean(product)}
      onOpenChange={(o) => !o && onClose()}
      title={`Conditionnements · ${product?.name ?? ''}`}
      tipsTopicId="products"
      tipsLabel="Aide coeff. & retour emballage"
      maxWidthClass="max-w-xl"
      scrollable
      error={error}
      footer={
        <>
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
            disabled={isPending}
            onClick={onSubmit}
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {state.id ? 'Mettre à jour le conditionnement' : 'Enregistrer le conditionnement'}
          </button>
        </>
      }
    >
      {product && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
          {product.packagings.map((pk) => {
            const selected = state.id === pk.id;
            return (
              <button
                key={pk.id}
                type="button"
                onClick={() => onSelectExisting(pk)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  selected
                    ? 'border-[#2563EB] bg-[#2563EB] text-white'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[#182230] dark:text-slate-200 hover:border-[#2563EB]'
                }`}
              >
                <span>
                  {packagingContentsLabel(pk.name, product.base_unit, pk.coefficient_milli)}
                </span>
                {!pk.is_active && <span className="text-[10px] opacity-80">(Inactif)</span>}
              </button>
            );
          })}
          {canAddMore && (
            <button
              type="button"
              onClick={() => onStartNew(product)}
              className={`inline-flex items-center gap-1 rounded-lg border border-dashed px-2.5 py-1 text-xs font-medium transition-colors ${
                state.id === undefined
                  ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/40 text-[#2563EB]'
                  : 'border-slate-300 dark:border-slate-700 text-[#667085] hover:border-[#2563EB] hover:text-[#2563EB]'
              }`}
            >
              <Plus className="h-3 w-3" />
              Nouveau
            </button>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium">Type de conditionnement</label>
          <select
            aria-label="Type de conditionnement"
            value={state.name}
            onChange={(e) =>
              onChangeState((prev) => ({ ...prev, name: e.target.value as PackagingName }))
            }
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm capitalize"
          >
            {PACKAGING_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <QuantityInput
          label={`Coefficient (en ${product?.base_unit})`}
          value={state.coefficient}
          onChange={(v) => onChangeState((prev) => ({ ...prev, coefficient: v }))}
          unit={product?.base_unit}
        />
        <MoneyInput
          label="Prix d'achat"
          value={state.purchase_price}
          onChange={(v) => onChangeState((prev) => ({ ...prev, purchase_price: v }))}
        />
        <MoneyInput
          label="Tarif gros"
          value={state.wholesale_price}
          onChange={(v) => onChangeState((prev) => ({ ...prev, wholesale_price: v }))}
        />
        <MoneyInput
          label="Tarif demi-gros"
          value={state.semi_wholesale_price}
          onChange={(v) => onChangeState((prev) => ({ ...prev, semi_wholesale_price: v }))}
        />
        <MoneyInput
          label="Prix détail"
          value={state.retail_price}
          onChange={(v) => onChangeState((prev) => ({ ...prev, retail_price: v }))}
        />
        <MoneyInput
          label="Consigne bouteille"
          value={state.bottle_deposit_amount}
          onChange={(v) => onChangeState((prev) => ({ ...prev, bottle_deposit_amount: v }))}
        />
        <MoneyInput
          label="Consigne caisse / casier"
          value={state.package_deposit_amount}
          onChange={(v) => onChangeState((prev) => ({ ...prev, package_deposit_amount: v }))}
        />
        <div className="col-span-2">
          <label className="block text-xs font-medium">Code-barres conditionnement</label>
          <input
            aria-label="Code-barres conditionnement"
            type="text"
            value={state.barcode}
            onChange={(e) => onChangeState((prev) => ({ ...prev, barcode: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={state.allow_fraction}
            onChange={(e) =>
              onChangeState((prev) => ({ ...prev, allow_fraction: e.target.checked }))
            }
            className="rounded border-slate-300 text-[#2563EB]"
          />
          Autoriser quantités fractionnaires (demi-casier)
        </label>
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={state.is_active}
            onChange={(e) => onChangeState((prev) => ({ ...prev, is_active: e.target.checked }))}
            className="rounded border-slate-300 text-[#2563EB]"
          />
          Conditionnement actif à la vente
        </label>
        <div className="col-span-2 border-t border-slate-200 dark:border-slate-800 pt-3">
          <label className="block text-xs font-medium">Profil consigne / emballage</label>
          <select
            aria-label="Profil consigne / emballage"
            value={state.deposit_mode}
            onChange={(e) =>
              onChangeState((prev) => ({
                ...prev,
                deposit_mode: e.target.value as 'none' | 'deposit',
              }))
            }
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="none">Sans retour emballage (perdu / jetable)</option>
            <option value="deposit">Avec consigne & suivi retour d'emballage</option>
          </select>
        </div>
        {state.deposit_mode === 'deposit' && (
          <>
            <div>
              <label className="block text-xs font-medium">Type d'emballage consigné</label>
              <select
                value={state.returnable_id}
                onChange={(e) =>
                  onChangeState((prev) => ({ ...prev, returnable_id: Number(e.target.value) }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              >
                <option value={0}>-- Choisir --</option>
                {returnableTypes?.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name} ({formatFcfa(rt.deposit_value)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium">Pièces par conditionnement</label>
              <input
                type="number"
                min={1}
                value={state.returnable_pieces}
                onChange={(e) =>
                  onChangeState((prev) => ({
                    ...prev,
                    returnable_pieces: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
              />
            </div>
          </>
        )}
      </div>
    </ModalDialog>
  );
}
