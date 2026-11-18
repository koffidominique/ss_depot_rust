import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import type { Client, CreditPolicy } from '../../../types/erp.ts';

interface ClientCreditModalProps {
  target: Client | null;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
  onSubmit: (values: {
    id: number;
    credit_policy: CreditPolicy;
    credit_limit: number;
    payment_terms_days: number;
  }) => void;
}

function ClientCreditFormBody({
  target,
  isPending,
  onSubmit,
}: {
  target: Client;
  isPending: boolean;
  onSubmit: ClientCreditModalProps['onSubmit'];
}) {
  const [creditPolicy, setCreditPolicy] = useState<CreditPolicy>(target.credit_policy);
  const [creditLimit, setCreditLimit] = useState<number>(target.credit_limit ?? 0);
  const [termsDays, setTermsDays] = useState<number>(target.payment_terms_days ?? 15);

  return (
    <>
      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-medium">État du crédit</label>
          <select
            value={creditPolicy}
            onChange={(e) => setCreditPolicy(e.target.value as CreditPolicy)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="forbidden">Crédit interdit</option>
            <option value="limited">Plafond limité</option>
            <option value="unlimited">Crédit illimité autorisé</option>
          </select>
        </div>
        {creditPolicy === 'limited' && (
          <MoneyInput label="Plafond de crédit" value={creditLimit} onChange={setCreditLimit} />
        )}
        {creditPolicy !== 'forbidden' && (
          <div>
            <label className="block text-xs font-medium">Délai d&apos;échéance (jours)</label>
            <input
              type="number"
              min={0}
              value={termsDays}
              onChange={(e) => setTermsDays(Math.max(0, Number(e.target.value)))}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
            />
          </div>
        )}
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
              id: target.id,
              credit_policy: creditPolicy,
              credit_limit: creditLimit,
              payment_terms_days: termsDays,
            })
          }
          className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Mettre à jour
        </button>
      </div>
    </>
  );
}

export function ClientCreditModal({
  target,
  onClose,
  error,
  isPending,
  onSubmit,
}: ClientCreditModalProps) {
  return (
    <ModalDialog
      open={Boolean(target)}
      onOpenChange={(o) => !o && onClose()}
      title={`Politique de crédit · ${target?.name ?? ''}`}
      tipsTopicId="clients"
      tipsLabel="Aide"
      maxWidthClass="max-w-md"
      error={error}
    >
      {target && (
        <ClientCreditFormBody
          key={target.id}
          target={target}
          isPending={isPending}
          onSubmit={onSubmit}
        />
      )}
    </ModalDialog>
  );
}
