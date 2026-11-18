import { useState } from 'react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { InlineAlert } from '../../../components/common/InlineAlert.tsx';
import { formatQty, newRequestKey } from '../../../utils/format.ts';
import type { StockProductRow } from '../types.ts';

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

interface StockAdjustModalProps {
  open: boolean;
  initialProductId: number;
  products: StockProductRow[];
  isPending: boolean;
  serverError: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    product_id: number;
    direction: 'in' | 'out';
    quantity: string;
    reason: string;
    request_key: string;
  }) => void;
}

function StockAdjustFormBody({
  initialProductId,
  products,
  isPending,
  serverError,
  onClose,
  onSubmit,
}: Omit<StockAdjustModalProps, 'open'>) {
  const [adjProductId, setAdjProductId] = useState<number>(
    initialProductId || products[0]?.id || 0
  );
  const [adjDirection, setAdjDirection] = useState<'in' | 'out'>('out');
  const [adjQuantity, setAdjQuantity] = useState('1');
  const [adjReason, setAdjReason] = useState('');
  const [adjRequestKey] = useState(() => newRequestKey('adj'));
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedProduct = products.find((p) => p.id === adjProductId) || products[0] || null;
  const parsedQtyMilli = parsePreviewMilli(adjQuantity);
  const projectedMilli =
    selectedProduct && parsedQtyMilli !== null
      ? selectedProduct.stock_milli + (adjDirection === 'out' ? -parsedQtyMilli : parsedQtyMilli)
      : null;

  const displayedError = validationError || serverError;

  return (
    <div className="mt-4">
      {displayedError && <InlineAlert message={displayedError} className="mb-3" />}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setValidationError(null);
          if (!selectedProduct) {
            setValidationError('Sélectionnez un produit actif.');
            return;
          }
          if (parsedQtyMilli === null) {
            setValidationError('Saisissez une quantité positive valide (max 3 décimales).');
            return;
          }
          if (adjReason.trim().length < 3) {
            setValidationError('Veuillez indiquer un motif explicite (au moins 3 caractères).');
            return;
          }
          onSubmit({
            product_id: selectedProduct.id,
            direction: adjDirection,
            quantity: adjQuantity.trim(),
            reason: adjReason.trim(),
            request_key: adjRequestKey,
          });
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
            {products.map((p) => (
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
            onClick={onClose}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Validation...' : "Valider l'ajustement"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function StockAdjustModal({
  open,
  initialProductId,
  products,
  isPending,
  serverError,
  onClose,
  onSubmit,
}: StockAdjustModalProps) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Ajustement manuel du stock"
      description="Casse, perte, don, échantillon ou correction ponctuelle avec motif audité"
      maxWidthClass="max-w-lg"
    >
      {open && (
        <StockAdjustFormBody
          key={initialProductId}
          initialProductId={initialProductId}
          products={products}
          isPending={isPending}
          serverError={serverError}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </ModalDialog>
  );
}
