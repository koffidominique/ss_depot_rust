import type { ReactNode } from 'react';
import { motion, type HTMLMotionProps, type Transition, type Variants } from 'motion/react';
import { cn } from '../../utils/format.ts';

export const DP_EASE = [0.22, 1, 0.36, 1] as const;

export const DP_SPRING: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 30,
  mass: 0.8,
};

export const DP_SPRING_SNAPPY: Transition = {
  type: 'spring',
  stiffness: 460,
  damping: 28,
  mass: 0.65,
};

export const DP_CARD_HOVER = { y: -3, scale: 1.015 } as const;
export const DP_CARD_TAP = { scale: 0.99 } as const;
export const DP_BUTTON_HOVER = { scale: 1.025, y: -1 } as const;
export const DP_BUTTON_TAP = { scale: 0.97 } as const;

export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.045,
      delayChildren: 0.02,
    },
  },
};

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.24, ease: DP_EASE },
  },
};

interface MotionSurfaceProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  interactive?: boolean;
}

export function MotionCard({
  children,
  interactive = true,
  className,
  ...props
}: MotionSurfaceProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.24, ease: DP_EASE }}
      whileHover={interactive ? DP_CARD_HOVER : undefined}
      whileTap={interactive ? DP_CARD_TAP : undefined}
      className={cn(
        'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E]',
        interactive ? 'dp-surface-interactive' : 'dp-surface',
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionStaggerGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionStaggerItem({
  children,
  interactive = false,
  className,
}: {
  children: ReactNode;
  interactive?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      variants={staggerItemVariants}
      whileHover={interactive ? DP_CARD_HOVER : undefined}
      whileTap={interactive ? DP_CARD_TAP : undefined}
      transition={DP_SPRING}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionSection({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, delay, ease: DP_EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
