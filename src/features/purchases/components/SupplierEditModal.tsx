import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { InlineAlert } from '../../../components/common/InlineAlert.tsx';
import type { Supplier } from '../../../types/erp.ts';
import {
  editSupplierSchema,
  type EditSupplierValues,
} from '../utils/supplierSchemas.ts';

/* ============================================================================
 * Modale d'édition d'une fiche fournisseur existante
 * ============================================================================ */

function EditSupplierBody({
  supplier,
  errorMsg,
  isPending,
  onSubmit,
}: {
  supplier: Supplier;
  errorMsg: string | null;
  isPending: boolean;
  onSubmit: (id: number, values: EditSupplierValues) => void;
}) {
  const form = useForm<EditSupplierValues>({
    resolver: zodResolver(editSupplierSchema),
    defaultValues: {
      name: supplier.name,
      company_name: supplier.company_name || '',
      phone: supplier.phone,
      address: supplier.address || '',
      email: supplier.email || '',
      contact_person: supplier.contact_person || '',
      payment_terms_days: supplier.payment_terms_days ?? 30,
      is_active: supplier.is_active === 1,
    },
  });

  return (
    <>
      {errorMsg && <InlineAlert message={errorMsg} className="mt-3" />}
      <form
        onSubmit={form.handleSubmit((values) => onSubmit(supplier.id, values))}
        className="mt-4 grid grid-cols-2 gap-3"
      >
        <div className="col-span-2">
          <label className="block text-xs font-medium">Nom fournisseur *</label>
          <input
            aria-label="Nom fournisseur"
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
            aria-label="Raison sociale fournisseur"
            type="text"
            {...form.register('company_name')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">Téléphone *</label>
          <input
            aria-label="Téléphone fournisseur"
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
            aria-label="Adresse fournisseur"
            type="text"
            {...form.register('address')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">E-mail</label>
          <input
            aria-label="E-mail fournisseur"
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
            aria-label="Contact fournisseur"
            type="text"
            {...form.register('contact_person')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium">Délai de règlement (jours)</label>
          <input
            aria-label="Délai fournisseur"
            type="number"
            min={0}
            {...form.register('payment_terms_days', { valueAsNumber: true })}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
          />
        </div>
        <label className="col-span-2 flex items-center gap-2 text-xs font-medium cursor-pointer">
          <input
            type="checkbox"
            {...form.register('is_active')}
            className="rounded border-slate-300 text-[#2563EB]"
          />
          Fiche fournisseur active
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
    </>
  );
}

export function SupplierEditModal({
  supplier,
  onClose,
  errorMsg,
  isPending,
  onSubmit,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  errorMsg: string | null;
  isPending: boolean;
  onSubmit: (id: number, values: EditSupplierValues) => void;
}) {
  return (
    <ModalDialog
      open={Boolean(supplier)}
      onOpenChange={(o) => !o && onClose()}
      title={`Modifier fournisseur · ${supplier?.code ?? ''}`}
      maxWidthClass="max-w-lg"
    >
      {supplier && (
        <EditSupplierBody
          key={supplier.id}
          supplier={supplier}
          errorMsg={errorMsg}
          isPending={isPending}
          onSubmit={onSubmit}
        />
      )}
    </ModalDialog>
  );
}
