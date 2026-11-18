import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, Search } from 'lucide-react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { InlineAlert } from '../../../components/common/InlineAlert.tsx';
import { QuantityInput } from '../../../components/common/QuantityInput.tsx';
import { formatDateTime, formatQty } from '../../../utils/format.ts';
import type { InventoryRecord } from '../types.ts';

interface InventoryCountModalProps {
  inventory: InventoryRecord | null;
  onClose: () => void;
  errorMsg: string | null;
  isPending: boolean;
  onValidate: (
    id: number,
    lines: Array<{ product_id: number; counted_quantity: string; reason?: string }>
  ) => void;
}

function buildInitialCounts(inv: InventoryRecord): Record<number, string> {
  const init: Record<number, string> = {};
  inv.lines.forEach((l) => {
    const val = l.counted_milli !== null ? l.counted_milli : l.theoretical_milli;
    init[l.product_id] = String(val / 1000);
  });
  return init;
}

function buildInitialReasons(inv: InventoryRecord): Record<number, string> {
  const init: Record<number, string> = {};
  inv.lines.forEach((l) => {
    init[l.product_id] = l.reason || '';
  });
  return init;
}

function InventoryCountBody({
  inventory,
  errorMsg,
  isPending,
  onValidate,
}: {
  inventory: InventoryRecord;
  errorMsg: string | null;
  isPending: boolean;
  onValidate: InventoryCountModalProps['onValidate'];
}) {
  const [counts, setCounts] = useState<Record<number, string>>(() => buildInitialCounts(inventory));
  const [reasons, setReasons] = useState<Record<number, string>>(() =>
    buildInitialReasons(inventory)
  );
  const [countSearch, setCountSearch] = useState('');
  const [onlyDiscrepancies, setOnlyDiscrepancies] = useState(false);

  const lineStats = inventory.lines.map((line) => {
    const theoreticalUnits = line.theoretical_milli / 1000;
    const enteredStr = counts[line.product_id] ?? String(theoreticalUnits);
    const enteredNum = Number(enteredStr.replace(',', '.'));
    const delta = Number.isFinite(enteredNum)
      ? Math.round((enteredNum - theoreticalUnits) * 1000) / 1000
      : 0;
    return { line, enteredStr, delta };
  });

  const totalDiscrepancies = lineStats.filter((x) => x.delta !== 0).length;
  const q = countSearch.trim().toLowerCase();
  const visibleLines = lineStats.filter(({ line, delta }) => {
    if (onlyDiscrepancies && delta === 0) return false;
    if (
      q &&
      !line.product_name.toLowerCase().includes(q) &&
      !line.product_reference.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
  const isReadonly = inventory.status !== 'draft';

  return (
    <>
      {errorMsg && <InlineAlert message={errorMsg} className="mt-3" />}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-3 py-2.5 text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#667085]" />
          <input
            type="text"
            value={countSearch}
            onChange={(e) => setCountSearch(e.target.value)}
            placeholder="Filtrer un article (nom ou référence)..."
            aria-label="Filtrer les articles de l'inventaire"
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-2.5 py-1.5 text-xs"
          />
        </div>
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyDiscrepancies}
            onChange={(e) => setOnlyDiscrepancies(e.target.checked)}
          />
          <span>Écarts uniquement</span>
        </label>
        <span className="font-mono-num text-[11px] font-semibold text-[#667085] dark:text-slate-300">
          {inventory.lines.length} article(s) ·{' '}
          <span className={totalDiscrepancies > 0 ? 'text-[#D9901A]' : 'text-[#16A36A]'}>
            {totalDiscrepancies} écart(s)
          </span>
        </span>
      </div>

      <div className="mt-3 space-y-2.5">
        {visibleLines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 py-6 text-center text-xs text-[#667085]">
            Aucun article ne correspond au filtre actif.
          </div>
        ) : (
          visibleLines.map(({ line, enteredStr, delta }) => (
            <div
              key={line.id}
              className="grid grid-cols-12 items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs"
            >
              <div className="col-span-4">
                <div className="font-medium text-[#182230] dark:text-slate-100">
                  {line.product_name}
                </div>
                <div className="font-mono-num text-[11px] text-[#667085]">
                  {line.product_reference} · Théorique :{' '}
                  {formatQty(line.theoretical_milli, line.base_unit)}
                </div>
              </div>
              <div className="col-span-3">
                <QuantityInput
                  label="Compté"
                  value={enteredStr}
                  disabled={isReadonly}
                  onChange={(v) => setCounts((p) => ({ ...p, [line.product_id]: v }))}
                  unit={line.base_unit}
                />
              </div>
              <div className="col-span-2 text-right">
                <div className="text-[11px] text-[#667085]">Écart</div>
                <div
                  className={`font-mono-num font-semibold ${
                    delta === 0
                      ? 'text-[#16A36A]'
                      : delta > 0
                        ? 'text-[#2563EB]'
                        : 'text-[#DC4545]'
                  }`}
                >
                  {delta > 0 ? '+' : ''}
                  {delta} {line.base_unit}
                </div>
              </div>
              <div className="col-span-3">
                <label className="block text-[11px] text-[#667085]">
                  Motif {delta !== 0 ? '*' : '(optionnel)'}
                </label>
                <input
                  type="text"
                  disabled={isReadonly}
                  value={reasons[line.product_id] || ''}
                  onChange={(e) => setReasons((p) => ({ ...p, [line.product_id]: e.target.value }))}
                  placeholder={delta !== 0 ? 'Motif obligatoire' : '—'}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs disabled:opacity-60"
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Dialog.Close asChild>
          <button
            type="button"
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
          >
            Fermer
          </button>
        </Dialog.Close>
        {inventory.status === 'draft' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              const lines = inventory.lines.map((l) => ({
                product_id: l.product_id,
                counted_quantity: counts[l.product_id] ?? String(l.theoretical_milli / 1000),
                reason: reasons[l.product_id] || undefined,
              }));
              onValidate(inventory.id, lines);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A36A] px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Valider et ajuster le stock
          </button>
        )}
      </div>
    </>
  );
}

export function InventoryCountModal({
  inventory,
  onClose,
  errorMsg,
  isPending,
  onValidate,
}: InventoryCountModalProps) {
  return (
    <ModalDialog
      open={Boolean(inventory)}
      onOpenChange={(o) => !o && onClose()}
      title={inventory ? `Inventaire · ${inventory.reference}` : ''}
      description={
        inventory
          ? inventory.status === 'draft'
            ? 'Saisissez les quantités physiques comptées et justifiez tout écart.'
            : `Validé le ${formatDateTime(inventory.validated_at)}`
          : undefined
      }
      tipsTopicId="inventories"
      tipsLabel="Aide écarts"
      maxWidthClass="max-w-3xl"
    >
      {inventory && (
        <InventoryCountBody
          key={inventory.id}
          inventory={inventory}
          errorMsg={errorMsg}
          isPending={isPending}
          onValidate={onValidate}
        />
      )}
    </ModalDialog>
  );
}
