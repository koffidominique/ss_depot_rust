import type { CustomerOrderSummary } from '../../../types/erp.ts';
import { formatFcfa } from '../../../utils/format.ts';

interface OrdersListTableProps {
  orders: CustomerOrderSummary[];
  onOpenOrder: (id: number) => void;
}

export function OrdersListTable({ orders, onOpenOrder }: OrdersListTableProps) {
  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-xs text-[#667085]">
        Aucune commande clientèle enregistrée pour le moment.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E]">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 dark:bg-slate-900 text-[#667085]">
          <tr>
            <th className="px-3 py-2.5 font-medium">N° Commande</th>
            <th className="px-3 py-2.5 font-medium">Client</th>
            <th className="px-3 py-2.5 font-medium">Type</th>
            <th className="px-3 py-2.5 font-medium">Statut</th>
            <th className="px-3 py-2.5 font-medium text-right">CA Liquides</th>
            <th className="px-3 py-2.5 font-medium text-right">Consigne</th>
            <th className="px-3 py-2.5 font-medium text-right">Net à percevoir</th>
            <th className="px-3 py-2.5 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
              <td className="px-3 py-2.5 font-mono-num font-semibold">{o.order_number}</td>
              <td className="px-3 py-2.5">{o.customer_name}</td>
              <td className="px-3 py-2.5 uppercase text-[11px]">{o.order_type}</td>
              <td className="px-3 py-2.5">
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium">
                  {o.status}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono-num">{formatFcfa(o.total_xof)}</td>
              <td className="px-3 py-2.5 text-right font-mono-num text-amber-700 dark:text-amber-300">
                {formatFcfa(o.deposit_due_xof)}
              </td>
              <td className="px-3 py-2.5 text-right font-mono-num font-semibold">
                {formatFcfa(o.total_to_collect_xof)}
              </td>
              <td className="px-3 py-2.5 text-right">
                <button
                  type="button"
                  onClick={() => onOpenOrder(o.id)}
                  className="rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Ouvrir
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
