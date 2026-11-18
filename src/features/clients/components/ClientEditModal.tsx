import type { UseFormReturn } from 'react-hook-form';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import type { Client } from '../../../types/erp.ts';
import type { EditClientValues } from '../utils/clientSchemas.ts';

interface ClientEditModalProps {
  target: Client | null;
  onClose: () => void;
  form: UseFormReturn<EditClientValues>;
  error: string | null;
  isPending: boolean;
  onSubmit: (values: EditClientValues) => void;
}

export function ClientEditModal({
  target,
  onClose,
  form,
  error,
  isPending,
  onSubmit,
}: ClientEditModalProps) {
  return (
    <ModalDialog
      open={Boolean(target)}
      onOpenChange={(o) => !o && onClose()}
      title={`Modifier client · ${target?.code ?? ''}`}
      maxWidthClass="max-w-lg"
      error={error}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium">Nom ou raison sociale *</label>
          <input
            aria-label="Nom du client"
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
            aria-label="Type client"
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
            aria-label="Téléphone client"
            type="text"
            {...form.register('phone')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">Adresse</label>
          <input
            aria-label="Adresse client"
            type="text"
            {...form.register('address')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">Ville</label>
          <input
            aria-label="Ville client"
            type="text"
            {...form.register('city')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">E-mail</label>
          <input
            aria-label="E-mail client"
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
            aria-label="Contact client"
            type="text"
            {...form.register('contact_person')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <label className="col-span-2 flex items-center gap-2 text-xs font-medium cursor-pointer">
          <input
            type="checkbox"
            {...form.register('is_active')}
            className="rounded border-slate-300 text-[#2563EB]"
          />
          Fiche client active
        </label>
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
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
