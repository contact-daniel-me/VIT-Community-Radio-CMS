import { createContext } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface PwaContextType {
  /** Whether the app is currently running in standalone (installed) mode */
  isInstalled: boolean;
  /** Whether the native beforeinstallprompt is ready to be triggered */
  canPromptInstall: boolean;
  /** Whether device is iOS Safari where manual Add to Home Screen is needed */
  isIos: boolean;
  /** Whether the device is currently offline */
  isOffline: boolean;
  /** Whether an updated Service Worker version is installed and waiting */
  updateAvailable: boolean;
  /** Triggers the native install prompt or returns 'manual' for iOS/other browsers */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'manual'>;
  /** Applies the pending update safely by messaging the waiting Service Worker */
  applyUpdate: () => void;
  /** Dismisses the current update toast */
  dismissUpdate: () => void;
}

export const PwaContext = createContext<PwaContextType | null>(null);

