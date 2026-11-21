import { formatFcfa } from '../../../utils/format.ts';
import type { EditCataloguePriceState, PriceHistoryEntry } from './catalogueColumns.tsx';

/* ============================================================================
 * Modales du catalogue central : modification de prix & historique
 * ============================================================================ */

export function CataloguePriceEditModal({
  editing,
  priceInput,
  priceReason,
  isPending,
  onChangePriceInput,
  onChangePriceReason,
  onClose,
  onConfirm,
}: {
  editing: EditCataloguePriceState | null;
  priceInput: string;
  priceReason: string;
  isPending: boolean;
  onChangePriceInput: (val: string) => void;
  onChangePriceReason: (val: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!editing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-xl bg-white p-5 shadow-xl">
        <h3 className="mb-1 text-sm font-semibold">Prix de référence — {editing.code}</h3>
        <p className="mb-3 text-xs text-slate-500">{editing.name}</p>
        <label className="text-xs text-slate-600">Nouveau prix (FCFA)</label>
        <input
          type="number"
          min="0"
          value={priceInput}
          onChange={(e) => onChangePriceInput(e.target.value)}
          className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <label className="text-xs text-slate-600">Motif (facultatif)</label>
        <input
          value={priceReason}
          onChange={(e) => onChangePriceReason(e.target.value)}
          className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <p className="mb-3 text-xs text-slate-400">
          Ancien prix : {formatFcfa(editing.price)} — conservé dans l'historique. Les ventes
          passées ne sont jamais recalculées.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {isPending ? '…' : 'Appliquer'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CataloguePriceHistoryModal({
  historyFor,
  entries,
  onClose,
}: {
  historyFor: { id: number; code: string } | null;
  entries: PriceHistoryEntry[];
  onClose: () => void;
}) {
  if (!historyFor) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="max-h-[70vh] w-[30rem] overflow-auto rounded-xl bg-white p-5 shadow-xl">
        <h3 className="mb-3 text-sm font-semibold">
          Historique des prix — {historyFor.code}
        </h3>
        {entries.length === 0 ? (
          <p className="text-xs text-slate-500">Aucun changement de prix enregistré.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1">Nouveau prix</th>
                <th className="py-1">Par</th>
                <th className="py-1">Motif</th>
                <th className="py-1">Date</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((h) => (
                <tr key={h.id} className="border-t border-slate-100">
                  <td className="py-1 font-semibold">{formatFcfa(h.reference_price)}</td>
                  <td className="py-1">{h.changed_by ?? '—'}</td>
                  <td className="py-1">{h.reason ?? '—'}</td>
                  <td className="py-1">{h.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
