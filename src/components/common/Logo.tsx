import { cn } from '../../utils/format.ts';

export function Logo({
  collapsed = false,
  className,
  src,
  alt = 'Logo DEPOTPRO',
}: { collapsed?: boolean; className?: string; src?: string | null; alt?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5 select-none', className)}>
      {src ? (
        <img src={src} alt={alt} className="h-8 w-8 shrink-0 rounded-md bg-white object-contain p-0.5" />
      ) : <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="8" fill="#101B33" />
        <rect x="6" y="7" width="20" height="18" rx="3" stroke="#60A5FA" strokeWidth="1.75" />
        <path d="M6 13H26" stroke="#2563EB" strokeWidth="1.75" />
        <path d="M12.5 7V25" stroke="#2563EB" strokeWidth="1.5" />
        <path d="M19.5 7V25" stroke="#2563EB" strokeWidth="1.5" />
        <circle cx="9.25" cy="10" r="1.25" fill="#60A5FA" />
        <circle cx="16" cy="10" r="1.25" fill="#60A5FA" />
        <circle cx="22.75" cy="10" r="1.25" fill="#60A5FA" />
      </svg>}
      {!collapsed && (
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
          DEPOT<span className="text-[#2563EB] dark:text-[#60A5FA]">PRO</span>
        </span>
      )}
    </div>
  );
}
