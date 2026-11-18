import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';

interface InventoryCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onCreate: (notes: string) => void;
}

export function InventoryCreateModal({
  open,
  onOpenChange,
  isPending,
  onCreate,
}: InventoryCreateModalProps) {
  const [createNotes, setCreateNotes] = useState('');

  return (
    <ModalDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setCreateNotes('');
        onOpenChange(o);
      }}
      title="Démarrer un inventaire physique"
      description="Un instantané du stock théorique de tous les produits actifs sera préparé en brouillon."
      maxWidthClass="max-w-md"
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
            disabled={isPending}
            onClick={() => onCreate(createNotes)}
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Créer le brouillon
          </button>
        </>
      }
    >
      <div className="mt-4">
        <label className="block text-xs font-medium">Notes d&apos;inventaire (optionnel)</label>
        <input
          type="text"
          value={createNotes}
          onChange={(e) => setCreateNotes(e.target.value)}
          placeholder="Ex : Inventaire mensuel entrepôt principal"
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
      </div>
    </ModalDialog>
  );
}
