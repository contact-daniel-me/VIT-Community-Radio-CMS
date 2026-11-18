import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { yoyoNotificationService, YOYO_NOTIFICATION_PREF_KEY } from '@/services/yoyoNotificationService';
import type { ActivityEvent } from '@/services/greetingService';

// Regex to catch standard Unicode emojis, pictographs, and symbols
const EMOJI_AND_SYMBOLS_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}★☆✨❤️💖🎙️🎧📻]/u;

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};
if (typeof (globalThis as any).localStorage === 'undefined') {
  (globalThis as any).localStorage = mockLocalStorage;
}

describe('YOYO Native Browser Notifications System', () => {
  const testUserId = 'test-notif-user-123';
  const testProfile = {
    id: testUserId,
    full_name: 'RJ Akshaya',
    role: 'RJ' as const,
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Feature Detection and Graceful Handling', () => {
    it('detects notification support gracefully without throwing', () => {
      const support = yoyoNotificationService.getSupport();
      expect(typeof support.isSupported).toBe('boolean');
      expect(typeof support.isServiceWorkerSupported).toBe('boolean');
      expect(typeof support.isPushSupported).toBe('boolean');
      expect(['default', 'granted', 'denied', 'unsupported']).toContain(support.permission);
    });

    it('reports disabled when userId is empty or preference is unset', () => {
      expect(yoyoNotificationService.isEnabled('')).toBe(false);
      expect(yoyoNotificationService.isEnabled(testUserId)).toBe(false);
    });
  });

  describe('2. User Permission Request & Preference State', () => {
    it('only enables notifications after permission is granted and preference is stored', async () => {
      // Mock Notification API in test environment
      const mockRequestPermission = vi.fn().mockResolvedValue('granted');
      const originalNotification = (globalThis as any).Notification;

      (globalThis as any).Notification = {
        permission: 'granted',
        requestPermission: mockRequestPermission,
      };
      if (typeof window !== 'undefined') (window as any).Notification = (globalThis as any).Notification;

      const result = await yoyoNotificationService.requestPermission(testUserId);
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
      expect(result.granted).toBe(true);
      expect(result.permission).toBe('granted');
      expect(localStorage.getItem(YOYO_NOTIFICATION_PREF_KEY + testUserId)).toBe('true');
      expect(yoyoNotificationService.isEnabled(testUserId)).toBe(true);

      (globalThis as any).Notification = originalNotification;
    });

    it('handles denied permission without throwing and stores false preference', async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue('denied');
      const originalNotification = (globalThis as any).Notification;

      (globalThis as any).Notification = {
        permission: 'denied',
        requestPermission: mockRequestPermission,
      };
      if (typeof window !== 'undefined') (window as any).Notification = (globalThis as any).Notification;

      const result = await yoyoNotificationService.requestPermission(testUserId);
      expect(result.granted).toBe(false);
      expect(result.permission).toBe('denied');
      expect(localStorage.getItem(YOYO_NOTIFICATION_PREF_KEY + testUserId)).toBe('false');
      expect(yoyoNotificationService.isEnabled(testUserId)).toBe(false);

      (globalThis as any).Notification = originalNotification;
    });

    it('allows users to explicitly disable notifications in settings', () => {
      localStorage.setItem(YOYO_NOTIFICATION_PREF_KEY + testUserId, 'true');
      yoyoNotificationService.disable(testUserId);
      expect(localStorage.getItem(YOYO_NOTIFICATION_PREF_KEY + testUserId)).toBe('false');
      expect(yoyoNotificationService.isEnabled(testUserId)).toBe(false);
    });
  });

  describe('3. Service Worker Web Push & Notification Click Handling', () => {
    it('verifies public/sw.js contains Web Push and notificationclick listeners', () => {
      const swPath = join(process.cwd(), 'public/sw.js');
      expect(existsSync(swPath)).toBe(true);
      const swCode = readFileSync(swPath, 'utf8');

      // Verify push event listener exists
      expect(swCode).toContain("self.addEventListener('push'");
      expect(swCode).toContain('showNotification');

      // Verify notificationclick event listener exists
      expect(swCode).toContain("self.addEventListener('notificationclick'");
      expect(swCode).toContain('event.notification.close()');
      expect(swCode).toContain('clients.matchAll');
      expect(swCode).toContain('client.focus()');
      expect(swCode).toContain('clients.openWindow');
    });
  });

  describe('4. Personalized Activity Notification Delivery', () => {
    it('creates personalized QC approval notification with correct route and zero emojis', async () => {
      let dispatchedNotification: any = null;
      const originalNotification = (globalThis as any).Notification;

      class MockNotification {
        title: string;
        options: any;
        onclick: any = null;
        constructor(title: string, options: any) {
          this.title = title;
          this.options = options;
          dispatchedNotification = { title, options };
        }
        close() {}
      }
      (MockNotification as any).permission = 'granted';
      (globalThis as any).Notification = MockNotification;
      if (typeof window !== 'undefined') (window as any).Notification = MockNotification;

      localStorage.setItem(YOYO_NOTIFICATION_PREF_KEY + testUserId, 'true');

      const qcEvent: ActivityEvent = {
        type: 'QC_APPROVED',
        userId: testUserId,
        timestamp: Date.now(),
        showName: 'Vellore Science Hour',
        details: 'ep-science-42',
      };

      const sent = await yoyoNotificationService.notifyActivity(qcEvent, testProfile);
      expect(sent).toBe(true);
      expect(dispatchedNotification).not.toBeNull();
      expect(dispatchedNotification.title).toContain('Akshaya');
      expect(dispatchedNotification.title).toContain('Quality Review Approved');
      expect(dispatchedNotification.options.body).toContain('Vellore Science Hour');
      expect(dispatchedNotification.options.data.url).toBe('/admin/episodes/ep-science-42');

      // Verify strict zero emojis policy
      expect(EMOJI_AND_SYMBOLS_REGEX.test(dispatchedNotification.title)).toBe(false);
      expect(EMOJI_AND_SYMBOLS_REGEX.test(dispatchedNotification.options.body)).toBe(false);

      (globalThis as any).Notification = originalNotification;
    });

    it('creates personalized Studio Booking notification routing to /bookings', async () => {
      let dispatchedNotification: any = null;
      const originalNotification = (globalThis as any).Notification;

      class MockNotification {
        title: string;
        options: any;
        constructor(title: string, options: any) {
          this.title = title;
          this.options = options;
          dispatchedNotification = { title, options };
        }
        close() {}
      }
      (MockNotification as any).permission = 'granted';
      (globalThis as any).Notification = MockNotification;
      if (typeof window !== 'undefined') (window as any).Notification = MockNotification;

      localStorage.setItem(YOYO_NOTIFICATION_PREF_KEY + testUserId, 'true');

      const bookingEvent: ActivityEvent = {
        type: 'STUDIO_BOOKED',
        userId: testUserId,
        timestamp: Date.now(),
        details: '2026-11-25 10:00 AM',
        reference: 'BK-999',
      };

      const sent = await yoyoNotificationService.notifyActivity(bookingEvent, testProfile);
      expect(sent).toBe(true);
      expect(dispatchedNotification).not.toBeNull();
      expect(dispatchedNotification.title).toContain('Studio Session Confirmed');
      expect(dispatchedNotification.options.body).toContain('2026-11-25 10:00 AM');
      expect(dispatchedNotification.options.data.url).toBe('/bookings');
      expect(EMOJI_AND_SYMBOLS_REGEX.test(dispatchedNotification.title)).toBe(false);

      (globalThis as any).Notification = originalNotification;
    });

    it('creates personalized Audio Upload notifications routing to /audio', async () => {
      let dispatchedNotification: any = null;
      const originalNotification = (globalThis as any).Notification;

      class MockNotification {
        title: string;
        options: any;
        constructor(title: string, options: any) {
          this.title = title;
          this.options = options;
          dispatchedNotification = { title, options };
        }
        close() {}
      }
      (MockNotification as any).permission = 'granted';
      (globalThis as any).Notification = MockNotification;
      if (typeof window !== 'undefined') (window as any).Notification = MockNotification;

      localStorage.setItem(YOYO_NOTIFICATION_PREF_KEY + testUserId, 'true');

      const audioEvent: ActivityEvent = {
        type: 'FINAL_AUDIO_UPLOADED',
        userId: testUserId,
        timestamp: Date.now(),
        showName: 'Community Spotlight',
      };

      const sent = await yoyoNotificationService.notifyActivity(audioEvent, testProfile);
      expect(sent).toBe(true);
      expect(dispatchedNotification.title).toContain('Broadcast Master Ready');
      expect(dispatchedNotification.options.body).toContain('Community Spotlight');
      expect(dispatchedNotification.options.data.url).toBe('/audio');
      expect(EMOJI_AND_SYMBOLS_REGEX.test(dispatchedNotification.title)).toBe(false);

      (globalThis as any).Notification = originalNotification;
    });

    it('creates personalized Show Scheduling notification routing to /schedule/edit', async () => {
      let dispatchedNotification: any = null;
      const originalNotification = (globalThis as any).Notification;

      class MockNotification {
        title: string;
        options: any;
        constructor(title: string, options: any) {
          this.title = title;
          this.options = options;
          dispatchedNotification = { title, options };
        }
        close() {}
      }
      (MockNotification as any).permission = 'granted';
      (globalThis as any).Notification = MockNotification;
      if (typeof window !== 'undefined') (window as any).Notification = MockNotification;

      localStorage.setItem(YOYO_NOTIFICATION_PREF_KEY + testUserId, 'true');

      const schedEvent: ActivityEvent = {
        type: 'SHOW_SCHEDULED',
        userId: testUserId,
        timestamp: Date.now(),
      };

      const sent = await yoyoNotificationService.notifyActivity(schedEvent, testProfile);
      expect(sent).toBe(true);
      expect(dispatchedNotification.title).toContain('Show Scheduled');
      expect(dispatchedNotification.options.data.url).toBe('/schedule/edit');
      expect(EMOJI_AND_SYMBOLS_REGEX.test(dispatchedNotification.title)).toBe(false);

      (globalThis as any).Notification = originalNotification;
    });
  });

  describe('5. Duplicate Prevention', () => {
    it('suppresses duplicate notifications with matching deduplication keys within TTL', () => {
      const dedupeKey = 'test-dedupe-key-1';
      expect(yoyoNotificationService.isDuplicate(testUserId, dedupeKey)).toBe(false);
      // Second attempt immediately after should be detected as duplicate
      expect(yoyoNotificationService.isDuplicate(testUserId, dedupeKey)).toBe(true);
    });
  });

  describe('6. Settings UI and Global AppLayout Integration', () => {
    it('verifies SettingsPage contains Enable YOYO Notifications option and controls', () => {
      const settingsPath = join(process.cwd(), 'src/pages/SettingsPage.tsx');
      expect(existsSync(settingsPath)).toBe(true);
      const settingsCode = readFileSync(settingsPath, 'utf8');

      expect(settingsCode).toContain('YOYO Notifications');
      expect(settingsCode).toContain('Enable YOYO Notifications');
      expect(settingsCode).toContain('Disable YOYO Notifications');
      expect(settingsCode).toContain('Send Test Notification');
      expect(settingsCode).toContain('yoyoNotificationService');
    });

    it('verifies AppLayout mounts the native notification activity watcher', () => {
      const appLayoutPath = join(process.cwd(), 'src/layouts/AppLayout.tsx');
      expect(existsSync(appLayoutPath)).toBe(true);
      const appLayoutCode = readFileSync(appLayoutPath, 'utf8');

      expect(appLayoutCode).toContain('yoyoNotificationService.initActivityWatcher');
      expect(appLayoutCode).toContain('<YoyoToast');
    });
  });
});
