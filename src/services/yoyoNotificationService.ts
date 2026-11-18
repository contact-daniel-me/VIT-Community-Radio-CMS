import { supabase } from '@/lib/supabase';
import { extractFirstName } from './greetingService';
import type { ActivityEvent, ActivityEventType } from './greetingService';
import type { UserRole } from '@/types/database';

export const YOYO_NOTIFICATION_PREF_KEY = 'vit_yoyo_notifications_enabled_';
const NOTIF_DEDUPE_KEY_PREFIX = 'vit_yoyo_notif_dedupe_';
const DEDUPE_TTL_MS = 2 * 60 * 1000; // 2 minutes deduplication window

export interface YoyoNotificationPayload {
  userId: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
}

export interface YoyoNotificationSupport {
  isSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  isServiceWorkerSupported: boolean;
  isPushSupported: boolean;
}

function getGlobalScope(): any {
  if (typeof window !== 'undefined') return window;
  if (typeof globalThis !== 'undefined') return globalThis;
  return {};
}

class SafeStorageAdapter {
  private mem = new Map<string, string>();

  private getNativeStorage(): Storage | null {
    try {
      const scope = getGlobalScope();
      if (scope && scope.localStorage) {
        return scope.localStorage;
      }
    } catch {}
    return null;
  }

  getItem(key: string): string | null {
    const s = this.getNativeStorage();
    if (s) {
      try {
        return s.getItem(key);
      } catch {}
    }
    return this.mem.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    const s = this.getNativeStorage();
    if (s) {
      try {
        s.setItem(key, value);
      } catch {}
    }
    this.mem.set(key, value);
  }

  removeItem(key: string): void {
    const s = this.getNativeStorage();
    if (s) {
      try {
        s.removeItem(key);
      } catch {}
    }
    this.mem.delete(key);
  }
}

const storage = new SafeStorageAdapter();
const memoryDedupe = new Map<string, number>();

