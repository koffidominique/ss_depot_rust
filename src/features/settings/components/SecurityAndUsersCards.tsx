import * as Switch from '@radix-ui/react-switch';
import { KeyRound, Plus, Users } from 'lucide-react';
import type { PaymentMethodConfig, UserAccount, UserRole } from '../../../types/erp.ts';

export function PaymentMethodsCard({
  paymentMethods,
  newMethodLabel,
  onChangeNewLabel,
  onToggleMethod,
  onAddMethod,
  isAdding,
}: {
  paymentMethods: PaymentMethodConfig[];
  newMethodLabel: string;
  onChangeNewLabel: (value: string) => void;
  onToggleMethod: (code: string, active: boolean) => void;
  onAddMethod: () => void;
  isAdding: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface p-5 space-y-4">
      <h3 className="font-display text-sm font-semibold">Moyens de paiement</h3>
      <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
        {paymentMethods.map((pm) => (
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
              onCheckedChange={(checked) => onToggleMethod(pm.code, checked)}
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
          onChange={(e) => onChangeNewLabel(e.target.value)}
          placeholder="Ex : Moov Money, Djamo..."
          className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={!newMethodLabel.trim() || isAdding}
          onClick={onAddMethod}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </button>
      </div>
    </div>
  );
}

export function PinSecurityCard({
  currentPin,
  newPin,
  onChangeCurrentPin,
  onChangeNewPin,
  onSubmit,
  isPending,
}: {
  currentPin: string;
  newPin: string;
  onChangeCurrentPin: (value: string) => void;
  onChangeNewPin: (value: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface p-5 space-y-4">
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
            onChange={(e) => onChangeCurrentPin(e.target.value.replace(/\D/g, ''))}
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
            onChange={(e) => onChangeNewPin(e.target.value.replace(/\D/g, ''))}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          disabled={currentPin.length !== 6 || newPin.length !== 6 || isPending}
          onClick={onSubmit}
          className="rounded-lg bg-[#182230] dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-40"
        >
          Modifier le code PIN
        </button>
      </div>
    </div>
  );
}

export function UsersRbacCard({
  usersList,
  newUsername,
  newDisplayName,
  newUserRole,
  newUserPin,
  onChangeUsername,
  onChangeDisplayName,
  onChangeRole,
  onChangePin,
  onToggleUser,
  onCreateUser,
  isCreating,
}: {
  usersList: UserAccount[];
  newUsername: string;
  newDisplayName: string;
  newUserRole: UserRole;
  newUserPin: string;
  onChangeUsername: (v: string) => void;
  onChangeDisplayName: (v: string) => void;
  onChangeRole: (v: UserRole) => void;
  onChangePin: (v: string) => void;
  onToggleUser: (userId: number, active: boolean) => void;
  onCreateUser: () => void;
  isCreating: boolean;
}) {
  if (usersList.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-[#2563EB]" />
        <h3 className="font-display text-sm font-semibold">Opérateurs &amp; Rôles (RBAC)</h3>
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
              onCheckedChange={(checked) => onToggleUser(u.id, checked)}
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
          onChange={(e) => onChangeUsername(e.target.value)}
          placeholder="Identifiant (ex: caisse1)"
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5"
        />
        <input
          type="text"
          value={newDisplayName}
          onChange={(e) => onChangeDisplayName(e.target.value)}
          placeholder="Nom affiché"
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5"
        />
        <select
          value={newUserRole}
          onChange={(e) => onChangeRole(e.target.value as UserRole)}
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
          onChange={(e) => onChangePin(e.target.value.replace(/\D/g, ''))}
          placeholder="PIN 6 chiffres"
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num"
        />
        <button
          type="button"
          disabled={
            !newUsername.trim() ||
            !newDisplayName.trim() ||
            newUserPin.length !== 6 ||
            isCreating
          }
          onClick={onCreateUser}
          className="col-span-2 inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un compte opérateur
        </button>
      </div>
    </div>
  );
}
