import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { DP_BUTTON_HOVER, DP_BUTTON_TAP, DP_EASE, DP_SPRING_SNAPPY } from '../motion/MotionPrimitives.tsx';
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
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, ease: DP_EASE }}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111A2E] dp-surface px-6 py-12 text-center',
        className
      )}
    >
      <Inbox className="h-8 w-8 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      <h3 className="mt-3 font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
        {title}
      </h3>
      <p className="mt-1 max-w-md text-xs text-[#667085] dark:text-slate-400">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

export function LoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
      className="space-y-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface p-4"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/70"
        />
      ))}
    </motion.div>
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
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: DP_EASE }}
      className="flex flex-col items-center justify-center rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 dp-surface px-6 py-10 text-center"
    >
      <AlertCircle className="h-8 w-8 text-[#DC4545]" aria-hidden="true" />
      <h3 className="mt-3 font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
        Impossible de charger les données
      </h3>
      <p className="mt-1 max-w-md text-xs text-[#667085] dark:text-slate-400">{message}</p>
      {onRetry && (
        <motion.button
          type="button"
          whileHover={DP_BUTTON_HOVER}
          whileTap={DP_BUTTON_TAP}
          transition={DP_SPRING_SNAPPY}
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 shadow-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Réessayer
        </motion.button>
      )}
    </motion.div>
  );
}
