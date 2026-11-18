import { CheckCircle2, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { cn } from '../../utils/format.ts';

interface InlineAlertProps {
  variant?: 'error' | 'success' | 'warning';
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export function InlineAlert({
  variant = 'error',
  message,
  onDismiss,
  className,
}: InlineAlertProps) {
  const styles =
    variant === 'success'
      ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 text-[#16A36A] dark:text-emerald-400'
      : variant === 'warning'
        ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/30 text-[#D9901A] dark:text-amber-400'
        : 'border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 text-[#DC4545]';

  const Icon =
    variant === 'success'
      ? CheckCircle2
      : variant === 'warning'
        ? AlertTriangle
        : AlertCircle;

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium',
        styles,
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Fermer le message"
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 opacity-80 hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