export const yoyoNotificationService = {
  /**
   * Evaluates environment support for Notifications API, Service Worker, and PushManager.
   */
  getSupport(): YoyoNotificationSupport {
    const scope = getGlobalScope();
    const isSupported = Boolean(scope && 'Notification' in scope && scope.Notification);
    const isServiceWorkerSupported = Boolean(
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    );
    const isPushSupported = Boolean(scope && 'PushManager' in scope);

    let permission: NotificationPermission | 'unsupported' = 'unsupported';
    if (isSupported && scope.Notification) {
      try {
        permission = scope.Notification.permission || 'default';
      } catch {
        permission = 'default';
      }
    }

    return {
      isSupported,
      permission,
      isServiceWorkerSupported,
      isPushSupported,
    };
  },

  /**
   * Checks whether the user has explicitly enabled native browser notifications
   * and granted browser permission.
   */
  isEnabled(userId: string): boolean {
    if (!userId) return false;
    const support = this.getSupport();
    if (!support.isSupported || support.permission !== 'granted') {
      return false;
    }
    const val = storage.getItem(YOYO_NOTIFICATION_PREF_KEY + userId);
    return val === 'true';
  },

  /**
   * Requests browser notification permission when the user explicitly clicks Enable.
   * Never invoked automatically on load.
   */
  async requestPermission(userId: string): Promise<{
    granted: boolean;
    permission: NotificationPermission | 'unsupported';
  }> {
    const scope = getGlobalScope();
    const support = this.getSupport();
    if (!support.isSupported || !scope.Notification) {
      return { granted: false, permission: 'unsupported' };
    }

    try {
      const result = await scope.Notification.requestPermission();
      if (result === 'granted') {
        storage.setItem(YOYO_NOTIFICATION_PREF_KEY + userId, 'true');
        void this.registerServiceWorker();
        return { granted: true, permission: 'granted' };
      } else {
        storage.setItem(YOYO_NOTIFICATION_PREF_KEY + userId, 'false');
        return { granted: false, permission: result };
      }
    } catch {
      return { granted: false, permission: 'default' };
    }
  },

  /**
   * Explicitly disables YOYO native browser notifications for the given user.
   */
  disable(userId: string): void {
    if (!userId) return;
    storage.setItem(YOYO_NOTIFICATION_PREF_KEY + userId, 'false');
  },

  /**
   * Registers or ensures the service worker is active for background/push notifications.
   */
  async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }
    try {
      const existing = await navigator.serviceWorker.getRegistration('/');
      if (existing) return existing;
      return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    } catch {
      return null;
    }
  },

  /**
   * Checks and records deduplication keys to prevent duplicate alerts.
   */
  isDuplicate(userId: string, dedupeKey: string): boolean {
    const fullKey = `${NOTIF_DEDUPE_KEY_PREFIX}${userId}_${dedupeKey}`;
    const now = Date.now();

    // Check memory cache
    const memTime = memoryDedupe.get(fullKey);
    if (memTime && now - memTime < DEDUPE_TTL_MS) {
      return true;
    }

    // Check storage cache
    const stored = storage.getItem(fullKey);
    if (stored) {
      const storedTime = parseInt(stored, 10);
      if (!isNaN(storedTime) && now - storedTime < DEDUPE_TTL_MS) {
        return true;
      }
    }

    // Record dedupe timestamp
    memoryDedupe.set(fullKey, now);
    storage.setItem(fullKey, now.toString());
    return false;
  },

  /**
   * Sends a native browser notification using Service Worker showNotification
   * or direct Notification API fallback.
   */
  async sendBrowserNotification(payload: YoyoNotificationPayload): Promise<boolean> {
    const { userId, title, body, url = '/dashboard', tag, icon, badge } = payload;

    if (!this.isEnabled(userId)) {
      return false;
    }

    const dedupeKey = tag || `${title}_${body}`;
    if (this.isDuplicate(userId, dedupeKey)) {
      return false;
    }

    const notifIcon = icon || '/favicon-192.png';
    const notifBadge = badge || '/favicon-32.png';

    // 1. Prefer Service Worker registration (handles background, PWA, mobile lock screen)
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg =
          (await navigator.serviceWorker.getRegistration('/')) ||
          (await navigator.serviceWorker.ready);

        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, {
            body,
            icon: notifIcon,
            badge: notifBadge,
            tag: tag || 'yoyo-notification',
            data: { url },
          });
          return true;
        }
      } catch {
        // Fall through to standard Notification API
      }
    }

    // 2. Direct Window Notification fallback
    const scope = getGlobalScope();
    if (scope && 'Notification' in scope && typeof scope.Notification === 'function') {
      try {
        const notif = new scope.Notification(title, {
          body,
          icon: notifIcon,
          badge: notifBadge,
          tag: tag || 'yoyo-notification',
          data: { url },
        });

        notif.onclick = (e: any) => {
          e?.preventDefault?.();
          scope.focus?.();
          if (url && scope.location) {
            scope.location.href = url;
          }
          notif.close?.();
        };

        return true;
      } catch {
        return false;
      }
    }

    return false;
  },

  /**
   * Sends an immediate test notification to verify browser notification delivery.
   */
  async sendTestNotification(userId: string, fullName?: string | null): Promise<boolean> {
    const firstName = extractFirstName(fullName);
    return this.sendBrowserNotification({
      userId,
      title: `Hey ${firstName}, I'm Yoyo!`,
      body: 'Browser notifications are working smoothly. You will get helpful updates for QC approvals, audio uploads, and schedules.',
      url: '/settings',
      tag: `yoyo-test-${Date.now()}`,
    });
  },

  /**
   * Converts an activity event into a tailored, personalized native notification
   * and dispatches it if the user has enabled browser notifications.
   */
  async notifyActivity(
    event: ActivityEvent,
    profile: { id: string; full_name?: string | null; role: UserRole },
  ): Promise<boolean> {
    if (!this.isEnabled(profile.id)) {
      return false;
    }

    const firstName = extractFirstName(profile.full_name);
    const { type, showName, reference, details } = event;

    let title = `Hey ${firstName}, I'm Yoyo!`;
    let body = 'A station activity was completed successfully.';
    let url = '/dashboard';
    let tag = `yoyo-${type}-${Date.now()}`;

    switch (type) {
      case 'QC_APPROVED':
        title = `Hey ${firstName}! Quality Review Approved`;
        body = showName
          ? `"${showName}" has been approved in QC and is ready for broadcast.`
          : 'A show has been approved in QC review and is ready for broadcast.';
        url = details ? `/admin/episodes/${details}` : '/qc';
        tag = `yoyo-qc-${details || reference || event.timestamp}`;
        break;

      case 'FINAL_AUDIO_UPLOADED':
        title = `Hey ${firstName}! Broadcast Master Ready`;
        body = showName
          ? `Final broadcast audio for "${showName}" is locked in.`
          : 'Final broadcast audio master is locked in and ready for airwaves.';
        url = details ? `/admin/episodes/${details}` : '/audio';
        tag = `yoyo-final-audio-${details || event.timestamp}`;
        break;

      case 'RAW_AUDIO_UPLOADED':
        title = `Hey ${firstName}! Recording Saved`;
        body = showName
          ? `Raw take for "${showName}" is safely uploaded to the station vault.`
          : 'Your raw take is safely banked in the station vault.';
        url = details ? `/admin/episodes/${details}` : '/audio';
        tag = `yoyo-raw-audio-${details || event.timestamp}`;
        break;

      case 'STUDIO_BOOKED':
        title = `Hey ${firstName}! Studio Session Confirmed`;
        body = details
          ? `Your studio session on ${details} is confirmed. Have a great recording!`
          : 'Your studio recording session has been confirmed!';
        url = '/bookings';
        tag = `yoyo-booking-${reference || details || event.timestamp}`;
        break;

      case 'SHOW_SCHEDULED':
        title = `Hey ${firstName}! Show Scheduled`;
        body = 'Your broadcast has been added to the station transmission lineup.';
        url = '/schedule/edit';
        tag = `yoyo-schedule-${details || event.timestamp}`;
        break;
    }

    return this.sendBrowserNotification({
      userId: profile.id,
      title,
      body,
      url,
      tag,
    });
  },

  /**
   * Listens for activity events and Supabase activity_logs changes to trigger
   * native notifications seamlessly in the background.
   */
  initActivityWatcher(
    profile: { id: string; full_name?: string | null; role: UserRole },
  ): () => void {
    if (typeof window === 'undefined') return () => {};

    // 1. Listen for local window activity events dispatched by client services
    const handleRecorded = (e: Event) => {
      const customEvent = e as CustomEvent<ActivityEvent>;
      if (customEvent.detail && customEvent.detail.userId === profile.id) {
        void this.notifyActivity(customEvent.detail, profile);
      }
    };

    window.addEventListener('vit_activity_recorded', handleRecorded);

    // 2. Listen for backend Supabase activity_logs updates via Realtime channel
    const channelName = `yoyo-activity-${profile.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          const newRow = payload.new as {
            action?: string;
            metadata?: Record<string, any>;
            created_at?: string;
            id?: string;
          };
          if (!newRow?.action) return;

          let type: ActivityEventType | null = null;
          if (newRow.action === 'EPISODE_APPROVED') type = 'QC_APPROVED';
          else if (newRow.action === 'AUDIO_UPLOADED') type = 'RAW_AUDIO_UPLOADED';
          else if (newRow.action === 'BOOKING_CREATED') type = 'STUDIO_BOOKED';
          else if (newRow.action === 'SCHEDULE_CREATED') type = 'SHOW_SCHEDULED';

          if (type) {
            const meta = newRow.metadata || {};
            const event: ActivityEvent = {
              type,
              userId: profile.id,
              timestamp: newRow.created_at ? new Date(newRow.created_at).getTime() : Date.now(),
              showName: meta.title || meta.name || undefined,
              reference: meta.reference || undefined,
              details: meta.episode_id || meta.details || undefined,
            };
            void this.notifyActivity(event, profile);
          }
        },
      )
      .subscribe();

    return () => {
      window.removeEventListener('vit_activity_recorded', handleRecorded);
      void supabase.removeChannel(channel);
    };
  },
};
