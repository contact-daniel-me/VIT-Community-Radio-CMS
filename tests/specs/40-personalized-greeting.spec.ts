import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractFirstName,
  getKolkataTimeParts,
  getGreetingPeriod,
  getTimeBasedGreeting,
  getActivityGreeting,
  getRoleGreeting,
  getSpecialRecognitionGreeting,
  selectGreeting,
  getHeadlineGreeting,
  getPeriodLabel,
  type GreetingPeriod,
  type ActivityEventType,
  type ActivityEvent,
} from '@/services/greetingService';
import { activityEventService } from '@/services/activityEventService';

// Regex to catch standard Unicode emojis, pictographs, and symbols
const EMOJI_AND_SYMBOLS_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}★☆✨❤️💖🎙️🎧📻]/u;

describe('Personalized Greeting and Appreciation System', () => {
  describe('1. Dynamic First Name Extraction', () => {
    it('extracts first name from full name', () => {
      expect(extractFirstName('Kavitha Ramanathan')).toBe('Kavitha');
      expect(extractFirstName('John Doe')).toBe('John');
    });

    it('gracefully handles RJ honorary prefixes', () => {
      expect(extractFirstName('RJ Akshaya')).toBe('Akshaya');
      expect(extractFirstName('rj Priya')).toBe('Priya');
    });

    it('handles single names cleanly', () => {
      expect(extractFirstName('Vellore')).toBe('Vellore');
      expect(extractFirstName('Admin')).toBe('Admin');
    });

    it('falls back gracefully on empty, whitespace, null, or undefined', () => {
      expect(extractFirstName('')).toBe('there');
      expect(extractFirstName('   ')).toBe('there');
      expect(extractFirstName(null)).toBe('there');
      expect(extractFirstName(undefined)).toBe('there');
    });

    it('never hardcodes names into output messages', () => {
      const msg1 = getTimeBasedGreeting('MORNING', 'Meera', 0);
      expect(msg1.message).toContain('Meera');

      const msg2 = getTimeBasedGreeting('MORNING', 'Suresh', 0);
      expect(msg2.message).toContain('Suresh');
      expect(msg2.message).not.toContain('Meera');
    });
  });

  describe('2. Strict Formatting Rules: Zero Emojis and Zero Decorative Symbols', () => {
    it('verifies all time-based greeting messages contain zero emojis or decorative symbols', () => {
      const periods: GreetingPeriod[] = [
        'MORNING',
        'AFTERNOON',
        'LUNCH',
        'AFTER_LUNCH',
        'EVENING',
        'NIGHT',
        'LATE_NIGHT',
      ];

      for (const p of periods) {
        for (let i = 0; i < 5; i++) {
          const g = getTimeBasedGreeting(p, 'Tester', i);
          expect(EMOJI_AND_SYMBOLS_REGEX.test(g.message)).toBe(false);
          expect(EMOJI_AND_SYMBOLS_REGEX.test(g.headline)).toBe(false);
          expect(EMOJI_AND_SYMBOLS_REGEX.test(g.tag)).toBe(false);
        }
      }
    });

    it('verifies all activity-based messages contain zero emojis or decorative symbols', () => {
      const activities: ActivityEventType[] = [
        'STUDIO_BOOKED',
        'RAW_AUDIO_UPLOADED',
        'FINAL_AUDIO_UPLOADED',
        'QC_APPROVED',
        'SHOW_SCHEDULED',
      ];

      for (const act of activities) {
        for (let i = 0; i < 4; i++) {
          const fakeEvent: ActivityEvent = { type: act, userId: 'u1', timestamp: Date.now() };
          const g = getActivityGreeting(fakeEvent, 'Tester', i);
          expect(EMOJI_AND_SYMBOLS_REGEX.test(g.message)).toBe(false);
          expect(EMOJI_AND_SYMBOLS_REGEX.test(g.headline)).toBe(false);
          expect(EMOJI_AND_SYMBOLS_REGEX.test(g.tag)).toBe(false);
        }
      }
    });

    it('verifies all role-based messages contain zero emojis or decorative symbols', () => {
      const roles = ['RJ', 'QC', 'PRODUCER', 'ADMIN'] as const;
      for (const r of roles) {
        for (let i = 0; i < 4; i++) {
          const g = getRoleGreeting(r, 'Tester', i);
          expect(EMOJI_AND_SYMBOLS_REGEX.test(g.message)).toBe(false);
          expect(EMOJI_AND_SYMBOLS_REGEX.test(g.headline)).toBe(false);
          expect(EMOJI_AND_SYMBOLS_REGEX.test(g.tag)).toBe(false);
        }
      }
    });

    it('verifies all special recognition messages contain zero emojis or decorative symbols', () => {
      const specials = ['FIRST_TIME', 'RETURNING_USER', 'MULTIPLE_ACTIVITIES', 'MILESTONE'] as const;
      for (const s of specials) {
        for (let i = 0; i < 3; i++) {
          const g = getSpecialRecognitionGreeting(s, 'Tester', i);
          expect(EMOJI_AND_SYMBOLS_REGEX.test(g.message)).toBe(false);
          expect(EMOJI_AND_SYMBOLS_REGEX.test(g.headline)).toBe(false);
          expect(EMOJI_AND_SYMBOLS_REGEX.test(g.tag)).toBe(false);
        }
      }
    });
  });

  describe('3. Time-Based Greeting System & Asia/Kolkata Boundaries', () => {
    // Helper to construct UTC date that corresponds to a specific IST time:
    // IST is UTC+5:30.
    // So 05:00 IST = 23:30 UTC (prev day).
    function makeIstDate(hours: number, minutes: number): Date {
      // 2026-11-18 at specified hours:minutes IST
      // UTC hours = hours - 5, UTC minutes = minutes - 30
      let utcHours = hours - 5;
      let utcMinutes = minutes - 30;
      let day = 18;
      if (utcMinutes < 0) {
        utcMinutes += 60;
        utcHours -= 1;
      }
      if (utcHours < 0) {
        utcHours += 24;
        day -= 1;
      }
      const iso = `2026-11-${String(day).padStart(2, '0')}T${String(utcHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')}:00.000Z`;
      return new Date(iso);
    }

    it('correctly maps 5:00 AM to 11:59 AM to Morning', () => {
      expect(getGreetingPeriod(makeIstDate(5, 0))).toBe('MORNING');
      expect(getGreetingPeriod(makeIstDate(9, 30))).toBe('MORNING');
      expect(getGreetingPeriod(makeIstDate(11, 59))).toBe('MORNING');
    });

    it('correctly maps 12:00 PM to 12:29 PM to Afternoon', () => {
      expect(getGreetingPeriod(makeIstDate(12, 0))).toBe('AFTERNOON');
      expect(getGreetingPeriod(makeIstDate(12, 15))).toBe('AFTERNOON');
      expect(getGreetingPeriod(makeIstDate(12, 29))).toBe('AFTERNOON');
    });

    it('correctly maps 12:30 PM to 2:30 PM to Lunch (inclusive boundaries)', () => {
      // Starts exactly at 12:30 PM
      expect(getGreetingPeriod(makeIstDate(12, 30))).toBe('LUNCH');
      expect(getGreetingPeriod(makeIstDate(13, 0))).toBe('LUNCH');
      expect(getGreetingPeriod(makeIstDate(13, 45))).toBe('LUNCH');
      // Ends at 2:30 PM inclusive
      expect(getGreetingPeriod(makeIstDate(14, 30))).toBe('LUNCH');
    });

    it('correctly maps 2:31 PM to 3:59 PM to Afternoon (After Lunch)', () => {
      expect(getGreetingPeriod(makeIstDate(14, 31))).toBe('AFTER_LUNCH');
      expect(getGreetingPeriod(makeIstDate(15, 0))).toBe('AFTER_LUNCH');
      expect(getGreetingPeriod(makeIstDate(15, 59))).toBe('AFTER_LUNCH');
    });

    it('correctly maps 4:00 PM to 7:59 PM to Evening', () => {
      expect(getGreetingPeriod(makeIstDate(16, 0))).toBe('EVENING');
      expect(getGreetingPeriod(makeIstDate(18, 30))).toBe('EVENING');
      expect(getGreetingPeriod(makeIstDate(19, 59))).toBe('EVENING');
    });

    it('correctly maps 8:00 PM to 11:59 PM to Night', () => {
      expect(getGreetingPeriod(makeIstDate(20, 0))).toBe('NIGHT');
      expect(getGreetingPeriod(makeIstDate(22, 15))).toBe('NIGHT');
      expect(getGreetingPeriod(makeIstDate(23, 59))).toBe('NIGHT');
    });

    it('correctly maps 12:00 AM to 4:59 AM to Late Night', () => {
      expect(getGreetingPeriod(makeIstDate(0, 0))).toBe('LATE_NIGHT');
      expect(getGreetingPeriod(makeIstDate(2, 30))).toBe('LATE_NIGHT');
      expect(getGreetingPeriod(makeIstDate(4, 59))).toBe('LATE_NIGHT');
    });

    it('formats Kolkata local time parts accurately', () => {
      const parts = getKolkataTimeParts(makeIstDate(13, 10));
      expect(parts.hours).toBe(13);
      expect(parts.minutes).toBe(10);
      expect(parts.formattedTime).toContain('1:10');
      expect(parts.formattedTime).toContain('pm');
    });

    it('generates period labels and headline greetings correctly', () => {
      expect(getPeriodLabel('LUNCH')).toBe('Lunchtime check-in');
      expect(getPeriodLabel('MORNING')).toBe('Morning welcome');
      expect(getHeadlineGreeting('LUNCH', 'Kavitha')).toBe('Lunch break, Kavitha');
      expect(getHeadlineGreeting('MORNING', 'Kavitha')).toBe('Good morning, Kavitha');
    });
  });

  describe('4. Multiple Variations per Greeting Period', () => {
    it('provides varied messages across rotations for each time period', () => {
      const periods: GreetingPeriod[] = [
        'MORNING',
        'AFTERNOON',
        'LUNCH',
        'AFTER_LUNCH',
        'EVENING',
        'NIGHT',
        'LATE_NIGHT',
      ];

      for (const p of periods) {
        const v0 = getTimeBasedGreeting(p, 'Rohan', 0).message;
        const v1 = getTimeBasedGreeting(p, 'Rohan', 1).message;
        const v2 = getTimeBasedGreeting(p, 'Rohan', 2).message;

        expect(v0).not.toBe(v1);
        expect(v1).not.toBe(v2);
        expect(v0).not.toBe(v2);
      }
    });
  });

  describe('5. Activity-Based Appreciation (All 5 Activities)', () => {
    const userId = 'user-test-123';

    it('appreciates STUDIO_BOOKED activity', () => {
      const event: ActivityEvent = {
        type: 'STUDIO_BOOKED',
        userId,
        timestamp: Date.now(),
        reference: 'BK-2026-001',
      };
      const result = selectGreeting({
        userId,
        fullName: 'Kavitha Ramanathan',
        role: 'RJ',
        recentActivity: event,
      });

      expect(result.category).toBe('ACTIVITY');
      expect(result.activityType).toBe('STUDIO_BOOKED');
      expect(result.tag).toBe('Studio session booked');
      expect(result.message).toContain('Kavitha');
      expect(result.message).toContain('studio is booked');
    });

    it('appreciates RAW_AUDIO_UPLOADED activity', () => {
      const event: ActivityEvent = {
        type: 'RAW_AUDIO_UPLOADED',
        userId,
        timestamp: Date.now(),
        showName: 'Vanakkam Vellore',
      };
      const result = selectGreeting({
        userId,
        fullName: 'RJ Priya',
        role: 'RJ',
        recentActivity: event,
      });

      expect(result.category).toBe('ACTIVITY');
      expect(result.activityType).toBe('RAW_AUDIO_UPLOADED');
      expect(result.tag).toBe('Raw audio uploaded');
      expect(result.message).toContain('Priya');
      expect(result.message).toContain('recording is safely uploaded');
    });

    it('appreciates FINAL_AUDIO_UPLOADED activity', () => {
      const event: ActivityEvent = {
        type: 'FINAL_AUDIO_UPLOADED',
        userId,
        timestamp: Date.now(),
        showName: 'Science Hour',
      };
      const result = selectGreeting({
        userId,
        fullName: 'Anand Kumar',
        role: 'PRODUCER',
        recentActivity: event,
      });

      expect(result.category).toBe('ACTIVITY');
      expect(result.activityType).toBe('FINAL_AUDIO_UPLOADED');
      expect(result.tag).toBe('Final broadcast audio ready');
      expect(result.message).toContain('Anand');
      expect(result.message).toContain('final audio is in');
    });

    it('appreciates QC_APPROVED activity', () => {
      const event: ActivityEvent = {
        type: 'QC_APPROVED',
        userId,
        timestamp: Date.now(),
        details: 'Show approved with high fidelity',
      };
      const result = selectGreeting({
        userId,
        fullName: 'Devi Sharma',
        role: 'QC',
        recentActivity: event,
      });

      expect(result.category).toBe('ACTIVITY');
      expect(result.activityType).toBe('QC_APPROVED');
      expect(result.tag).toBe('Quality review approved');
      expect(result.message).toContain('Devi');
      expect(result.message).toContain('Another show is ready to move forward');
    });

    it('appreciates SHOW_SCHEDULED activity', () => {
      const event: ActivityEvent = {
        type: 'SHOW_SCHEDULED',
        userId,
        timestamp: Date.now(),
        showName: 'Morning Raga',
      };
      const result = selectGreeting({
        userId,
        fullName: 'Karthik Raja',
        role: 'PRODUCER',
        recentActivity: event,
      });

      expect(result.category).toBe('ACTIVITY');
      expect(result.activityType).toBe('SHOW_SCHEDULED');
      expect(result.tag).toBe('Broadcast scheduled');
      expect(result.message).toContain('Karthik');
      expect(result.message).toContain('on the schedule');
    });

    it('never leaks another user\'s activity to the current user', () => {
      const otherUserEvent: ActivityEvent = {
        type: 'QC_APPROVED',
        userId: 'other-user-999',
        timestamp: Date.now(),
      };
      const result = selectGreeting({
        userId: 'current-user-111',
        fullName: 'Ravi',
        role: 'RJ',
        recentActivity: otherUserEvent, // Belongs to other user!
      });

      // Must NOT be ACTIVITY greeting for other user!
      expect(result.category).not.toBe('ACTIVITY');
    });
  });

  describe('6. All Four Supported CMS Roles', () => {
    it('supports RJ role greeting', () => {
      const result = getRoleGreeting('RJ', 'Akshaya');
      expect(result.category).toBe('ROLE');
      expect(result.tag).toBe('RJ Desk');
      expect(result.message).toContain('Akshaya');
    });

    it('supports QC role greeting', () => {
      const result = getRoleGreeting('QC', 'Gowtham');
      expect(result.category).toBe('ROLE');
      expect(result.tag).toBe('Quality Control Desk');
      expect(result.message).toContain('Gowtham');
    });

    it('supports Producer role greeting', () => {
      const result = getRoleGreeting('PRODUCER', 'Meenakshi');
      expect(result.category).toBe('ROLE');
      expect(result.tag).toBe('Production Desk');
      expect(result.message).toContain('Meenakshi');
    });

    it('supports Admin role greeting', () => {
      const result = getRoleGreeting('ADMIN', 'Siddharth');
      expect(result.category).toBe('ROLE');
      expect(result.tag).toBe('Station Operations');
      expect(result.message).toContain('Siddharth');
    });
  });

  describe('7. Additional Recognition Greetings', () => {
    it('recognizes first-time login', () => {
      const result = selectGreeting({
        userId: 'new-user',
        fullName: 'Deepa',
        role: 'RJ',
        isFirstTime: true,
      });
      expect(result.category).toBe('SPECIAL');
      expect(result.tag).toBe('Welcome to the team');
      expect(result.message).toContain('Welcome to the team, Deepa!');
    });

    it('recognizes returning user after extended absence', () => {
      const result = selectGreeting({
        userId: 'returning-user',
        fullName: 'Vijay',
        role: 'PRODUCER',
        isReturningUser: true,
      });
      expect(result.category).toBe('SPECIAL');
      expect(result.tag).toBe('Welcome back');
      expect(result.message).toContain('Vijay');
    });

    it('recognizes multiple completed activities in one day', () => {
      const result = selectGreeting({
        userId: 'active-user',
        fullName: 'Sangeetha',
        role: 'QC',
        hasMultipleActivitiesToday: true,
      });
      expect(result.category).toBe('SPECIAL');
      expect(result.tag).toBe('Productive day');
      expect(result.message).toContain('Sangeetha');
    });

    it('recognizes broadcast milestone achievements', () => {
      const result = selectGreeting({
        userId: 'veteran-user',
        fullName: 'Prakash',
        role: 'RJ',
        isMilestone: true,
      });
      expect(result.category).toBe('SPECIAL');
      expect(result.tag).toBe('Station milestone');
      expect(result.message).toContain('Prakash');
    });
  });

  describe('8. Message Selection Priority Chain', () => {
    const userId = 'priority-user-1';

    it('Priority 1: Recent activity overrides first-time, role, and time greetings', () => {
      const recentEvent: ActivityEvent = {
        type: 'QC_APPROVED',
        userId,
        timestamp: Date.now(),
      };
      const result = selectGreeting({
        userId,
        fullName: 'Manoj',
        role: 'QC',
        recentActivity: recentEvent,
        isFirstTime: true, // Should be overridden by recent activity
      });
      expect(result.category).toBe('ACTIVITY');
      expect(result.activityType).toBe('QC_APPROVED');
    });

    it('Priority 2: First-time recognition overrides general role and time greetings', () => {
      const result = selectGreeting({
        userId,
        fullName: 'Manoj',
        role: 'QC',
        isFirstTime: true,
      });
      expect(result.category).toBe('SPECIAL');
      expect(result.tag).toBe('Welcome to the team');
    });

    it('Caring check-in precedence: Lunch and Late-Night prioritize care and well-being', () => {
      // 1:00 PM IST is lunch
      const lunchDate = new Date('2026-11-18T07:30:00.000Z'); // 1:00 PM IST
      const result = selectGreeting({
        userId,
        fullName: 'Manoj',
        role: 'ADMIN',
        date: lunchDate,
      });
      expect(result.period).toBe('LUNCH');
      expect(result.message).toContain('lunch');
    });
  });

  describe('9. Activity Event Service & Storage Layer', () => {
    it('records and retrieves user activity within valid time window', () => {
      const recorded = activityEventService.recordActivity('STUDIO_BOOKED', 'test-user-persist', {
        reference: 'BK-999',
      });
      expect(recorded.type).toBe('STUDIO_BOOKED');
      expect(recorded.reference).toBe('BK-999');

      const retrieved = activityEventService.getRecentActivity('test-user-persist');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.type).toBe('STUDIO_BOOKED');

      // Clear activity
      activityEventService.clearRecentActivity('test-user-persist');
      const cleared = activityEventService.getRecentActivity('test-user-persist');
      expect(cleared).toBeNull();
    });
  });

  describe('10. YOYO Toast Notification & Companion Specifications', () => {
    it('generates the exact lunchtime message from YOYO companion example', () => {
      // 1:43 PM IST = 08:13 UTC
      const date143pm = new Date('2026-11-18T08:13:00.000Z');
      const greeting = selectGreeting({
        userId: 'daniel-1',
        fullName: 'Daniel',
        role: 'PRODUCER',
        date: date143pm,
        variationIndex: 0,
      });

      expect(greeting.period).toBe('LUNCH');
      expect(greeting.message).toBe(
        "Good afternoon, Daniel! It's lunchtime. Take a little break, grab something delicious, and recharge. I'll be here when you're back!"
      );
      expect(greeting.formattedTimeIst).toContain('1:43');
      expect(greeting.formattedTimeIst).toContain('PM IST');
    });

    it('formats IST time in uppercase AM/PM with IST timezone suffix', () => {
      const morningDate = new Date('2026-11-18T03:45:00.000Z'); // 9:15 AM IST
      const parts = getKolkataTimeParts(morningDate);
      expect(parts.formattedTimeIst).toBe('9:15 AM IST');

      const eveningDate = new Date('2026-11-18T13:00:00.000Z'); // 6:30 PM IST
      const partsEve = getKolkataTimeParts(eveningDate);
      expect(partsEve.formattedTimeIst).toBe('6:30 PM IST');
    });

    it('verifies YOYO notification component and Dashboard integration', () => {
      const yoyoPath = join(process.cwd(), 'src/components/dashboard/YoyoToast.tsx');
      expect(existsSync(yoyoPath)).toBe(true);
      const yoyoCode = readFileSync(yoyoPath, 'utf8');
      expect(yoyoCode).toContain("Hey, I'm Yoyo!");
      expect(yoyoCode).toContain('Your little friend from Growiota.');
      expect(yoyoCode).toContain('yoyo-toast-container');
      expect(yoyoCode).toContain('autoDismissMs = 10000');
      expect(yoyoCode).toContain('yoyo-close-btn');

      // Verify the purple YOYO avatar badge/logo is completely removed
      expect(yoyoCode).not.toContain('yoyo-avatar-badge');

      // Verify old banner is removed from DashboardPage.tsx
      const dashboardPath = join(process.cwd(), 'src/pages/DashboardPage.tsx');
      const dashboardCode = readFileSync(dashboardPath, 'utf8');
      expect(dashboardCode).not.toContain('NoteForYouCard');
      expect(dashboardCode).not.toContain('A LITTLE NOTE FOR YOU');

      // Verify YoyoToast is mounted in AppLayout across the CMS
      const appLayoutPath = join(process.cwd(), 'src/layouts/AppLayout.tsx');
      const appLayoutCode = readFileSync(appLayoutPath, 'utf8');
      expect(appLayoutCode).toContain('<YoyoToast');
    });
  });

  describe('11. Session-Based Greeting State Management Across All CMS Tabs', () => {
    it('initializes session greeting as not shown for a new session', () => {
      const testUser = 'user-session-test-' + Date.now();
      expect(activityEventService.hasShownSessionGreeting(testUser)).toBe(false);
    });

    it('marks session greeting as shown and persists in session storage', () => {
      const testUser = 'user-session-test-' + Date.now();
      expect(activityEventService.hasShownSessionGreeting(testUser)).toBe(false);

      activityEventService.markSessionGreetingShown(testUser);
      expect(activityEventService.hasShownSessionGreeting(testUser)).toBe(true);
    });

    it('resets session greeting state when user logs out', () => {
      const testUser = 'user-session-logout-' + Date.now();
      activityEventService.markSessionGreetingShown(testUser);
      expect(activityEventService.hasShownSessionGreeting(testUser)).toBe(true);

      // User logs out -> resetSessionGreeting is invoked
      activityEventService.resetSessionGreeting(testUser);
      expect(activityEventService.hasShownSessionGreeting(testUser)).toBe(false);
    });

    it('resets all session greetings on global resetSessionGreeting()', () => {
      const userA = 'user-a-' + Date.now();
      const userB = 'user-b-' + Date.now();
      activityEventService.markSessionGreetingShown(userA);
      activityEventService.markSessionGreetingShown(userB);

      expect(activityEventService.hasShownSessionGreeting(userA)).toBe(true);
      expect(activityEventService.hasShownSessionGreeting(userB)).toBe(true);

      activityEventService.resetSessionGreeting();
      expect(activityEventService.hasShownSessionGreeting(userA)).toBe(false);
      expect(activityEventService.hasShownSessionGreeting(userB)).toBe(false);
    });

    it('activity appreciation takes precedence over session greeting flag', () => {
      const testUser = 'user-activity-precedence-' + Date.now();
      // Ordinary greeting was already shown
      activityEventService.markSessionGreetingShown(testUser);
      expect(activityEventService.hasShownSessionGreeting(testUser)).toBe(true);

      // Now user records an activity (e.g. booked a studio)
      const recorded = activityEventService.recordActivity('STUDIO_BOOKED', testUser, {
        reference: 'BK-555',
      });

      // getRecentActivity should return the activity even though session greeting is marked shown
      const recent = activityEventService.getRecentActivity(testUser);
      expect(recent).not.toBeNull();
      expect(recent?.type).toBe('STUDIO_BOOKED');
      expect(recent?.reference).toBe('BK-555');

      // Clear activity once acknowledged
      activityEventService.clearRecentActivity(testUser, recorded.timestamp);
      expect(activityEventService.getRecentActivity(testUser)).toBeNull();
    });

    it('verifies YoyoToast is mounted in AppLayout across all CMS tabs without duplication', () => {
      // 1. AppLayout MUST mount YoyoToast so it is globally active across all CMS tabs
      const appLayoutPath = join(process.cwd(), 'src/layouts/AppLayout.tsx');
      expect(existsSync(appLayoutPath)).toBe(true);
      const appLayoutCode = readFileSync(appLayoutPath, 'utf8');
      expect(appLayoutCode).toContain("import { YoyoToast } from '@/components/dashboard/YoyoToast';");
      expect(appLayoutCode).toContain('<YoyoToast');

      // 2. DashboardPage must NOT have a duplicate YoyoToast instance
      const dashboardPath = join(process.cwd(), 'src/pages/DashboardPage.tsx');
      const dashboardCode = readFileSync(dashboardPath, 'utf8');
      expect(dashboardCode).not.toContain('<YoyoToast');

      // 3. Sub-pages must not declare separate duplicate instances
      const subPages = [
        'src/pages/StudioPage.tsx',
        'src/pages/MyBookingsPage.tsx',
        'src/pages/EpisodesPage.tsx',
        'src/pages/EpisodeDetailPage.tsx',
        'src/pages/QcPage.tsx',
        'src/pages/SchedulePage.tsx',
        'src/pages/AudioLibraryPage.tsx',
        'src/pages/UsersPage.tsx',
        'src/pages/BadgesPage.tsx',
        'src/pages/SettingsPage.tsx',
        'src/pages/HolidaysPage.tsx',
        'src/pages/FeedbackPage.tsx',
        'src/pages/admin/AnalyticsPage.tsx',
      ];

      for (const relPath of subPages) {
        const fullPath = join(process.cwd(), relPath);
        if (existsSync(fullPath)) {
          const code = readFileSync(fullPath, 'utf8');
          expect(code, `${relPath} must not contain duplicate YoyoToast`).not.toContain('<YoyoToast');
        }
      }
    });

    it('verifies all supported activity triggers across CMS tabs (QC, Episodes, Studio, Audio, Scheduling)', () => {
      const testUser = 'user-multitab-activity-' + Date.now();

      // 1. Studio Booking activity trigger
      const studioBooking = activityEventService.recordActivity('STUDIO_BOOKED', testUser, {
        reference: 'BK-101',
        details: '2026-11-20',
      });
      expect(studioBooking.type).toBe('STUDIO_BOOKED');
      let currentActivity = activityEventService.getRecentActivity(testUser);
      expect(currentActivity?.type).toBe('STUDIO_BOOKED');
      activityEventService.clearRecentActivity(testUser, studioBooking.timestamp);

      // 2. Audio Upload raw take trigger
      const rawAudio = activityEventService.recordActivity('RAW_AUDIO_UPLOADED', testUser, {
        showName: 'Morning Waves',
        details: 'raw_take_1.wav',
      });
      expect(rawAudio.type).toBe('RAW_AUDIO_UPLOADED');
      currentActivity = activityEventService.getRecentActivity(testUser);
      expect(currentActivity?.type).toBe('RAW_AUDIO_UPLOADED');
      activityEventService.clearRecentActivity(testUser, rawAudio.timestamp);

      // 3. Episodes tab / final master audio trigger
      const finalAudio = activityEventService.recordActivity('FINAL_AUDIO_UPLOADED', testUser, {
        showName: 'Campus Chronicle',
        details: 'master_final.mp3',
      });
      expect(finalAudio.type).toBe('FINAL_AUDIO_UPLOADED');
      currentActivity = activityEventService.getRecentActivity(testUser);
      expect(currentActivity?.type).toBe('FINAL_AUDIO_UPLOADED');
      activityEventService.clearRecentActivity(testUser, finalAudio.timestamp);

      // 4. QC tab approval trigger
      const qcApproved = activityEventService.recordActivity('QC_APPROVED', testUser, {
        showName: 'Vellore Science Hour',
        details: 'ep-777',
      });
      expect(qcApproved.type).toBe('QC_APPROVED');
      currentActivity = activityEventService.getRecentActivity(testUser);
      expect(currentActivity?.type).toBe('QC_APPROVED');
      activityEventService.clearRecentActivity(testUser, qcApproved.timestamp);

      // 5. Scheduling tab trigger
      const scheduled = activityEventService.recordActivity('SHOW_SCHEDULED', testUser, {
        details: 'ep-777',
      });
      expect(scheduled.type).toBe('SHOW_SCHEDULED');
      currentActivity = activityEventService.getRecentActivity(testUser);
      expect(currentActivity?.type).toBe('SHOW_SCHEDULED');
      activityEventService.clearRecentActivity(testUser, scheduled.timestamp);
    });

    it('verifies AuthProvider wires session greeting reset to signOut and auth changes', () => {
      const authProviderPath = join(process.cwd(), 'src/hooks/AuthProvider.tsx');
      const authProviderCode = readFileSync(authProviderPath, 'utf8');
      expect(authProviderCode).toContain('activityEventService.resetSessionGreeting');
      expect(authProviderCode).toContain('resetSessionGreeting(currentUserId)');
    });

    it('verifies YoyoToast implementation uses session-based visibility check', () => {
      const yoyoPath = join(process.cwd(), 'src/components/dashboard/YoyoToast.tsx');
      const yoyoCode = readFileSync(yoyoPath, 'utf8');
      expect(yoyoCode).toContain('activityEventService.hasShownSessionGreeting');
      expect(yoyoCode).toContain('activityEventService.markSessionGreetingShown');
      expect(yoyoCode).toContain('autoDismissMs = 10000');
    });
  });
});
