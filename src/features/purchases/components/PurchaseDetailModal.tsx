import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { StatusBadge } from '../../../components/common/StatusBadge.tsx';
import type { PurchaseOrder, SupplierDebt } from '../../../types/erp.ts';
import { formatDate, formatDateTime, formatFcfa, formatQty } from '../../../utils/format.ts';

interface PurchaseDetailModalProps {
  target: PurchaseOrder | null;
  supplierDebts?: SupplierDebt[];
  onClose: () => void;
}

export function PurchaseDetailModal({
  target,
  supplierDebts,
  onClose,
}: PurchaseDetailModalProps) {
  const receiptRefs = new Set((target?.receipts || []).map((r) => r.reference));
  const linkedDebts = (supplierDebts || []).filter((d) => receiptRefs.has(d.receipt_reference));

  return (
    <ModalDialog
      open={Boolean(target)}
      onOpenChange={(o) => !o && onClose()}
      title={`Détails commande · ${target?.reference ?? ''}`}
      subtitle={
        target
          ? `${target.supplier_name} (${target.supplier_code}) · ${formatDateTime(target.created_at)}`
          : undefined
      }
      maxWidthClass="max-w-2xl"
      scrollable
    >
      {target && (
        <div className="mt-4 space-y-5 text-xs">
          <div>
            <h4 className="font-display font-semibold mb-2">Lignes &amp; écarts de réception</h4>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
              {target.lines.map((l) => {
                const gapMilli = l.ordered_quantity_milli - l.received_quantity_milli;
                return (
                  <div key={l.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <div className="font-medium">
                        {l.product_name} ({l.packaging_name})
                      </div>
                      <div className="font-mono-num text-[11px] text-[#667085]">
                        Commandé : {formatQty(l.ordered_quantity_milli)} · Reçu :{' '}
                        {formatQty(l.received_quantity_milli)}
                      </div>
                    </div>
                    <span
                      className={`font-mono-num font-semibold ${
                        gapMilli === 0 ? 'text-[#16A36A]' : 'text-[#D9901A]'
                      }`}
                    >
                      {gapMilli === 0 ? 'Complet' : `Écart restant : ${formatQty(gapMilli)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-2">
              Réceptions enregistrées ({target.receipts.length})
            </h4>
            {target.receipts.length === 0 ? (
              <p className="text-[#667085]">Aucune réception effectuée sur cette commande.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                {target.receipts.map((rec) => (
                  <div key={rec.id} className="flex items-center justify-between px-3 py-2">
                    <span className="font-mono-num font-semibold">{rec.reference}</span>
                    <span className="font-mono-num text-[#667085]">
                      {formatDateTime(rec.created_at)}
                    </span>
                    <span className="font-mono-num font-semibold text-[#16A36A]">
                      {formatFcfa(rec.total_amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="font-display font-semibold mb-2">
              Dettes &amp; échéances générées ({linkedDebts.length})
            </h4>
            {linkedDebts.length === 0 ? (
              <p className="text-[#667085]">
                Aucune dette fournisseur ouverte issue de ces réceptions.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                {linkedDebts.map((d) => (
                  <div key={d.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <span className="font-mono-num font-semibold">{d.receipt_reference}</span>
                      <span className="ml-2 text-[#667085]">
                        Échéance : {formatDate(d.due_date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono-num font-semibold text-[#DC4545]">
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
      )}
    </ModalDialog>
  );
}
