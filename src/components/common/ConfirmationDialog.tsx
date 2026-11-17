import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../../utils/format.ts';

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  consequences?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = false,
  loading = false,
  onConfirm,
}: ConfirmationDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 shadow-xl focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {destructive && (
                <div className="rounded-lg bg-rose-50 dark:bg-rose-950/50 p-2 text-[#DC4545] shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              )}
              <div>
                <Dialog.Title className="font-display text-base font-semibold text-[#182230] dark:text-slate-100">
                  {title}
                </Dialog.Title>
                <Dialog.Description className="mt-1.5 text-sm text-[#667085] dark:text-slate-400">
                  {description}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {consequences && consequences.length > 0 && (
            <ul className="mt-4 space-y-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3 text-xs text-[#182230] dark:text-slate-300">
              {consequences.map((c, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-slate-400">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex items-center justify-end gap-3">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={loading}
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              className={cn(
                'rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-50',
                destructive
                  ? 'bg-[#DC4545] hover:bg-rose-700'
                  : 'bg-[#2563EB] hover:bg-blue-700'
              )}
            >
              {loading ? 'Traitement...' : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
