import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';

interface ImportCsvModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  csvText: string;
  onChangeCsvText: (value: string) => void;
  error: string | null;
  isPending: boolean;
  onSubmit: () => void;
}

export function ImportCsvModal({
  open,
  onOpenChange,
  csvText,
  onChangeCsvText,
  error,
  isPending,
  onSubmit,
}: ImportCsvModalProps) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Importer des produits (CSV)"
      description="Colonnes attendues : name;base_unit;category;brand;barcode;stock;min_stock;purchase_price;retail_price"
      maxWidthClass="max-w-lg"
      error={error}
      footer={
        <>
          <Dialog.Close asChild>
            <button
              type="button"
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
            >
              Annuler
            </button>
          </Dialog.Close>
          <button
            type="button"
            disabled={!csvText.trim() || isPending}
            onClick={onSubmit}
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Lancer l&apos;import
          </button>
        </>
      }
    >
      <textarea
        rows={8}
        value={csvText}
        onChange={(e) => onChangeCsvText(e.target.value)}
        placeholder={'name;base_unit;category;stock;retail_price\nSprite 33cl;canette;Boissons gazeuses;120;450'}
        className="mt-3 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 font-mono-num text-xs"
      />
    </ModalDialog>
  );
}
