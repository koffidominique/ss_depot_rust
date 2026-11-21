import { CheckCircle2, HardDrive, RefreshCw, ShieldAlert } from 'lucide-react';
import type { LocalDbStatus } from '../../../types/erp.ts';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

interface Props {
  status?: LocalDbStatus;
  isFetching: boolean;
  onRefreshIntegrity: () => void;
}

export function LocalDbStatusCard({ status, isFetching, onRefreshIntegrity }: Props) {
  if (!status) return null;

  const isHealthy = status.integrity === 'ok' && status.foreignKeyErrors === 0;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-[#2563EB]">
            <HardDrive className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-xs font-semibold text-[#182230] dark:text-slate-100">
                Base de données locale SQLite (100% hors-ligne)
              </h3>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  isHealthy
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                }`}
              >
                {isHealthy ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <ShieldAlert className="h-3 w-3" />
                )}
                {isHealthy
                  ? `Intégrité OK · Schéma v${status.schemaVersion}`
                  : `Anomalie (${status.integrity}, FK=${status.foreignKeyErrors})`}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[#667085] dark:text-slate-400 break-all">
              Fichier : <span className="font-mono">{status.dbPath}</span> ({formatBytes(status.dbSizeBytes)}, mode {status.journalMode} · WAL {formatBytes(status.walSizeBytes)})
            </p>
            <p className="text-[11px] text-[#667085] dark:text-slate-400 break-all">
              Dossier sauvegardes : <span className="font-mono">{status.backupDir}</span> ({status.backupCount} archive(s))
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={isFetching}
          onClick={onRefreshIntegrity}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-[#182230] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Vérifier l’intégrité locale
        </button>
      </div>
    </div>
  );
}
