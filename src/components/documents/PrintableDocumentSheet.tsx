import type { AppSettings } from '../../types/erp.ts';
import { formatDateTime, formatFcfa } from '../../utils/format.ts';
import type { PrintableDocumentData } from './DocumentPrintModal.tsx';

/* ============================================================================
 * Feuille imprimable (en-tête société, tiers, lignes, ventilation & totaux)
 * ============================================================================ */

export function PrintableDocumentSheet({
  doc,
  company,
}: {
  doc: PrintableDocumentData;
  company: AppSettings | undefined;
}) {
  return (
    <div className="p-8 space-y-6 bg-white text-[#182230]">
      {/* En-tête commercial */}
      <div className="flex items-start justify-between gap-6 border-b-2 border-[#101B33] pb-5">
        <div className="flex items-start gap-3">
          {company?.logo_path ? (
            <img
              src={company.logo_path}
              alt={company.company_name || 'Logo dépôt'}
              className="h-10 w-10 rounded-lg border border-slate-200 bg-white object-contain p-0.5 shrink-0"
            />
          ) : (
            <svg viewBox="0 0 36 36" className="h-10 w-10 shrink-0" aria-hidden="true">
              <rect width="36" height="36" rx="8" fill="#101B33" />
              <path
                d="M9 12h18M9 18h18M9 24h10"
                stroke="#60A5FA"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx="25" cy="24" r="3" fill="#2563EB" />
            </svg>
          )}
          <div>
            <div className="font-display text-lg font-bold tracking-tight text-[#101B33]">
              {company?.company_name || 'DEPOTPRO'}
            </div>
            {company?.company_legal_name && (
              <div className="text-xs text-[#667085]">{company.company_legal_name}</div>
            )}
            <div className="mt-1 text-xs text-[#667085] space-y-0.5">
              {company?.address && <div>{company.address}</div>}
              <div>
                {[company?.city, company?.country].filter(Boolean).join(', ')}
                {company?.phone ? ` · Tél : ${company.phone}` : ''}
              </div>
              {company?.email && <div>{company.email}</div>}
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-bold tracking-wider text-[#2563EB] uppercase">
            {doc.docType}
          </div>
          <div className="mt-1 font-mono-num text-base font-bold text-[#101B33]">
            {doc.reference}
          </div>
          <div className="mt-1 font-mono-num text-xs text-[#667085]">
            {formatDateTime(doc.date)}
          </div>
          {doc.statusLabel && (
            <div className="mt-1 text-xs font-semibold text-[#182230]">
              Statut : {doc.statusLabel}
            </div>
          )}
        </div>
      </div>

      {/* Tiers */}
      {doc.partyName && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs">
          <span className="font-semibold text-[#667085] uppercase tracking-wide">
            {doc.partyTitle || 'Tiers'} :{' '}
          </span>
          <span className="font-semibold text-[#182230]">{doc.partyName}</span>
          {doc.partyDetails && (
            <div className="mt-0.5 text-[#667085]">{doc.partyDetails}</div>
          )}
        </div>
      )}

      {/* Tableau des lignes */}
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-slate-300 text-[#667085]">
            <th className="py-2 pr-2 font-semibold">Désignation</th>
            <th className="py-2 px-2 font-semibold text-right">Quantité</th>
            <th className="py-2 px-2 font-semibold text-right">P.U.</th>
            <th className="py-2 pl-2 font-semibold text-right">Montant</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {doc.lines.map((line, i) => (
            <tr key={i}>
              <td className="py-2.5 pr-2">
                <div className="font-medium text-[#182230]">{line.label}</div>
                {line.sublabel && (
                  <div className="text-[11px] text-[#667085]">{line.sublabel}</div>
                )}
              </td>
              <td className="py-2.5 px-2 text-right font-mono-num">{line.quantity}</td>
              <td className="py-2.5 px-2 text-right font-mono-num">
                {line.unitPrice !== undefined && line.unitPrice !== null
                  ? formatFcfa(line.unitPrice)
                  : '—'}
              </td>
              <td className="py-2.5 pl-2 text-right font-mono-num font-semibold">
                {line.total !== undefined && line.total !== null
                  ? formatFcfa(line.total)
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totaux & Paiements */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
        <div className="space-y-2 text-xs">
          {doc.payments && doc.payments.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="font-semibold text-[#101B33] mb-1.5">
                Ventilation des règlements
              </div>
              <div className="space-y-1">
                {doc.payments.map((p, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="text-[#667085]">{p.label}</span>
                    <span className="font-mono-num font-medium">{formatFcfa(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {doc.notes && (
            <div className="rounded-lg border border-slate-200 p-3 text-[#667085] whitespace-pre-line">
              <span className="font-semibold text-[#182230]">Observations &amp; conditions : </span>
              {doc.notes}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-xs space-y-1.5">
          {(doc.summaryRows || []).map((row, idx) => {
            const toneCls =
              row.tone === 'success'
                ? 'text-[#16A36A]'
                : row.tone === 'warning'
                  ? 'text-[#D9901A]'
                  : row.tone === 'danger'
                    ? 'text-[#DC4545]'
                    : 'text-[#182230]';
            return (
              <div
                key={idx}
                className={`flex justify-between ${
                  row.bold ? 'border-t border-slate-300 pt-1.5 text-sm font-bold' : ''
                } ${toneCls}`}
              >
                <span>{row.label}</span>
                <span className="font-mono-num">{row.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bloc de validation (signatures) */}
      <div className="grid grid-cols-2 gap-6 pt-2 text-xs">
        <div className="rounded-lg border border-slate-300 p-3">
          <div className="font-semibold text-[#101B33] mb-2">Le client</div>
          <div className="space-y-3 text-[#667085]">
            <div>Nom : ______________________</div>
            <div>Date : ______________________</div>
            <div>Signature : ______________________</div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-300 p-3">
          <div className="font-semibold text-[#101B33] mb-2">
            Le responsable du sous-dépôt
          </div>
          <div className="space-y-3 text-[#667085]">
            <div>Nom : ______________________</div>
            <div>Date : ______________________</div>
            <div>Signature / Cachet : ______________________</div>
          </div>
        </div>
      </div>

      {/* Pied de page document */}
      <div className="border-t border-slate-200 pt-4 flex items-center justify-between text-[11px] text-[#667085]">
        <span>
          {company?.company_name || 'DEPOTPRO'} · Document généré localement sans recalcul rétroactif
        </span>
        <span className="font-mono-num">Réf. {doc.reference}</span>
      </div>
    </div>
  );
}
