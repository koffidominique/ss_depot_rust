import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2 } from 'lucide-react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { InlineAlert } from '../../../components/common/InlineAlert.tsx';
import type { AppSettings } from '../../../types/erp.ts';

export function OnboardingBanner({
  onOpenSetup,
  onSkip,
  isSkipping,
}: {
  onOpenSetup: () => void;
  onSkip: () => void;
  isSkipping: boolean;
}) {
  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#2563EB]" />
            <h2 className="font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
              Assistant de première configuration
            </h2>
          </div>
          <p className="text-xs text-[#667085] dark:text-slate-300 max-w-2xl">
            Votre espace est prêt avec les moyens de paiement et catégories génériques par défaut.
            Personnalisez l’identité de votre dépôt avant d’émettre vos premières factures et reçus
            PDF.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] font-medium text-[#182230] dark:text-slate-200">
            <span className="inline-flex items-center gap-1 text-[#16A36A]">
              <CheckCircle2 className="h-3.5 w-3.5" /> 1. PIN propriétaire configuré
            </span>
            <span className="inline-flex items-center gap-1 text-[#2563EB]">
              2. Identité du dépôt à renseigner
            </span>
            <Link to="/suppliers" className="hover:underline text-[#667085] dark:text-slate-300">
              3. Ajouter fournisseurs &amp; produits →
            </Link>
            <Link to="/cash" className="hover:underline text-[#667085] dark:text-slate-300">
              4. Ouvrir la caisse →
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenSetup}
            className="rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Configurer mon dépôt
          </button>
          <button
            type="button"
            disabled={isSkipping}
            onClick={onSkip}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-[#667085] dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Configurer plus tard
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingFormBody({
  settings,
  isPending,
  serverError,
  onClose,
  onSave,
}: {
  settings: AppSettings | null | undefined;
  isPending: boolean;
  serverError: string | null;
  onClose: () => void;
  onSave: (payload: {
    company_name: string;
    company_legal_name: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    setup_completed: boolean;
  }) => void;
}) {
  const [obName, setObName] = useState(
    settings?.company_name && settings.company_name !== 'Mon Dépôt' ? settings.company_name : ''
  );
  const [obLegal, setObLegal] = useState(settings?.company_legal_name || '');
  const [obPhone, setObPhone] = useState(settings?.phone || '');
  const [obAddress, setObAddress] = useState(settings?.address || '');
  const [obCity, setObCity] = useState(settings?.city || '');
  const [obCountry, setObCountry] = useState(settings?.country || '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const displayedError = validationError || serverError;

  return (
    <form
      className="mt-4 space-y-3 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        setValidationError(null);
        if (!obName.trim()) {
          setValidationError('Le nom commercial du dépôt est obligatoire.');
          return;
        }
        onSave({
          company_name: obName.trim(),
          company_legal_name: obLegal.trim(),
          phone: obPhone.trim(),
          address: obAddress.trim(),
          city: obCity.trim(),
          country: obCountry.trim(),
          setup_completed: true,
        });
      }}
    >
      {displayedError && <InlineAlert message={displayedError} />}
      <label className="block space-y-1">
        <span className="font-medium text-[#667085] dark:text-slate-400">
          Nom commercial du dépôt *
        </span>
        <input
          type="text"
          value={obName}
          onChange={(e) => setObName(e.target.value)}
          placeholder="Ex. Dépôt Boissons Étoile"
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="font-medium text-[#667085] dark:text-slate-400">Raison sociale</span>
          <input
            type="text"
            value={obLegal}
            onChange={(e) => setObLegal(e.target.value)}
            placeholder="SARL / Établissement"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-medium text-[#667085] dark:text-slate-400">Téléphone</span>
          <input
            type="text"
            value={obPhone}
            onChange={(e) => setObPhone(e.target.value)}
            placeholder="+225 ..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="font-medium text-[#667085] dark:text-slate-400">
          Adresse / Quartier
        </span>
        <input
          type="text"
          value={obAddress}
          onChange={(e) => setObAddress(e.target.value)}
          placeholder="Adresse physique du dépôt"
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="font-medium text-[#667085] dark:text-slate-400">Ville</span>
          <input
            type="text"
            value={obCity}
            onChange={(e) => setObCity(e.target.value)}
            placeholder="Abidjan, Bouaké..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-medium text-[#667085] dark:text-slate-400">Pays</span>
          <input
            type="text"
            value={obCountry}
            onChange={(e) => setObCountry(e.target.value)}
            placeholder="Côte d'Ivoire"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-2 text-xs font-medium"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          Enregistrer et terminer
        </button>
      </div>
    </form>
  );
}

export function OnboardingModal({
  open,
  onOpenChange,
  settings,
  isPending,
  serverError,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings | null | undefined;
  isPending: boolean;
  serverError: string | null;
  onSave: (payload: {
    company_name: string;
    company_legal_name: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    setup_completed: boolean;
  }) => void;
}) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Identité de votre dépôt"
      maxWidthClass="max-w-lg"
    >
      {open && (
        <OnboardingFormBody
          key={settings?.company_name ?? 'init'}
          settings={settings}
          isPending={isPending}
          serverError={serverError}
          onClose={() => onOpenChange(false)}
          onSave={onSave}
        />
      )}
    </ModalDialog>
  );
}
