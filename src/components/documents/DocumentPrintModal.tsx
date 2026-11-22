import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Download, MessageCircle, Printer, X } from 'lucide-react';
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
    | 'REÇU DE COMMANDE'
    | 'AVOIR CLIENT'
    | 'BON DE COMMANDE'
    | 'BON DE COMMANDE CLIENT – ACCUSÉ DE RÉCEPTION'
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
  partyPhone?: string | null;
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
  const [pdfUrl, setPdfUrl] = useState<{ url: string; fileName: string } | null>(null);

  const company = settingsData?.settings;

  const buildPdfBlobUrl = async (): Promise<{ url: string; fileName: string } | null> => {
    if (!doc) return null;
    const bytes = await apiClient.generateDocumentPdf(doc as unknown as Record<string, unknown>);
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const safeRef = doc.reference.replace(/[^a-zA-Z0-9_-]+/g, '_');
    const fileName = `DEPOTPRO_${safeRef}.pdf`;
    return { url, fileName };
  };

  const handleDownloadPdf = async () => {
    if (!doc) return;
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      const pdf = await buildPdfBlobUrl();
      if (!pdf) return;
      const { url, fileName } = pdf;
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Erreur lors de la génération PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  /* Envoi WhatsApp : génère le PDF puis ouvre la conversation du client.
   * L'utilisateur joignez le PDF téléchargé dans la conversation ouverte. */
  const handleSendWhatsApp = async () => {
    if (!doc) return;
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      const pdf = await buildPdfBlobUrl();
      if (!pdf) return;
      const { url, fileName } = pdf;
      setPdfUrl({ url, fileName });
      // Déclenche le téléchargement du PDF à joindre au message
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();

      const rawPhone = (doc.partyPhone || '').replace(/[^0-9]/g, '');
      // Normalisation Côte d'Ivoire : 10 chiffres locaux -> +225
      const waPhone =
        rawPhone.length === 10 ? `225${rawPhone}` : rawPhone;
      const message =
        `Bonjour ${doc.partyName || ''}, voici votre document ${doc.docType} ` +
        `réf. ${doc.reference}. Le PDF (${fileName}) vient d'être téléchargé, ` +
        'merci de le joindre à votre réponse ou de l\'ouvrir depuis vos téléchargements.';
      const waUrl = waPhone
        ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');
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
                    disabled={downloadingPdf}
                    onClick={handleSendWhatsApp}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1DA851] disabled:opacity-50"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    {downloadingPdf ? 'Génération...' : 'Envoyer par WhatsApp'}
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
              {pdfUrl && (
                <div className="no-print bg-emerald-50 px-6 py-2 text-xs text-emerald-800 border-b border-emerald-200 flex items-center justify-between gap-3">
                  <span>
                    PDF prêt ({pdfUrl.fileName}) — joint-le dans la conversation WhatsApp ouverte.
                  </span>
                  <a
                    href={pdfUrl.url}
                    download={pdfUrl.fileName}
                    className="font-semibold underline whitespace-nowrap"
                  >
                    Re-télécharger
                  </a>
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
