import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { InlineAlert } from '../../../components/common/InlineAlert.tsx';
import {
  createSupplierSchema,
  type CreateSupplierValues,
} from '../utils/supplierSchemas.ts';

/* ============================================================================
 * Modale de création d'un nouveau fournisseur
 * ============================================================================ */

function CreateSupplierBody({
  errorMsg,
  isPending,
  onSubmit,
}: {
  errorMsg: string | null;
  isPending: boolean;
  onSubmit: (values: CreateSupplierValues) => void;
}) {
  const form = useForm<CreateSupplierValues>({
    resolver: zodResolver(createSupplierSchema),
    defaultValues: {
      name: '',
      company_name: '',
      phone: '',
      address: '',
      email: '',
      contact_person: '',
      payment_terms_days: 30,
    },
  });

  return (
    <>
      {errorMsg && <InlineAlert message={errorMsg} className="mt-3" />}
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium">Nom fournisseur *</label>
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
          <label className="block text-xs font-medium">Raison sociale</label>
          <input
            type="text"
            {...form.register('company_name')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">Téléphone *</label>
          <input
            type="text"
            {...form.register('phone')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          {form.formState.errors.phone && (
            <p className="mt-1 text-xs text-[#DC4545]">{form.formState.errors.phone.message}</p>
          )}
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
        <div>
          <label className="block text-xs font-medium">Délai de règlement (jours)</label>
          <input
            type="number"
            min={0}
            {...form.register('payment_terms_days', { valueAsNumber: true })}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
          />
        </div>
        <div className="mt-5 flex justify-end gap-3 pt-2">
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
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white"
          >
            Enregistrer
          </button>
        </div>
      </form>
    </>
  );
}

export function SupplierCreateModal({
  open,
  onOpenChange,
  errorMsg,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorMsg: string | null;
  isPending: boolean;
  onSubmit: (values: CreateSupplierValues) => void;
}) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouveau fournisseur"
      tipsTopicId="suppliers"
      tipsLabel="Aide"
      maxWidthClass="max-w-md"
    >
      {open && (
        <CreateSupplierBody errorMsg={errorMsg} isPending={isPending} onSubmit={onSubmit} />
      )}
    </ModalDialog>
  );
}
