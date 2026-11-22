import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Download,
  FileText,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { apiClient } from "../services/api/createApiClient.ts";
import type {
  DocumentArchiveFilter,
  DocumentArchiveSummary,
} from "../types/erp.ts";
import { formatFcfa } from "../utils/format.ts";
import { InlineAlert } from "../components/common/InlineAlert.tsx";
import { ErrorState, LoadingState } from "../components/common/States.tsx";
import {
  DocumentPrintModal,
  type PrintableDocumentData,
} from "../components/documents/DocumentPrintModal.tsx";
import { buildArchivedDocumentPrintable } from "../features/documents/utils/buildArchivedDocumentPrintable.ts";

const EMPTY_FILTERS: DocumentArchiveFilter = {
  search: "",
  documentType: "all",
  sourceStatus: "all",
  paymentStatus: "all",
  customerId: undefined,
  from: "",
  to: "",
  minTotalXof: undefined,
  maxTotalXof: undefined,
  page: 1,
  pageSize: 25,
};

const DOC_LABELS: Record<string, string> = {
  sales_receipt: "Reçu de vente",
  sales_invoice: "Facture de vente",
  order_confirmation: "Bon de commande",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  confirmed: "Confirmée",
  preparing: "En préparation",
  delivered: "Livrée",
  invoiced: "Facturée",
  paid: "Soldée",
  validated: "Validée",
  partially_returned: "Retour partiel",
  returned: "Retournée",
  cancelled: "Annulée",
};

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: "Non payé",
  partial: "Paiement partiel",
  paid: "Soldé",
};

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-FR");
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  return `"${raw.replace(/"/g, '""')}"`;
}

