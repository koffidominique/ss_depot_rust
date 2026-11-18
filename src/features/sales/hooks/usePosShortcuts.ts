import { useEffect, useRef, type RefObject } from 'react';

interface UsePosShortcutsOptions {
  searchInputRef: RefObject<HTMLInputElement | null>;
  canValidate: boolean;
  onValidate: () => void;
  hasModalOpen: boolean;
  onEscape: () => void;
}

export function usePosShortcuts({
  searchInputRef,
  canValidate,
  onValidate,
  hasModalOpen,
  onEscape,
}: UsePosShortcutsOptions) {
  const validateRef = useRef<() => void>(() => {});

  useEffect(() => {
    validateRef.current = () => {
      if (canValidate) {
        onValidate();
      }
    };
  }, [canValidate, onValidate]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === 'F9') {
        if (!hasModalOpen) {
          e.preventDefault();
          validateRef.current();
        }
      } else if (e.key === 'Escape') {
        onEscape();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchInputRef, hasModalOpen, onEscape]);
}
