import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Lock, RotateCcw, ShieldCheck } from 'lucide-react';
import { DataTable } from '../../../components/tables/DataTable.tsx';
import type { BackupFile } from '../../../types/erp.ts';
import { formatBytes, formatDateTime } from '../../../utils/format.ts';

interface BackupsTableProps {
  backups: BackupFile[];
  onVerify: (name: string, isEncrypted: boolean) => void;
  onDownload: (name: string) => void;
  onRestore: (name: string, isEncrypted: boolean) => void;
}

export function BackupsTable({
  backups,
  onVerify,
  onDownload,
  onRestore,
}: BackupsTableProps) {
  const columns = useMemo<ColumnDef<BackupFile>[]>(
    () => [
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
        cell: ({ row }) => (
          <span className="font-mono-num text-xs">{formatDateTime(row.original.createdAt)}</span>
        ),
      },
      {
        accessorKey: 'size',
        header: 'Taille',
        cell: ({ row }) => (
          <span className="font-mono-num text-xs">{formatBytes(row.original.size)}</span>
        ),
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
                onClick={() => onVerify(row.original.name, isEnc)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-[#16A36A]" />
                Vérifier
              </button>
              <button
                type="button"
                onClick={() => onDownload(row.original.name)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" />
                Exporter
              </button>
              <button
                type="button"
                onClick={() => onRestore(row.original.name, isEnc)}
                className="inline-flex items-center gap-1 rounded-md border border-rose-200 dark:border-rose-900/60 px-2.5 py-1 text-xs font-medium text-[#DC4545] hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurer
              </button>
            </div>
          );
        },
      },
    ],
    [onVerify, onDownload, onRestore]
  );

  return (
    <DataTable
      data={backups}
      columns={columns as ColumnDef<BackupFile, unknown>[]}
      emptyMessage="Aucune sauvegarde créée pour le moment."
    />
  );
}
