import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';

interface QuickClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  error: string | null;
  isPending: boolean;
  onSubmit: (values: {
    name: string;
    client_type: 'particulier' | 'professionnel';
    phone: string;
  }) => void;
}

export function QuickClientModal({
  open,
  onOpenChange,
  error,
  isPending,
  onSubmit,
}: QuickClientModalProps) {
  const [name, setName] = useState('');
  const [clientType, setClientType] = useState<'particulier' | 'professionnel'>('particulier');
  const [phone, setPhone] = useState('');

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setName('');
      setPhone('');
      setClientType('particulier');
    }
    onOpenChange(nextOpen);
  };

  return (
    <ModalDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Nouveau client rapide"
      maxWidthClass="max-w-sm"
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
            disabled={!name.trim() || isPending}
            onClick={() => onSubmit({ name, client_type: clientType, phone })}
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Créer &amp; sélectionner
          </button>
        </>
      }
    >
      <div className="mt-4 space-y-3 text-xs">
        <div>
          <label className="block font-medium">Nom complet / Enseigne *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Maquis Horizon"
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
        </div>
        <div>
          <label className="block font-medium">Type</label>
          <select
            value={clientType}
            onChange={(e) =>
              setClientType(e.target.value === 'professionnel' ? 'professionnel' : 'particulier')
            }
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          >
            <option value="particulier">Particulier</option>
            <option value="professionnel">Professionnel</option>
          </select>
        </div>
        <div>
          <label className="block font-medium">Téléphone</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+225 07..."
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
          />
        </div>
      </div>
    </ModalDialog>
  );
}
