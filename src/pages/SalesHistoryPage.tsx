import { useState } from 'react';
import { Download } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { SearchInput } from '../components/forms/SearchInput.tsx';
import { InlineAlert } from '../components/common/InlineAlert.tsx';
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from '../components/documents/DocumentPrintModal.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { SaleDetail, SaleSummary } from '../types/erp.ts';
import { exportSalesCsv } from '../utils/csv.ts';
import {
  useSalesHistoryMutations,
  useSalesHistoryQueries,
} from '../features/sales/hooks/useSalesHistoryData.ts';
import { SalesHistoryTable } from '../features/sales/components/SalesHistoryTable.tsx';
import { SaleDetailModal } from '../features/sales/components/SaleDetailModal.tsx';
import { SaleCancelModal } from '../features/sales/components/SaleCancelModal.tsx';
import { SaleReturnModal } from '../features/sales/components/SaleReturnModal.tsx';

export function SalesHistoryPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);

  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SaleDetail | null>(null);
  const [returnTarget, setReturnTarget] = useState<SaleDetail | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);

  const { salesQuery, refundMethods } = useSalesHistoryQueries({
    search,
    status,
    fromDate,
    toDate,
    page,
  });

  const { cancelMutation, returnMutation } = useSalesHistoryMutations({
    onCancelled: (updated) => {
      setCancelTarget(null);
      setActionError(null);
      setSelectedSale(updated);
    },
    onReturned: (updated) => {
      setReturnTarget(null);
      setActionError(null);
      setSelectedSale(updated);
    },
    onError: (msg) => setActionError(msg),
  });

  const defaultRefundMethodFor = (sale: SaleDetail | null) => {
    const firstCode = sale?.payments?.[0]?.method_code;
    if (firstCode && refundMethods.some((m) => m.code === firstCode)) {
      return firstCode;
    }
    return refundMethods[0]?.code || 'cash';
  };

  const handleExportCsv = async () => {
    setExportingCsv(true);
    setActionError(null);
    try {
      const all: SaleSummary[] = [];
      let cur = 1;
      let pages = 1;
      do {
        const res = await apiClient.listSales({
          search,
          status,
          from: fromDate || undefined,
          to: toDate || undefined,
          page: cur,
          pageSize: 100,
        });
        all.push(...res.items);
        pages = res.totalPages || 1;
        cur += 1;
      } while (cur <= pages && cur <= 100);
      exportSalesCsv(all);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erreur export CSV des ventes.');
    } finally {
      setExportingCsv(false);
    }
  };

  const openDetail = async (id: number) => {
    setActionError(null);
    const detail = await apiClient.getSaleDetail(id);
    setSelectedSale(detail);
  };

  const { data, isLoading, error, refetch } = salesQuery;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(next) => {
              setSearch(next);
              setPage(1);
            }}
            placeholder="Référence vente ou client..."
            ariaLabel="Rechercher une vente"
            className="w-72"
          />
          <select
            aria-label="Statut ventes"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3 py-2 text-xs font-medium"
          >
            <option value="all">Tous les statuts</option>
            <option value="validated">Validées</option>
            <option value="partially_returned">Retour partiel</option>
            <option value="returned">Retournées</option>
            <option value="cancelled">Annulées</option>
          </select>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[#667085] dark:text-slate-400">Du</span>
            <input
              aria-label="Date début ventes"
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-2.5 py-1.5 font-mono-num text-xs"
            />
            <span className="text-[#667085] dark:text-slate-400">au</span>
            <input
              aria-label="Date fin ventes"
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-2.5 py-1.5 font-mono-num text-xs"
            />
            {(fromDate || toDate || search || status !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStatus('all');
                  setFromDate('');
                  setToDate('');
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[11px] font-medium text-[#667085] hover:text-[#182230] dark:hover:text-slate-200"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          disabled={exportingCsv}
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          {exportingCsv ? 'Export en cours...' : 'Exporter CSV'}
        </button>
      </div>

      {actionError && !selectedSale && !cancelTarget && !returnTarget && (
        <InlineAlert message={actionError} onDismiss={() => setActionError(null)} />
      )}

      {isLoading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Erreur de chargement.'}
          onRetry={() => refetch()}
        />
      ) : (
        <SalesHistoryTable
          items={data.items}
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          onPageChange={setPage}
          onOpenDetail={openDetail}
        />
      )}

      <SaleDetailModal
        sale={selectedSale}
        actionError={!cancelTarget && !returnTarget ? actionError : null}
        onClose={() => setSelectedSale(null)}
        onPrint={setPrintDoc}
        onOpenReturn={(sale) => {
          setActionError(null);
          setReturnTarget(sale);
        }}
        onOpenCancel={(sale) => {
          setActionError(null);
          setCancelTarget(sale);
        }}
      />

      <SaleCancelModal
        sale={cancelTarget}
        defaultMethodCode={defaultRefundMethodFor(cancelTarget)}
        refundMethods={refundMethods}
        serverError={actionError}
        isPending={cancelMutation.isPending}
        onClose={() => setCancelTarget(null)}
        onConfirm={(args) => {
          setActionError(null);
          cancelMutation.mutate(args);
        }}
      />

      <SaleReturnModal
        sale={returnTarget}
        defaultMethodCode={defaultRefundMethodFor(returnTarget)}
        refundMethods={refundMethods}
        serverError={actionError}
        isPending={returnMutation.isPending}
        onClose={() => setReturnTarget(null)}
        onConfirm={(args) => {
          setActionError(null);
          returnMutation.mutate(args);
        }}
      />

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}
