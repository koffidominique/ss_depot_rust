import { forwardRef, type KeyboardEventHandler } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../../utils/format.ts';

interface SearchInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  placeholder?: string;
  ariaLabel?: string;
  clearable?: boolean;
  className?: string;
  inputClassName?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    {
      value,
      onChange,
      onKeyDown,
      placeholder = 'Rechercher...',
      ariaLabel,
      clearable = false,
      className,
      inputClassName,
    },
    ref
  ) {
    return (
      <div className={cn('relative', className)}>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          ref={ref}
          type="text"
          value={value}
          aria-label={ariaLabel || placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={cn(
            'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] py-2 pl-9 text-sm text-[#182230] dark:text-slate-100 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none',
            clearable && value ? 'pr-8' : 'pr-3',
            inputClassName
          )}
        />
        {clearable && value && (
          <button
            type="button"
            aria-label="Effacer la recherche"
            onClick={() => onChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }
);
