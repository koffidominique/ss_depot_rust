import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Switch from '@radix-ui/react-switch';
import { Image as ImageIcon, KeyRound, Plus, Save, Trash2, Users } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { useUiStore } from '../stores/uiStore.ts';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { AppSettings, UserAccount, UserRole } from '../types/erp.ts';
import { compressLocalImage } from '../utils/image.ts';

export function SettingsPage() {
  const qc = useQueryClient();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const [draft, setDraft] = useState<Partial<AppSettings>>({});
  const [newMethodLabel, setNewMethodLabel] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('cashier');
  const [newUserPin, setNewUserPin] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const { data: usersList } = useQuery<UserAccount[]>({
    queryKey: ['auth-users'],
    queryFn: async () => {
      if (typeof apiClient.listUsers !== 'function') return [];
      try {
        return await apiClient.listUsers();
      } catch {
        return [];
      }
    },
  });

  const form: Partial<AppSettings> = {
    ...(data?.settings || {}),
    ...draft,
  };

  const setForm = (updater: (prev: Partial<AppSettings>) => Partial<AppSettings>) => {
    setDraft((prev) => updater({ ...(data?.settings || {}), ...prev }));
  };

  const saveMut = useMutation({
    mutationFn: () =>
      apiClient.updateSettings({
        ...form,
        allow_negative_stock: Boolean(form.allow_negative_stock),
        logo_path: form.logo_path ?? null,
        setup_completed: true,
        theme,
      }),
    onSuccess: () => {
      setDraft({});
      qc.invalidateQueries({ queryKey: ['settings'] });
      setFeedback({ type: 'ok', text: 'Paramètres enregistrés avec succès.' });
    },
    onError: (err) =>
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur sauvegarde.' }),
  });

  const handleLogoChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await compressLocalImage(file, { maxSide: 256, quality: 0.85, maxLength: 350_000 });
      setFeedback(null);
      setForm((p) => ({ ...p, logo_path: dataUrl }));
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur chargement du logo.',
      });
    }
  };

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

  const createUserMut = useMutation({
    mutationFn: () =>
      apiClient.createUser({
        username: newUsername,
        displayName: newDisplayName,
        role: newUserRole,
        pin: newUserPin,
      }),
    onSuccess: (created) => {
      setNewUsername('');
      setNewDisplayName('');
      setNewUserPin('');
      qc.invalidateQueries({ queryKey: ['auth-users'] });
      setFeedback({
        type: 'ok',
        text: `Compte ${created.username} (${created.roleLabel}) créé avec succès.`,
      });
    },
    onError: (err) =>
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erreur création utilisateur.' }),
  });

  const toggleUserMut = useMutation({
    mutationFn: ({ userId, active }: { userId: number; active: boolean }) =>
      apiClient.toggleUser(userId, active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auth-users'] });
      setFeedback({ type: 'ok', text: 'Statut du compte mis à jour.' });
    },
    onError: (err) =>
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Action refusée.' }),
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
      {data.settings.setup_completed === 0 && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/30 px-4 py-3 text-xs font-medium text-[#182230] dark:text-slate-100">
          Première configuration : renseignez le nom commercial et les coordonnées de votre dépôt pour personnaliser vos documents imprimés et reçus PDF.
        </div>
      )}
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
        {/* Général, Commercial, Documents & Affichage */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold">Général & société</h3>
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
                      onClick={() => setForm((p) => ({ ...p, logo_path: null }))}
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
                onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
              />
            </div>
            <div className="col-span-2">
              <label className="block font-medium">Raison sociale / En-tête légal</label>
              <input
                type="text"
                value={form.company_legal_name || ''}
                onChange={(e) => setForm((p) => ({ ...p, company_legal_name: e.target.value }))}
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
              <label className="block font-medium">E-mail</label>
              <input
                type="email"
                value={form.email || ''}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
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
              <label className="block font-medium">Ville</label>
              <input
                type="text"
                value={form.city || ''}
                onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-medium">Pays</label>
              <input
                type="text"
                value={form.country || ''}
                onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
              />
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
            <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-[#667085]">
              Documents & numérotation
            </h4>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-medium">Ventes</label>
                <input
                  type="text"
                  value={form.sale_prefix || 'VTE'}
                  onChange={(e) => setForm((p) => ({ ...p, sale_prefix: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
                />
              </div>
              <div>
                <label className="block font-medium">Factures</label>
                <input
                  type="text"
                  value={form.invoice_prefix || 'FAC'}
                  onChange={(e) => setForm((p) => ({ ...p, invoice_prefix: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
                />
              </div>
              <div>
                <label className="block font-medium">Avoirs</label>
                <input
                  type="text"
                  value={form.credit_note_prefix || 'AVO'}
                  onChange={(e) => setForm((p) => ({ ...p, credit_note_prefix: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
                />
              </div>
              <div>
                <label className="block font-medium">Commandes</label>
                <input
                  type="text"
                  value={form.order_prefix || 'CMD'}
                  onChange={(e) => setForm((p) => ({ ...p, order_prefix: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
                />
              </div>
              <div>
                <label className="block font-medium">Réceptions</label>
                <input
                  type="text"
                  value={form.receipt_prefix || 'REC'}
                  onChange={(e) => setForm((p) => ({ ...p, receipt_prefix: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
                />
              </div>
              <div>
                <label className="block font-medium">Achats</label>
                <input
                  type="text"
                  value={form.purchase_prefix || 'ACH'}
                  onChange={(e) => setForm((p) => ({ ...p, purchase_prefix: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4 text-xs">
            <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-[#667085]">
              Commercial, crédit & affichage
            </h4>
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
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 px-3 py-2 text-[11px] text-[#667085] dark:text-slate-400">
              Politique crédit par défaut : aucune vente à crédit autorisée sans configuration explicite sur la fiche client (écran Clients).
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

          {/* Comptes & Rôles RBAC */}
          {usersList && usersList.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#2563EB]" />
                <h3 className="font-display text-sm font-semibold">Opérateurs & Rôles (RBAC)</h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {usersList.map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-2.5 gap-3">
                    <div>
                      <div className="font-medium">
                        {u.displayName}{' '}
                        <span className="font-mono-num text-[11px] text-[#667085]">(@{u.username})</span>
                      </div>
                      <div className="text-[11px] text-[#667085]">
                        {u.roleLabel} · {u.active ? 'Actif' : 'Désactivé'}
                      </div>
                    </div>
                    <Switch.Root
                      disabled={u.role === 'owner'}
                      checked={u.active}
                      onCheckedChange={(checked) =>
                        toggleUserMut.mutate({ userId: u.id, active: checked })
                      }
                      className="relative h-5 w-9 rounded-full bg-slate-300 dark:bg-slate-700 data-[state=checked]:bg-[#16A36A] disabled:opacity-60"
                    >
                      <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[18px]" />
                    </Switch.Root>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 grid grid-cols-2 gap-2.5 text-xs">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Identifiant (ex: caisse1)"
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                />
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Nom affiché"
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                />
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5"
                >
                  <option value="cashier">Caissier</option>
                  <option value="stock_manager">Magasinier</option>
                  <option value="manager">Gérant</option>
                  <option value="accountant">Comptable</option>
                  <option value="admin">Administrateur</option>
                </select>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={newUserPin}
                  onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="PIN 6 chiffres"
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
                />
                <button
                  type="button"
                  disabled={
                    !newUsername.trim() ||
                    !newDisplayName.trim() ||
                    newUserPin.length !== 6 ||
                    createUserMut.isPending
                  }
                  onClick={() => createUserMut.mutate()}
                  className="col-span-2 inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un compte opérateur
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
