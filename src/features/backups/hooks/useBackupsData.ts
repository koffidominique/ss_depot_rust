import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import type { BackupFile } from '../../../types/erp.ts';

export type PassphraseAction =
  | { mode: 'create' }
  | { mode: 'verify'; name: string }
  | { mode: 'restore'; name: string }
  | null;

export function useBackupsQuery() {
  return useQuery({
    queryKey: ['backups'],
    queryFn: () => apiClient.listBackups(),
  });
}

export function useLocalDbStatusQuery() {
  return useQuery({
    queryKey: ['local-db-status'],
    queryFn: () => apiClient.getLocalDbStatus(),
  });
}

interface UseBackupsMutationsOptions {
  onStatus: (msg: { type: 'ok' | 'err'; text: string }) => void;
  onClearPassphraseModal: () => void;
  onClearRestoreTarget: () => void;
}

export function useBackupsMutations({
  onStatus,
  onClearPassphraseModal,
  onClearRestoreTarget,
}: UseBackupsMutationsOptions) {
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: () => apiClient.createBackup(),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      qc.invalidateQueries({ queryKey: ['local-db-status'] });
      onStatus({
        type: 'ok',
        text: `Sauvegarde cohérente créée et vérifiée : ${created.name}`,
      });
    },
    onError: (err) =>
      onStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur sauvegarde.',
      }),
  });

  const createEncMut = useMutation({
    mutationFn: (secret: string) => apiClient.createEncryptedBackup(secret),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      qc.invalidateQueries({ queryKey: ['local-db-status'] });
      onClearPassphraseModal();
      onStatus({
        type: 'ok',
        text: `Sauvegarde chiffrée AES-256-GCM créée : ${created.name}`,
      });
    },
    onError: (err) =>
      onStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur sauvegarde chiffrée.',
      }),
  });

  const importMut = useMutation({
    mutationFn: (args: { filename: string; bytes: Uint8Array }) =>
      apiClient.importBackup(args.filename, args.bytes),
    onSuccess: (imported) => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      qc.invalidateQueries({ queryKey: ['local-db-status'] });
      onStatus({
        type: 'ok',
        text: `Sauvegarde importée et vérifiée : ${imported.name} — vous pouvez maintenant la restaurer depuis la liste.`,
      });
    },
    onError: (err) =>
      onStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur import sauvegarde.',
      }),
  });

  const verifyMut = useMutation({
    mutationFn: (args: { name: string; secret?: string }) =>
      args.secret !== undefined
        ? apiClient.verifyEncryptedBackup(args.name, args.secret)
        : apiClient.verifyBackup(args.name),
    onSuccess: (res) => {
      onClearPassphraseModal();
      const ok =
        res.integrity === 'ok' && res.foreignKeyErrors === 0 && res.compatible !== false;
      const hashHint = res.sha256 ? `, SHA-256 ${res.sha256.slice(0, 12)}…` : '';
      onStatus({
        type: ok ? 'ok' : 'err',
        text: ok
          ? `Vérification ${res.name} (lecture seule) : intégrité=${res.integrity}, erreurs FK=${res.foreignKeyErrors}, schéma v${res.schemaVersion}${hashHint}, compatible.`
          : `Sauvegarde ${res.name} incompatible : ${res.compatibilityReason || `intégrité=${res.integrity}, FK=${res.foreignKeyErrors}`}`,
      });
    },
    onError: (err) =>
      onStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur vérification.',
      }),
  });

  const restoreMut = useMutation({
    mutationFn: (args: { name: string; secret?: string }) =>
      args.secret !== undefined
        ? apiClient.restoreEncryptedBackup(args.name, args.secret)
        : apiClient.restoreBackup(args.name),
    onSuccess: (res) => {
      qc.invalidateQueries();
      onClearRestoreTarget();
      onClearPassphraseModal();
      const safetyHint = res.safetyBackup
        ? `sauvegarde sécurité : ${res.safetyBackup}`
        : 'pré-sauvegarde de sécurité conservée';
      const summaryHint = res.counts
        ? `, ${res.counts.products} produit(s), ${res.counts.sales} vente(s)`
        : '';
      onStatus({
        type: 'ok',
        text: `Base restaurée depuis ${res.restored} (${safetyHint}${summaryHint}).`,
      });
    },
    onError: (err) => {
      onClearRestoreTarget();
      onStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur restauration.',
      });
    },
  });

  const downloadBackupFile = async (file: BackupFile | string) => {
    const name = typeof file === 'string' ? file : file.name;
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
      onStatus({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erreur téléchargement.',
      });
    }
  };

  return { createMut, createEncMut, importMut, verifyMut, restoreMut, downloadBackupFile };
}
