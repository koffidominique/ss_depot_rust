import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { isTauriRuntime } from '../services/api/createApiClient.ts';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let pwaInitialized = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export function initPwa(): void {
  if (pwaInitialized || typeof window === 'undefined' || isTauriRuntime()) {
    return;
  }
  pwaInitialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notifyListeners();
  });

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        setInterval(() => {
          void registration.update();
        }, 60 * 60 * 1000);
      },
    });
  }
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(() => Boolean(deferredPrompt));
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const syncInstall = () => setCanInstall(Boolean(deferredPrompt));
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    listeners.add(syncInstall);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    syncInstall();

    return () => {
      listeners.delete(syncInstall);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      deferredPrompt = null;
      notifyListeners();
    }
  };

  return { canInstall, isOnline, promptInstall };
}
