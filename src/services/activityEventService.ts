import { supabase } from '@/lib/supabase';
import { stationDay } from '@/utils/datetime';
import type { ActivityEvent, ActivityEventType } from './greetingService';

const ACTIVITY_STORAGE_KEY = 'vit_activity_recent_';
const VISIT_STORAGE_KEY = 'vit_user_last_visit_';
const TODAY_ACTIVITIES_KEY = 'vit_activities_today_';
const SESSION_GREETING_KEY = 'vit_yoyo_greeting_shown_';
const DISMISSED_ACTIVITY_KEY = 'vit_activity_dismissed_';

// 2 hours window for immediate recent activity appreciation
const MAX_ACTIVITY_AGE_MS = 2 * 60 * 60 * 1000;

class SafeStorageAdapter {
  private mem = new Map<string, string>();

  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {}
    return this.mem.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {}
    this.mem.set(key, value);
  }

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
    this.mem.delete(key);
  }
}

class SafeSessionStorageAdapter {
  private mem = new Map<string, string>();

  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(key);
      }
    } catch {}
    return this.mem.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
      }
    } catch {}
    this.mem.set(key, value);
  }

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    } catch {}
    this.mem.delete(key);
  }

  clear(): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.clear();
      }
    } catch {}
    this.mem.clear();
  }
}

const safeStorage = new SafeStorageAdapter();
const safeSessionStorage = new SafeSessionStorageAdapter();

