import { useEffect, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import { formatFcfa } from '../../../utils/format.ts';

type CloseCashFormValues = {
  physical_cash: number;
  closing_notes: string;
};

interface CloseCashModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionReference?: string;
  theoreticalCash: number;
  digitalNet: number;
  error: string | null;
  isPending: boolean;
  onSubmit: (values: CloseCashFormValues) => void;
}

export function CloseCashModal({
  open,
  onOpenChange,
  sessionReference,
  theoreticalCash,
  digitalNet,
  error,
  isPending,
  onSubmit,
}: CloseCashModalProps) {
  const theoreticalCashRef = useRef(theoreticalCash);
  theoreticalCashRef.current = theoreticalCash;

  const schema = useRef(
    z
      .object({
        physical_cash: z.number().int().min(0, 'Le montant physique doit être positif ou nul.'),
        closing_notes: z.string(),
      })
      .superRefine((vals, ctx) => {
        if (vals.physical_cash !== theoreticalCashRef.current && !vals.closing_notes.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['closing_notes'],
            message:
              'Un commentaire justificatif est obligatoire lorsque la caisse présente un écart.',
          });
        }
      })
  ).current;

  const form = useForm<CloseCashFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { physical_cash: theoreticalCash, closing_notes: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({ physical_cash: theoreticalCash, closing_notes: '' });
    }
  }, [open, theoreticalCash, form]);

  const physicalCashWatched = form.watch('physical_cash');
  const diffPreview =
    Number.isSafeInteger(physicalCashWatched) && physicalCashWatched >= 0
      ? physicalCashWatched - theoreticalCash
      : 0;

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Clôture de caisse · ${sessionReference ?? ''}`}
      tipsTopicId="cash"
      tipsLabel="Règle clôture"
      maxWidthClass="max-w-md"
      error={error}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-[#667085]">Espèces théoriques attendues</span>
              <span className="font-mono-num font-semibold">{formatFcfa(theoreticalCash)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#667085]">Encaissements digitaux (contrôle)</span>
              <span className="font-mono-num">{formatFcfa(digitalNet)}</span>
            </div>
          </div>
          <Controller
            control={form.control}
            name="physical_cash"
            render={({ field, fieldState }) => (
              <MoneyInput
                label="Espèces physiques comptées *"
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          <div className="flex justify-between text-xs">
            <span className="text-[#667085]">Écart constaté</span>
            <span
              className={`font-mono-num font-semibold ${
                diffPreview === 0 ? 'text-[#16A36A]' : 'text-[#D9901A]'
              }`}
            >
              {diffPreview > 0 ? '+' : ''}
              {formatFcfa(diffPreview)}
            </span>
          </div>
          <div>
            <label htmlFor="cash-closing-notes" className="block text-xs font-medium">
              Commentaire de clôture{' '}
              {diffPreview !== 0 ? '(obligatoire car écart != 0) *' : '(optionnel)'}
            </label>
            <textarea
              id="cash-closing-notes"
              rows={2}
              aria-invalid={Boolean(form.formState.errors.closing_notes)}
              {...form.register('closing_notes')}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
            />
            {form.formState.errors.closing_notes && (
              <p className="mt-1 text-[11px] text-[#DC4545]" role="alert">
                {form.formState.errors.closing_notes.message}
              </p>
            )}
          </div>
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
            className="rounded-lg bg-[#182230] dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-50"
          >
            Clôturer définitivement
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
