import type { AppSettings } from '../../types/erp.ts';
import { formatDate, formatDateTime, formatFcfa } from '../../utils/format.ts';
import type { PrintableDocumentData } from './DocumentPrintModal.tsx';

function companyDetails(company: AppSettings | undefined) {
  return [
    company?.address,
    [company?.city, company?.country].filter(Boolean).join(', '),
    company?.phone ? `Tél. ${company.phone}` : null,
    company?.email,
  ].filter(Boolean).join(' · ');
}

export function PrintableDocumentSheet({
  doc,
  company,
}: {
  doc: PrintableDocumentData;
  company: AppSettings | undefined;
}) {
  const isCustomerReceipt = doc.docType === 'REÇU DE COMMANDE';
  const isPurchaseOrder = doc.docType === 'BON DE COMMANDE';
  const secondaryName = doc.secondaryPartyName || company?.company_name || 'Sous-dépôt';
  const secondaryDetails = doc.secondaryPartyDetails || companyDetails(company);
  const senderTitle = isPurchaseOrder ? 'FOURNISSEUR' : (doc.partyTitle || 'CLIENT');
  const receiverTitle = doc.secondaryPartyTitle || (isPurchaseOrder ? 'LIVRER À' : 'DESTINATAIRE');
  const clientSignatures = isCustomerReceipt || doc.partyTitle?.toLowerCase().includes('client');

  return (
    <article className="document-sheet space-y-5 bg-white px-7 py-7 text-black sm:px-10 sm:py-9">
      <header className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-black uppercase leading-none tracking-tight sm:text-4xl">
            {isCustomerReceipt ? 'REÇU DE COMMANDE' : isPurchaseOrder ? 'BON DE COMMANDE' : doc.docType}
          </h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {isCustomerReceipt
              ? 'Accusé de réception · Document commercial, non justificatif de paiement'
              : isPurchaseOrder
                ? 'Demande d’approvisionnement fournisseur'
                : 'Document commercial'}
          </p>
        </div>
        <div className="flex max-w-[48%] items-start gap-3 text-right">
          {company?.logo_path ? (
            <img src={company.logo_path} alt={company.company_name || 'Logo'} className="h-14 w-14 shrink-0 object-contain" />
          ) : (
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-slate-950 text-lg font-black text-white">
              {(company?.company_name || 'DP').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-display text-base font-extrabold uppercase leading-tight">{company?.company_name || 'DEPOTPRO'}</div>
            {company?.company_legal_name && <div className="mt-0.5 text-[11px] text-slate-600">{company.company_legal_name}</div>}
            <div className="mt-1 max-w-64 text-[10px] leading-relaxed text-slate-600">{companyDetails(company) || 'Coordonnées à compléter dans les paramètres'}</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 divide-x divide-white bg-black text-white">
        <div className="px-3 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">N° document</div>
          <div className="mt-0.5 font-mono-num text-base font-bold">{doc.reference}</div>
        </div>
        <div className="px-3 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Date d’émission</div>
          <div className="mt-0.5 text-sm font-bold">{formatDateTime(doc.date)}</div>
          {doc.deliveryDate && <div className="mt-0.5 text-[10px]">Livraison prévue : {formatDate(doc.deliveryDate)}</div>}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4">
        <div className="min-h-24 border border-black">
          <h2 className="bg-black px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white">{senderTitle}</h2>
          <div className="space-y-1 px-3 py-2 text-xs">
            <div className="font-bold">{doc.partyName || '—'}</div>
            {doc.partyDetails && <div className="whitespace-pre-line leading-relaxed text-slate-700">{doc.partyDetails}</div>}
            {doc.partyPhone && !doc.partyDetails?.includes(doc.partyPhone) && <div>Tél. {doc.partyPhone}</div>}
          </div>
        </div>
        <div className="min-h-24 border border-black">
          <h2 className="bg-black px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white">{receiverTitle}</h2>
          <div className="space-y-1 px-3 py-2 text-xs">
            <div className="font-bold">{secondaryName}</div>
            {secondaryDetails && <div className="whitespace-pre-line leading-relaxed text-slate-700">{secondaryDetails}</div>}
            {doc.statusLabel && <div className="pt-0.5 text-[10px] font-semibold uppercase text-slate-600">Statut : {doc.statusLabel}</div>}
          </div>
        </div>
      </section>

      <div className="overflow-hidden border border-black">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-black text-white">
            <tr>
              <th className="w-[14%] px-2 py-2 text-center font-bold uppercase">Qté</th>
              <th className="px-2 py-2 font-bold uppercase">Description</th>
              <th className="w-[19%] px-2 py-2 text-right font-bold uppercase">Prix unitaire</th>
              <th className="w-[20%] px-2 py-2 text-right font-bold uppercase">Total</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.length ? doc.lines.map((line, index) => (
              <tr key={`${line.label}-${index}`} className="border-t border-black align-top">
                <td className="border-r border-black px-2 py-2 text-center font-mono-num">{line.quantity}</td>
                <td className="border-r border-black px-2 py-2">
                  <div className="font-semibold">{line.label}</div>
                  {line.sublabel && <div className="mt-0.5 whitespace-pre-line text-[10px] leading-relaxed text-slate-600">{line.sublabel}</div>}
                </td>
                <td className="border-r border-black px-2 py-2 text-right font-mono-num">{line.unitPrice == null ? '—' : formatFcfa(line.unitPrice)}</td>
                <td className="px-2 py-2 text-right font-mono-num font-semibold">{line.total == null ? '—' : formatFcfa(line.total)}</td>
              </tr>
            )) : <tr className="border-t border-black"><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Aucune ligne</td></tr>}
          </tbody>
        </table>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-[1.2fr_0.8fr]">
        <div className="border border-black">
          <h2 className="bg-black px-3 py-2 text-xs font-bold text-white">Observations et conditions</h2>
          <div className="min-h-28 whitespace-pre-line px-3 py-3 text-xs leading-relaxed text-slate-700">
            {doc.notes || (isPurchaseOrder
              ? 'Merci de confirmer la disponibilité et le délai de livraison. Toute réception physique sera contrôlée séparément.'
              : 'Merci pour votre confiance.')}
          </div>
        </div>
        <div className="space-y-2 self-start px-1 py-1 text-xs">
          {(doc.summaryRows || []).map((row, index) => {
            const emphasis = row.bold || /total|reste à payer/i.test(row.label);
            return (
              <div key={`${row.label}-${index}`} className={`flex justify-between gap-3 ${emphasis ? 'border-t border-black pt-2 text-sm font-bold' : ''} ${row.tone === 'danger' ? 'text-red-700' : row.tone === 'success' ? 'text-emerald-700' : row.tone === 'warning' ? 'text-amber-700' : ''}`}>
                <span>{row.label}</span><span className="shrink-0 text-right font-mono-num">{row.value}</span>
              </div>
            );
          })}
        </div>
      </section>

      {doc.payments && doc.payments.length > 0 && (
        <section className="border border-slate-400 p-3 text-xs">
          <h2 className="mb-2 font-bold uppercase">Règlements enregistrés</h2>
          {doc.payments.map((payment, index) => <div key={`${payment.label}-${index}`} className="flex justify-between border-t border-slate-200 py-1"><span>{payment.label}</span><span className="font-mono-num">{formatFcfa(payment.amount)}</span></div>)}
        </section>
      )}

      <section className="grid grid-cols-2 gap-5 pt-1 text-xs">
        <div className="min-h-24 border border-slate-400 px-3 py-2">
          <div className="font-bold">{clientSignatures ? 'Reçu par le client' : isPurchaseOrder ? 'Visa du fournisseur' : 'Le tiers'}</div>
          <div className="mt-2 space-y-3 text-slate-600"><div>Nom : __________________________</div><div>Date et signature : __________________________</div></div>
        </div>
        <div className="min-h-24 border border-slate-400 px-3 py-2">
          <div className="font-bold">{isPurchaseOrder ? 'Émis par le sous-dépôt' : 'Responsable du sous-dépôt'}</div>
          <div className="mt-2 space-y-3 text-slate-600"><div>Nom : __________________________</div><div>Date et cachet : __________________________</div></div>
        </div>
      </section>

      <footer className="border-t border-slate-300 pt-3 text-center text-[10px] italic text-slate-500">
        {isCustomerReceipt
          ? 'Merci pour votre confiance. Ce reçu confirme la commande et ne remplace pas une facture ou un reçu de paiement.'
          : isPurchaseOrder
            ? 'Bon de commande émis sous réserve de validation et de contrôle à la réception physique.'
            : `${company?.company_name || 'DEPOTPRO'} · Document généré à partir des données commerciales enregistrées.`}
        <div className="mt-1 not-italic">Réf. {doc.reference} · {company?.company_name || 'DEPOTPRO'}</div>
      </footer>
    </article>
  );
}
