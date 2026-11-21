import { isValidElement, type ReactNode } from 'react';
import { motion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import {
  DP_CARD_HOVER,
  DP_CARD_TAP,
  DP_EASE,
  DP_SPRING,
} from '../motion/MotionPrimitives.tsx';
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
      renderedIcon = (
        <span className="text-slate-400 dark:text-slate-500 transition-transform duration-200 group-hover:scale-110 shrink-0">
          {icon}
        </span>
      );
    } else {
      const IconComponent = icon as LucideIcon;
      renderedIcon = (
        <IconComponent
          className="h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 group-hover:scale-110 shrink-0"
          aria-hidden="true"
        />
      );
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={DP_CARD_HOVER}
      whileTap={DP_CARD_TAP}
      transition={{ ...DP_SPRING, opacity: { duration: 0.2, ease: DP_EASE } }}
      className={cn(
        'group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-4 dp-surface-interactive',
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
    </motion.div>
  );
}
