import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import type { PaymentMethodConfig } from '../../../types/erp.ts';
import { formatFcfa } from '../../../utils/format.ts';
import type { OpenIssue } from '../types.ts';

interface ConsignmentReturnModalProps {
  target: OpenIssue | null;
  onClose: () => void;
  activeMethods: PaymentMethodConfig[];
  error: string | null;
  isPending: boolean;
  onSubmit: (values: {
    target: OpenIssue;
    pieces: number;
    condition_state: 'good' | 'damaged';
    refund_amount: number;
    credit_reduction: number;
    method_code: string;
    reason: string;
  }) => void;
}

function ConsignmentReturnFormBody({
  target,
  activeMethods,
  isPending,
  onSubmit,
}: {
  target: OpenIssue;
  activeMethods: PaymentMethodConfig[];
  isPending: boolean;
  onSubmit: ConsignmentReturnModalProps['onSubmit'];
}) {
  const initialRem = Math.max(1, target.pieces - target.returned_pieces);
  const [pieces, setPieces] = useState(initialRem);
  const [conditionState, setConditionState] = useState<'good' | 'damaged'>('good');
  const [refundAmount, setRefundAmount] = useState(initialRem * target.unit_value);
  const [creditReduction, setCreditReduction] = useState(0);
  const [methodCode, setMethodCode] = useState('cash');
  const [reason, setReason] = useState('Retour emballages vides');
  const [confirmMatchingProducts, setConfirmMatchingProducts] = useState(false);

  return (
    <>
      <div className="mt-4 space-y-3 text-xs">
        {target.expected_products && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 p-3 text-xs space-y-1.5">
            <div className="font-semibold text-[#B45309] dark:text-amber-400">
              Correspondance obligatoire des bouteilles vides
            </div>
            <p className="text-[#667085] dark:text-slate-300">
              Produits commandés et livrés attendus :{' '}
              <span className="font-medium text-[#182230] dark:text-slate-100">
                {target.expected_products}
              </span>
            </p>
            <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmMatchingProducts}
                onChange={(e) => setConfirmMatchingProducts(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-[#16A36A] focus:ring-[#16A36A]"
              />
              <span className="text-[#182230] dark:text-slate-200">
                Je confirme que les bouteilles vides remises correspondent exactement aux produits
                livrés ci-dessus.
              </span>
            </label>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-medium">Pièces retournées</label>
            <input
              type="number"
              min={1}
              max={target.pieces - target.returned_pieces}
              value={pieces}
              onChange={(e) => {
                const val = Math.max(1, Math.trunc(Number(e.target.value) || 1));
                setPieces(val);
                const maxValBig = BigInt(val) * BigInt(Math.max(0, target.unit_value));
                setRefundAmount(
                  maxValBig <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(maxValBig) : 0
                );
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num"
            />
          </div>
          <div>
            <label className="block font-medium">État</label>
            <select
              value={conditionState}
              onChange={(e) => {
                const st = e.target.value as 'good' | 'damaged';
                setConditionState(st);
                if (st === 'damaged') setRefundAmount(0);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
            >
              <option value="good">Bon état (réintègre le stock)</option>
              <option value="damaged">Endommagé / Cassé</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MoneyInput
            label="Remboursement client"
            value={refundAmount}
            onChange={setRefundAmount}
          />
          <MoneyInput
            label="Déduction créance"
            value={creditReduction}
            onChange={setCreditReduction}
          />
        </div>
        <div>
          <label className="block font-medium">Moyen de remboursement</label>
          <select
            value={methodCode}
            onChange={(e) => setMethodCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          >
            {activeMethods.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium">Motif *</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
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
          disabled={isPending || (Boolean(target.expected_products) && !confirmMatchingProducts)}
          onClick={() =>
            onSubmit({
              target,
              pieces,
              condition_state: conditionState,
              refund_amount: refundAmount,
              credit_reduction: creditReduction,
              method_code: methodCode,
              reason,
            })
          }
          className="rounded-lg bg-[#16A36A] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Confirmer le retour
        </button>
      </div>
    </>
  );
}

export function ConsignmentReturnModal({
  target,
  onClose,
  activeMethods,
  error,
  isPending,
  onSubmit,
}: ConsignmentReturnModalProps) {
  return (
    <ModalDialog
      open={Boolean(target)}
      onOpenChange={(o) => !o && onClose()}
      title={`Retour de vides · ${target?.sale_reference ?? ''}`}
      subtitle={`${target?.packaging_name ?? ''} — Tarif unitaire ${formatFcfa(target?.unit_value ?? 0)}`}
      tipsTopicId="consignments"
      tipsLabel="Aide retour"
      maxWidthClass="max-w-md"
      error={error}
    >
      {target && (
        <ConsignmentReturnFormBody
          key={target.id}
          target={target}
          activeMethods={activeMethods}
          isPending={isPending}
          onSubmit={onSubmit}
        />
      )}
    </ModalDialog>
  );
}
