import { Trash2 } from 'lucide-react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import type { HeldCart } from '../../../stores/uiStore.ts';
import { formatDateTime, formatFcfa } from '../../../utils/format.ts';
import { calculateSaleCart } from '../utils/saleCalculations.ts';

interface HeldSalesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heldCarts: HeldCart[];
  onResume: (ticketId: string) => void;
  onDelete: (ticketId: string) => void;
}

export function HeldSalesModal({
  open,
  onOpenChange,
  heldCarts,
  onResume,
  onDelete,
}: HeldSalesModalProps) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Ventes mises en attente (${heldCarts.length})`}
      maxWidthClass="max-w-md"
    >
      <div className="mt-4 max-h-80 space-y-2.5 overflow-y-auto text-xs">
        {heldCarts.length === 0 ? (
          <p className="py-6 text-center text-[#667085]">Aucun panier en attente.</p>
        ) : (
          heldCarts.map((ticket) => {
            const ticketCalc = calculateSaleCart(ticket.items, ticket.discountAmount);
            return (
              <div
                key={ticket.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-[#182230] dark:text-slate-100 truncate">
                    {ticket.label}
                  </div>
                  <div className="text-[11px] text-[#667085] font-mono-num">
                    {ticket.items.length} ligne(s) ·{' '}
                    {ticketCalc.isValid && ticketCalc.grandTotal !== null
                      ? formatFcfa(ticketCalc.grandTotal)
                      : 'Total à vérifier'}{' '}
                    · {formatDateTime(ticket.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onResume(ticket.id)}
                    className="rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700"
                  >
                    Reprendre
                  </button>
                  <button
                    type="button"
                    aria-label={`Supprimer ticket ${ticket.label}`}
                    onClick={() => onDelete(ticket.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:text-[#DC4545]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </ModalDialog>
  );
}