function exportCsv(items: DocumentArchiveSummary[]) {
  const headers = [
    "Type de document",
    "Référence document",
    "Référence source",
    "Date document",
    "Client",
    "Téléphone",
    "Statut document",
    "Statut paiement",
    "Marchandises FCFA",
    "Consignes FCFA",
    "Total à percevoir FCFA",
    "Déjà payé FCFA",
    "Reste à payer FCFA",
    "Date archivage",
  ];
  const rows = items.map((item) => [
    DOC_LABELS[item.documentType] ?? item.documentType,
    item.documentReference,
    item.sourceReference,
    item.documentDate,
    item.customerName,
    item.customerPhone ?? "",
    STATUS_LABELS[item.sourceStatus] ?? item.sourceStatus,
    PAYMENT_LABELS[item.paymentStatus] ?? item.paymentStatus,
    item.subtotalXof,
    item.depositXof,
    item.totalToCollectXof,
    item.paidXof,
    item.balanceXof,
    item.generatedAt,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `depotpro_archive_documents_${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DocumentsArchivePage() {
  const [draft, setDraft] = useState<DocumentArchiveFilter>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<DocumentArchiveFilter>(EMPTY_FILTERS);
  const [printDoc, setPrintDoc] = useState<PrintableDocumentData | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const archiveQuery = useQuery({
    queryKey: ["document-archive", filters],
    queryFn: () => apiClient.listDocumentArchive(filters),
  });
  const clientsQuery = useQuery({
    queryKey: ["document-archive-clients"],
    queryFn: () => apiClient.listClients(),
  });

  const clients = clientsQuery.data ?? [];
  const data = archiveQuery.data;
  const hasFilters = useMemo(
    () =>
      Boolean(
        filters.search ||
          (filters.documentType && filters.documentType !== "all") ||
          (filters.sourceStatus && filters.sourceStatus !== "all") ||
          (filters.paymentStatus && filters.paymentStatus !== "all") ||
          filters.customerId ||
          filters.from ||
          filters.to ||
          filters.minTotalXof !== undefined ||
          filters.maxTotalXof !== undefined,
      ),
    [filters],
  );

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);
    setFilters({ ...draft, search: draft.search?.trim() ?? "", page: 1, pageSize: 25 });
  };

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setActionError(null);
  };

  const handlePrint = async (id: number) => {
    setActionError(null);
    try {
      const archived = await apiClient.getDocumentArchive(id);
      setPrintDoc(buildArchivedDocumentPrintable(archived));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Impossible d'ouvrir le document archivé.");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setActionError(null);
    try {
      const items: DocumentArchiveSummary[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await apiClient.listDocumentArchive({
          ...filters,
          page,
          pageSize: 100,
        });
        items.push(...response.items);
        totalPages = response.totalPages;
        page += 1;
      } while (page <= totalPages && page <= 200);
      exportCsv(items);
      if (page <= totalPages) {
        setActionError("L'export a été limité à 20 000 documents. Réduisez la période pour exporter le reste.");
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Erreur pendant l'export CSV.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-blue-50 p-2 text-[#2563EB] dark:bg-blue-500/10 dark:text-blue-300">
              <FileText className="h-5 w-5" />
            </div>
            <h1 className="font-display text-xl font-semibold">Reçus &amp; bons de commandes</h1>
          </div>
          <p className="mt-1 text-xs text-[#667085] dark:text-slate-400">
            Archives des documents émis, recherche comptable et réimpression des exemplaires conservés.
          </p>
        </div>
        <button
          type="button"
          disabled={exporting || !data || data.total === 0}
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-[#111A2E] dark:text-slate-200"
        >
          <Download className="h-4 w-4" />
          {exporting ? "Export en cours..." : "Exporter les résultats CSV"}
        </button>
      </div>

      {actionError && <InlineAlert message={actionError} onDismiss={() => setActionError(null)} />}

      <form
        onSubmit={applyFilters}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111A2E]"
      >
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-[#2563EB]" />
          Recherche avancée
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="xl:col-span-2">
            <span className="mb-1 block text-[11px] font-medium text-[#667085]">Recherche libre</span>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 dark:border-slate-700">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={draft.search ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
                placeholder="Référence, client, téléphone, produit…"
                className="w-full bg-transparent py-2 text-sm outline-none"
              />
            </div>
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-medium text-[#667085]">Type de document</span>
            <select
              value={draft.documentType ?? "all"}
              onChange={(event) => setDraft((current) => ({ ...current, documentType: event.target.value as DocumentArchiveFilter["documentType"] }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">Tous les documents</option>
              <option value="sales_receipt">Reçus de vente</option>
              <option value="sales_invoice">Factures de vente</option>
              <option value="order_confirmation">Bons de commande</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-medium text-[#667085]">Client</span>
            <select
              value={draft.customerId ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, customerId: event.target.value ? Number(event.target.value) : undefined }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">Tous les clients</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-medium text-[#667085]">Statut document / source</span>
            <select
              value={draft.sourceStatus ?? "all"}
              onChange={(event) => setDraft((current) => ({ ...current, sourceStatus: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">Tous les statuts</option>
              <option value="draft">Brouillon</option>
              <option value="confirmed">Confirmée</option>
              <option value="preparing">En préparation</option>
              <option value="delivered">Livrée</option>
              <option value="invoiced">Facturée</option>
              <option value="paid">Soldée</option>
              <option value="validated">Validée</option>
              <option value="partially_returned">Retour partiel</option>
              <option value="returned">Retournée</option>
              <option value="cancelled">Annulée</option>
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-medium text-[#667085]">État du paiement</span>
            <select
              value={draft.paymentStatus ?? "all"}
              onChange={(event) => setDraft((current) => ({ ...current, paymentStatus: event.target.value as DocumentArchiveFilter["paymentStatus"] }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">Tous</option>
              <option value="unpaid">Non payé</option>
              <option value="partial">Paiement partiel</option>
              <option value="paid">Soldé</option>
            </select>
          </label>
          <label>
            <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-[#667085]"><CalendarDays className="h-3.5 w-3.5" /> Du</span>
            <input type="date" value={draft.from ?? ""} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label>
            <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-[#667085]"><CalendarDays className="h-3.5 w-3.5" /> Au</span>
            <input type="date" value={draft.to ?? ""} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-medium text-[#667085]">Montant minimum (FCFA)</span>
            <input type="number" min="0" value={draft.minTotalXof ?? ""} onChange={(event) => setDraft((current) => ({ ...current, minTotalXof: event.target.value === "" ? undefined : Math.max(0, Number(event.target.value)) }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label>
            <span className="mb-1 block text-[11px] font-medium text-[#667085]">Montant maximum (FCFA)</span>
            <input type="number" min="0" value={draft.maxTotalXof ?? ""} onChange={(event) => setDraft((current) => ({ ...current, maxTotalXof: event.target.value === "" ? undefined : Math.max(0, Number(event.target.value)) }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
          </button>
          <button type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700">
            <Search className="h-3.5 w-3.5" /> Appliquer les filtres
          </button>
        </div>
      </form>

      {archiveQuery.isLoading ? <LoadingState rows={7} /> : archiveQuery.error || !data ? (
        <ErrorState
          message={archiveQuery.error instanceof Error ? archiveQuery.error.message : "Impossible de charger l'archive documentaire."}
          onRetry={() => archiveQuery.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Documents archivés" value={String(data.summary.documentCount)} hint="Selon les filtres appliqués" />
            <SummaryCard label="Total à percevoir" value={formatFcfa(data.summary.totalToCollectXof)} hint="Marchandises et consignes" />
            <SummaryCard label="Encaissements archivés" value={formatFcfa(data.summary.paidXof)} hint="Montants enregistrés à l'émission" />
            <SummaryCard label="Soldes archivés" value={formatFcfa(data.summary.balanceXof)} hint="Restes dus à la date du document" warning={data.summary.balanceXof > 0} />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#111A2E]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <h2 className="text-sm font-semibold">Journal des documents</h2>
                <p className="text-[11px] text-[#667085]">{data.total} résultat(s) · Tri du plus récent au plus ancien</p>
              </div>
              {hasFilters && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">Filtres actifs</span>}
            </div>
            {data.items.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <FileText className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold">Aucun document archivé pour ces critères</p>
                <p className="mt-1 text-xs text-[#667085]">Générez un reçu depuis une vente ou un bon depuis une commande : le document sera conservé ici pour sa réimpression.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-[#667085] dark:bg-slate-900/70">
                    <tr>
                      <th className="px-4 py-3">Document / Référence</th>
                      <th className="px-3 py-3">Date</th>
                      <th className="px-3 py-3">Client</th>
                      <th className="px-3 py-3">Statut</th>
                      <th className="px-3 py-3 text-right">Total à percevoir</th>
                      <th className="px-3 py-3 text-right">Payé</th>
                      <th className="px-3 py-3 text-right">Solde</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                        <td className="px-4 py-3">
                          <div className="font-semibold">{DOC_LABELS[item.documentType] ?? item.documentType}</div>
                          <div className="mt-0.5 font-mono text-[10px] text-[#667085]">{item.documentReference}</div>
                          <div className="text-[10px] text-[#667085]">Source : {item.sourceReference}</div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">{dateLabel(item.documentDate)}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium">{item.customerName}</div>
                          {item.customerPhone && <div className="text-[10px] text-[#667085]">{item.customerPhone}</div>}
                        </td>
                        <td className="px-3 py-3">
                          <div>{STATUS_LABELS[item.sourceStatus] ?? item.sourceStatus}</div>
                          <div className={item.paymentStatus === "paid" ? "mt-0.5 text-[10px] text-emerald-600" : "mt-0.5 text-[10px] text-amber-600"}>
                            {PAYMENT_LABELS[item.paymentStatus] ?? item.paymentStatus}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono-num font-semibold">{formatFcfa(item.totalToCollectXof)}</td>
                        <td className="px-3 py-3 text-right font-mono-num">{formatFcfa(item.paidXof)}</td>
                        <td className="px-3 py-3 text-right font-mono-num">{formatFcfa(item.balanceXof)}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => void handlePrint(item.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                            <Printer className="h-3.5 w-3.5" /> Voir / Réimprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs dark:border-slate-800">
              <span className="text-[#667085]">Page {data.page} / {data.totalPages}</span>
              <div className="flex gap-2">
                <button type="button" disabled={data.page <= 1}
                  onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, data.page - 1) }))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40 dark:border-slate-700">Précédent</button>
                <button type="button" disabled={data.page >= data.totalPages}
                  onClick={() => setFilters((current) => ({ ...current, page: Math.min(data.totalPages, data.page + 1) }))}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40 dark:border-slate-700">Suivant</button>
              </div>
            </div>
          </div>
        </>
      )}

      <DocumentPrintModal doc={printDoc} onClose={() => setPrintDoc(null)} />
    </div>
  );
}

function SummaryCard({ label, value, hint, warning = false }: { label: string; value: string; hint: string; warning?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-[#111A2E]">
      <div className="text-[11px] font-medium text-[#667085]">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${warning ? "text-amber-600" : "text-[#182230] dark:text-white"}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-[#98A2B3]">{hint}</div>
    </div>
  );
}
