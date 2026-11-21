import { InlineAlert } from '../components/common/InlineAlert.tsx';
import { apiClient } from '../services/api/createApiClient.ts';
import type { PreviewAllocation } from '../types/erp.ts';
import { OrderStepClient } from '../features/orders/components/OrderStepClient.tsx';
import { OrderStepLines } from '../features/orders/components/OrderStepLines.tsx';
import { OrderStepPackaging } from '../features/orders/components/OrderStepPackaging.tsx';
import { OrderStepReview } from '../features/orders/components/OrderStepReview.tsx';
import { OrderStepConfirm } from '../features/orders/components/OrderStepConfirm.tsx';
import { OrdersListTable } from '../features/orders/components/OrdersListTable.tsx';
import { useOrdersWizard } from '../features/orders/hooks/useOrdersWizard.ts';

const STEPS = [
  { id: 1, label: '1. Client' },
  { id: 2, label: '2. Lignes produits' },
  { id: 3, label: '3. Emballages physiques' },
  { id: 4, label: '4. Récapitulatif' },
  { id: 5, label: '5. Confirmation' },
] as const;

export function OrdersPage() {
  const {
    step,
    setStep,
    draft,
    setDraft,
    editingOrderId,
    setEditingOrderId,
    activeOrder,
    setActiveOrder,
    error,
    setError,
    clients,
    deposits,
    depositHistory,
    orders,
    variantOptions,
    effectivePreview,
    isServerPreview,
    createMutation,
    actionMutation,
    startEditingDraft,
  } = useOrdersWizard();

  const activeClient = clients.find((c) => c.id === draft.customer_id) ?? null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h1 className="font-display text-lg font-semibold">
              Prise de commande clientèle &amp; casiers mixtes
            </h1>
            <p className="text-xs text-[#667085]">
              Brouillon sauvegardé hors-ligne ·{' '}
              {isServerPreview ? 'Prévisualisation serveur synchronisée' : 'Calcul local'} ·
              Consignes séparées du CA.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STEPS.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={s.id === 5 && !activeOrder}
                onClick={() => setStep(s.id)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  step === s.id
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-[#667085] dark:text-slate-300 disabled:opacity-40'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4">
            <InlineAlert variant="error" message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        <div className="mt-4">
          {step === 1 && (
            <OrderStepClient
              clients={clients}
              customerId={draft.customer_id}
              onSelectCustomer={(id) => setDraft((d) => ({ ...d, customer_id: id }))}
              deposits={deposits}
              depositHistory={depositHistory}
            />
          )}
          {step === 2 && (
            <OrderStepLines
              lines={draft.lines}
              options={variantOptions}
              onChangeLines={(lines) =>
                setDraft((d) => ({ ...d, lines, custom_allocations: null }))
              }
            />
          )}
          {step === 3 && (
            <OrderStepPackaging
              allocations={effectivePreview.allocations}
              warnings={effectivePreview.warnings}
              isCustomOverride={Boolean(draft.custom_allocations)}
              onChangeAllocations={(next: PreviewAllocation[]) =>
                setDraft((d) => ({ ...d, custom_allocations: next }))
              }
              onResetAuto={() => setDraft((d) => ({ ...d, custom_allocations: null }))}
            />
          )}
          {step === 4 && (
            <OrderStepReview
              client={activeClient}
              preview={effectivePreview}
              paymentMethod={draft.payment_method}
              onChangePaymentMethod={(pm) => setDraft((d) => ({ ...d, payment_method: pm }))}
              discountXof={draft.discount_xof}
              onChangeDiscountXof={(discount_xof) => setDraft((d) => ({ ...d, discount_xof }))}
              deliveryAddress={draft.delivery_address}
              onChangeDeliveryAddress={(delivery_address) =>
                setDraft((d) => ({ ...d, delivery_address }))
              }
              notes={draft.notes}
              onChangeNotes={(notes) => setDraft((d) => ({ ...d, notes }))}
            />
          )}
          {step === 5 && activeOrder && (
            <OrderStepConfirm
              orderDetail={activeOrder}
              isBusy={actionMutation.isPending}
              onConfirm={() =>
                actionMutation.mutate(() => apiClient.confirmCustomerOrder(activeOrder.order.id))
              }
              onDeliver={() =>
                actionMutation.mutate(() => apiClient.deliverCustomerOrder(activeOrder.order.id))
              }
              onInvoice={() =>
                actionMutation.mutate(() => apiClient.invoiceCustomerOrder(activeOrder.order.id))
              }
              onPayFull={() =>
                actionMutation.mutate(() =>
                  apiClient.payCustomerOrder(activeOrder.order.id, {
                    amount_xof: Math.max(
                      1,
                      activeOrder.order.total_to_collect_xof - activeOrder.order.paid_xof,
                    ),
                    method: activeOrder.order.payment_method ?? 'cash',
                  }),
                )
              }
              onCancel={() =>
                actionMutation.mutate(() => apiClient.cancelCustomerOrder(activeOrder.order.id))
              }
              onEditDraft={() => startEditingDraft(activeOrder)}
              onReturnCrate={(assetId) =>
                actionMutation.mutate(() =>
                  apiClient.returnOrderPackaging(activeOrder.order.id, {
                    packaging_asset_id: assetId,
                    quantity: 1,
                    notes: 'Retour casier vide client',
                  }),
                )
              }
              onResetWizard={() => {
                setEditingOrderId(null);
                setActiveOrder(null);
                setStep(1);
              }}
            />
          )}
        </div>

        {step < 5 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 pt-4">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium disabled:opacity-40"
            >
              Précédent
            </button>
            <div className="flex items-center gap-2">
              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(4, s + 1))}
                  className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white"
                >
                  Suivant
                </button>
              ) : (
                <button
                  type="button"
                  disabled={createMutation.isPending}
                  onClick={() => createMutation.mutate()}
                  className="rounded-lg bg-[#16A36A] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {editingOrderId ? 'Mettre à jour le brouillon' : 'Valider la commande'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-sm font-semibold">Commandes récentes</h2>
        <OrdersListTable
          orders={orders}
          onOpenOrder={(id) =>
            actionMutation.mutate(async () => {
              const detail = await apiClient.getCustomerOrder(id);
              setStep(5);
              return detail;
            })
          }
        />
      </div>
    </div>
  );
}
