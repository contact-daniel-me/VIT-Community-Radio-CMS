import { createContext } from 'react';

export type FeedbackVariant = 'booking' | 'publish' | 'upload' | 'approval' | 'save';

export type ConfettiPreset = 'subtle' | 'celebration';

export interface ConfettiBurstRequest {
  id: number;
  preset: ConfettiPreset;
}

export interface ToastItem {
  id: string;
  variant: FeedbackVariant;
  title: string;
  detail?: string;
  badgeText?: string;
  dedupeKey?: string;
  createdAt: number;
  durationMs: number;
}

export interface BookingCelebrationPayload {
  showName?: string | null;
  reference?: string | null;
  dateLabel?: string | null;
  timeLabel?: string | null;
  isTour?: boolean;
  dedupeKey?: string;
}

export interface PublishCelebrationPayload {
  showName?: string | null;
  programName?: string | null;
  dedupeKey?: string;
}

export interface SubtleFeedbackPayload {
  title: string;
  detail?: string;
  dedupeKey?: string;
}

export interface SimpleSavePayload {
  title: string;
  detail?: string;
  dedupeKey?: string;
}

export interface SuccessFeedbackContextValue {
  /** Small confetti burst + confirmation toast after studio booking is confirmed. */
  celebrateBooking: (payload?: BookingCelebrationPayload) => void;
  /** Noticeable celebration confetti + "Your show is live!" toast after publishing. */
  celebratePublish: (payload?: PublishCelebrationPayload) => void;
  /** Subtle animated confirmation toast for confirmed audio uploads / Mixota exports. */
  notifyUpload: (payload: SubtleFeedbackPayload) => void;
  /** Subtle animated confirmation toast for confirmed QC / booking / account approvals. */
  notifyApproval: (payload: SubtleFeedbackPayload) => void;
  /** Simple restrained toast notification for ordinary save / edit / draft operations. */
  notifySave: (payload: SimpleSavePayload) => void;
  /** Dismisses a visible toast by ID. */
  dismissToast: (id: string) => void;
}

export const CONFETTI_PRESETS: Record<
  ConfettiPreset,
  {
    particleCount: number;
    durationMs: number;
    spreadDeg: number;
    minSpeed: number;
    maxSpeed: number;
    gravity: number;
    minSize: number;
    maxSize: number;
    dualEmitter: boolean;
  }
> = {
  subtle: {
    particleCount: 22,
    durationMs: 1200,
    spreadDeg: 68,
    minSpeed: 3.2,
    maxSpeed: 6.2,
    gravity: 0.16,
    minSize: 4,
    maxSize: 6.5,
    dualEmitter: false,
  },
  celebration: {
    particleCount: 44,
    durationMs: 1750,
    spreadDeg: 92,
    minSpeed: 4.2,
    maxSpeed: 8.6,
    gravity: 0.14,
    minSize: 5,
    maxSize: 8.5,
    dualEmitter: true,
  },
};

export const TOAST_DURATION_MS: Record<FeedbackVariant, number> = {
  booking: 4800,
  publish: 5500,
  upload: 4200,
  approval: 4200,
  save: 3600,
};

/**
 * Checks whether the user prefers reduced motion via CSS media query.
 * Safe to invoke in non-browser / test environments.
 */
export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Builds the polished live show message ensuring "Your show is live!" and
 * the published show name are displayed cleanly whenever available.
 */
export function formatPublishCelebrationMessage(payload?: PublishCelebrationPayload): {
  title: string;
  detail: string;
  badgeText: string;
} {
  const showName = payload?.showName?.trim() || '';
  const programName = payload?.programName?.trim() || '';

  let detail = 'Available for listeners now.';
  if (showName && programName && showName.toLowerCase() !== programName.toLowerCase()) {
    detail = `"${showName}" · ${programName}`;
  } else if (showName) {
    detail = `"${showName}"`;
  } else if (programName) {
    detail = `"${programName}"`;
  }

  return {
    title: 'Your show is live!',
    detail,
    badgeText: 'LIVE',
  };
}

/**
 * Builds the studio booking confirmation toast copy from verified booking metadata.
 */
export function formatBookingCelebrationMessage(payload?: BookingCelebrationPayload): {
  title: string;
  detail?: string;
} {
  const title = payload?.isTour ? 'Studio tour booked!' : 'Studio slot booked!';
  const slotTime =
    payload?.dateLabel && payload?.timeLabel
      ? `${payload.dateLabel} · ${payload.timeLabel}`
      : payload?.dateLabel || payload?.timeLabel || '';

  const parts = [
    payload?.showName?.trim() || '',
    slotTime.trim(),
    payload?.reference?.trim() || '',
  ].filter(Boolean);

  return {
    title,
    detail: parts.length > 0 ? parts.join(' · ') : 'Your studio slot is confirmed.',
  };
}

export interface FeedbackDeduper {
  canTriggerConfetti: (key?: string, now?: number) => boolean;
  canShowToast: (key?: string, now?: number) => boolean;
  reset: () => void;
}

/**
 * Guards against duplicate animations or duplicate toasts caused by StrictMode double
 * renders, double clicks, or repeated backend responses within a short cooldown window.
 */
export function createFeedbackDeduper(
  confettiCooldownMs = 2500,
  toastCooldownMs = 1500,
  minBurstGapMs = 350,
): FeedbackDeduper {
  const confettiKeys = new Map<string, number>();
  const toastKeys = new Map<string, number>();
  let lastBurstAt = -Infinity;

  const prune = (map: Map<string, number>, threshold: number, now: number) => {
    if (map.size <= 32) return;
    for (const [k, ts] of map.entries()) {
      if (now - ts > threshold) map.delete(k);
    }
  };

  return {
    canTriggerConfetti(key?: string, now = Date.now()): boolean {
      if (now - lastBurstAt < minBurstGapMs) {
        return false;
      }
      if (key) {
        const prev = confettiKeys.get(key);
        if (prev !== undefined && now - prev < confettiCooldownMs) {
          return false;
        }
        confettiKeys.set(key, now);
        prune(confettiKeys, confettiCooldownMs, now);
      }
      lastBurstAt = now;
      return true;
    },
    canShowToast(key?: string, now = Date.now()): boolean {
      if (!key) return true;
      const prev = toastKeys.get(key);
      if (prev !== undefined && now - prev < toastCooldownMs) {
        return false;
      }
      toastKeys.set(key, now);
      prune(toastKeys, toastCooldownMs, now);
      return true;
    },
    reset() {
      confettiKeys.clear();
      toastKeys.clear();
      lastBurstAt = -Infinity;
    },
  };
}

export const SuccessFeedbackContext = createContext<SuccessFeedbackContextValue | null>(null);

