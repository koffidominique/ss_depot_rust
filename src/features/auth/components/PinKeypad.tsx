import { Delete } from 'lucide-react';

interface PinKeypadProps {
  disabled: boolean;
  onDigit: (digit: string) => void;
  onClear: () => void;
  onBackspace: () => void;
}

export function PinDotsIndicator({ length }: { length: number }) {
  return (
    <div className="mt-6 flex justify-center gap-3" aria-label="Indicateur de code PIN">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`h-3.5 w-3.5 rounded-full border transition-all duration-150 ${
            i < length
              ? 'border-[#2563EB] bg-[#2563EB] scale-110'
              : 'border-slate-300 dark:border-slate-700 bg-transparent'
          }`}
        />
      ))}
    </div>
  );
}

export function PinKeypad({ disabled, onDigit, onClear, onBackspace }: PinKeypadProps) {
  return (
    <div className="mt-6 grid grid-cols-3 gap-2.5">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
        <button
          key={digit}
          type="button"
          disabled={disabled}
          onClick={() => onDigit(digit)}
          className="h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 font-mono-num text-lg font-semibold text-[#182230] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-40"
        >
          {digit}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={onClear}
        className="h-12 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-[#667085] dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
      >
        Effacer
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDigit('0')}
        className="h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 font-mono-num text-lg font-semibold text-[#182230] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-40"
      >
        0
      </button>
      <button
        type="button"
        aria-label="Supprimer un chiffre"
        disabled={disabled}
        onClick={onBackspace}
        className="flex h-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
      >
        <Delete className="h-4 w-4" />
      </button>
    </div>
  );
}
