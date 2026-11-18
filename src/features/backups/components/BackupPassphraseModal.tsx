import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import type { PassphraseAction } from '../hooks/useBackupsData.ts';

interface BackupPassphraseModalProps {
  action: PassphraseAction;
  passphrase: string;
  onChangePassphrase: (value: string) => void;
  onClose: () => void;
  isBusy: boolean;
  onSubmit: () => void;
}

export function BackupPassphraseModal({
  action,
  passphrase,
  onChangePassphrase,
  onClose,
  isBusy,
  onSubmit,
}: BackupPassphraseModalProps) {
  const title = !action
    ? ''
    : action.mode === 'create'
      ? 'Créer une sauvegarde chiffrée (AES-256-GCM)'
      : action.mode === 'verify'
        ? `Vérifier ${action.name}`
        : `Restaurer ${action.name}`;

  const description = !action
    ? undefined
    : action.mode === 'create'
      ? 'Choisissez une phrase secrète robuste (minimum 8 caractères). Elle sera requise pour toute vérification ou restauration hors site.'
      : 'Saisissez la phrase secrète utilisée lors du chiffrement de cette archive .dpbkp.';

  return (
    <ModalDialog
      open={Boolean(action)}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      maxWidthClass="max-w-md"
      footer={
        <>
          <Dialog.Close asChild>
            <button
              type="button"
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Annuler
            </button>
          </Dialog.Close>
          <button
            type="button"
            disabled={isBusy || passphrase.trim().length < 8}
            onClick={onSubmit}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${
              action?.mode === 'restore'
                ? 'bg-[#DC4545] hover:bg-rose-700'
                : 'bg-[#2563EB] hover:bg-blue-700'
            }`}
          >
            {isBusy
              ? 'Traitement...'
              : action?.mode === 'create'
                ? 'Chiffrer et sauvegarder'
                : action?.mode === 'verify'
                  ? 'Déchiffrer et vérifier'
                  : 'Déchiffrer et restaurer'}
          </button>
        </>
      }
    >
      <div className="mt-4">
        <label htmlFor="backup-passphrase" className="block text-xs font-medium">
          Phrase secrète de chiffrement
        </label>
        <input
          id="backup-passphrase"
          type="password"
          value={passphrase}
          onChange={(e) => onChangePassphrase(e.target.value)}
          placeholder="Minimum 8 caractères"
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
        />
      </div>
    </ModalDialog>
  );
}
