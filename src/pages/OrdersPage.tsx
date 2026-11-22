import { useState } from 'react';
import { useUiStore } from '../stores/uiStore.ts';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { InlineAlert } from '../components/common/InlineAlert.tsx';
import { apiClient } from '../services/api/createApiClient.ts';
import type { AppSettings, Client, CustomerOrderDetail, CustomerOrderReceiptSnapshot, PreviewAllocation } from '../types/erp.ts';
import { OrderStepClient } from '../features/orders/components/OrderStepClient.tsx';
import { OrderStepLines } from '../features/orders/components/OrderStepLines.tsx';
import { OrderStepPackaging } from '../features/orders/components/OrderStepPackaging.tsx';
import { OrderStepReview } from '../features/orders/components/OrderStepReview.tsx';
import { OrderStepConfirm } from '../features/orders/components/OrderStepConfirm.tsx';
import { OrdersListTable } from '../features/orders/components/OrdersListTable.tsx';
import { useOrdersWizard } from '../features/orders/hooks/useOrdersWizard.ts';
import { buildOrderReceiptDocument } from '../features/orders/utils/orderPrintDocument.ts';

const STEPS = [
  { id: 1, label: '1. Client' },
  { id: 2, label: '2. Lignes produits' },
  { id: 3, label: '3. Emballages physiques' },
  { id: 4, label: '4. Récapitulatif' },
  { id: 5, label: '5. Confirmation' },
] as const;

export function OrdersPage() {
  const currentUser = useUiStore((store) => store.currentUser);
  const isOwner = currentUser?.role === 'owner';
  const {
    step,
    setStep,
    draft,
    setDraft,
    editingOrderId,
    setEditingOrderId,
    activeOrder,
    setActiveOrder,
    receiptDoc,
    closeReceiptDoc,
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

  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [receiptHistory, setReceiptHistory] = useState<CustomerOrderReceiptSnapshot[] | null>(null);
  const [revisionReason, setRevisionReason] = useState('');
  const [isRevisingReceipt, setIsRevisingReceipt] = useState(false);
  const activeClient = clients.find((c) => c.id === draft.customer_id) ?? null;

  const printReceiptSnapshot = (receipt: CustomerOrderReceiptSnapshot) => {
    const snapshot = JSON.parse(receipt.snapshot_json) as {
      issuedAt: string;
      issuer: { name: string };
      company: AppSettings;
      customer: Partial<Client>;
      orderDetail: CustomerOrderDetail;
      payments: Array<{ reference: string; paidAt: string; methodLabel: string; amountXof: number }>;
      revisionReason?: string;
    };
    setPrintDoc(buildOrderReceiptDocument(
      snapshot.orderDetail,
      snapshot.customer ? ({ ...snapshot.customer } as Client) : null,
      snapshot.issuer?.name || receipt.issued_by_name,
      {
        receiptNumber: receipt.receipt_number,
        issuedAt: snapshot.issuedAt || receipt.issued_at,
        company: snapshot.company,
        payments: snapshot.payments,
        revisionReason: snapshot.revisionReason,
      },
    ));
  };

  const openReceiptHistory = async () => {
    if (!activeOrder) return;
    setError(null);
    try {
      const receipts = await apiClient.listCustomerOrderReceipts(activeOrder.order.id);
      setReceiptHistory(receipts);
      setRevisionReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger l’historique des reçus.');
    }
  };

  const reviseReceipt = async () => {
    if (!activeOrder) return;
    setError(null);
    setIsRevisingReceipt(true);
    try {
      const receipt = await apiClient.reviseCustomerOrderReceipt(activeOrder.order.id, revisionReason);
      const receipts = await apiClient.listCustomerOrderReceipts(activeOrder.order.id);
      setReceiptHistory(receipts);
      setRevisionReason('');
      printReceiptSnapshot(receipt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’émettre la version corrigée du reçu.');
    } finally {
      setIsRevisingReceipt(false);
    }
  };

  const issueReceiptForActiveOrder = async () => {
    if (!activeOrder) return;
    setError(null);
    try {
      const receipt = await apiClient.issueCustomerOrderReceipt(activeOrder.order.id);
      const snapshot = JSON.parse(receipt.snapshot_json) as {
        issuedAt: string;
        issuer: { name: string };
        company: AppSettings;
        customer: Partial<Client>;
        orderDetail: CustomerOrderDetail;
        payments: Array<{ reference: string; paidAt: string; methodLabel: string; amountXof: number }>;
      };
      const frozenClient = snapshot.customer
        ? ({ ...snapshot.customer } as Client)
        : null;
      setPrintDoc(buildOrderReceiptDocument(
        snapshot.orderDetail,
        frozenClient,
        snapshot.issuer?.name || receipt.issued_by_name,
        {
          receiptNumber: receipt.receipt_number,
          issuedAt: snapshot.issuedAt || receipt.issued_at,
          company: snapshot.company,
          payments: snapshot.payments,
        },
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’émettre le reçu de commande.');
    }
  };

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
              isOwner={isOwner}
              onSubmitForApproval={() =>
                actionMutation.mutate(async () => {
                  await apiClient.submitCommercialDocument('customer_order', activeOrder.order.id);
                  return apiClient.getCustomerOrder(activeOrder.order.id);
                })
              }
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
              onPrintReceipt={() => void issueReceiptForActiveOrder()}
              onViewReceiptHistory={() => void openReceiptHistory()}
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

      {receiptHistory !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/60 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipt-history-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-[#111A2E]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="receipt-history-title" className="font-display text-base font-semibold">Historique des accusés de commande</h2>
                <p className="mt-1 text-xs text-slate-500">Chaque version est un snapshot immuable. Une correction crée un nouveau numéro et ne remplace jamais les versions précédentes.</p>
              </div>
              <button type="button" onClick={() => setReceiptHistory(null)} className="rounded-lg border px-3 py-1.5 text-xs">Fermer</button>
            </div>
            <div className="mt-4 space-y-2">
              {receiptHistory.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900">Aucun reçu n’a encore été émis pour cette commande.</p>
              ) : receiptHistory.map((receipt) => (
                <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div>
                    <p className="text-sm font-semibold">{receipt.receipt_number} · version {receipt.version}</p>
                    <p className="text-xs text-slate-500">Émis le {receipt.issued_at} par {receipt.issued_by_name} ({receipt.issued_by_role})</p>
                  </div>
                  <button type="button" onClick={() => printReceiptSnapshot(receipt)} className="rounded-lg border px-3 py-2 text-xs font-medium">Réimprimer ce snapshot</button>
                </div>
              ))}
            </div>
            {isOwner && receiptHistory.length > 0 && activeOrder && !['draft', 'cancelled'].includes(activeOrder.order.status) && (
              <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
                <label htmlFor="receipt-revision-reason" className="block text-xs font-semibold">Émettre une version corrigée (propriétaire)</label>
                <textarea
                  id="receipt-revision-reason"
                  value={revisionReason}
                  onChange={(event) => setRevisionReason(event.target.value)}
                  minLength={8}
                  maxLength={500}
                  rows={3}
                  placeholder="Motif de correction (8 à 500 caractères)"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
                />
                <button
                  type="button"
                  disabled={isRevisingReceipt || revisionReason.trim().length < 8}
                  onClick={() => void reviseReceipt()}
                  className="mt-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {isRevisingReceipt ? 'Émission…' : 'Créer et imprimer la nouvelle version'}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
      <DocumentPrintModal doc={receiptDoc} onClose={closeReceiptDoc} />
    </div>
  );
}
