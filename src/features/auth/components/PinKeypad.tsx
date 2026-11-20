import { Delete } from 'lucide-react';
import { motion } from 'motion/react';

interface PinKeypadProps {
  disabled: boolean;
  onDigit: (digit: string) => void;
  onClear: () => void;
  onBackspace: () => void;
}

const buttonVariants = {
  hidden: { opacity: 0, scale: 0.8, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
  hover: { scale: 1.05, y: -2 },
  tap: { scale: 0.95, y: 0 },
};

const containerVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.03 } },
};

export function PinDotsIndicator({ length }: { length: number }) {
  return (
    <div className="mt-6 flex justify-center gap-3" aria-label="Indicateur de code PIN" role="status" aria-live="polite">
      {Array.from({ length: 6 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: i < length ? 1.1 : 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: i * 0.03 }}
          className={`h-3.5 w-3.5 rounded-full border-2 transition-all duration-150 ${
            i < length
              ? 'border-blue-500 bg-blue-500 shadow-lg shadow-blue-500/30'
              : 'border-slate-300 dark:border-slate-700 bg-transparent dark:bg-slate-800/50'
          }`}>
          {i < length && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25, delay: i * 0.03 + 0.05 }}
              className="absolute inset-1.5 rounded-full bg-white/30" />
          )}
        </motion.div>
      ))}
    </div>
  );
}

export function PinKeypad({ disabled, onDigit, onClear, onBackspace }: PinKeypadProps) {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="mt-6 relative"
      role="region"
      aria-label="Clavier numérique"
    >
      {/* Glassmorphism background with blur */}
      <div className="absolute inset-0 rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-white/20 dark:border-slate-800/50 shadow-2xl shadow-black/10 dark:shadow-black/30 p-4" />

      <div className="relative grid grid-cols-3 gap-3 p-4">
        {digits.map((digit) => (
          <motion.button
            key={digit}
            type="button"
            disabled={disabled}
            onClick={() => onDigit(digit)}
            variants={buttonVariants}
            initial="hidden"
            animate="visible"
            whileHover={disabled ? undefined : 'hover'}
            whileTap={disabled ? undefined : 'tap'}
            className="relative h-14 w-full rounded-xl font-mono-num text-xl font-semibold text-slate-900 dark:text-slate-100
              bg-white/70 dark:bg-slate-800/70
              border border-white/30 dark:border-slate-700/50
              shadow-sm shadow-black/5 dark:shadow-black/20
              hover:shadow-lg hover:shadow-blue-500/20 hover:border-blue-500/30
              active:shadow-none
              transition-all duration-200 ease-out
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-sm
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
            style={{ willChange: 'transform, box-shadow' }}>
            <span className="relative z-10">{digit}</span>
            {/* Subtle shine effect on hover */}
            <motion.div
              className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"
              animate={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
            />
          </motion.button>
        ))}
        <motion.button
          key="clear"
          type="button"
          disabled={disabled}
          onClick={onClear}
          variants={buttonVariants}
          initial="hidden"
          animate="visible"
          whileHover={disabled ? undefined : 'hover'}
          whileTap={disabled ? undefined : 'tap'}
          className="relative h-14 w-full rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400
            bg-white/70 dark:bg-slate-800/70
            border border-white/30 dark:border-slate-700/50
            shadow-sm shadow-black/5 dark:shadow-black/20
            hover:shadow-lg hover:shadow-rose-500/20 hover:border-rose-500/30 hover:text-rose-600 dark:hover:text-rose-400
            active:shadow-none
            transition-all duration-200 ease-out
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-sm
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
          style={{ willChange: 'transform, box-shadow' }}>
          <span className="relative z-10">Effacer</span>
          <motion.div
            className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"
            animate={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
          />
        </motion.button>
        <motion.button
          key="0"
          type="button"
          disabled={disabled}
          onClick={() => onDigit('0')}
          variants={buttonVariants}
          initial="hidden"
          animate="visible"
          whileHover={disabled ? undefined : 'hover'}
          whileTap={disabled ? undefined : 'tap'}
          className="relative h-14 w-full rounded-xl font-mono-num text-xl font-semibold text-slate-900 dark:text-slate-100
            bg-white/70 dark:bg-slate-800/70
            border border-white/30 dark:border-slate-700/50
            shadow-sm shadow-black/5 dark:shadow-black/20
            hover:shadow-lg hover:shadow-blue-500/20 hover:border-blue-500/30
            active:shadow-none
            transition-all duration-200 ease-out
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-sm
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
          style={{ willChange: 'transform, box-shadow' }}>
          <span className="relative z-10">0</span>
          <motion.div
            className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"
            animate={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
          />
        </motion.button>
        <motion.button
          key="backspace"
          type="button"
          aria-label="Supprimer un chiffre"
          disabled={disabled}
          onClick={onBackspace}
          variants={buttonVariants}
          initial="hidden"
          animate="visible"
          whileHover={disabled ? undefined : 'hover'}
          whileTap={disabled ? undefined : 'tap'}
          className="relative flex h-14 items-center justify-center rounded-xl text-slate-600 dark:text-slate-300
            bg-white/70 dark:bg-slate-800/70
            border border-white/30 dark:border-slate-700/50
            shadow-sm shadow-black/5 dark:shadow-black/20
            hover:shadow-lg hover:shadow-amber-500/20 hover:border-amber-500/30 hover:text-amber-600 dark:hover:text-amber-400
            active:shadow-none
            transition-all duration-200 ease-out
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-sm
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900"
          style={{ willChange: 'transform, box-shadow' }}>
          <span className="relative z-10 flex items-center justify-center">
            <Delete className="h-5 w-5" />
          </span>
          <motion.div
            className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"
            animate={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
          />
        </motion.button>
      </div>
    </motion.div>
  );
}