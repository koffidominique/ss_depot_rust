import type { ReactNode } from 'react';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { cn } from '../../utils/format.ts';

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-6 py-12 text-center',
        className
      )}
    >
      <Inbox className="h-8 w-8 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      <h3 className="mt-3 font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
        {title}
      </h3>
      <p className="mt-1 max-w-md text-xs text-[#667085] dark:text-slate-400">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/70"
        />
      ))}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 px-6 py-10 text-center">
      <AlertCircle className="h-8 w-8 text-[#DC4545]" aria-hidden="true" />
      <h3 className="mt-3 font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
        Impossible de charger les données
      </h3>
      <p className="mt-1 max-w-md text-xs text-[#667085] dark:text-slate-400">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Réessayer
        </button>
      )}
    </div>
  );
}
