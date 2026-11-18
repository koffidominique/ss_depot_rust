import type { UseFormReturn } from 'react-hook-form';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import type { CategoryFormValues } from '../utils/productSchemas.ts';

interface CategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<CategoryFormValues>;
  error: string | null;
  isPending: boolean;
  onSubmit: (values: CategoryFormValues) => void;
}

export function CategoryModal({
  open,
  onOpenChange,
  form,
  error,
  isPending,
  onSubmit,
}: CategoryModalProps) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvelle catégorie produit"
      maxWidthClass="max-w-md"
      error={error}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="mt-4 space-y-3 text-xs">
          <div>
            <label htmlFor="category-name" className="block font-medium">
              Nom de la catégorie *
            </label>
            <input
              id="category-name"
              type="text"
              aria-invalid={Boolean(form.formState.errors.name)}
              {...form.register('name')}
              placeholder="Ex : Jus & Nectars"
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
            {form.formState.errors.name && (
              <p className="mt-1 text-[11px] text-[#DC4545]" role="alert">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="category-desc" className="block font-medium">
              Description (optionnelle)
            </label>
            <input
              id="category-desc"
              type="text"
              {...form.register('description')}
              placeholder="Conditionnements et formats associés"
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
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
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Créer la catégorie
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
