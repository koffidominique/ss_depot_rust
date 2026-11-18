import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import type { ReturnableType } from '../types.ts';

interface ConsignmentAdjustModalProps {
  target: ReturnableType | null;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
  onSubmit: (values: {
    packaging_id: number;
    movement_type: 'entry' | 'breakage' | 'loss' | 'exit';
    quantity: number;
    reason: string;
  }) => void;
}

function ConsignmentAdjustFormBody({
  target,
  isPending,
  onSubmit,
}: {
  target: ReturnableType;
  isPending: boolean;
  onSubmit: ConsignmentAdjustModalProps['onSubmit'];
}) {
  const [movementType, setMovementType] = useState<'entry' | 'breakage' | 'loss' | 'exit'>('entry');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');

  return (
    <>
      <div className="mt-4 space-y-3 text-xs">
        <div>
          <label className="block font-medium">Type de mouvement</label>
          <select
            value={movementType}
            onChange={(e) =>
              setMovementType(e.target.value as 'entry' | 'breakage' | 'loss' | 'exit')
            }
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          >
            <option value="entry">Entrée dépôt (+)</option>
            <option value="breakage">Casse (-)</option>
            <option value="loss">Perte / Écart (-)</option>
            <option value="exit">Sortie fournisseur (-)</option>
          </select>
        </div>
        <div>
          <label className="block font-medium">Nombre de pièces</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num"
          />
        </div>
        <div>
          <label className="block font-medium">Motif obligatoire *</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex : Reprise fournisseur ou casse manutention"
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
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
          type="button"
          disabled={isPending}
          onClick={() =>
            onSubmit({
              packaging_id: target.id,
              movement_type: movementType,
              quantity,
              reason,
            })
          }
          className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white"
        >
          Enregistrer
        </button>
      </div>
    </>
  );
}

export function ConsignmentAdjustModal({
  target,
  onClose,
  error,
  isPending,
  onSubmit,
}: ConsignmentAdjustModalProps) {
  return (
    <ModalDialog
      open={Boolean(target)}
      onOpenChange={(o) => !o && onClose()}
      title={`Mouvement de vides · ${target?.name ?? ''}`}
      maxWidthClass="max-w-md"
      error={error}
    >
      {target && (
        <ConsignmentAdjustFormBody
          key={target.id}
          target={target}
          isPending={isPending}
          onSubmit={onSubmit}
        />
      )}
    </ModalDialog>
  );
}
