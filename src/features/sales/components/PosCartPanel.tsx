import { AnimatePresence, motion } from 'motion/react';
import { PauseCircle, PlayCircle, ShoppingCart, Trash2, UserPlus } from 'lucide-react';
import { FormTipsButton } from '../../../components/common/FormTipsButton.tsx';
import { DP_EASE } from '../../../components/motion/MotionPrimitives.tsx';
import { QuantityInput } from '../../../components/common/QuantityInput.tsx';
import { formatFcfa } from '../../../utils/format.ts';
import type { CartItem, HeldCart } from '../../../stores/uiStore.ts';
import type { Client, PaymentMethodConfig } from '../../../types/erp.ts';
import type { SaleCalculationResult } from '../utils/saleCalculations.ts';
import { PosPaymentPanel } from './PosPaymentPanel.tsx';

interface PosCartPanelProps {
  posCart: CartItem[];
  heldCarts: HeldCart[];
  clients?: Client[];
  posClientId: number | null;
  onClientChange: (clientId: number | null) => void;
  posSaleType: 'cash' | 'credit';
  onSaleTypeChange: (saleType: 'cash' | 'credit') => void;
  dueDate: string;
  onDueDateChange: (value: string) => void;
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
  isSubmitting: boolean;
  onUpdateCartItem: (key: string, patch: Partial<CartItem>) => void;
  onRemoveFromCart: (key: string) => void;
  onClearCart: () => void;
  onHoldCart: () => void;
  onOpenHeldModal: () => void;
  onOpenQuickClient: () => void;
  onSubmitSale: () => void;
}

