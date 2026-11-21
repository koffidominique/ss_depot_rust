import { useRef, useState } from 'react';
import { DatabaseBackup, Lock, Upload } from 'lucide-react';
import { ConfirmationDialog } from '../components/common/ConfirmationDialog.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { InlineAlert } from '../components/common/InlineAlert.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import {
  useBackupsMutations,
  useBackupsQuery,
  useLocalDbStatusQuery,
  type PassphraseAction,
} from '../features/backups/hooks/useBackupsData.ts';
import { BackupsTable } from '../features/backups/components/BackupsTable.tsx';
import { BackupPassphraseModal } from '../features/backups/components/BackupPassphraseModal.tsx';
import { LocalDbStatusCard } from '../features/backups/components/LocalDbStatusCard.tsx';

export function BackupsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [passphraseAction, setPassphraseAction] = useState<PassphraseAction>(null);
  const [passphrase, setPassphrase] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { data: backups, isLoading, error, refetch } = useBackupsQuery();
  const localDbQuery = useLocalDbStatusQuery();

  const { createMut, createEncMut, importMut, verifyMut, restoreMut, downloadBackupFile } =
    useBackupsMutations({
      onStatus: setStatusMsg,
      onClearPassphraseModal: () => {
        setPassphraseAction(null);
        setPassphrase('');
      },
      onClearRestoreTarget: () => setRestoreTarget(null),
    });

  const handleFileImport = async (file: File | undefined) => {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    importMut.mutate({ filename: file.name, bytes: new Uint8Array(buffer) });
  };

  const handlePassphraseSubmit = () => {
    if (!passphraseAction) return;
    if (passphraseAction.mode === 'create') {
      createEncMut.mutate(passphrase);
    } else if (passphraseAction.mode === 'verify') {
      verifyMut.mutate({ name: passphraseAction.name, secret: passphrase });
    } else if (passphraseAction.mode === 'restore') {
      restoreMut.mutate({ name: passphraseAction.name, secret: passphrase });
    }
  };

  const isEncryptedBusy =
    createEncMut.isPending || verifyMut.isPending || restoreMut.isPending;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
        <div>
          <h2 className="font-display text-sm font-semibold">
            Sauvegardes SQLite cohérentes (VACUUM INTO)
          </h2>
          <p className="mt-1 text-xs text-[#667085] dark:text-slate-400">
            Chaque sauvegarde consolide le journal WAL, exécute PRAGMA integrity_check, conserve
            les 30 dernières archives et peut être chiffrée en AES-256-GCM (.dpbkp).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <FormTipsButton topicId="backups" label="Aide sauvegarde" />
          <input
            ref={fileInputRef}
            type="file"
            accept=".db,.dpbkp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              void handleFileImport(f);
            }}
          />
          <button
            type="button"
            disabled={importMut.isPending}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-[#182230] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
            Importer (.db / .dpbkp)
          </button>
          <button
            type="button"
            disabled={createEncMut.isPending}
            onClick={() => {
              setPassphrase('');
              setPassphraseAction({ mode: 'create' });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-[#182230] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Lock className="h-3.5 w-3.5 text-amber-600" />
            Sauvegarde chiffrée
          </button>
          <button
            type="button"
            disabled={createMut.isPending}
            onClick={() => createMut.mutate()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <DatabaseBackup className="h-4 w-4" />
            Créer une sauvegarde maintenant
          </button>
        </div>
      </div>

      <LocalDbStatusCard
        status={localDbQuery.data}
        isFetching={localDbQuery.isFetching}
        onRefreshIntegrity={() => void localDbQuery.refetch()}
      />

      {statusMsg && (
        <InlineAlert
          variant={statusMsg.type === 'ok' ? 'success' : 'error'}
          message={statusMsg.text}
          onDismiss={() => setStatusMsg(null)}
        />
      )}

      {isLoading ? (
        <LoadingState />
      ) : error || !backups ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Erreur chargement sauvegardes.'}
          onRetry={() => refetch()}
        />
      ) : (
        <BackupsTable
          backups={backups}
          onVerify={(name, isEnc) =>
            isEnc
              ? (setPassphrase(''), setPassphraseAction({ mode: 'verify', name }))
              : verifyMut.mutate({ name })
          }
          onDownload={(name) => void downloadBackupFile(name)}
          onRestore={(name, isEnc) =>
            isEnc
              ? (setPassphrase(''), setPassphraseAction({ mode: 'restore', name }))
              : setRestoreTarget(name)
          }
        />
      )}

      <ConfirmationDialog
        open={Boolean(restoreTarget)}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title="Confirmer la restauration contrôlée"
        description={`Vous allez restaurer la base active à partir de "${restoreTarget}". Une sauvegarde automatique de l'état actuel sera créée juste avant le remplacement.`}
        confirmLabel="Restaurer cette sauvegarde"
        destructive
        loading={restoreMut.isPending}
        onConfirm={() => restoreTarget && restoreMut.mutate({ name: restoreTarget })}
      />

      <BackupPassphraseModal
        action={passphraseAction}
        passphrase={passphrase}
        onChangePassphrase={setPassphrase}
        onClose={() => {
          setPassphraseAction(null);
          setPassphrase('');
        }}
        isBusy={isEncryptedBusy}
        onSubmit={handlePassphraseSubmit}
      />
    </div>
  );
}
