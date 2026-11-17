import { useId } from 'react';
import { cn } from '../../utils/format.ts';

interface QuantityInputProps {
  value: string;
  onChange: (value: string) => void;
  unit?: string;
  allowFraction?: boolean;
  label?: string;
  disabled?: boolean;
  error?: string;
  id?: string;
  className?: string;
}

export function QuantityInput({
  value,
  onChange,
  unit,
  allowFraction = true,
  label,
  disabled = false,
  error,
  id,
  className,
}: QuantityInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className={cn('space-y-1', className)}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-[#182230] dark:text-slate-200">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <input
          id={inputId}
          type="text"
          inputMode={allowFraction ? 'decimal' : 'numeric'}
          disabled={disabled}
          value={value}
          onChange={(e) => {
            const raw = e.target.value.replace(',', '.');
            if (raw === '') {
              onChange('');
              return;
            }
            if (!allowFraction) {
              if (/^\d+$/.test(raw)) onChange(raw);
              return;
            }
            if (/^\d+(\.\d{0,3})?$/.test(raw)) {
              onChange(raw);
            }
          }}
          className={cn(
            'w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm text-[#182230] dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] disabled:opacity-50',
            unit ? 'pr-20' : '',
            error ? 'border-[#DC4545]' : 'border-slate-300 dark:border-slate-700'
          )}
        />
        {unit && (
          <span className="pointer-events-none absolute right-3 text-xs text-[#667085] dark:text-slate-400">
            {unit}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-[#DC4545]">{error}</p>}
    </div>
  );
}
