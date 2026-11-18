import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Edit3, X } from 'lucide-react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { InlineAlert } from '../../../components/common/InlineAlert.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import { StatusBadge } from '../../../components/common/StatusBadge.tsx';
import type {
  PaymentMethodConfig,
  PurchaseOrder,
  Supplier,
  SupplierDebt,
} from '../../../types/erp.ts';
import { formatDate, formatDateTime, formatFcfa } from '../../../utils/format.ts';

function PayDebtBody({
  debt,
  activeMethods,
  errorMsg,
  isPending,
  onConfirm,
}: {
  debt: SupplierDebt;
  activeMethods: PaymentMethodConfig[];
  errorMsg: string | null;
  isPending: boolean;
  onConfirm: (args: { debtId: number; method_code: string; amount: number }) => void;
}) {
  const [payAmount, setPayAmount] = useState(debt.remaining_amount);
  const [payMethod, setPayMethod] = useState(activeMethods[0]?.code || 'cash');

  return (
    <>
      {errorMsg && <InlineAlert message={errorMsg} className="mt-3" />}
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium">Moyen de paiement</label>
          <select
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            {activeMethods.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <MoneyInput label="Montant versé" value={payAmount} onChange={setPayAmount} />
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
          disabled={isPending}
          onClick={() => onConfirm({ debtId: debt.id, method_code: payMethod, amount: payAmount })}
          className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white"
        >
          Confirmer règlement
        </button>
      </div>
    </>
  );
}

export function SupplierDebtPayModal({
  debt,
  activeMethods,
  errorMsg,
  isPending,
  onClose,
  onConfirm,
}: {
  debt: SupplierDebt | null;
  activeMethods: PaymentMethodConfig[];
  errorMsg: string | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (args: { debtId: number; method_code: string; amount: number }) => void;
}) {
  return (
    <ModalDialog
      open={Boolean(debt)}
      onOpenChange={(o) => !o && onClose()}
      title={`Régler ${debt?.supplier_name ?? ''}`}
      description={
        debt
          ? `Réception ${debt.receipt_reference} · Reste dû : ${formatFcfa(debt.remaining_amount)}`
          : undefined
      }
      tipsTopicId="suppliers"
      tipsLabel="Aide"
      maxWidthClass="max-w-md"
    >
      {debt && (
        <PayDebtBody
          key={debt.id}
          debt={debt}
          activeMethods={activeMethods}
          errorMsg={errorMsg}
          isPending={isPending}
          onConfirm={onConfirm}
        />
      )}
    </ModalDialog>
  );
}

export function SupplierDetailModal({
  supplier,
  purchases,
  debts,
  onClose,
  onEdit,
}: {
  supplier: Supplier | null;
  purchases: PurchaseOrder[];
  debts: SupplierDebt[];
  onClose: () => void;
  onEdit: (supplier: Supplier) => void;
}) {
  return (
    <Dialog.Root open={Boolean(supplier)} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl">
          {supplier &&
            (() => {
              const supOrders = purchases.filter((p) => p.supplier_id === supplier.id);
              const supDebts = debts.filter((d) => d.supplier_id === supplier.id);
              return (
                <div className="space-y-5 text-xs">
                  <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div>
                      <Dialog.Title className="font-display text-base font-bold">
                        {supplier.name} · {supplier.code}
                      </Dialog.Title>
                      <p className="mt-0.5 text-[#667085]">
                        Tél : {supplier.phone} · Délai : {supplier.payment_terms_days} jour(s)
                        {supplier.company_name ? ` · ${supplier.company_name}` : ''}
                        {supplier.address ? ` · ${supplier.address}` : ''}
                        {supplier.email ? ` · ${supplier.email}` : ''}
                        {supplier.contact_person ? ` · Contact : ${supplier.contact_person}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(supplier)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Modifier
                      </button>
                      <Dialog.Close className="rounded-lg p-1 text-slate-400">
                        <X className="h-4 w-4" />
                      </Dialog.Close>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <div className="text-[#667085]">Total réceptionné</div>
                      <div className="mt-1 font-mono-num text-sm font-bold text-[#16A36A]">
                        {formatFcfa(supplier.total_purchases)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <div className="text-[#667085]">Solde dû</div>
                      <div className="mt-1 font-mono-num text-sm font-bold text-[#DC4545]">
                        {formatFcfa(supplier.balance_due)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-display font-semibold mb-2">
                      Commandes & réceptions ({supOrders.length})
                    </h4>
                    {supOrders.length === 0 ? (
                      <p className="text-[#667085]">Aucune commande passée à ce fournisseur.</p>
                    ) : (
                      <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                        {supOrders.map((po) => (
                          <div
                            key={po.id}
                            className="flex items-center justify-between px-3 py-2"
                          >
                            <div>
                              <span className="font-mono-num font-semibold">{po.reference}</span>
                              <span className="ml-2 font-mono-num text-[#667085]">
                                {formatDateTime(po.created_at)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono-num">
                                Reçu {formatFcfa(po.received_amount)} /{' '}
                                {formatFcfa(po.total_amount)}
                              </span>
                              <StatusBadge status={po.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="font-display font-semibold mb-2">
                      Dettes & règlements ({supDebts.length})
                    </h4>
                    {supDebts.length === 0 ? (
                      <p className="text-[#667085]">Aucune dette enregistrée.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                        {supDebts.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center justify-between px-3 py-2"
                          >
                            <div>
                              <span className="font-mono-num font-semibold">
                                {d.receipt_reference}
                              </span>
                              <span className="ml-2 text-[#667085]">
                                Éch. {formatDate(d.due_date)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono-num font-semibold">
                                Reste {formatFcfa(d.remaining_amount)}
                              </span>
                              <StatusBadge status={d.status} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
