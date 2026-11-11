import { describe, expect, it, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONFETTI_PRESETS,
  TOAST_DURATION_MS,
  createFeedbackDeduper,
  formatBookingCelebrationMessage,
  formatPublishCelebrationMessage,
  isReducedMotionPreferred,
} from '@/context/successFeedbackContext';

const ROOT = path.resolve(__dirname, '../../');

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('Success Animations & Feedback System', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('1. Confetti presets & timing discipline (~1–2 seconds)', () => {
    it('configures subtle booking confetti shorter and lighter than publish celebration confetti', () => {
      const { subtle, celebration } = CONFETTI_PRESETS;

      // Both stay short (~1-2 seconds)
      expect(subtle.durationMs).toBeGreaterThanOrEqual(1000);
      expect(subtle.durationMs).toBeLessThanOrEqual(2000);
      expect(celebration.durationMs).toBeGreaterThanOrEqual(1200);
      expect(celebration.durationMs).toBeLessThanOrEqual(2000);

      // Show publishing is slightly more noticeable than studio booking
      expect(celebration.particleCount).toBeGreaterThan(subtle.particleCount);
      expect(celebration.durationMs).toBeGreaterThan(subtle.durationMs);
      expect(celebration.dualEmitter).toBe(true);
      expect(subtle.dualEmitter).toBe(false);

      // Keep particle budgets lightweight
      expect(subtle.particleCount).toBeLessThanOrEqual(30);
      expect(celebration.particleCount).toBeLessThanOrEqual(60);
    });

    it('keeps toast auto-dismiss durations balanced and readable', () => {
      expect(TOAST_DURATION_MS.publish).toBeGreaterThan(TOAST_DURATION_MS.save);
      expect(TOAST_DURATION_MS.booking).toBeGreaterThan(TOAST_DURATION_MS.save);
      expect(TOAST_DURATION_MS.save).toBeGreaterThanOrEqual(3000);
    });
  });

  describe('2. Show publishing & studio booking message formatting', () => {
    it('formats "Your show is live!" with published show name when available', () => {
      const msg = formatPublishCelebrationMessage({
        showName: 'Campus Late Night Ep. 4',
        programName: 'Midnight Beats',
      });

      expect(msg.title).toBe('Your show is live!');
      expect(msg.badgeText).toBe('LIVE');
      expect(msg.detail).toContain('Campus Late Night Ep. 4');
      expect(msg.detail).toContain('Midnight Beats');
    });

    it('avoids duplicate repetition when show name matches program name', () => {
      const msg = formatPublishCelebrationMessage({
        showName: 'Morning Buzz',
        programName: 'morning buzz',
      });

      expect(msg.title).toBe('Your show is live!');
      expect(msg.detail).toBe('"Morning Buzz"');
    });

    it('gracefully falls back when show name is absent', () => {
      const msg = formatPublishCelebrationMessage({});
      expect(msg.title).toBe('Your show is live!');
      expect(msg.detail.length).toBeGreaterThan(0);
    });

    it('formats studio booking confirmation details concisely', () => {
      const msg = formatBookingCelebrationMessage({
        showName: 'Tech Talk',
        reference: 'VCR-2026-000199',
        dateLabel: 'Mon, 16 Nov',
        timeLabel: '10:00 AM',
      });

      expect(msg.title).toBe('Studio slot booked!');
      expect(msg.detail).toContain('Tech Talk');
      expect(msg.detail).toContain('Mon, 16 Nov');
      expect(msg.detail).toContain('10:00 AM');
      expect(msg.detail).toContain('VCR-2026-000199');
    });

    it('labels studio tours accurately when isTour is true', () => {
      const msg = formatBookingCelebrationMessage({
        showName: 'Freshers Tour',
        isTour: true,
      });

      expect(msg.title).toBe('Studio tour booked!');
      expect(msg.detail).toContain('Freshers Tour');
    });
  });

  describe('3. Duplicate animation & toast prevention', () => {
    it('blocks duplicate confetti bursts and duplicate toasts within cooldown windows', () => {
      const deduper = createFeedbackDeduper(2500, 1500, 350);

      // First booking triggers both confetti and toast
      expect(deduper.canTriggerConfetti('booking:123', 10_000)).toBe(true);
      expect(deduper.canShowToast('booking:123', 10_000)).toBe(true);

      // Duplicate re-render / repeated API response within cooldown is blocked
      expect(deduper.canTriggerConfetti('booking:123', 10_500)).toBe(false);
      expect(deduper.canShowToast('booking:123', 10_500)).toBe(false);

      // Still blocked at 2.0s for confetti (cooldown 2.5s), allowed for toast (>1.5s)
      expect(deduper.canTriggerConfetti('booking:123', 12_000)).toBe(false);
      expect(deduper.canShowToast('booking:123', 12_000)).toBe(true);

      // Allowed again after full confetti cooldown expires
      expect(deduper.canTriggerConfetti('booking:123', 13_000)).toBe(true);
    });

    it('throttles overlapping rapid bursts across different keys', () => {
      const deduper = createFeedbackDeduper(2500, 1500, 350);

      expect(deduper.canTriggerConfetti('publish:ep-1', 1000)).toBe(true);
      expect(deduper.canTriggerConfetti('publish:ep-2', 1100)).toBe(false);
      expect(deduper.canTriggerConfetti('publish:ep-2', 1400)).toBe(true);
    });
  });

  describe('4. Reduced motion & accessibility compliance', () => {
    it('returns false safely in non-browser environments', () => {
      expect(isReducedMotionPreferred()).toBe(false);
    });

    it('detects prefers-reduced-motion: reduce cleanly', () => {
      vi.stubGlobal('window', {
        matchMedia: (query: string) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
        }),
      });

      expect(isReducedMotionPreferred()).toBe(true);
    });

    it('guards CSS and canvas animations behind prefers-reduced-motion rules', () => {
      const css = readSrc('src/styles/success-feedback.css');
      const studioCss = readSrc('src/styles/studio.css');
      const canvasSrc = readSrc('src/components/feedback/ConfettiCanvas.tsx');

      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toContain('@media (prefers-reduced-motion: no-preference)');
      expect(css).toContain('pointer-events: none');
      expect(studioCss).toContain('@media (prefers-reduced-motion: no-preference)');
      expect(canvasSrc).toContain('isReducedMotionPreferred()');
      expect(canvasSrc).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
      expect(canvasSrc).toContain('sf-confetti-canvas');
    });
  });

  describe('5. Workflow integration verification (post-backend only, tier separation)', () => {
    it('wraps application routes in SuccessFeedbackProvider inside App.tsx', () => {
      const appSrc = readSrc('src/App.tsx');
      const mainSrc = readSrc('src/main.tsx');

      expect(appSrc).toContain('<SuccessFeedbackProvider>');
      expect(appSrc).toContain('</SuccessFeedbackProvider>');
      expect(mainSrc).toContain("./styles/success-feedback.css");
    });

    it('wires BookingDialog to celebrateBooking strictly after createBooking resolves', () => {
      const src = readSrc('src/components/studio/BookingDialog.tsx');

      expect(src).toContain('celebrateBooking');
      expect(src).toContain('bookingService.createBooking');
      // Booking request (not yet booked) uses simple save toast, not booking confetti
      expect(src).toContain("title: 'Booking request sent'");
      expect(src.indexOf('bookingService.createBooking')).toBeLessThan(
        src.lastIndexOf('celebrateBooking('),
      );
    });

    it('wires HomepageScheduleDialog and EpisodeDetailPage to celebratePublish only after publish confirms', () => {
      const dialogSrc = readSrc('src/components/studio/HomepageScheduleDialog.tsx');
      const detailSrc = readSrc('src/pages/EpisodeDetailPage.tsx');

      expect(dialogSrc).toContain('resolveEpisodePublishStatus(saved)');
      expect(dialogSrc).toContain('celebratePublish');
      expect(dialogSrc).toContain('notifySave');
      expect(dialogSrc.indexOf('scheduleHomepageEpisode')).toBeLessThan(
        dialogSrc.indexOf('celebratePublish('),
      );

      expect(detailSrc).toContain('celebratePublish');
      expect(detailSrc).toContain('notifyUpload');
      expect(detailSrc).toContain('notifyApproval');
      expect(detailSrc).toContain('notifySave');
      expect(detailSrc.indexOf('scheduleHomepageEpisode')).toBeLessThan(
        detailSrc.indexOf('celebratePublish('),
      );
    });

    it('uses subtle upload/approval feedback vs simple save toasts appropriately', () => {
      const recSrc = readSrc('src/components/studio/RecordingDialog.tsx');
      const qcSrc = readSrc('src/pages/QcPage.tsx');
      const myBookingsSrc = readSrc('src/pages/MyBookingsPage.tsx');
      const settingsSrc = readSrc('src/pages/SettingsPage.tsx');
      const programsSrc = readSrc('src/pages/ProgramsPage.tsx');

      expect(recSrc).toContain('notifyUpload');
      expect(recSrc).not.toContain('celebrateBooking');
      expect(recSrc).not.toContain('celebratePublish');

      expect(qcSrc).toContain('notifyApproval');
      expect(qcSrc).toContain('notifySave');
      expect(qcSrc).not.toContain('celebratePublish(');

      expect(myBookingsSrc).toContain('notifyApproval');
      expect(myBookingsSrc).toContain('notifySave');

      // Ordinary save pages stay on simple toast notifications
      expect(settingsSrc).toContain('notifySave');
      expect(settingsSrc).not.toContain('celebrate');
      expect(programsSrc).toContain('notifySave');
      expect(programsSrc).not.toContain('celebrate');
    });
  });
});
