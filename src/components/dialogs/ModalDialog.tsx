import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { FormTipsButton } from '../common/FormTipsButton.tsx';
import { DP_SPRING_SNAPPY } from '../motion/MotionPrimitives.tsx';
import { cn } from '../../utils/format.ts';

interface ModalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  subtitle?: string;
  titleClassName?: string;
  tipsTopicId?: string;
  tipsLabel?: string;
  headerActions?: ReactNode;
  maxWidthClass?: string;
  scrollable?: boolean;
  error?: string | null;
  children: ReactNode;
  footer?: ReactNode;
}

export function ModalDialog({
  open,
  onOpenChange,
  title,
  description,
  subtitle,
  titleClassName,
  tipsTopicId,
  tipsLabel,
  headerActions,
  maxWidthClass = 'max-w-lg',
  scrollable = false,
  error,
  children,
  footer,
}: ModalDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px]"
          />
        </Dialog.Overlay>
        <Dialog.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 px-4 sm:px-0 focus:outline-none',
            maxWidthClass
          )}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={DP_SPRING_SNAPPY}
            className={cn(
              'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-6 dp-modal-surface',
              scrollable ? 'max-h-[90vh] overflow-y-auto' : ''
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Dialog.Title
                  className={cn(
                    'font-display text-base font-semibold text-[#182230] dark:text-slate-100',
                    titleClassName
                  )}
                >
                  {title}
                </Dialog.Title>
                {subtitle && (
                  <p className="mt-0.5 text-xs text-[#667085] dark:text-slate-400">{subtitle}</p>
                )}
                {description && (
                  <Dialog.Description className="mt-1.5 text-xs text-[#667085] dark:text-slate-400">
                    {description}
                  </Dialog.Description>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {headerActions}
                {tipsTopicId && <FormTipsButton topicId={tipsTopicId} label={tipsLabel} />}
                <Dialog.Close
                  aria-label="Fermer la fenêtre"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-[#DC4545]"
              >
                {error}
              </div>
            )}

            {children}

            {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
