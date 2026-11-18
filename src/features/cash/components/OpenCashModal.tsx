import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';

const openCashSchema = z.object({
  opening_cash: z.number().int().min(0, 'Le fond de caisse doit être positif ou nul.'),
});
type OpenCashFormValues = z.infer<typeof openCashSchema>;

interface OpenCashModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  error: string | null;
  isPending: boolean;
  onSubmit: (openingCash: number) => void;
}

export function OpenCashModal({
  open,
  onOpenChange,
  error,
  isPending,
  onSubmit,
}: OpenCashModalProps) {
  const form = useForm<OpenCashFormValues>({
    resolver: zodResolver(openCashSchema),
    defaultValues: { opening_cash: 0 },
  });

  useEffect(() => {
    if (open) form.reset({ opening_cash: 0 });
  }, [open, form]);

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ouvrir la caisse"
      tipsTopicId="cash"
      tipsLabel="Aide caisse"
      maxWidthClass="max-w-md"
      error={error}
    >
      <form onSubmit={form.handleSubmit((vals) => onSubmit(vals.opening_cash))} noValidate>
        <div className="mt-4">
          <Controller
            control={form.control}
            name="opening_cash"
            render={({ field, fieldState }) => (
              <MoneyInput
                label="Fond de caisse initial en espèces"
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
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
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Confirmer l&apos;ouverture
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