export function PosCartPanel({
  posCart,
  heldCarts,
  clients,
  posClientId,
  onClientChange,
  posSaleType,
  onSaleTypeChange,
  dueDate,
  onDueDateChange,
  globalDiscount,
  onGlobalDiscountChange,
  totals,
  paymentRows,
  onPaymentRowsChange,
  activeMethods,
  errorMsg,
  isSubmitting,
  onUpdateCartItem,
  onRemoveFromCart,
  onClearCart,
  onHoldCart,
  onOpenHeldModal,
  onOpenQuickClient,
  onSubmitSale,
}: PosCartPanelProps) {
  const selectedClient = clients?.find((c) => c.id === posClientId);
  const availCredit =
    selectedClient &&
    selectedClient.credit_policy === 'limited' &&
    selectedClient.credit_limit !== null
      ? Math.max(0, selectedClient.credit_limit - selectedClient.unpaid_balance)
      : null;

  return (
    <div className="space-y-4 lg:col-span-5">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 font-display text-sm font-semibold">
            <ShoppingCart className="h-4 w-4 text-[#2563EB]" />
            <span>Panier de vente ({posCart.length})</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {heldCarts.length > 0 && (
              <button
                type="button"
                onClick={onOpenHeldModal}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 text-[11px] font-semibold text-[#D9901A]"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                En attente ({heldCarts.length})
              </button>
            )}
            {posCart.length > 0 && (
              <button
                type="button"
                onClick={onHoldCart}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-medium text-[#667085] hover:border-[#2563EB] hover:text-[#2563EB]"
              >
                <PauseCircle className="h-3.5 w-3.5" />
                Mettre en attente
              </button>
            )}
            <FormTipsButton topicId="sales-pos" label="Aide saisie" />
            {posCart.length > 0 && (
              <button
                type="button"
                onClick={onClearCart}
                className="text-xs font-medium text-[#DC4545] hover:underline"
              >
                Vider
              </button>
            )}
          </div>
        </div>

        {/* Sélection client et mode vente */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-[#667085] dark:text-slate-400">
                Client
              </label>
              <button
                type="button"
                onClick={onOpenQuickClient}
                aria-label="Créer rapidement un client"
                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#2563EB] hover:underline"
              >
                <UserPlus className="h-3 w-3" />
                Nouveau client
              </button>
            </div>
            <select
              value={posClientId ?? ''}
              onChange={(e) => onClientChange(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-2 text-xs"
            >
              <option value="">Client Comptoir (Anonyme)</option>
              {clients?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.credit_policy === 'forbidden' ? 'Comptant' : 'Crédit OK'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#667085] dark:text-slate-400">
              Type de vente
            </label>
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
              <button
                type="button"
                onClick={() => onSaleTypeChange('cash')}
                className={`rounded-md py-1.5 text-xs font-medium ${
                  posSaleType === 'cash'
                    ? 'bg-[#2563EB] text-white'
                    : 'text-[#667085] dark:text-slate-300'
                }`}
              >
                Comptant
              </button>
              <button
                type="button"
                onClick={() => onSaleTypeChange('credit')}
                className={`rounded-md py-1.5 text-xs font-medium ${
                  posSaleType === 'credit'
                    ? 'bg-[#D9901A] text-white'
                    : 'text-[#667085] dark:text-slate-300'
                }`}
              >
                À crédit
              </button>
            </div>
          </div>
        </div>

        {selectedClient && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-3 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-[#182230] dark:text-slate-200">
              {selectedClient.credit_policy === 'forbidden'
                ? 'Crédit interdit'
                : selectedClient.credit_policy === 'unlimited'
                  ? 'Crédit autorisé (sans plafond)'
                  : `Plafond ${formatFcfa(selectedClient.credit_limit ?? 0)} · Dispo ${formatFcfa(availCredit ?? 0)}`}
            </span>
            <span className="font-mono-num text-[#667085] dark:text-slate-400">
              Dû : {formatFcfa(selectedClient.unpaid_balance)} · Vides :{' '}
              {selectedClient.returnable_pieces_due} pcs
            </span>
          </div>
        )}

        {posSaleType === 'credit' && (
          <div>
            <label className="block text-xs font-medium text-[#667085] dark:text-slate-400">
              Date d&apos;échéance (optionnelle, sinon calculée selon délai client)
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => onDueDateChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num text-xs"
            />
          </div>
        )}

        {/* Lignes du panier */}
        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {posCart.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#667085] dark:text-slate-400">
              Sélectionnez un conditionnement à gauche pour démarrer la vente.
            </p>
          ) : (
            <AnimatePresence initial={false}>
              {posCart.map((item) => {
                const lineCalc = totals.lineResults[item.key];
                return (
                  <motion.div
                    key={item.key}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 14, transition: { duration: 0.14 } }}
                    transition={{ duration: 0.2, ease: DP_EASE }}
                    className="py-2.5 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-[#182230] dark:text-slate-100">
                          {item.productName}
                        </div>
                        <div className="text-[11px] text-[#667085] dark:text-slate-400">
                          <span className="capitalize">
                            {item.salesUnitLabel || item.packagingName}
                          </span>{' '}
                          · {formatFcfa(item.unitPrice)}
                          {item.depositMode === 'deposit' && item.depositPerPack > 0
                            ? ` + consigne ${formatFcfa(item.depositPerPack)}`
                            : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveFromCart(item.key)}
                        className="text-slate-400 hover:text-[#DC4545] transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <QuantityInput
                        value={item.quantity}
                        onChange={(q) => onUpdateCartItem(item.key, { quantity: q })}
                        allowFraction={item.allowFraction}
                        unit={item.packagingName}
                        error={lineCalc && !lineCalc.valid ? lineCalc.error || undefined : undefined}
                        className="w-36"
                      />
                      <div className="font-mono-num text-xs font-semibold">
                        {lineCalc && lineCalc.valid && lineCalc.lineNet !== null
                          ? formatFcfa(lineCalc.lineNet)
                          : '—'}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        <PosPaymentPanel
          posSaleType={posSaleType}
          globalDiscount={globalDiscount}
          onGlobalDiscountChange={onGlobalDiscountChange}
          totals={totals}
          paymentRows={paymentRows}
          onPaymentRowsChange={onPaymentRowsChange}
          activeMethods={activeMethods}
          errorMsg={errorMsg}
          cartLength={posCart.length}
          isSubmitting={isSubmitting}
          onSubmitSale={onSubmitSale}
        />
      </div>
    </div>
  );
}
