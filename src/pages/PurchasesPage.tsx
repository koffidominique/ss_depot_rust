import { useState } from 'react';
import { Download, Plus } from 'lucide-react';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { PurchaseOrder } from '../types/erp.ts';
import { exportPurchasesCsv } from '../utils/csv.ts';
import {
  usePurchasesMutations,
  usePurchasesQueries,
} from '../features/purchases/hooks/usePurchasesData.ts';
import { PurchasesTable } from '../features/purchases/components/PurchasesTable.tsx';
import { PurchaseOrderModal } from '../features/purchases/components/PurchaseOrderModal.tsx';
import { PurchaseReceiveModal } from '../features/purchases/components/PurchaseReceiveModal.tsx';
import { PurchaseDetailModal } from '../features/purchases/components/PurchaseDetailModal.tsx';
import { PurchaseCancelModal } from '../features/purchases/components/PurchaseCancelModal.tsx';

export function PurchasesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<PurchaseOrder | null>(null);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { ordersQuery, suppliersQuery, productsQuery, supplierDebtsQuery } = usePurchasesQueries(
    Boolean(detailTarget)
  );

  const { createPoMutation, receiveMutation, cancelPoMutation } = usePurchasesMutations({
    onCreatedPo: () => {
      setCreateOpen(false);
      setErrorMsg(null);
    },
    onReceivedPo: () => {
      setReceiveTarget(null);
      setErrorMsg(null);
    },
    onCancelledPo: () => {
      setCancelTarget(null);
      setErrorMsg(null);
    },
    onError: setErrorMsg,
  });

  const { data: orders, isLoading, error, refetch } = ordersQuery;
  const products = productsQuery.data?.items || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-[#667085] dark:text-slate-400">
          Le bon de commande ne modifie pas le stock : seule une réception validée augmente les
          quantités et génère la dette fournisseur.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!orders || orders.length === 0}
            onClick={() => exportPurchasesCsv(orders || [])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Exporter CSV
          </button>
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setCreateOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nouveau bon de commande
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error || !orders ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Erreur chargement achats.'}
          onRetry={() => refetch()}
        />
      ) : (
        <PurchasesTable
          orders={orders}
          onInspect={setDetailTarget}
          onPrint={setPrintDoc}
          onReceive={(order) => {
            setReceiveTarget(order);
            setErrorMsg(null);
          }}
          onCancel={(order) => {
            setCancelTarget(order);
            setErrorMsg(null);
          }}
        />
      )}

      <PurchaseOrderModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        suppliers={suppliersQuery.data}
        products={products}
        error={errorMsg}
        isPending={createPoMutation.isPending}
        onSubmit={(values) => createPoMutation.mutate(values)}
      />

      <PurchaseReceiveModal
        target={receiveTarget}
        onClose={() => setReceiveTarget(null)}
        error={errorMsg}
        isPending={receiveMutation.isPending}
        onSubmit={(values) => receiveMutation.mutate(values)}
      />

      <PurchaseDetailModal
        target={detailTarget}
        supplierDebts={supplierDebtsQuery.data}
        onClose={() => setDetailTarget(null)}
      />

      <PurchaseCancelModal
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        error={errorMsg}
        isPending={cancelPoMutation.isPending}
        onSubmit={(values) => cancelPoMutation.mutate(values)}
      />

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
