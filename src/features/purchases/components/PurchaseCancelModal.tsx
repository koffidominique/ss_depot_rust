import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import type { PurchaseOrder } from '../../../types/erp.ts';

const cancelPoSchema = z.object({
  reason: z.string().trim().min(1, "Le motif d'annulation est obligatoire."),
});
export type CancelPoFormValues = z.infer<typeof cancelPoSchema>;

interface PurchaseCancelModalProps {
  target: PurchaseOrder | null;
  onClose: () => void;
  error: string | null;
  isPending: boolean;
  onSubmit: (values: { target: PurchaseOrder; reason: string }) => void;
}

export function PurchaseCancelModal({
  target,
  onClose,
  error,
  isPending,
  onSubmit,
}: PurchaseCancelModalProps) {
  const form = useForm<CancelPoFormValues>({
    resolver: zodResolver(cancelPoSchema),
    defaultValues: { reason: '' },
  });

  useEffect(() => {
    if (target) form.reset({ reason: '' });
  }, [target, form]);

  return (
    <ModalDialog
      open={Boolean(target)}
      onOpenChange={(o) => !o && onClose()}
      title={`Annuler la commande · ${target?.reference ?? ''}`}
      titleClassName="text-[#DC4545]"
      description="Cette commande n'a fait l'objet d'aucune réception. Son annulation la marquera définitivement comme annulée sans impact sur le stock."
      maxWidthClass="max-w-md"
      error={error}
    >
      <form
        onSubmit={form.handleSubmit((vals) => {
          if (!target) return;
          onSubmit({ target, reason: vals.reason });
        })}
        noValidate
      >
        <div className="mt-4">
          <label htmlFor="po-cancel-reason" className="block text-xs font-medium">
            Motif d&apos;annulation obligatoire *
          </label>
          <input
            id="po-cancel-reason"
            type="text"
            aria-invalid={Boolean(form.formState.errors.reason)}
            {...form.register('reason')}
            placeholder="Ex : Rupture fournisseur / doublon"
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          {form.formState.errors.reason && (
            <p className="mt-1 text-[11px] text-[#DC4545]" role="alert">
              {form.formState.errors.reason.message}
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Dialog.Close asChild>
            <button
              type="button"
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
            >
              Fermer
            </button>
          </Dialog.Close>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-[#DC4545] px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
          >
            Confirmer l&apos;annulation
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
