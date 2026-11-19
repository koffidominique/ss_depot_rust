import * as Switch from '@radix-ui/react-switch';
import { Image as ImageIcon, Save, Trash2 } from 'lucide-react';
import { FormTipsButton } from '../../../components/common/FormTipsButton.tsx';
import type { AppSettings } from '../../../types/erp.ts';
import { compressLocalImage } from '../../../utils/image.ts';

interface CompanySettingsCardProps {
  form: Partial<AppSettings>;
  theme: 'light' | 'dark';
  isSaving: boolean;
  onUpdateForm: (updater: (prev: Partial<AppSettings>) => Partial<AppSettings>) => void;
  onSetTheme: (theme: 'light' | 'dark') => void;
  onError: (msg: string) => void;
  onClearFeedback: () => void;
  onSave: () => void;
}

export function CompanySettingsCard({
  form,
  theme,
  isSaving,
  onUpdateForm,
  onSetTheme,
  onError,
  onClearFeedback,
  onSave,
}: CompanySettingsCardProps) {
  const handleLogoChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await compressLocalImage(file, {
        maxSide: 256,
        quality: 0.85,
        maxLength: 350_000,
      });
      onClearFeedback();
      onUpdateForm((p) => ({ ...p, logo_path: dataUrl }));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erreur chargement du logo.');
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold">Général &amp; société</h3>
        <FormTipsButton topicId="settings" label="Aide paramètres" />
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="col-span-2 flex items-center gap-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
          {form.logo_path ? (
            <img
              src={form.logo_path}
              alt={form.company_name || 'Logo dépôt'}
              className="h-14 w-14 rounded-lg border border-slate-200 dark:border-slate-700 bg-white object-contain p-1 shrink-0"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[#667085] shrink-0">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-medium text-[#182230] dark:text-slate-100">
              Logo du dépôt (documents imprimés)
            </div>
            <div className="text-[11px] text-[#667085] dark:text-slate-400">
              PNG, JPEG ou WebP · redimensionné automatiquement (max 256×256)
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
                Choisir un logo
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => handleLogoChange(e.target.files?.[0])}
                />
              </label>
              {form.logo_path && (
                <button
                  type="button"
                  onClick={() => onUpdateForm((p) => ({ ...p, logo_path: null }))}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[#DC4545] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <Trash2 className="h-3 w-3" />
                  Retirer
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="col-span-2">
          <label className="block font-medium">Nom commercial</label>
          <input
            type="text"
            value={form.company_name || ''}
            onChange={(e) => onUpdateForm((p) => ({ ...p, company_name: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
        </div>
        <div className="col-span-2">
          <label className="block font-medium">Raison sociale / En-tête légal</label>
          <input
            type="text"
            value={form.company_legal_name || ''}
            onChange={(e) => onUpdateForm((p) => ({ ...p, company_legal_name: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
        </div>
        <div>
          <label className="block font-medium">Téléphone</label>
          <input
            type="text"
            value={form.phone || ''}
            onChange={(e) => onUpdateForm((p) => ({ ...p, phone: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
        </div>
        <div>
          <label className="block font-medium">E-mail</label>
          <input
            type="email"
            value={form.email || ''}
            onChange={(e) => onUpdateForm((p) => ({ ...p, email: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
        </div>
        <div className="col-span-2">
          <label className="block font-medium">Adresse</label>
          <input
            type="text"
            value={form.address || ''}
            onChange={(e) => onUpdateForm((p) => ({ ...p, address: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
        </div>
        <div>
          <label className="block font-medium">Ville</label>
          <input
            type="text"
            value={form.city || ''}
            onChange={(e) => onUpdateForm((p) => ({ ...p, city: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
        </div>
        <div>
          <label className="block font-medium">Pays</label>
          <input
            type="text"
            value={form.country || ''}
            onChange={(e) => onUpdateForm((p) => ({ ...p, country: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
        </div>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
        <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-[#667085]">
          Documents &amp; numérotation
        </h4>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block font-medium">Ventes</label>
            <input
              type="text"
              value={form.sale_prefix || 'VTE'}
              onChange={(e) => onUpdateForm((p) => ({ ...p, sale_prefix: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
            />
          </div>
          <div>
            <label className="block font-medium">Factures</label>
            <input
              type="text"
              value={form.invoice_prefix || 'FAC'}
              onChange={(e) => onUpdateForm((p) => ({ ...p, invoice_prefix: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
            />
          </div>
          <div>
            <label className="block font-medium">Avoirs</label>
            <input
              type="text"
              value={form.credit_note_prefix || 'AVO'}
              onChange={(e) =>
                onUpdateForm((p) => ({ ...p, credit_note_prefix: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
            />
          </div>
          <div>
            <label className="block font-medium">Commandes</label>
            <input
              type="text"
              value={form.order_prefix || 'CMD'}
              onChange={(e) => onUpdateForm((p) => ({ ...p, order_prefix: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
            />
          </div>
          <div>
            <label className="block font-medium">Réceptions</label>
            <input
              type="text"
              value={form.receipt_prefix || 'REC'}
              onChange={(e) => onUpdateForm((p) => ({ ...p, receipt_prefix: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
            />
          </div>
          <div>
            <label className="block font-medium">Achats</label>
            <input
              type="text"
              value={form.purchase_prefix || 'ACH'}
              onChange={(e) => onUpdateForm((p) => ({ ...p, purchase_prefix: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4 text-xs">
        <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-[#667085]">
          Commercial, crédit &amp; affichage
        </h4>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Autoriser le stock négatif en vente</div>
            <div className="text-[#667085]">
              Décoché par défaut pour bloquer les ventes hors stock.
            </div>
          </div>
          <Switch.Root
            checked={Boolean(form.allow_negative_stock)}
            onCheckedChange={(checked) =>
              onUpdateForm((p) => ({ ...p, allow_negative_stock: checked ? 1 : 0 }))
            }
            className="relative h-5 w-9 rounded-full bg-slate-300 dark:bg-slate-700 data-[state=checked]:bg-[#2563EB] transition-colors"
          >
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
          </Switch.Root>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 px-3 py-2 text-[11px] text-[#667085] dark:text-slate-400">
          Politique crédit par défaut : aucune vente à crédit autorisée sans configuration explicite
          sur la fiche client (écran Clients).
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Mode sombre</div>
            <div className="text-[#667085]">
              Basculer entre le thème clair et le thème sombre.
            </div>
          </div>
          <Switch.Root
            checked={theme === 'dark'}
            onCheckedChange={(checked) => onSetTheme(checked ? 'dark' : 'light')}
            className="relative h-5 w-9 rounded-full bg-slate-300 dark:bg-slate-700 data-[state=checked]:bg-[#2563EB] transition-colors"
          >
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
          </Switch.Root>
        </div>

        <div className="col-span-2">
          <label className="block font-medium">Délai d'inactivité avant verrouillage (minutes)</label>
          <input
            type="number"
            min="1"
            max="120"
            value={form.inactivity_timeout_minutes ?? 10}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1 && val <= 120) {
                onUpdateForm((p) => ({ ...p, inactivity_timeout_minutes: val }));
              }
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
          <div className="mt-1 text-[11px] text-[#667085] dark:text-slate-400">
            Durée d'inactivité avant que l'application se verrouille automatiquement (1 à 120 minutes).
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={onSave}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          <Save className="h-3.5 w-3.5" />
          Enregistrer les paramètres
        </button>
      </div>
    </div>
  );
}