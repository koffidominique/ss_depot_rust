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
  const isCustomerReceipt = ['REÇU DE VENTE', 'REÇU DE COMMANDE', 'BON DE COMMANDE CLIENT – ACCUSÉ DE RÉCEPTION'].includes(doc.docType);
  const isPurchaseOrder = doc.docType === 'BON DE COMMANDE';
  const isPurchaseReceipt = doc.docType === 'BON DE RÉCEPTION';
  const secondaryName = doc.secondaryPartyName || company?.company_name || 'Sous-dépôt';
  const secondaryDetails = doc.secondaryPartyDetails || companyDetails(company);
  const senderTitle = isPurchaseOrder ? 'FOURNISSEUR' : (doc.partyTitle || 'CLIENT');
  const receiverTitle = doc.secondaryPartyTitle || (isPurchaseOrder ? 'LIVRER À' : 'DESTINATAIRE');
  const clientSignatures = isCustomerReceipt || doc.partyTitle?.toLowerCase().includes('client');
  const isOrderAcknowledgement = doc.docType === 'BON DE COMMANDE CLIENT – ACCUSÉ DE RÉCEPTION';

  if (isOrderAcknowledgement) {
    const notes = (doc.notes || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const cashier = notes.find((line) => line.startsWith('Émis par :'))?.replace('Émis par :', '').trim();
    const orderPayment = notes.find((line) => line.startsWith('Mode de règlement prévu :'))?.replace('Mode de règlement prévu :', '').trim();
    const operationalNotes = notes.filter((line) => !/^(Émis par :|Mode de règlement prévu :|Statut du paiement :|Livraison :|Casiers mixtes —)/.test(line));
    const valueFor = (label: string) => doc.summaryRows.find((row) => row.label === label)?.value || '—';
    return (
      <article className="order-receipt-sheet bg-white px-6 py-6 text-slate-800 sm:px-8">
        <header className="order-receipt-header">
          <div className="order-receipt-brand">
            {company?.logo_path ? <img src={company.logo_path} alt="Logo du sous-dépôt" /> : <div className="order-receipt-logo-placeholder">LOGO</div>}
            <div className="min-w-0">
              <h1>{company?.company_name || 'DEPOTPRO'}</h1>
              {company?.address && <p>Adresse : {company.address}</p>}
              <p>{[company?.city, company?.country].filter(Boolean).join(' · ')}</p>
              {company?.phone && <p>Tél / WhatsApp : {company.phone}</p>}
              {company?.email && <p>{company.email}</p>}
            </div>
          </div>
          <div className="order-receipt-number">
            <strong>REÇU DE COMMANDE</strong>
            <small>CONFIRMATION DE COMMANDE CLIENT</small>
            <span>N° reçu : {doc.reference}</span>
            {doc.orderReference && <span>Réf. commande : {doc.orderReference}</span>}
            <span>Date : {formatDateTime(doc.date)}</span>
            {doc.statusLabel && <span>Statut : {doc.statusLabel}</span>}
            {cashier && <span>Émis par : {cashier}</span>}
          </div>
        </header>

        <div className="order-receipt-party-grid">
          <section><h2>INFORMATIONS DU CLIENT</h2><b>{doc.partyName || '—'}</b>
            {doc.partyDetails && <p>{doc.partyDetails}</p>}
            {doc.partyPhone && !doc.partyDetails?.includes(doc.partyPhone) && <p>Contact : {doc.partyPhone}</p>}
          </section>
          <section><h2>MODE DE RETRAIT / LIVRAISON</h2>
            <p>{doc.deliveryDate || (doc.secondaryPartyDetails && doc.secondaryPartyDetails !== 'À retirer au sous-dépôt') ? 'Livraison prévue' : 'Enlèvement sur place (au sous-dépôt)'}</p>
            <b>{doc.secondaryPartyName || doc.partyName || '—'}</b>
            <p>{doc.secondaryPartyDetails || '—'}</p>
            <p>{doc.deliveryDate ? `Date prévue : ${formatDate(doc.deliveryDate)}` : 'Date / Heure prévue : non renseignée'}</p>
          </section>
        </div>

        <section className="order-receipt-products">
          <h2>LIGNES DE COMMANDE</h2>
          <table><thead><tr><th>N°</th><th>DÉSIGNATION DE LA BOISSON & FORMAT (CL)</th><th>CONDITIONNEMENT (CASIER / PACK)</th><th>QTÉ</th><th>PRIX UNITAIRE (FCFA)</th><th>MONTANT TOTAL (FCFA)</th></tr></thead>
            <tbody>{doc.lines.filter((line) => !line.label.startsWith('Emballage :')).map((line, index) => <tr key={`${line.label}-${index}`}>
              <td>{index + 1}</td><td>{line.label}</td><td>{line.sublabel || '—'}</td><td>{line.quantity}</td><td>{line.unitPrice == null ? '—' : formatFcfa(line.unitPrice)}</td><td>{line.total == null ? '—' : formatFcfa(line.total)}</td>
            </tr>)}</tbody>
          </table>
        </section>

        {doc.packagingLines?.length ? <section className="order-receipt-packaging"><h2>SUIVI DES CASIERS & EMBALLAGES (CONSIGNES)</h2>
          <table><thead><tr><th>Type d'emballage</th><th>Prévu</th><th>Remis</th><th>Rendus</th><th>Solde à restituer</th><th>Consigne (unité / total)</th></tr></thead>
            <tbody>{doc.packagingLines.map((line, index) => <tr key={`${line.label}-${index}`}>
              <td>{line.label}<small>{line.statusLabel}{line.detail ? ` · ${line.detail}` : ''}</small></td>
              <td>{line.expectedQuantity}</td>
              <td>{line.issuedQuantity ?? '—'}</td>
              <td>{line.issuedQuantity == null ? '—' : line.returnedQuantity ?? 0}</td>
              <td>{line.issuedQuantity == null ? '—' : Math.max(0, line.issuedQuantity - (line.returnedQuantity ?? 0))}</td>
              <td>{line.unitDepositXof == null ? 'Non consigné' : `${formatFcfa(line.unitDepositXof)} / ${formatFcfa(line.amount ?? 0)}`}</td>
            </tr>)}</tbody>
          </table></section> : null}

        <section className="order-receipt-finance"><h2>DÉCOMPTE FINANCIER (FCFA)</h2>
          <div className="order-receipt-summary">{doc.summaryRows.map((row, index) => <div key={`${row.label}-${index}`} className={`${row.bold ? 'is-total' : ''} ${row.tone === 'danger' ? 'is-due' : ''}`}><span>{row.label}</span><b>{row.value}</b></div>)}</div>
        </section>
        <section className="order-receipt-payment"><b>Mode de règlement prévu :</b> {orderPayment || 'Non renseigné'}<br />Montant déjà encaissé : {valueFor('Acomptes / paiements enregistrés')} · Statut : {notes.find((line) => line.startsWith('Statut du paiement :'))?.replace('Statut du paiement :', '').trim() || '—'}
          {doc.payments?.length ? <div className="mt-2 border-t border-slate-200 pt-1">{doc.payments.map((payment, index) => <div key={`${payment.label}-${index}`} className="flex justify-between gap-3"><span>{payment.label}</span><b>{formatFcfa(payment.amount)}</b></div>)}</div> : <div className="mt-1 text-slate-500">Aucun encaissement associé enregistré à l’émission.</div>}
        </section>
        {operationalNotes.length > 0 && <p className="order-receipt-notes">{operationalNotes.join(' · ')}</p>}
        <section className="order-receipt-signatures"><div><b>Signature & cachet du sous-dépôt</b></div><div><b>Signature du client (bon pour accord & réception)</b></div></section>
        <footer>Merci pour votre confiance ! Veuillez vérifier vos quantités et emballages avant de quitter le dépôt.</footer>
      </article>
    );
  }

  return (
    <article className="document-sheet space-y-5 bg-white px-7 py-7 text-black sm:px-10 sm:py-9">
      <header className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-black uppercase leading-none tracking-tight sm:text-4xl">
            {isCustomerReceipt ? doc.docType : isPurchaseOrder ? 'BON DE COMMANDE' : doc.docType}
          </h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {isCustomerReceipt
              ? doc.docType === 'REÇU DE VENTE' ? 'Reçu client · Détail de la vente et des emballages remis' : 'Document client · Ne constitue ni un reçu de vente ni une preuve de paiement'
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

      {doc.packagingLines && doc.packagingLines.length > 0 && (
        <section className="border border-slate-400 p-3 text-xs">
          <h2 className="mb-2 font-bold uppercase">{isPurchaseOrder ? 'Emballages vides à préparer' : isPurchaseReceipt ? 'Emballages vides remis au fournisseur' : isCustomerReceipt ? 'Emballages consignés remis au client' : 'Emballages physiques / consignes'}</h2>
          <div className="divide-y divide-slate-200">
            {doc.packagingLines.map((line, index) => (
              <div key={`${line.label}-${index}`} className="grid grid-cols-[1fr_auto] gap-2 py-2">
                <div>
                  <div className="font-semibold">{line.label} · {line.kind === 'bottle' ? 'bouteilles' : line.kind === 'crate' ? 'casiers' : 'autre'}</div>
                  {line.detail && <div className="text-[10px] text-slate-600">{line.detail}</div>}
                  <div className="text-[10px] font-medium text-slate-700">{line.statusLabel}</div>
                </div>
                <div className="text-right font-mono-num">
                  <div>Attendu : {line.expectedQuantity}</div>
                  {line.issuedQuantity != null && <div>Remis : {line.issuedQuantity}</div>}
                  {line.returnedQuantity != null && <div>Retourné : {line.returnedQuantity} · Solde : {Math.max(0, line.expectedQuantity - line.returnedQuantity)}</div>}
                  {line.amount != null && <div>{formatFcfa(line.amount)}</div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
          <div className="font-bold">{clientSignatures ? 'Reçu par le client' : (isPurchaseOrder || isPurchaseReceipt) ? 'Visa du fournisseur' : 'Le tiers'}</div>
          <div className="mt-2 space-y-3 text-slate-600"><div>Nom : __________________________</div><div>Date et signature : __________________________</div></div>
        </div>
        <div className="min-h-24 border border-slate-400 px-3 py-2">
          <div className="font-bold">{isPurchaseOrder ? 'Émis par le sous-dépôt' : isPurchaseReceipt ? 'Réceptionné par le sous-dépôt' : 'Responsable du sous-dépôt'}</div>
          <div className="mt-2 space-y-3 text-slate-600"><div>Nom : __________________________</div><div>Date et cachet : __________________________</div></div>
        </div>
      </section>

      <footer className="border-t border-slate-300 pt-3 text-center text-[10px] italic text-slate-500">
        {doc.docType === 'REÇU DE VENTE'
          ? 'Reçu de vente détaillé; les marchandises, emballages remis, règlements et solde sont indiqués séparément.'
          : isCustomerReceipt
            ? 'Merci pour votre confiance. Cet accusé confirme la commande client; il ne remplace ni le reçu de vente ni une preuve de paiement.'
            : isPurchaseOrder
            ? 'Bon de commande émis sous réserve de validation et de contrôle à la réception physique.'
            : isPurchaseReceipt
              ? 'Bon de réception physique lié au CMD indiqué; les emballages remis sont un échange matériel sans dette client ni ligne financière.'
              : `${company?.company_name || 'DEPOTPRO'} · Document généré à partir des données commerciales enregistrées.`}
        <div className="mt-1 not-italic">Réf. {doc.reference} · {company?.company_name || 'DEPOTPRO'}</div>
      </footer>
    </article>
  );
}
