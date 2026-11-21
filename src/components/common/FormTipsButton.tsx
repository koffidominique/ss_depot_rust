import { motion } from 'motion/react';
import { HelpCircle } from 'lucide-react';
import { DP_BUTTON_HOVER, DP_BUTTON_TAP, DP_SPRING_SNAPPY } from '../motion/MotionPrimitives.tsx';
import { useUiStore } from '../../stores/uiStore.ts';

interface FormTipsButtonProps {
  topicId: string;
  label?: string;
  className?: string;
}

export function FormTipsButton({
  topicId,
  label = 'Règles métier',
  className = '',
}: FormTipsButtonProps) {
  const openTips = useUiStore((s) => s.openTips);

  return (
    <motion.button
      type="button"
      whileHover={DP_BUTTON_HOVER}
      whileTap={DP_BUTTON_TAP}
      transition={DP_SPRING_SNAPPY}
      onClick={() => openTips(topicId)}
      title="Afficher les conseils et règles métier"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-[#667085] dark:text-slate-300 hover:border-[#2563EB]/60 hover:text-[#2563EB] dark:hover:text-[#60A5FA] hover:shadow-sm transition-colors whitespace-nowrap shrink-0 ${className}`}
    >
      <HelpCircle className="h-3.5 w-3.5 shrink-0" />
      <span>{label}</span>
    </motion.button>
  );
}
