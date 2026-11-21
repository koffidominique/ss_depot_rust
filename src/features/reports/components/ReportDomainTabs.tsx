import { StatusBadge } from '../../../components/common/StatusBadge.tsx';
import type { CashStatus, Receivable, SupplierDebt } from '../../../types/erp.ts';
import { formatDate, formatDateTime, formatFcfa, formatQty } from '../../../utils/format.ts';
import type { StockProductReportRow } from '../utils/reportPdfBuilders.ts';

export function StockReportTab({
  products,
  knownValuationFcfa,
}: {
  products: StockProductReportRow[];
  knownValuationFcfa: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">
          État du stock &amp; valorisation CUMP ({products.length} produits actifs)
        </h3>
        <span className="font-mono-num text-xs font-bold text-[#2563EB]">
          Total connu : {formatFcfa(knownValuationFcfa)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[#667085]">
              <th className="py-2">Réf / Produit</th>
              <th className="py-2 text-right">Stock</th>
              <th className="py-2 text-right">CUMP</th>
              <th className="py-2 text-right">Valorisation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {products.slice(0, 100).map((p) => (
              <tr key={p.id}>
                <td className="py-2">
                  <span className="font-mono-num text-[#667085]">{p.reference}</span> ·{' '}
                  <span className="font-medium">{p.name}</span>
                </td>
                <td className="py-2 text-right font-mono-num">
                  {formatQty(p.stock_milli, p.base_unit)}
                </td>
                <td className="py-2 text-right font-mono-num">
                  {p.average_cost_fcfa !== null ? formatFcfa(p.average_cost_fcfa) : 'Inconnu'}
                </td>
                <td className="py-2 text-right font-mono-num font-semibold">
                  {p.valuation_fcfa !== null ? formatFcfa(p.valuation_fcfa) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CashReportTab({ cashData }: { cashData?: CashStatus }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface p-5 space-y-3">
      <h3 className="font-display text-sm font-semibold">Sessions de caisse récentes</h3>
      {cashData?.activeSession && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-xs flex justify-between">
          <span>
            Session active :{' '}
            <strong className="font-mono-num">{cashData.activeSession.reference}</strong> (ouverte
            le {formatDateTime(cashData.activeSession.opened_at)})
          </span>
          <span className="font-mono-num font-bold text-[#16A36A]">
            Théorique espèces :{' '}
            {formatFcfa(cashData.summary?.theoreticalCash ?? cashData.activeSession.opening_cash)}
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[#667085]">
              <th className="py-2">Session</th>
              <th className="py-2">Clôture</th>
              <th className="py-2 text-right">Théorique</th>
              <th className="py-2 text-right">Physique</th>
              <th className="py-2 text-right">Écart</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(cashData?.history || []).map((s) => (
              <tr key={s.id}>
                <td className="py-2 font-mono-num font-semibold">{s.reference}</td>
                <td className="py-2 font-mono-num text-[#667085]">{formatDateTime(s.closed_at)}</td>
                <td className="py-2 text-right font-mono-num">{formatFcfa(s.theoretical_cash)}</td>
                <td className="py-2 text-right font-mono-num">{formatFcfa(s.physical_cash)}</td>
                <td className="py-2 text-right font-mono-num font-semibold">
                  {formatFcfa(s.difference)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReceivablesReportTab({ receivables }: { receivables: Receivable[] }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface p-5 space-y-3">
      <h3 className="font-display text-sm font-semibold">État des créances clients</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[#667085]">
              <th className="py-2">Client</th>
              <th className="py-2">Facture</th>
              <th className="py-2">Échéance</th>
              <th className="py-2 text-right">Initial</th>
              <th className="py-2 text-right">Reste</th>
              <th className="py-2 text-right">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {receivables.map((r) => (
              <tr key={r.id}>
                <td className="py-2 font-medium">{r.client_name}</td>
                <td className="py-2 font-mono-num">{r.sale_reference}</td>
                <td className="py-2 font-mono-num text-[#667085]">{formatDate(r.due_date)}</td>
                <td className="py-2 text-right font-mono-num">{formatFcfa(r.initial_amount)}</td>
                <td className="py-2 text-right font-mono-num font-semibold text-[#D9901A]">
                  {formatFcfa(r.remaining_amount)}
                </td>
                <td className="py-2 text-right">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SuppliersReportTab({ supplierDebts }: { supplierDebts: SupplierDebt[] }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface p-5 space-y-3">
      <h3 className="font-display text-sm font-semibold">Engagements &amp; dettes fournisseurs</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[#667085]">
              <th className="py-2">Fournisseur</th>
              <th className="py-2">Réception</th>
              <th className="py-2">Échéance</th>
              <th className="py-2 text-right">Initial</th>
              <th className="py-2 text-right">Reste dû</th>
              <th className="py-2 text-right">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {supplierDebts.map((d) => (
              <tr key={d.id}>
                <td className="py-2 font-medium">{d.supplier_name}</td>
                <td className="py-2 font-mono-num">{d.receipt_reference}</td>
                <td className="py-2 font-mono-num text-[#667085]">{formatDate(d.due_date)}</td>
                <td className="py-2 text-right font-mono-num">{formatFcfa(d.initial_amount)}</td>
                <td className="py-2 text-right font-mono-num font-semibold text-[#DC4545]">
                  {formatFcfa(d.remaining_amount)}
                </td>
                <td className="py-2 text-right">
                  <StatusBadge status={d.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ConsignmentsReportTab({
  types,
  balances,
}: {
  types: Array<{
    id: number;
    code: string;
    name: string;
    producer: string;
    deposit_value: number;
    stock_quantity: number;
  }>;
  balances: Array<{
    id: number;
    client_name: string;
    packaging_name: string;
    balance_pieces: number;
    deposit_held_amount: number;
  }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface-interactive p-5 space-y-3">
        <h3 className="font-display text-sm font-semibold">Parc emballages dépôt</h3>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {types.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2">
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-[#667085]">
                  {t.code} · {t.producer}
                </div>
              </div>
              <div className="text-right font-mono-num">
                <div className="font-semibold">{t.stock_quantity} vides</div>
                <div className="text-[#667085]">{formatFcfa(t.deposit_value)} / u</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface-interactive p-5 space-y-3">
        <h3 className="font-display text-sm font-semibold">Emballages détenus par les clients</h3>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {balances.length === 0 ? (
            <p className="text-[#667085] py-2">Aucun emballage client en attente.</p>
          ) : (
            balances.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{b.client_name}</div>
                  <div className="text-[#667085]">{b.packaging_name}</div>
                </div>
                <div className="text-right font-mono-num">
                  <div className="font-semibold text-[#D9901A]">{b.balance_pieces} pcs</div>
                  <div className="text-[#667085]">{formatFcfa(b.deposit_held_amount)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
