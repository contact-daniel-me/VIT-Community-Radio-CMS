import { useEffect } from 'react';

const MAX_TIMEOUT_MS = 2_147_483_647; // 32-bit signed int max for setTimeout (~24.8 days)

/**
 * Schedules a one-shot timer for the nearest upcoming transition timestamp
 * (e.g., scheduled publish time or expiry time) and refreshes automatically.
 */
export function useScheduledTransitionRefresh(
  timestamps: (string | null | undefined)[],
  onBoundary: () => void,
): void {
  const nextBoundaryMs = (() => {
    const now = Date.now();
    let earliest: number | null = null;
    for (const raw of timestamps) {
      if (!raw) continue;
      const ms = new Date(raw).getTime();
      if (isNaN(ms) || ms <= now) continue;
      if (earliest === null || ms < earliest) {
        earliest = ms;
      }
    }
    return earliest;
  })();

  useEffect(() => {
    if (nextBoundaryMs === null) return;
    const delay = Math.min(Math.max(nextBoundaryMs - Date.now() + 600, 500), MAX_TIMEOUT_MS);
    const timer = window.setTimeout(() => {
      onBoundary();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [nextBoundaryMs, onBoundary]);
}

