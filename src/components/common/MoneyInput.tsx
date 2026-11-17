import { useId } from 'react';
import { cn } from '../../utils/format.ts';

interface MoneyInputProps {
  value: number | string;
  onChange: (value: number) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  id?: string;
  className?: string;
}

export function MoneyInput({
  value,
  onChange,
  label,
  placeholder = '0',
  disabled = false,
  error,
  id,
  className,
}: MoneyInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const display = value === '' || value === null || value === undefined ? '' : String(value);

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
          inputMode="numeric"
          disabled={disabled}
          value={display}
          placeholder={placeholder}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, '');
            onChange(digits === '' ? 0 : Number(digits));
          }}
          className={cn(
            'w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 pr-14 font-mono-num text-sm text-[#182230] dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] disabled:opacity-50',
            error ? 'border-[#DC4545]' : 'border-slate-300 dark:border-slate-700'
          )}
        />
        <span className="pointer-events-none absolute right-3 text-xs font-medium text-[#667085] dark:text-slate-400">
          FCFA
        </span>
      </div>
      {error && <p className="text-xs text-[#DC4545]">{error}</p>}
    </div>
  );
}