export const activityEventService = {
  /**
   * Records a successfully completed activity event for a user.
   * Dispatches a window event so dashboard components can react immediately.
   */
  recordActivity(
    type: ActivityEventType,
    userId: string,
    options?: { showName?: string; reference?: string; details?: string },
  ): ActivityEvent {
    const event: ActivityEvent = {
      type,
      userId,
      timestamp: Date.now(),
      showName: options?.showName,
      reference: options?.reference,
      details: options?.details,
    };

    try {
      safeStorage.setItem(ACTIVITY_STORAGE_KEY + userId, JSON.stringify(event));

      // Increment today's activity counter
      const todayKey = `${TODAY_ACTIVITIES_KEY}${userId}_${stationDay()}`;
      const rawToday = safeStorage.getItem(todayKey);
      const count = rawToday ? parseInt(rawToday, 10) + 1 : 1;
      safeStorage.setItem(todayKey, count.toString());

      // Dispatch window event for live in-session update
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('vit_activity_recorded', { detail: event }));
      }
    } catch {
      // Non-blocking
    }

    return event;
  },

  /**
   * Retrieves the most recent activity event for the logged-in user,
   * strictly validating that it belongs to this user and occurred recently.
   */
  getRecentActivity(userId: string, maxAgeMs: number = MAX_ACTIVITY_AGE_MS): ActivityEvent | null {
    try {
      const raw = safeStorage.getItem(ACTIVITY_STORAGE_KEY + userId);
      if (!raw) return null;

      const event = JSON.parse(raw) as ActivityEvent;
      if (!event || event.userId !== userId) return null;

      const age = Date.now() - event.timestamp;
      if (age > maxAgeMs) {
        return null;
      }

      return event;
    } catch {
      return null;
    }
  },

  /**
   * Dismisses or clears the current activity event once acknowledged.
   */
  clearRecentActivity(userId: string, timestamp?: number): void {
    try {
      safeStorage.removeItem(ACTIVITY_STORAGE_KEY + userId);
      safeSessionStorage.setItem(
        DISMISSED_ACTIVITY_KEY + userId,
        String(timestamp ?? Date.now()),
      );
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('vit_activity_cleared', { detail: { userId } }));
      }
    } catch {
      // Non-blocking
    }
  },

  /**
   * Counts how many activities were completed today by this user.
   */
  getTodayActivityCount(userId: string): number {
    try {
      const todayKey = `${TODAY_ACTIVITIES_KEY}${userId}_${stationDay()}`;
      const raw = safeStorage.getItem(todayKey);
      return raw ? parseInt(raw, 10) : 0;
    } catch {
      return 0;
    }
  },

  /**
   * Determines if the user is logging in for the first time or returning after an extended absence.
   */
  checkUserSessionRecognition(
    userId: string,
    profileCreatedAt?: string | null,
  ): { isFirstTime: boolean; isReturningUser: boolean } {
    try {
      const storageKey = VISIT_STORAGE_KEY + userId;
      const rawLastVisit = safeStorage.getItem(storageKey);
      const now = Date.now();

      // Check first-time: no previous visit stored AND account created within 7 days
      if (!rawLastVisit) {
        safeStorage.setItem(storageKey, now.toString());
        const isNewAccount = profileCreatedAt
          ? now - new Date(profileCreatedAt).getTime() < 7 * 24 * 60 * 60 * 1000
          : false;
        return { isFirstTime: isNewAccount, isReturningUser: false };
      }

      // Check returning user: previous visit was over 7 days ago
      const lastVisitTime = parseInt(rawLastVisit, 10);
      const daysSinceLastVisit = (now - lastVisitTime) / (1000 * 60 * 60 * 24);
      const isReturningUser = daysSinceLastVisit >= 7;

      // Update visit timestamp
      safeStorage.setItem(storageKey, now.toString());

      return { isFirstTime: false, isReturningUser };
    } catch {
      return { isFirstTime: false, isReturningUser: false };
    }
  },

  /**
   * Queries Supabase for the user's latest backend activity as a graceful fallback
   * when local session storage has no recent event.
   * Strictly filters by `user_id = userId` so NO other user's data can leak.
   */
  async fetchRecentBackendActivity(userId: string): Promise<ActivityEvent | null> {
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, action, created_at, metadata')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;

      const action = data.action;
      const timestamp = new Date(data.created_at).getTime();

      // Ensure it occurred within the recent activity window (last 2 hours)
      if (Date.now() - timestamp > MAX_ACTIVITY_AGE_MS) {
        return null;
      }

      // Check if this activity (or newer) was already dismissed in this session
      const lastDismissedRaw = safeSessionStorage.getItem(DISMISSED_ACTIVITY_KEY + userId);
      if (lastDismissedRaw) {
        const lastDismissed = parseInt(lastDismissedRaw, 10);
        if (timestamp <= lastDismissed) {
          return null;
        }
      }

      let type: ActivityEventType | null = null;
      if (action === 'BOOKING_CREATED') {
        type = 'STUDIO_BOOKED';
      } else if (action === 'AUDIO_UPLOADED') {
        type = 'RAW_AUDIO_UPLOADED';
      } else if (action === 'EPISODE_APPROVED') {
        type = 'QC_APPROVED';
      } else if (action === 'SCHEDULE_CREATED') {
        type = 'SHOW_SCHEDULED';
      }

      if (!type) return null;

      const metadata = (data.metadata || {}) as Record<string, any>;
      return {
        type,
        userId,
        timestamp,
        showName: metadata.title || metadata.name || undefined,
        reference: metadata.reference || undefined,
      };
    } catch {
      return null;
    }
  },

  /**
   * Checks whether the ordinary YOYO greeting has already been shown in this user session.
   */
  hasShownSessionGreeting(userId: string): boolean {
    if (!userId) return false;
    return safeSessionStorage.getItem(SESSION_GREETING_KEY + userId) === 'true';
  },

  /**
   * Marks that the ordinary YOYO greeting was shown in this user session.
   */
  markSessionGreetingShown(userId: string): void {
    if (!userId) return;
    safeSessionStorage.setItem(SESSION_GREETING_KEY + userId, 'true');
  },

  /**
   * Resets the session-based greeting state (e.g. on logout).
   */
  resetSessionGreeting(userId?: string): void {
    if (userId) {
      safeSessionStorage.removeItem(SESSION_GREETING_KEY + userId);
      safeSessionStorage.removeItem(DISMISSED_ACTIVITY_KEY + userId);
    } else {
      safeSessionStorage.clear();
    }
  },
};
