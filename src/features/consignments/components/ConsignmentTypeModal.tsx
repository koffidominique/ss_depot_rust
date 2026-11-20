import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';

interface ConsignmentTypeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  error: string | null;
  isPending: boolean;
  onSubmit: (values: {
    code: string;
    name: string;
    producer: string;
    kind: 'bottle' | 'crate';
    deposit_value: number;
    initial_stock: number;
  }) => void;
}

export function ConsignmentTypeModal({
  open,
  onOpenChange,
  error,
  isPending,
  onSubmit,
}: ConsignmentTypeModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [producer, setProducer] = useState('SOLIBRA');
  const [kind, setKind] = useState<'bottle' | 'crate'>('bottle');
  const [depositValue, setDepositValue] = useState(150);
  const [initialStock, setInitialStock] = useState(0);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setCode('');
      setName('');
    }
    onOpenChange(next);
  };

  return (
    <ModalDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Nouvel emballage réutilisable"
      maxWidthClass="max-w-md"
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
            disabled={isPending}
            onClick={() =>
              onSubmit({
                code,
                name,
                producer,
                kind,
                deposit_value: depositValue,
                initial_stock: initialStock,
              })
            }
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white"
          >
            Créer
          </button>
        </>
      }
    >
      <div className="mt-4 space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-medium">Code *</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CAS-SOL-24"
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
            />
          </div>
          <div>
            <label className="block font-medium">Type *</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'bottle' | 'crate')}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
            >
              <option value="bottle">Bouteille verre</option>
              <option value="crate">Casier plastique</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block font-medium">Nom de l&apos;emballage *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Casier 24 alvéoles SOLIBRA"
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
        </div>
        <div>
          <label className="block font-medium">Producteur / Brasserie *</label>
          <input
            type="text"
            value={producer}
            onChange={(e) => setProducer(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MoneyInput label="Valeur retour emballage" value={depositValue} onChange={setDepositValue} />
          <div>
            <label className="block font-medium">Stock vides initial</label>
            <input
              type="number"
              min={0}
              value={initialStock}
              onChange={(e) =>
                setInitialStock(Math.max(0, Math.trunc(Number(e.target.value) || 0)))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num"
            />
          </div>
        </div>
      </div>
    </ModalDialog>
  );
}
