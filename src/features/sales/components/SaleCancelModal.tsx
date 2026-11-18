import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { InlineAlert } from '../../../components/common/InlineAlert.tsx';
import type { PaymentMethodConfig, SaleDetail } from '../../../types/erp.ts';

interface SaleCancelModalProps {
  sale: SaleDetail | null;
  defaultMethodCode: string;
  refundMethods: PaymentMethodConfig[];
  serverError: string | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (args: { saleId: number; reason: string; refund_method_code: string }) => void;
}

function SaleCancelBody({
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
  onConfirm: SaleCancelModalProps['onConfirm'];
}) {
  const [cancelReason, setCancelReason] = useState('');
  const [refundMethodCode, setRefundMethodCode] = useState(defaultMethodCode);

  return (
    <>
      {serverError && <InlineAlert message={serverError} className="mt-3" />}
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium">Moyen de remboursement</label>
          <select
            aria-label="Moyen de remboursement"
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
          <label className="block text-xs font-medium">Motif obligatoire *</label>
          <input
            type="text"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Ex : Erreur de saisie client"
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
            Fermer
          </button>
        </Dialog.Close>
        <button
          type="button"
          disabled={!cancelReason.trim() || isPending}
          onClick={() =>
            onConfirm({
              saleId: sale.id,
              reason: cancelReason,
              refund_method_code: refundMethodCode,
            })
          }
          className="rounded-lg bg-[#DC4545] px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
        >
          Confirmer contre-écriture
        </button>
      </div>
    </>
  );
}

export function SaleCancelModal({
  sale,
  defaultMethodCode,
  refundMethods,
  serverError,
  isPending,
  onClose,
  onConfirm,
}: SaleCancelModalProps) {
  return (
    <ModalDialog
      open={Boolean(sale)}
      onOpenChange={(o) => !o && onClose()}
      title={`Annulation par contre-écriture · ${sale?.reference ?? ''}`}
      description="Le stock sera réintégré et les encaissements remboursés sur la session de caisse ouverte."
      tipsTopicId="sales-history"
      tipsLabel="Règles"
      maxWidthClass="max-w-md"
      titleClassName="text-[#DC4545]"
    >
      {sale && (
        <SaleCancelBody
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
