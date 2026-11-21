import { CheckCircle2, Pencil, RotateCcw, Truck, XCircle } from 'lucide-react';
import type { CustomerOrderDetail } from '../../../types/erp.ts';
import { formatFcfa } from '../../../utils/format.ts';

interface OrderStepConfirmProps {
  orderDetail: CustomerOrderDetail;
  isBusy: boolean;
  onConfirm: () => void;
  onDeliver: () => void;
  onInvoice: () => void;
  onPayFull: () => void;
  onCancel: () => void;
  onEditDraft: () => void;
  onReturnCrate: (assetId: number) => void;
  onResetWizard: () => void;
}

export function OrderStepConfirm({
  orderDetail,
  isBusy,
  onConfirm,
  onDeliver,
  onInvoice,
  onPayFull,
  onCancel,
  onEditDraft,
  onReturnCrate,
  onResetWizard,
}: OrderStepConfirmProps) {
  const { order, lines, allocations } = orderDetail;
  const remainingToPay = Math.max(0, order.total_to_collect_xof - order.paid_xof);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 p-4 text-xs space-y-1.5">
        <div className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          Commande #{order.order_number} ({order.status.toUpperCase()})
        </div>
        <p className="text-emerald-900 dark:text-emerald-200">
          Stock à prélever :{' '}
          {lines.map((l) => `${l.product_name} ${l.base_quantity} btl`).join(', ')}
          {allocations.length > 0
            ? ` — Emballages : ${allocations.map((a) => `${a.quantity} × ${a.packaging_name}`).join(', ')}.`
            : '.'}
        </p>
        <p className="font-semibold text-emerald-900 dark:text-emerald-200">
          CA liquides : {formatFcfa(order.total_xof)} · Consigne enregistrée :{' '}
          {formatFcfa(order.deposit_due_xof)} · Net à percevoir :{' '}
          {formatFcfa(order.total_to_collect_xof)}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {order.status === 'draft' && (
          <>
            <button
              type="button"
              disabled={isBusy}
              onClick={onConfirm}
              className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              Confirmer (déduire stock)
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={onEditDraft}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium"
            >
              <Pencil className="h-3.5 w-3.5" />
              Modifier brouillon
            </button>
          </>
        )}
        {order.status === 'confirmed' && (
          <button
            type="button"
            disabled={isBusy}
            onClick={onDeliver}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A36A] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            <Truck className="h-3.5 w-3.5" />
            Livrer (imputer consignes client)
          </button>
        )}
        {order.status === 'delivered' && (
          <button
            type="button"
            disabled={isBusy}
            onClick={onInvoice}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium"
          >
            Facturer
          </button>
        )}
        {remainingToPay > 0 && order.status !== 'cancelled' && (
          <button
            type="button"
            disabled={isBusy}
            onClick={onPayFull}
            className="rounded-lg bg-slate-900 dark:bg-slate-100 dark:text-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            Encaisser solde ({formatFcfa(remainingToPay)})
          </button>
        )}
        {['draft', 'confirmed'].includes(order.status) && (
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-[#DC4545]"
          >
            <XCircle className="h-3.5 w-3.5" />
            Annuler commande
          </button>
        )}
        {['delivered', 'invoiced', 'paid'].includes(order.status) &&
          allocations
            .filter((a) => a.is_consigned === 1 && a.returned_quantity < a.quantity)
            .map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={isBusy}
                onClick={() => onReturnCrate(a.packaging_asset_id)}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retourner 1 {a.packaging_name}
              </button>
            ))}
        <button
          type="button"
          onClick={onResetWizard}
          className="ml-auto rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium"
        >
          Nouvelle commande
        </button>
      </div>
    </div>
  );
}
