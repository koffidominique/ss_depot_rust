import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Archive,
  FileEdit,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../../utils/format.ts';

export type StatusKind =
  | 'draft'
  | 'validated'
  | 'confirmed'
  | 'open'
  | 'closed'
  | 'paid'
  | 'partial'
  | 'partially_returned'
  | 'returned'
  | 'received'
  | 'overdue'
  | 'archived'
  | 'cancelled'
  | 'active';

const CONFIG: Record<
  StatusKind,
  { label: string; colorClass: string; Icon: typeof CheckCircle2 }
> = {
  draft: { label: 'Brouillon', colorClass: 'text-slate-600 dark:text-slate-400', Icon: FileEdit },
  validated: { label: 'Validé', colorClass: 'text-[#16A36A] dark:text-emerald-400', Icon: CheckCircle2 },
  confirmed: { label: 'Confirmée', colorClass: 'text-[#2563EB] dark:text-[#60A5FA]', Icon: Clock },
  open: { label: 'Ouverte', colorClass: 'text-[#2563EB] dark:text-[#60A5FA]', Icon: Clock },
  closed: { label: 'Clôturée', colorClass: 'text-slate-600 dark:text-slate-400', Icon: CheckCircle2 },
  paid: { label: 'Payé', colorClass: 'text-[#16A36A] dark:text-emerald-400', Icon: CheckCircle2 },
  active: { label: 'Actif', colorClass: 'text-[#16A36A] dark:text-emerald-400', Icon: CheckCircle2 },
  received: { label: 'Reçue', colorClass: 'text-[#16A36A] dark:text-emerald-400', Icon: CheckCircle2 },
  partial: { label: 'Partiel', colorClass: 'text-[#D9901A] dark:text-amber-400', Icon: RefreshCw },
  partially_returned: { label: 'Retour partiel', colorClass: 'text-[#D9901A] dark:text-amber-400', Icon: RefreshCw },
  returned: { label: 'Retournée', colorClass: 'text-[#D9901A] dark:text-amber-400', Icon: RefreshCw },
  overdue: { label: 'En retard', colorClass: 'text-[#DC4545] dark:text-rose-400', Icon: AlertTriangle },
  archived: { label: 'Archivé', colorClass: 'text-slate-500 dark:text-slate-400', Icon: Archive },
  cancelled: { label: 'Annulé', colorClass: 'text-[#DC4545] dark:text-rose-400', Icon: XCircle },
};

export function StatusBadge({
  status,
  labelOverride,
  className,
}: {
  status: StatusKind;
  labelOverride?: string;
  className?: string;
}) {
  const cfg = CONFIG[status] ?? CONFIG.draft;
  const Icon = cfg.Icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0',
        cfg.colorClass,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{labelOverride ?? cfg.label}</span>
    </span>
  );
}
