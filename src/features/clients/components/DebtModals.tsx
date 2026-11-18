import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Trash2 } from 'lucide-react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { InlineAlert } from '../../../components/common/InlineAlert.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import type { PaymentMethodConfig, Receivable, SaleDetail } from '../../../types/erp.ts';
import { formatDateTime, formatFcfa } from '../../../utils/format.ts';

function DebtPayBody({
  receivable,
  activeMethods,
  errorMsg,
  isPending,
  onSubmit,
}: {
  receivable: Receivable;
  activeMethods: PaymentMethodConfig[];
  errorMsg: string | null;
  isPending: boolean;
  onSubmit: (args: {
    receivableId: number;
    note: string;
    parts: Array<{ method_code: string; amount: number }>;
  }) => void;
}) {
  const [parts, setParts] = useState<Array<{ method_code: string; amount: number }>>([
    { method_code: 'cash', amount: receivable.remaining_amount },
  ]);
  const [note, setNote] = useState('');

  return (
    <>
      {errorMsg && <InlineAlert message={errorMsg} className="mt-3" />}
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Paiement (simple ou mixte)</span>
          <button
            type="button"
            onClick={() => setParts((p) => [...p, { method_code: 'wave', amount: 0 }])}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB]"
          >
            <Plus className="h-3 w-3" />
            Ajouter moyen
          </button>
        </div>
        {parts.map((part, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <select
              value={part.method_code}
              onChange={(e) =>
                setParts((prev) =>
                  prev.map((p, i) => (i === idx ? { ...p, method_code: e.target.value } : p))
                )
              }
              className="w-36 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs"
            >
              {activeMethods.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </select>
            <MoneyInput
              value={part.amount}
              onChange={(amt) =>
                setParts((prev) =>
                  prev.map((p, i) => (i === idx ? { ...p, amount: amt } : p))
                )
              }
              className="flex-1"
            />
            {parts.length > 1 && (
              <button
                type="button"
                onClick={() => setParts((prev) => prev.filter((_, i) => i !== idx))}
                className="text-slate-400 hover:text-[#DC4545]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium">Observation</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
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
          onClick={() => onSubmit({ receivableId: receivable.id, note, parts })}
          className="rounded-lg bg-[#16A36A] px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          Valider l&apos;encaissement
        </button>
      </div>
    </>
  );
}

export function DebtPayModal({
  receivable,
  activeMethods,
  errorMsg,
  isPending,
  onClose,
  onSubmit,
}: {
  receivable: Receivable | null;
  activeMethods: PaymentMethodConfig[];
  errorMsg: string | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (args: {
    receivableId: number;
    note: string;
    parts: Array<{ method_code: string; amount: number }>;
  }) => void;
}) {
  return (
    <ModalDialog
      open={Boolean(receivable)}
      onOpenChange={(o) => !o && onClose()}
      title={`Encaisser créance · ${receivable?.sale_reference ?? ''}`}
      description={
        receivable
          ? `${receivable.client_name} · Reste dû : ${formatFcfa(receivable.remaining_amount)}`
          : undefined
      }
      tipsTopicId="debts"
      tipsLabel="Aide"
      maxWidthClass="max-w-md"
    >
      {receivable && (
        <DebtPayBody
          key={receivable.id}
          receivable={receivable}
          activeMethods={activeMethods}
          errorMsg={errorMsg}
          isPending={isPending}
          onSubmit={onSubmit}
        />
      )}
    </ModalDialog>
  );
}

export function DebtHistoryModal({
  receivable,
  historySale,
  onClose,
}: {
  receivable: Receivable | null;
  historySale: SaleDetail | undefined;
  onClose: () => void;
}) {
  return (
    <ModalDialog
      open={Boolean(receivable)}
      onOpenChange={(o) => !o && onClose()}
      title={`Paiements · ${receivable?.sale_reference ?? ''}`}
      description={
        receivable
          ? `${receivable.client_name} · Initial : ${formatFcfa(receivable.initial_amount)} · Reste : ${formatFcfa(receivable.remaining_amount)}`
          : undefined
      }
      maxWidthClass="max-w-lg"
    >
      <div className="mt-4 space-y-2 text-xs">
        {!historySale ? (
          <p className="text-[#667085]">Chargement de l&apos;historique...</p>
        ) : historySale.payments.length === 0 ? (
          <p className="text-[#667085]">Aucun versement encore enregistré sur cette facture.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
            {historySale.payments.map((p, idx) => (
              <div key={`${p.id}-${idx}`} className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <div className="font-medium">
                    <span className="font-mono-num font-semibold">{p.reference}</span> ·{' '}
                    {p.method_label}
                  </div>
                  <div className="font-mono-num text-[11px] text-[#667085]">
                    {formatDateTime(p.created_at)}
                  </div>
                </div>
                <span className="font-mono-num font-semibold text-[#16A36A]">
                  {formatFcfa(p.part_amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalDialog>
  );
}
