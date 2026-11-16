import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { analyticsService } from '@/services/analyticsService';
import { useAuth } from '@/hooks/useAuth';

/**
 * Global background analytics tracker.
 *
 * Runs automatically across the public site and admin CMS:
 * 1. Tracks page navigation events without blocking routing.
 * 2. Emits periodic presence heartbeats (25s) while visible.
 * 3. Handles visibility changes (pauses when hidden, wakes on focus).
 * 4. Logs login/logout events securely without recording credentials.
 */
export function AnalyticsTracker() {
  const location = useLocation();
  const { session, profile } = useAuth();
  const lastPathRef = useRef<string>('');
  const lastUserRef = useRef<string | null>(null);

  // 1. Navigation tracking
  useEffect(() => {
    const currentPath = location.pathname;
    if (lastPathRef.current !== currentPath) {
      lastPathRef.current = currentPath;

      // Send non-blocking heartbeat with current path
      void analyticsService.sendHeartbeat(currentPath, false);

      // Log page view event
      void analyticsService.logActivity(
        'PAGE_VIEW',
        currentPath,
        `Viewed ${currentPath}`,
        {
          search: location.search,
          referrer: document.referrer || null,
        },
      );
    }
  }, [location.pathname, location.search]);

  // 2. Authentication transition tracking (login / logout)
  useEffect(() => {
    const currentUserId = session?.user?.id ?? null;
    if (lastUserRef.current !== currentUserId) {
      if (currentUserId && !lastUserRef.current) {
        // User just signed in
        void analyticsService.logActivity(
          'USER_LOGIN',
          location.pathname,
          `${profile?.full_name ?? 'User'} logged in`,
          { role: profile?.role },
        );
      } else if (!currentUserId && lastUserRef.current) {
        // User logged out
        void analyticsService.logActivity(
          'USER_LOGOUT',
          location.pathname,
          'User logged out',
        );
      }
      lastUserRef.current = currentUserId;
    }
  }, [session?.user?.id, profile?.full_name, profile?.role, location.pathname]);

  // 3. Periodic presence heartbeat (every 25s while document visible)
  useEffect(() => {
    const sendPulse = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void analyticsService.sendHeartbeat(window.location.pathname, false);
      }
    };

    const intervalId = window.setInterval(sendPulse, 25000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendPulse();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return null;
}
