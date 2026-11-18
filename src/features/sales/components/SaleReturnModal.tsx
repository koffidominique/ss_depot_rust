import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { InlineAlert } from '../../../components/common/InlineAlert.tsx';
import type { PaymentMethodConfig, SaleDetail } from '../../../types/erp.ts';
import { formatQty } from '../../../utils/format.ts';

function parseQtyMilliInput(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (!cleaned) return 0;
  if (!/^\d+(\.\d{1,3})?$/.test(cleaned)) return null;
  const [intPart, fracPart = ''] = cleaned.split('.');
  return Number(intPart) * 1000 + Number(fracPart.padEnd(3, '0'));
}

interface SaleReturnModalProps {
  sale: SaleDetail | null;
  defaultMethodCode: string;
  refundMethods: PaymentMethodConfig[];
  serverError: string | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (args: {
    saleId: number;
    reason: string;
    restock_approved: boolean;
    refund_method_code: string;
    lines: Array<{ sale_line_id: number; base_quantity: string }>;
  }) => void;
}

function SaleReturnBody({
  sale,
  defaultMethodCode,
  refundMethods,
  serverError,
  isPending,
  onConfirm,
}: {
  sale: SaleDetail;
  defaultMethodCode: string;
  refundMethods: PaymentMethodConfig[];
  serverError: string | null;
  isPending: boolean;
  onConfirm: SaleReturnModalProps['onConfirm'];
}) {
  const [returnReason, setReturnReason] = useState('');
  const [returnQtyByLine, setReturnQtyByLine] = useState<Record<number, string>>({});
  const [restockApproved, setRestockApproved] = useState(true);
  const [refundMethodCode, setRefundMethodCode] = useState(defaultMethodCode);
  const [validationError, setValidationError] = useState<string | null>(null);

  const displayedError = validationError || serverError;

  const handleSubmit = () => {
    setValidationError(null);
    const lines: Array<{ sale_line_id: number; base_quantity: string }> = [];
    for (const l of sale.lines) {
      const raw = (returnQtyByLine[l.id] || '').trim().replace(',', '.');
      if (!raw) continue;
      const qtyMilli = parseQtyMilliInput(raw);
      if (qtyMilli === null) {
        setValidationError(`Quantité de retour invalide pour ${l.product_name}.`);
        return;
      }
      if (qtyMilli <= 0) continue;
      const remMilli = Math.max(0, l.base_quantity_milli - l.returned_base_milli);
      if (qtyMilli > remMilli) {
        setValidationError(
          `Quantité retournée supérieure au solde restant pour ${l.product_name}.`
        );
        return;
      }
      lines.push({ sale_line_id: l.id, base_quantity: raw });
    }
    if (lines.length === 0) {
      setValidationError('Saisissez au moins un article à retourner avec une quantité > 0.');
      return;
    }
    onConfirm({
      saleId: sale.id,
      reason: returnReason,
      restock_approved: restockApproved,
      refund_method_code: refundMethodCode,
      lines,
    });
  };

  return (
    <>
      {displayedError && <InlineAlert message={displayedError} className="mt-3" />}
      <div className="mt-4 space-y-3">
        {sale.lines.map((l) => {
          const remMilli = Math.max(0, l.base_quantity_milli - l.returned_base_milli);
          return (
            <div key={l.id} className="flex items-center justify-between gap-3 text-xs">
              <div>
                <div className="font-medium">{l.product_name}</div>
                <div className="text-[#667085]">
                  {remMilli > 0
                    ? `Max retournable : ${formatQty(remMilli, l.base_unit)}`
                    : 'Déjà intégralement retournée'}
                </div>
              </div>
              <input
                type="text"
                aria-label={`Quantité retour ${l.product_name}`}
                disabled={remMilli <= 0}
                value={returnQtyByLine[l.id] || ''}
                onChange={(e) => {
                  const raw = e.target.value.replace(',', '.');
                  if (raw === '' || /^\d+(\.\d{0,3})?$/.test(raw)) {
                    setReturnQtyByLine((prev) => ({ ...prev, [l.id]: raw }));
                  }
                }}
                placeholder="0"
                className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num text-right disabled:opacity-50"
              />
            </div>
          );
        })}

        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={restockApproved}
            onChange={(e) => setRestockApproved(e.target.checked)}
          />
          <span>Réintégrer les marchandises en stock (état conforme)</span>
        </label>

        <div>
          <label className="block text-xs font-medium">
            Moyen de remboursement (si avoir remboursé)
          </label>
          <select
            aria-label="Moyen de remboursement retour"
            value={refundMethodCode}
            onChange={(e) => setRefundMethodCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
          >
            {refundMethods.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium">Motif du retour *</label>
          <input
            type="text"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-3">
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
          disabled={!returnReason.trim() || isPending}
          onClick={handleSubmit}
          className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
        >
          Générer l&apos;avoir
        </button>
      </div>
    </>
  );
}

export function SaleReturnModal({
  sale,
  defaultMethodCode,
  refundMethods,
  serverError,
  isPending,
  onClose,
  onConfirm,
}: SaleReturnModalProps) {
  return (
    <ModalDialog
      open={Boolean(sale)}
      onOpenChange={(o) => !o && onClose()}
      title={`Retour de marchandises · ${sale?.reference ?? ''}`}
      tipsTopicId="sales-history"
      tipsLabel="Aide avoir"
      maxWidthClass="max-w-lg"
    >
      {sale && (
        <SaleReturnBody
          key={sale.id}
          sale={sale}
          defaultMethodCode={defaultMethodCode}
          refundMethods={refundMethods}
          serverError={serverError}
          isPending={isPending}
          onConfirm={onConfirm}
        />
      )}
    </ModalDialog>
  );
}
