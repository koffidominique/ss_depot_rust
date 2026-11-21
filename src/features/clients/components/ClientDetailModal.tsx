import { Edit3 } from 'lucide-react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { StatusBadge } from '../../../components/common/StatusBadge.tsx';
import type { Client, Receivable, SaleSummary } from '../../../types/erp.ts';
import { formatDate, formatDateTime, formatFcfa } from '../../../utils/format.ts';

interface ClientBalanceItem {
  id: number;
  client_id: number;
  packaging_name: string;
  packaging_code: string;
  balance_pieces: number;
  deposit_held_amount: number;
}

interface ClientDetailModalProps {
  target: Client | null;
  onClose: () => void;
  onEdit: (client: Client) => void;
  sales: SaleSummary[];
  receivables: Receivable[];
  consignmentBalances: ClientBalanceItem[];
}

export function ClientDetailModal({
  target,
  onClose,
  onEdit,
  sales,
  receivables,
  consignmentBalances,
}: ClientDetailModalProps) {
  const clientSales = target ? sales.filter((s) => s.client_id === target.id) : [];
  const clientRecs = target ? receivables.filter((r) => r.client_id === target.id) : [];
  const clientBalances = target
    ? consignmentBalances.filter((b) => b.client_id === target.id)
    : [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <ModalDialog
      open={Boolean(target)}
      onOpenChange={(o) => !o && onClose()}
      title={target ? `${target.name} · ${target.code}` : ''}
      subtitle={
        target
          ? [
              target.client_type,
              target.phone,
              target.address,
              target.city,
              target.email,
              target.contact_person ? `Contact : ${target.contact_person}` : '',
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      headerActions={
        target ? (
          <button
            type="button"
            onClick={() => onEdit(target)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Modifier
          </button>
        ) : undefined
      }
      maxWidthClass="max-w-2xl"
      scrollable
    >
      {target && (
        <div className="mt-4 space-y-5 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-[#667085]">Solde créances</div>
              <div className="mt-1 font-mono-num text-sm font-bold text-[#D9901A]">
                {formatFcfa(target.unpaid_balance)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-[#667085]">Politique crédit</div>
              <div className="mt-1 font-semibold">
                {target.credit_policy === 'forbidden'
                  ? 'Interdit'
                  : target.credit_policy === 'unlimited'
                    ? 'Illimité'
                    : `Plafond ${formatFcfa(target.credit_limit)}`}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-[#667085]">Emballages dus</div>
              <div className="mt-1 font-mono-num text-sm font-bold">
                {target.returnable_pieces_due} pièce(s)
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-2">
              Échéances &amp; créances ({clientRecs.length})
            </h4>
            {clientRecs.length === 0 ? (
              <p className="text-[#667085]">Aucune créance enregistrée.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                {clientRecs.map((r) => {
                  const overdue = r.due_date && r.remaining_amount > 0 && r.due_date < today;
                  return (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2">
                      <div>
                        <span className="font-mono-num font-semibold">{r.sale_reference}</span>
                        <span
                          className={`ml-2 font-mono-num ${
                            overdue ? 'text-[#DC4545] font-semibold' : 'text-[#667085]'
                          }`}
                        >
                          Échéance : {formatDate(r.due_date)} {overdue ? '(En retard)' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono-num font-semibold">
                          {formatFcfa(r.remaining_amount)}
                        </span>
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h4 className="font-display font-semibold mb-2">
              Retour emballages détenus ({clientBalances.length})
            </h4>
            {clientBalances.length === 0 ? (
              <p className="text-[#667085]">Aucun emballage en attente de retour.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                {clientBalances.map((b) => (
                  <div key={b.id} className="flex items-center justify-between px-3 py-2">
                    <span>
                      {b.packaging_name}{' '}
                      <span className="font-mono-num text-[#667085]">({b.packaging_code})</span>
                    </span>
                    <span className="font-mono-num font-semibold">
                      {b.balance_pieces} pcs · Caution {formatFcfa(b.deposit_held_amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="font-display font-semibold mb-2">
              Historique récent des ventes ({clientSales.length})
            </h4>
            {clientSales.length === 0 ? (
              <p className="text-[#667085]">Aucune vente liée à ce client.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                {clientSales.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <span className="font-mono-num font-semibold">{s.reference}</span>
                      <span className="ml-2 font-mono-num text-[#667085]">
                        {formatDateTime(s.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono-num font-semibold">
                        {formatFcfa(s.total_amount)}
                      </span>
                      <StatusBadge status={s.status} />
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
