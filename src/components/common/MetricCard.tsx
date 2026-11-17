import { isValidElement, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/format.ts';

interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
  hint?: string;
  icon?: LucideIcon | ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'accent';
  className?: string;
}

export function MetricCard({
  label,
  value,
  subtext,
  hint,
  icon,
  tone = 'default',
  className,
}: MetricCardProps) {
  const valueTone =
    tone === 'success'
      ? 'text-[#16A36A] dark:text-emerald-400'
      : tone === 'warning'
      ? 'text-[#D9901A] dark:text-amber-400'
      : tone === 'danger'
      ? 'text-[#DC4545] dark:text-rose-400'
      : tone === 'accent'
      ? 'text-[#2563EB] dark:text-[#60A5FA]'
      : 'text-[#182230] dark:text-slate-100';

  const noteText = subtext ?? hint;

  let renderedIcon: ReactNode = null;
  if (icon) {
    if (isValidElement(icon)) {
      renderedIcon = <span className="text-slate-400 dark:text-slate-500 shrink-0">{icon}</span>;
    } else {
      const IconComponent = icon as LucideIcon;
      renderedIcon = (
        <IconComponent className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
      );
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4 transition-colors',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[#667085] dark:text-slate-400 truncate">
          {label}
        </span>
        {renderedIcon}
      </div>
      <div className={cn('mt-2 font-mono-num text-xl font-bold tracking-tight truncate', valueTone)}>
        {value}
      </div>
      {noteText && (
        <div className="mt-1 text-xs text-[#667085] dark:text-slate-400 truncate">
          {noteText}
        </div>
      )}
    </div>
  );
}
