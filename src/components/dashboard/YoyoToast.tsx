import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { UserRole } from '@/types/database';
import { supabase } from '@/lib/supabase';
import {
  selectGreeting,
  type ActivityEvent,
  type GreetingMessage,
} from '@/services/greetingService';
import { activityEventService } from '@/services/activityEventService';

export interface YoyoToastProps {
  userId: string;
  fullName?: string | null;
  role: UserRole;
  profileCreatedAt?: string | null;
  totalEpisodes?: number;
  autoDismissMs?: number;
  onDismiss?: () => void;
}

export function YoyoToast({
  userId,
  fullName,
  role,
  profileCreatedAt,
  totalEpisodes = 0,
  autoDismissMs = 10000, // 10 seconds auto-dismiss
  onDismiss,
}: YoyoToastProps) {
  const [recentActivity, setRecentActivity] = useState<ActivityEvent | null>(() => {
    return activityEventService.getRecentActivity(userId);
  });

  // Session-based visibility:
  // 1. If an active recent activity is present, show activity appreciation.
  // 2. Otherwise, ordinary greetings display strictly once per user session.
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (activityEventService.getRecentActivity(userId)) {
      return true;
    }
    if (activityEventService.hasShownSessionGreeting(userId)) {
      return false;
    }
    activityEventService.markSessionGreetingShown(userId);
    return true;
  });

  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const [variationIndex] = useState<number>(() => {
    try {
      const stored = sessionStorage.getItem(`vit_greeting_var_${userId}`);
      return stored ? parseInt(stored, 10) : 0;
    } catch {
      return 0;
    }
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check session-based recognitions (first-time, returning user)
  const sessionRecognition = useMemo(() => {
    return activityEventService.checkUserSessionRecognition(userId, profileCreatedAt);
  }, [userId, profileCreatedAt]);

  const todayActivitiesCount = useMemo(() => {
    return activityEventService.getTodayActivityCount(userId);
  }, [userId, recentActivity]);

  const [userTotalEpisodes, setUserTotalEpisodes] = useState<number>(totalEpisodes);

  useEffect(() => {
    if (totalEpisodes > 0) {
      setUserTotalEpisodes(totalEpisodes);
      return;
    }
    if (userId) {
      let isMounted = true;
      supabase
        .from('episodes')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', userId)
        .then(
          ({ count }) => {
            if (isMounted && typeof count === 'number') {
              setUserTotalEpisodes(count);
            }
          },
          () => {},
        );
      return () => {
        isMounted = false;
      };
    }
  }, [userId, totalEpisodes]);

  const isMilestone = userTotalEpisodes > 0 && [5, 10, 25, 50, 100].includes(userTotalEpisodes);

  // Listen for real-time live activity events within the current session
  useEffect(() => {
    const handleRecorded = (e: Event) => {
      const customEvent = e as CustomEvent<ActivityEvent>;
      if (customEvent.detail && customEvent.detail.userId === userId) {
        setRecentActivity(customEvent.detail);
        setIsVisible(true);
        setIsClosing(false);
      }
    };

    const handleCleared = (e: Event) => {
      const customEvent = e as CustomEvent<{ userId: string }>;
      if (customEvent.detail && customEvent.detail.userId === userId) {
        setRecentActivity(null);
      }
    };

    window.addEventListener('vit_activity_recorded', handleRecorded);
    window.addEventListener('vit_activity_cleared', handleCleared);

    return () => {
      window.removeEventListener('vit_activity_recorded', handleRecorded);
      window.removeEventListener('vit_activity_cleared', handleCleared);
    };
  }, [userId]);

  // Background fetch if no local session activity exists
  useEffect(() => {
    if (!recentActivity) {
      let isMounted = true;
      activityEventService
        .fetchRecentBackendActivity(userId)
        .then((act) => {
          if (isMounted && act) {
            setRecentActivity(act);
          }
        })
        .catch(() => {});

      return () => {
        isMounted = false;
      };
    }
  }, [userId, recentActivity]);

  const greeting: GreetingMessage = useMemo(() => {
    return selectGreeting({
      userId,
      fullName,
      role,
      recentActivity,
      isFirstTime: sessionRecognition.isFirstTime,
      isReturningUser: sessionRecognition.isReturningUser,
      hasMultipleActivitiesToday: todayActivitiesCount >= 3,
      isMilestone,
      milestoneDetail: isMilestone ? `${userTotalEpisodes} episodes` : undefined,
      variationIndex,
      mode: 'AUTO',
    });
  }, [
    userId,
    fullName,
    role,
    recentActivity,
    sessionRecognition,
    todayActivitiesCount,
    isMilestone,
    userTotalEpisodes,
    variationIndex,
  ]);

  const handleDismiss = useCallback(() => {
    setIsClosing(true);
    activityEventService.markSessionGreetingShown(userId);
    setTimeout(() => {
      setIsVisible(false);
      if (recentActivity) {
        activityEventService.clearRecentActivity(userId, recentActivity.timestamp);
        setRecentActivity(null);
      }
      if (onDismiss) {
        onDismiss();
      }
    }, 250);
  }, [userId, recentActivity, onDismiss]);

  // Automatic dismissal after autoDismissMs (10s default), paused on hover
  useEffect(() => {
    if (!isVisible || isClosing || isPaused || autoDismissMs <= 0) return;

    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, autoDismissMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isVisible, isClosing, isPaused, autoDismissMs, handleDismiss, recentActivity]);

  if (!isVisible) return null;

  const cardClasses = [
    'yoyo-toast-card',
    greeting.category === 'ACTIVITY' ? 'has-activity' : '',
    isClosing ? 'is-closing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside
      className="yoyo-toast-container"
      aria-live="polite"
      aria-label="YOYO notification"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className={cardClasses}>
        <div className="yoyo-toast-top">
          <div className="yoyo-identity-text">
            <h3 className="yoyo-heading">Hey, I'm Yoyo!</h3>
            <p className="yoyo-subtitle">Your little friend from Growiota.</p>
          </div>

          <button
            type="button"
            className="yoyo-close-btn"
            onClick={handleDismiss}
            aria-label="Close notification"
            title="Dismiss"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <p className="yoyo-message">{greeting.message}</p>

        {greeting.category === 'ACTIVITY' && (recentActivity?.showName || recentActivity?.reference) && (
          <div className="yoyo-detail">
            <span>
              Related to:{' '}
              <strong>
                {recentActivity.showName || recentActivity.reference}
              </strong>
            </span>
          </div>
        )}

        <div className="yoyo-footer">
          <span className="yoyo-tag-badge">{greeting.tag}</span>
          <span className="yoyo-time-text">
            {greeting.formattedTimeIst || `${greeting.formattedTime} IST`}
          </span>
        </div>
      </div>
    </aside>
  );
}
