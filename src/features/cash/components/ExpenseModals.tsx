import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as Dialog from '@radix-ui/react-dialog';
import { Image as ImageIcon, Trash2 } from 'lucide-react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { InlineAlert } from '../../../components/common/InlineAlert.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import type { ExpenseItem, PaymentMethodConfig } from '../../../types/erp.ts';
import { compressLocalImage } from '../../../utils/image.ts';
import { formatFcfa } from '../../../utils/format.ts';
import { expenseSchema, type ExpenseFormValues } from '../hooks/useExpensesData.ts';

function ExpenseCreateBody({
  categories,
  activeMethods,
  errorMsg,
  onSetError,
  isPending,
  onSubmit,
}: {
  categories: Array<{ id: number; name: string }>;
  activeMethods: PaymentMethodConfig[];
  errorMsg: string | null;
  onSetError: (msg: string | null) => void;
  isPending: boolean;
  onSubmit: (values: ExpenseFormValues) => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      category: categories[0]?.name || 'Frais généraux',
      amount: 0,
      method_code: activeMethods[0]?.code || 'cash',
      beneficiary: '',
      notes: '',
      receipt_path: null,
    },
  });

  const currentReceipt = watch('receipt_path');

  const handleReceiptFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await compressLocalImage(file, { maxSide: 512, quality: 0.82 });
      onSetError(null);
      setValue('receipt_path', dataUrl, { shouldDirty: true });
    } catch (err) {
      onSetError(err instanceof Error ? err.message : 'Erreur chargement justificatif.');
    }
  };

  return (
    <>
      {errorMsg && <InlineAlert message={errorMsg} className="mt-3" />}
      <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3 text-xs">
        <div>
          <label className="block font-medium">Catégorie *</label>
          <select
            aria-label="Catégorie dépense"
            {...register('category')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
            {categories.length === 0 && <option value="Frais généraux">Frais généraux</option>}
          </select>
          {errors.category && <p className="mt-1 text-[#DC4545]">{errors.category.message}</p>}
        </div>

        <div>
          <Controller
            name="amount"
            control={control}
            render={({ field }) => (
              <MoneyInput
                label="Montant de la dépense *"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
          {errors.amount && <p className="mt-1 text-[#DC4545]">{errors.amount.message}</p>}
        </div>

        <div>
          <label className="block font-medium">Moyen de décaissement *</label>
          <select
            aria-label="Moyen de décaissement"
            {...register('method_code')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          >
            {activeMethods.map((m) => (
              <option key={m.code} value={m.code}>
                {m.label}
              </option>
            ))}
            {activeMethods.length === 0 && <option value="cash">Espèces</option>}
          </select>
          {errors.method_code && (
            <p className="mt-1 text-[#DC4545]">{errors.method_code.message}</p>
          )}
        </div>

        <div>
          <label className="block font-medium">Bénéficiaire (optionnel)</label>
          <input
            aria-label="Bénéficiaire dépense"
            type="text"
            {...register('beneficiary')}
            placeholder="Ex : Chauffeur, CIE, Propriétaire"
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
        </div>

        <div>
          <label className="block font-medium">Notes / Justificatif</label>
          <input
            aria-label="Notes dépense"
            type="text"
            {...register('notes')}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {currentReceipt ? (
                <img
                  src={currentReceipt}
                  alt="Justificatif dépense"
                  className="h-12 w-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-white object-cover shrink-0"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[#667085] shrink-0">
                  <ImageIcon className="h-4 w-4" />
                </div>
              )}
              <div>
                <div className="font-medium text-[#182230] dark:text-slate-100">
                  Photo du reçu / justificatif
                </div>
                <div className="text-[11px] text-[#667085] dark:text-slate-400">
                  PNG, JPEG ou WebP · stocké hors-ligne
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="cursor-pointer rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
                Joindre reçu
                <input
                  aria-label="Joindre un justificatif"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => handleReceiptFile(e.target.files?.[0])}
                />
              </label>
              {currentReceipt && (
                <button
                  type="button"
                  onClick={() => setValue('receipt_path', null)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[#DC4545] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <Trash2 className="h-3 w-3" />
                  Retirer
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 pt-2">
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
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            Valider la dépense
          </button>
        </div>
      </form>
    </>
  );
}

export function ExpenseCreateModal({
  open,
  onOpenChange,
  categories,
  activeMethods,
  errorMsg,
  onSetError,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Array<{ id: number; name: string }>;
  activeMethods: PaymentMethodConfig[];
  errorMsg: string | null;
  onSetError: (msg: string | null) => void;
  isPending: boolean;
  onSubmit: (values: ExpenseFormValues) => void;
}) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Enregistrer une dépense"
      tipsTopicId="expenses"
      tipsLabel="Aide dépense"
      maxWidthClass="max-w-md"
    >
      {open && (
        <ExpenseCreateBody
          categories={categories}
          activeMethods={activeMethods}
          errorMsg={errorMsg}
          onSetError={onSetError}
          isPending={isPending}
          onSubmit={onSubmit}
        />
      )}
    </ModalDialog>
  );
}

export function ExpenseReceiptModal({
  item,
  onClose,
}: {
  item: ExpenseItem | null;
  onClose: () => void;
}) {
  return (
    <ModalDialog
      open={Boolean(item)}
      onOpenChange={(o) => !o && onClose()}
      title={`Justificatif · ${item?.reference ?? ''}`}
      description={
        item
          ? `${item.category} · ${formatFcfa(item.amount)}${item.beneficiary ? ` · ${item.beneficiary}` : ''}`
          : undefined
      }
      maxWidthClass="max-w-lg"
    >
      {item?.receipt_path && (
        <img
          src={item.receipt_path}
          alt={`Reçu ${item.reference}`}
          className="mt-4 w-full max-h-[65vh] rounded-lg border border-slate-200 dark:border-slate-800 object-contain bg-slate-50 dark:bg-slate-900"
        />
      )}
    </ModalDialog>
  );
}
