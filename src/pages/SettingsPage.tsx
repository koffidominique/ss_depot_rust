import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Switch from '@radix-ui/react-switch';
import { KeyRound, Plus, Save } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { useUiStore } from '../stores/uiStore.ts';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { AppSettings } from '../types/erp.ts';

export function SettingsPage() {
  const qc = useQueryClient();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const [form, setForm] = useState<Partial<AppSettings>>({});
  const [newMethodLabel, setNewMethodLabel] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  useEffect(() => {
    if (data?.settings) {
      setForm(data.settings);
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.updateSettings({
        ...form,
        theme,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setFeedback({ type: 'ok', text: 'Paramètres enregistrés avec succès.' });
    },
    onError: (err) =>
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur sauvegarde.' }),
  });

  const addMethodMut = useMutation({
    mutationFn: () => apiClient.addPaymentMethod(newMethodLabel),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setNewMethodLabel('');
      setFeedback({ type: 'ok', text: 'Moyen de paiement ajouté.' });
    },
    onError: (err) =>
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur ajout moyen.' }),
  });

  const toggleMethodMut = useMutation({
    mutationFn: ({ code, active }: { code: string; active: boolean }) =>
      apiClient.togglePaymentMethod(code, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
    onError: (err) =>
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Action refusée.' }),
  });

  const pinMut = useMutation({
    mutationFn: () => apiClient.changePin(currentPin, newPin),
    onSuccess: () => {
      setCurrentPin('');
      setNewPin('');
      setFeedback({ type: 'ok', text: 'Code PIN propriétaire mis à jour.' });
    },
    onError: (err) =>
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur changement PIN.' }),
  });

  if (isLoading) return <LoadingState rows={6} />;
  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Erreur chargement paramètres.'}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium ${
            feedback.type === 'ok'
              ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 text-[#16A36A]'
              : 'border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 text-[#DC4545]'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Entreprise & Préfixes */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold">Identité du dépôt & numérotation</h3>
            <FormTipsButton topicId="settings" label="Aide paramètres" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="col-span-2">
              <label className="block font-medium">Nom commercial</label>
              <input
                type="text"
                value={form.company_name || ''}
                onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-medium">Téléphone</label>
              <input
                type="text"
                value={form.phone || ''}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-medium">Ville</label>
              <input
                type="text"
                value={form.city || ''}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
              />
            </div>
            <div className="col-span-2">
              <label className="block font-medium">Adresse</label>
              <input
                type="text"
                value={form.address || ''}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-medium">Préfixe ventes</label>
              <input
                type="text"
                value={form.sale_prefix || 'VTE'}
                onChange={(e) => setForm((p) => ({ ...p, sale_prefix: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num"
              />
            </div>
            <div>
              <label className="block font-medium">Préfixe factures</label>
              <input
                type="text"
                value={form.invoice_prefix || 'FAC'}
                onChange={(e) => setForm((p) => ({ ...p, invoice_prefix: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num"
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Autoriser le stock négatif en vente</div>
                <div className="text-[#667085]">Décoché par défaut pour bloquer les ventes hors stock.</div>
              </div>
              <Switch.Root
                checked={Boolean(form.allow_negative_stock)}
                onCheckedChange={(checked) => setForm((p) => ({ ...p, allow_negative_stock: checked ? 1 : 0 }))}
                className="relative h-5 w-9 rounded-full bg-slate-300 dark:bg-slate-700 data-[state=checked]:bg-[#2563EB] transition-colors"
              >
                <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
              </Switch.Root>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Mode sombre</div>
                <div className="text-[#667085]">Basculer entre le thème clair et le thème sombre.</div>
              </div>
              <Switch.Root
                checked={theme === 'dark'}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                className="relative h-5 w-9 rounded-full bg-slate-300 dark:bg-slate-700 data-[state=checked]:bg-[#2563EB] transition-colors"
              >
                <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
              </Switch.Root>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Save className="h-3.5 w-3.5" />
              Enregistrer les paramètres
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Moyens de paiement versionnés */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4">
            <h3 className="font-display text-sm font-semibold">Moyens de paiement</h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {data.paymentMethods.map((pm) => (
                <div key={pm.code} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="font-medium">{pm.label}</div>
                    <div className="font-mono-num text-[11px] text-[#667085]">
                      {pm.code} · {pm.is_cash === 1 ? 'Espèces (non désactivable)' : 'Canal digital'}
                    </div>
                  </div>
                  <Switch.Root
                    disabled={pm.is_cash === 1}
                    checked={pm.active === 1}
                    onCheckedChange={(checked) => toggleMethodMut.mutate({ code: pm.code, active: checked })}
                    className="relative h-5 w-9 rounded-full bg-slate-300 dark:bg-slate-700 data-[state=checked]:bg-[#16A36A] disabled:opacity-60"
                  >
                    <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
                  </Switch.Root>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <input
                type="text"
                value={newMethodLabel}
                onChange={(e) => setNewMethodLabel(e.target.value)}
                placeholder="Ex : Moov Money, Djamo..."
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs"
              />
              <button
                type="button"
                disabled={!newMethodLabel.trim() || addMethodMut.isPending}
                onClick={() => addMethodMut.mutate()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </button>
            </div>
          </div>

          {/* Sécurité Code PIN */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#2563EB]" />
              <h3 className="font-display text-sm font-semibold">Sécurité · Code PIN propriétaire</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium">PIN actuel (6 chiffres)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num"
                />
              </div>
              <div>
                <label className="block font-medium">Nouveau PIN (6 chiffres)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={currentPin.length !== 6 || newPin.length !== 6 || pinMut.isPending}
                onClick={() => pinMut.mutate()}
                className="rounded-lg bg-[#182230] dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-40"
              >
                Modifier le code PIN
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
