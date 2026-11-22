import { CheckCircle2, Pencil, Printer, RotateCcw, Truck, XCircle } from 'lucide-react';
import type { PrintableDocumentData } from '../../../components/documents/DocumentPrintModal.tsx';
import type { CustomerOrderDetail } from '../../../types/erp.ts';
import { formatFcfa } from '../../../utils/format.ts';
import { buildOrderReceiptDocument } from '../utils/orderPrintDocument.ts';
import type { Client } from '../../../types/erp.ts';

interface OrderStepConfirmProps {
  orderDetail: CustomerOrderDetail;
  isBusy: boolean;
  isOwner: boolean;
  onSubmitForApproval: () => void;
  onConfirm: () => void;
  onDeliver: () => void;
  onInvoice: () => void;
  onPayFull: () => void;
  onCancel: () => void;
  onEditDraft: () => void;
  onReturnCrate: (assetId: number) => void;
  onResetWizard: () => void;
  onPrintReceipt: (doc: PrintableDocumentData) => void;
  client: Client | null;
  agentName: string | null;
}

export function OrderStepConfirm({
  orderDetail,
  isBusy,
  isOwner,
  onSubmitForApproval,
  onConfirm,
  onDeliver,
  onInvoice,
  onPayFull,
  onCancel,
  onEditDraft,
  onReturnCrate,
  onResetWizard,
  onPrintReceipt,
  client,
  agentName,
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

      {order.approval_status === 'pending_owner_approval' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          En attente de validation du propriétaire. Aucun mouvement de stock n’a encore été enregistré.
        </div>
      )}
      {order.approval_status === 'rejected' && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
          Commande rejetée. Consultez l’historique des documents avant toute nouvelle soumission.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {order.status === 'draft' && order.approval_status !== 'pending_owner_approval' && (
          <>
            <button
              type="button"
              disabled={isBusy}
              onClick={isOwner ? onConfirm : onSubmitForApproval}
              className="rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              {isOwner ? 'Confirmer (déduire stock)' : 'Soumettre au propriétaire'}
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
          onClick={() => onPrintReceipt(buildOrderReceiptDocument(orderDetail, client, agentName))}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium"
        >
          <Printer className="h-3.5 w-3.5" />
          Reçu commande
        </button>
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
