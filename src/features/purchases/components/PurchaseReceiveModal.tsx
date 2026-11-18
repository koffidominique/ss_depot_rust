import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { QuantityInput } from '../../../components/common/QuantityInput.tsx';
import type { PurchaseOrder } from '../../../types/erp.ts';
import { formatQty } from '../../../utils/format.ts';

interface PurchaseReceiveModalProps {
  target: PurchaseOrder | null;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
  onSubmit: (values: {
    target: PurchaseOrder;
    receiveQty: Record<number, string>;
    receiveReason: Record<number, string>;
  }) => void;
}

function buildInitialReceiveQty(target: PurchaseOrder): Record<number, string> {
  const initQty: Record<number, string> = {};
  target.lines.forEach((l) => {
    const remMilli = l.ordered_quantity_milli - l.received_quantity_milli;
    if (remMilli > 0) {
      const intPart = Math.floor(remMilli / 1000);
      const frac = remMilli % 1000;
      initQty[l.id] =
        frac === 0
          ? String(intPart)
          : `${intPart}.${String(frac).padStart(3, '0').replace(/0+$/, '')}`;
    }
  });
  return initQty;
}

function PurchaseReceiveFormBody({
  target,
  isPending,
  onSubmit,
}: {
  target: PurchaseOrder;
  isPending: boolean;
  onSubmit: PurchaseReceiveModalProps['onSubmit'];
}) {
  const [receiveQty, setReceiveQty] = useState<Record<number, string>>(() =>
    buildInitialReceiveQty(target)
  );
  const [receiveReason, setReceiveReason] = useState<Record<number, string>>({});

  return (
    <>
      <div className="mt-4 space-y-3">
        {target.lines.map((l) => {
          const remMilli = l.ordered_quantity_milli - l.received_quantity_milli;
          if (remMilli <= 0) return null;
          return (
            <div
              key={l.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2 text-xs"
            >
              <div className="flex justify-between">
                <span className="font-semibold">{l.product_name}</span>
                <span className="font-mono-num text-[#667085]">
                  Restant : {formatQty(remMilli, l.packaging_name)} (×
                  {formatQty(l.coefficient_milli, l.base_unit)})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <QuantityInput
                  label="Quantité reçue"
                  value={receiveQty[l.id] || ''}
                  onChange={(v) => setReceiveQty((p) => ({ ...p, [l.id]: v }))}
                  unit={l.packaging_name}
                />
                <div>
                  <label className="block text-xs font-medium">
                    Motif d&apos;écart (optionnel)
                  </label>
                  <input
                    type="text"
                    value={receiveReason[l.id] || ''}
                    onChange={(e) =>
                      setReceiveReason((p) => ({ ...p, [l.id]: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                  />
                </div>
              </div>
            </div>
          );
        })}
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
          onClick={() => onSubmit({ target, receiveQty, receiveReason })}
          className="rounded-lg bg-[#16A36A] px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          Valider la réception en stock
        </button>
      </div>
    </>
  );
}

export function PurchaseReceiveModal({
  target,
  onClose,
  error,
  isPending,
  onSubmit,
}: PurchaseReceiveModalProps) {
  return (
    <ModalDialog
      open={Boolean(target)}
      onOpenChange={(o) => !o && onClose()}
      title={`Réceptionner · ${target?.reference ?? ''}`}
      tipsTopicId="purchases"
      tipsLabel="Aide réception"
      maxWidthClass="max-w-xl"
      scrollable
      error={error}
    >
      {target && (
        <PurchaseReceiveFormBody
          key={target.id}
          target={target}
          isPending={isPending}
          onSubmit={onSubmit}
        />
      )}
    </ModalDialog>
  );
}
