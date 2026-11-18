import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, DatabaseBackup, Download, Lock, RotateCcw, ShieldCheck } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { DataTable } from '../components/tables/DataTable.tsx';
import { ConfirmationDialog } from '../components/common/ConfirmationDialog.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { BackupFile } from '../types/erp.ts';
import { formatBytes, formatDateTime } from '../utils/format.ts';

type PassphraseAction =
  | { mode: 'create' }
  | { mode: 'verify'; name: string }
  | { mode: 'restore'; name: string }
  | null;

export function BackupsPage() {
  const qc = useQueryClient();
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [passphraseAction, setPassphraseAction] = useState<PassphraseAction>(null);
  const [passphrase, setPassphrase] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { data: backups, isLoading, error, refetch } = useQuery({
    queryKey: ['backups'],
    queryFn: () => apiClient.listBackups(),
  });

  const createMut = useMutation({
    mutationFn: () => apiClient.createBackup(),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      setStatusMsg({
        type: 'ok',
        text: `Sauvegarde cohérente créée et vérifiée : ${created.name}`,
      });
    },
    onError: (err) =>
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Erreur sauvegarde.' }),
  });

  const createEncMut = useMutation({
    mutationFn: (secret: string) => apiClient.createEncryptedBackup(secret),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      setPassphraseAction(null);
      setPassphrase('');
      setStatusMsg({
        type: 'ok',
        text: `Sauvegarde chiffrée AES-256-GCM créée : ${created.name}`,
      });
    },
    onError: (err) =>
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Erreur sauvegarde chiffrée.' }),
  });

  const verifyMut = useMutation({
    mutationFn: (args: { name: string; secret?: string }) =>
      args.secret !== undefined
        ? apiClient.verifyEncryptedBackup(args.name, args.secret)
        : apiClient.verifyBackup(args.name),
    onSuccess: (res) => {
      setPassphraseAction(null);
      setPassphrase('');
      const ok = res.integrity === 'ok' && res.foreignKeyErrors === 0 && res.compatible !== false;
      const hashHint = res.sha256 ? `, SHA-256 ${res.sha256.slice(0, 12)}…` : '';
      setStatusMsg({
        type: ok ? 'ok' : 'err',
        text: ok
          ? `Vérification ${res.name} (lecture seule) : intégrité=${res.integrity}, erreurs FK=${res.foreignKeyErrors}, schéma v${res.schemaVersion}${hashHint}, compatible.`
          : `Sauvegarde ${res.name} incompatible : ${res.compatibilityReason || `intégrité=${res.integrity}, FK=${res.foreignKeyErrors}`}`,
      });
    },
    onError: (err) =>
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Erreur vérification.' }),
  });

  const restoreMut = useMutation({
    mutationFn: (args: { name: string; secret?: string }) =>
      args.secret !== undefined
        ? apiClient.restoreEncryptedBackup(args.name, args.secret)
        : apiClient.restoreBackup(args.name),
    onSuccess: (res) => {
      qc.invalidateQueries();
      setRestoreTarget(null);
      setPassphraseAction(null);
      setPassphrase('');
      const safetyHint = res.safetyBackup ? `sauvegarde sécurité : ${res.safetyBackup}` : 'pré-sauvegarde de sécurité conservée';
      const summaryHint = res.counts
        ? `, ${res.counts.products} produit(s), ${res.counts.sales} vente(s)`
        : '';
      setStatusMsg({
        type: 'ok',
        text: `Base restaurée depuis ${res.restored} (${safetyHint}${summaryHint}).`,
      });
    },
    onError: (err) => {
      setRestoreTarget(null);
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : 'Erreur restauration.' });
    },
  });

  const handleDownload = async (name: string) => {
    try {
      const bytes = await apiClient.downloadBackup(name);
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur téléchargement.',
      });
    }
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

  const isEncryptedBusy = createEncMut.isPending || verifyMut.isPending || restoreMut.isPending;

  const columns: ColumnDef<BackupFile>[] = [
    {
      accessorKey: 'name',
      header: 'Archive SQLite',
      cell: ({ row }) => {
        const isEnc = Boolean(row.original.encrypted || row.original.name.endsWith('.dpbkp'));
        return (
          <div className="flex items-center gap-2">
            <span className="font-mono-num text-xs font-semibold">{row.original.name}</span>
            {isEnc && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                <Lock className="h-2.5 w-2.5" />
                AES-256
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Date de création',
      cell: ({ row }) => <span className="font-mono-num text-xs">{formatDateTime(row.original.createdAt)}</span>,
    },
    {
      accessorKey: 'size',
      header: 'Taille',
      cell: ({ row }) => <span className="font-mono-num text-xs">{formatBytes(row.original.size)}</span>,
    },
    {
      accessorKey: 'sha256',
      header: 'SHA-256',
      cell: ({ row }) => (
        <span className="font-mono-num text-xs text-[#667085] dark:text-slate-400">
          {row.original.sha256 ? `${row.original.sha256.slice(0, 12)}…` : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const isEnc = Boolean(row.original.encrypted || row.original.name.endsWith('.dpbkp'));
        return (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                isEnc
                  ? (setPassphrase(''), setPassphraseAction({ mode: 'verify', name: row.original.name }))
                  : verifyMut.mutate({ name: row.original.name })
              }
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[#16A36A]" />
              Vérifier
            </button>
            <button
              type="button"
              onClick={() => handleDownload(row.original.name)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              Exporter
            </button>
            <button
              type="button"
              onClick={() =>
                isEnc
                  ? (setPassphrase(''), setPassphraseAction({ mode: 'restore', name: row.original.name }))
                  : setRestoreTarget(row.original.name)
              }
              className="inline-flex items-center gap-1 rounded-md border border-rose-200 dark:border-rose-900/60 px-2.5 py-1 text-xs font-medium text-[#DC4545] hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurer
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
        <div>
          <h2 className="font-display text-sm font-semibold">Sauvegardes SQLite cohérentes (VACUUM INTO)</h2>
          <p className="mt-1 text-xs text-[#667085] dark:text-slate-400">
            Chaque sauvegarde consolide le journal WAL, exécute PRAGMA integrity_check, conserve les 30 dernières archives et peut être chiffrée en AES-256-GCM (.dpbkp).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <FormTipsButton topicId="backups" label="Aide sauvegarde" />
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

      {statusMsg && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-medium ${
            statusMsg.type === 'ok'
              ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 text-[#16A36A]'
              : 'border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 text-[#DC4545]'
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMsg.text}</span>
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : error || !backups ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Erreur chargement sauvegardes.'}
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable
          data={backups}
          columns={columns as ColumnDef<BackupFile, unknown>[]}
          emptyMessage="Aucune sauvegarde créée pour le moment."
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

      {passphraseAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-600" />
              <h3 className="font-display text-sm font-semibold">
                {passphraseAction.mode === 'create'
                  ? 'Créer une sauvegarde chiffrée (AES-256-GCM)'
                  : passphraseAction.mode === 'verify'
                    ? `Vérifier ${passphraseAction.name}`
                    : `Restaurer ${passphraseAction.name}`}
              </h3>
            </div>
            <p className="text-xs text-[#667085] dark:text-slate-400">
              {passphraseAction.mode === 'create'
                ? 'Choisissez une phrase secrète robuste (minimum 8 caractères). Elle sera requise pour toute vérification ou restauration hors site.'
                : 'Saisissez la phrase secrète utilisée lors du chiffrement de cette archive .dpbkp.'}
            </p>
            <div>
              <label htmlFor="backup-passphrase" className="block text-xs font-medium">
                Phrase secrète de chiffrement
              </label>
              <input
                id="backup-passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Minimum 8 caractères"
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPassphraseAction(null);
                  setPassphrase('');
                }}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isEncryptedBusy || passphrase.trim().length < 8}
                onClick={handlePassphraseSubmit}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${
                  passphraseAction.mode === 'restore'
                    ? 'bg-[#DC4545] hover:bg-rose-700'
                    : 'bg-[#2563EB] hover:bg-blue-700'
                }`}
              >
                {isEncryptedBusy
                  ? 'Traitement...'
                  : passphraseAction.mode === 'create'
                    ? 'Chiffrer et sauvegarder'
                    : passphraseAction.mode === 'verify'
                      ? 'Déchiffrer et vérifier'
                      : 'Déchiffrer et restaurer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
