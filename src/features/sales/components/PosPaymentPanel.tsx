import { motion } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import { InlineAlert } from '../../../components/common/InlineAlert.tsx';
import { DP_BUTTON_HOVER, DP_BUTTON_TAP, DP_SPRING_SNAPPY } from '../../../components/motion/MotionPrimitives.tsx';
import { formatFcfa } from '../../../utils/format.ts';
import type { PaymentMethodConfig } from '../../../types/erp.ts';
import type { SaleCalculationResult } from '../utils/saleCalculations.ts';

interface PosPaymentPanelProps {
  posSaleType: 'cash' | 'credit';
  globalDiscount: number;
  onGlobalDiscountChange: (value: number) => void;
  totals: SaleCalculationResult;
  paymentRows: Array<{ method_code: string; amount: number }>;
  onPaymentRowsChange: (
    updater: (
      prev: Array<{ method_code: string; amount: number }>
    ) => Array<{ method_code: string; amount: number }>
  ) => void;
  activeMethods: PaymentMethodConfig[];
  errorMsg: string | null;
  cartLength: number;
  isSubmitting: boolean;
  onSubmitSale: () => void;
}

export function PosPaymentPanel({
  posSaleType,
  globalDiscount,
  onGlobalDiscountChange,
  totals,
  paymentRows,
  onPaymentRowsChange,
  activeMethods,
  errorMsg,
  cartLength,
  isSubmitting,
  onSubmitSale,
}: PosPaymentPanelProps) {
  const paidTotal = totals.paidTotal;

  return (
    <>
      <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3 text-xs">
        <div className="flex justify-between">
          <span className="text-[#667085] dark:text-slate-400">Marchandises</span>
          <span className="font-mono-num font-medium">
            {totals.subtotalMerch !== null ? formatFcfa(totals.subtotalMerch) : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#667085] dark:text-slate-400">Remise globale</span>
          <MoneyInput value={globalDiscount} onChange={onGlobalDiscountChange} className="w-40" />
        </div>
        <div className="flex justify-between">
          <span className="text-[#667085] dark:text-slate-400">Retour emballages</span>
          <span className="font-mono-num font-medium text-[#D9901A] dark:text-amber-400">
            {totals.totalDeposit !== null ? formatFcfa(totals.totalDeposit) : '—'}
          </span>
        </div>
        <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2 text-sm font-bold">
          <span>Total à payer</span>
          <span className="font-mono-num text-[#2563EB] dark:text-[#60A5FA]">
            {totals.isValid && totals.grandTotal !== null ? formatFcfa(totals.grandTotal) : '—'}
          </span>
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold">Encaissement (simple ou mixte)</span>
          <div className="flex items-center gap-2">
            {posSaleType === 'cash' &&
              totals.isValid &&
              totals.grandTotal !== null &&
              totals.grandTotal > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onPaymentRowsChange((prev) => [
                      {
                        method_code: prev[0]?.method_code || 'cash',
                        amount: totals.grandTotal as number,
                      },
                    ])
                  }
                  className="text-[11px] font-medium text-[#2563EB] hover:underline"
                >
                  Solder {formatFcfa(totals.grandTotal)}
                </button>
              )}
            <button
              type="button"
              onClick={() =>
                onPaymentRowsChange((r) => [...r, { method_code: 'wave', amount: 0 }])
              }
              className="text-[11px] font-medium text-[#2563EB] hover:underline"
            >
              + Ajouter moyen
            </button>
          </div>
        </div>

        {paymentRows.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <select
              value={row.method_code}
              onChange={(e) =>
                onPaymentRowsChange((prev) =>
                  prev.map((p, i) => (i === idx ? { ...p, method_code: e.target.value } : p))
                )
              }
              className="w-40 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs"
            >
              {activeMethods.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </select>
            <MoneyInput
              value={row.amount}
              onChange={(amt) =>
                onPaymentRowsChange((prev) =>
                  prev.map((p, i) => (i === idx ? { ...p, amount: amt } : p))
                )
              }
              className="flex-1"
            />
            {paymentRows.length > 1 && (
              <button
                type="button"
                onClick={() => onPaymentRowsChange((prev) => prev.filter((_, i) => i !== idx))}
                className="text-slate-400 hover:text-[#DC4545]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}

        <div className="flex justify-between text-xs pt-1">
          <span className="text-[#667085] dark:text-slate-400">
            {posSaleType === 'credit' ? 'Reste en créance client' : 'Total saisi'}
          </span>
          <span className="font-mono-num font-semibold">
            {posSaleType === 'credit'
              ? totals.isValid && totals.remainingAmount !== null
                ? formatFcfa(totals.remainingAmount)
                : '—'
              : paidTotal !== null
                ? formatFcfa(paidTotal)
                : '—'}
          </span>
        </div>
      </div>

      {totals.hasItems && !totals.isValid && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-[#DC4545] space-y-1"
        >
          {totals.errors.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </div>
      )}

      {errorMsg && <InlineAlert variant="error" message={errorMsg} />}

      <motion.button
        type="button"
        whileHover={cartLength === 0 || !totals.isValid || isSubmitting ? undefined : DP_BUTTON_HOVER}
        whileTap={cartLength === 0 || !totals.isValid || isSubmitting ? undefined : DP_BUTTON_TAP}
        transition={DP_SPRING_SNAPPY}
        disabled={cartLength === 0 || !totals.isValid || isSubmitting}
        onClick={onSubmitSale}
        className="w-full rounded-xl bg-[#16A36A] py-3 text-sm font-semibold text-white hover:bg-emerald-700 shadow-sm hover:shadow-[0_10px_22px_-6px_rgba(22,163,106,0.45)] transition-all disabled:opacity-40"
      >
        {isSubmitting ? 'Validation en cours...' : 'Valider la vente (F9)'}
      </motion.button>
    </>
  );
}
