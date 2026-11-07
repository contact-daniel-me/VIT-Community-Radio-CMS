import React, { useEffect, useRef, useState } from 'react';
import {
  PwaContext,
  type BeforeInstallPromptEvent,
  type PwaContextType,
} from './pwaContext';

function checkIsInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
  const isIosStandalone =
    'standalone' in window.navigator &&
    Boolean((window.navigator as unknown as { standalone: boolean }).standalone);
  const isAndroidTwa = document.referrer.startsWith('android-app://');
  return Boolean(isStandaloneMedia || isIosStandalone || isAndroidTwa);
}

function checkIsIos(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) && !('MSStream' in window);
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [isInstalled, setIsInstalled] = useState<boolean>(checkIsInstalled);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const isIos = checkIsIos();

  useEffect(() => {
    // 1. Detect standalone display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches || checkIsInstalled());
    };
    mediaQuery.addEventListener('change', handleDisplayChange);

    // 2. Capture beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 3. Detect when app has been installed
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // 4. Online/Offline network connectivity listeners
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 5. Service Worker Registration & Update Detection
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          // If there is already a waiting worker
          if (reg.waiting) {
            waitingWorkerRef.current = reg.waiting;
            setUpdateAvailable(true);
          }

          // Listen for new workers entering installed state
          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                waitingWorkerRef.current = installing;
                setUpdateAvailable(true);
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[PWA] ServiceWorker registration warning:', err);
        });

      // Reload page when new service worker takes control (via SKIP_WAITING)
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    return () => {
      mediaQuery.removeEventListener('change', handleDisplayChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'manual'> => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
      return choice.outcome;
    }
    return 'manual';
  };

  const applyUpdate = () => {
    if (waitingWorkerRef.current) {
      waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  const dismissUpdate = () => {
    setUpdateAvailable(false);
  };

  const value: PwaContextType = {
    isInstalled,
    canPromptInstall: Boolean(deferredPrompt),
    isIos,
    isOffline,
    updateAvailable,
    promptInstall,
    applyUpdate,
    dismissUpdate,
  };

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

