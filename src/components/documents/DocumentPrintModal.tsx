import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer, X } from 'lucide-react';
import { useState } from 'react';
import { apiClient } from '../../services/api/createApiClient.ts';
import { PrintableDocumentSheet } from './PrintableDocumentSheet.tsx';

/* ============================================================================
 * Modale d'aperçu, impression & export PDF des documents commerciaux
 * ============================================================================ */

export interface PrintableDocumentLine {
  label: string;
  sublabel?: string;
  quantity: string;
  unitPrice?: number | null;
  total?: number | null;
}

export interface PrintableDocumentSummaryRow {
  label: string;
  value: string;
  bold?: boolean;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

export interface PrintableDocumentData {
  docType:
    | 'FACTURE'
    | 'REÇU DE VENTE'
    | 'AVOIR CLIENT'
    | 'BON DE COMMANDE'
    | 'BON DE RÉCEPTION'
    | 'REÇU RETOUR EMBALLAGES'
    | 'RAPPORT DE CAISSE'
    | 'ÉTAT DES CRÉANCES CLIENTS'
    | 'RAPPORT DE STOCK & VALORISATION'
    | 'BILAN COMMERCIAL & FINANCES'
    | 'ÉTAT DES DETTES FOURNISSEURS'
    | 'ÉTAT DES CONSIGNATIONS';
  reference: string;
  date: string;
  statusLabel?: string;
  partyTitle?: string;
  partyName?: string;
  partyDetails?: string;
  lines: PrintableDocumentLine[];
  summaryRows: PrintableDocumentSummaryRow[];
  payments?: Array<{ label: string; amount: number }>;
  notes?: string | null;
}

export function DocumentPrintModal({
  doc,
  onClose,
}: {
  doc: PrintableDocumentData | null;
  onClose: () => void;
}) {
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
    enabled: Boolean(doc),
  });
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const company = settingsData?.settings;

  const handleDownloadPdf = async () => {
    if (!doc) return;
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      const bytes = await apiClient.generateDocumentPdf(doc as unknown as Record<string, unknown>);
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const safeRef = doc.reference.replace(/[^a-zA-Z0-9_-]+/g, '_');
      const a = document.createElement('a');
      a.href = url;
      a.download = `DEPOTPRO_${safeRef}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Erreur lors de la génération PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <Dialog.Root open={Boolean(doc)} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="no-print fixed inset-0 z-50 bg-slate-950/60" />
        <Dialog.Content className="print-document-root fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white text-[#182230] shadow-2xl">
          {doc && (
            <div>
              <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-6 py-3">
                <Dialog.Title className="font-display text-sm font-semibold text-[#182230]">
                  Aperçu document · {doc.docType} ({doc.reference})
                </Dialog.Title>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={downloadingPdf}
                    onClick={handleDownloadPdf}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A36A] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloadingPdf ? 'Génération...' : 'Télécharger PDF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimer
                  </button>
                  <Dialog.Close className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200">
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>
              </div>
              {pdfError && (
                <div className="no-print bg-red-50 px-6 py-2 text-xs text-red-700 border-b border-red-200">
                  {pdfError}
                </div>
              )}

              <PrintableDocumentSheet doc={doc} company={company} />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
