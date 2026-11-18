import { Controller, type UseFormReturn } from 'react-hook-form';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import type { CreateClientValues } from '../utils/clientSchemas.ts';

interface ClientCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<CreateClientValues>;
  error: string | null;
  isPending: boolean;
  onSubmit: (values: CreateClientValues) => void;
}

export function ClientCreateModal({
  open,
  onOpenChange,
  form,
  error,
  isPending,
  onSubmit,
}: ClientCreateModalProps) {
  const watchPolicy = form.watch('credit_policy');

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouveau client"
      tipsTopicId="clients"
      tipsLabel="Règles crédit"
      maxWidthClass="max-w-lg"
      scrollable
      error={error}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium">Nom ou raison sociale *</label>
          <input
            type="text"
            {...form.register('name')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          {form.formState.errors.name && (
            <p className="mt-1 text-xs text-[#DC4545]">{form.formState.errors.name.message}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium">Type</label>
          <select
            {...form.register('client_type')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="particulier">Particulier</option>
            <option value="professionnel">Professionnel (Maquis / Hôtel / Bar)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium">Téléphone</label>
          <input
            type="text"
            {...form.register('phone')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">Adresse</label>
          <input
            type="text"
            {...form.register('address')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">Ville</label>
          <input
            type="text"
            {...form.register('city')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">E-mail</label>
          <input
            type="email"
            {...form.register('email')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          {form.formState.errors.email && (
            <p className="mt-1 text-xs text-[#DC4545]">{form.formState.errors.email.message}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium">Interlocuteur / Contact</label>
          <input
            type="text"
            {...form.register('contact_person')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2 border-t border-slate-200 dark:border-slate-800 pt-3">
          <label className="block text-xs font-medium">Politique de crédit explicite</label>
          <select
            {...form.register('credit_policy')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="forbidden">Crédit interdit (Comptant uniquement)</option>
            <option value="limited">Plafond limité</option>
            <option value="unlimited">Crédit illimité autorisé</option>
          </select>
        </div>
        {watchPolicy === 'limited' && (
          <div>
            <Controller
              name="credit_limit"
              control={form.control}
              render={({ field }) => (
                <MoneyInput label="Plafond autorisé" value={field.value} onChange={field.onChange} />
              )}
            />
            {form.formState.errors.credit_limit && (
              <p className="mt-1 text-xs text-[#DC4545]">
                {form.formState.errors.credit_limit.message}
              </p>
            )}
          </div>
        )}
        {watchPolicy !== 'forbidden' && (
          <div>
            <label className="block text-xs font-medium">Échéance (jours)</label>
            <input
              type="number"
              min={0}
              {...form.register('payment_terms_days', { valueAsNumber: true })}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
            />
          </div>
        )}
        <div className="col-span-2 mt-2 flex justify-end gap-3">
          <Dialog.Close asChild>
            <button
              type="button"
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
            >
              Annuler
            </button>
          </Dialog.Close>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Créer le client
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
