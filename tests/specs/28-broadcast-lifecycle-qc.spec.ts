/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';
import { computeEpisodeLifecycle, qcService, sortCompletedQCEpisodes, type EpisodeWithLifecycle } from '@/services/qcService';
import type { EpisodeWithRelations } from '@/services/episodeService';
import type { ScheduleRow } from '@/types/database';

function createMockEpisode(overrides: Partial<EpisodeWithRelations> = {}): EpisodeWithRelations {
  return {
    id: 'ep-123',
    episode_id: 'VCR-2026-000101',
    program_id: 'prog-1',
    title: 'Test Episode Morning Drive',
    description: 'A great morning show',
    episode_number: 1,
    host_name: 'RJ Sriganth',
    assigned_rj: 'usr-1',
    audio_file_id: 'aud-1',
    final_audio_file_id: 'aud-final-1',
    duration_seconds: 1800,
    status: 'APPROVED',
    submitted_at: '2026-11-01T10:00:00Z',
    reviewed_at: '2026-11-01T14:00:00Z',
    raw_file_delete_at: null,
    archived_at: null,
    show_on_homepage: false,
    homepage_publish_at: null,
    homepage_expires_at: null,
    created_by: 'usr-1',
    studio_name: 'Main Studio',
    created_at: '2026-11-01T09:00:00Z',
    updated_at: '2026-11-01T14:00:00Z',
    program: { id: 'prog-1', name: 'Vanakkam Vellore', requires_audio: true, active: true },
    audio_file: null,
    final_audio_file: {
      id: 'aud-final-1',
      episode_id: 'ep-123',
      file_name: 'final-audio.mp3',
      storage_path: 'episodes/ep-123/final-audio.mp3',
      mime_type: 'audio/mpeg',
      file_size: 15000000,
      duration_seconds: 1800,
      uploaded_by: 'usr-1',
      deleted_at: null,
      created_at: '2026-11-01T09:00:00Z',
      updated_at: '2026-11-01T09:00:00Z',
    },
    author: { id: 'usr-1', full_name: 'RJ Sriganth' },
    assignee: { id: 'usr-1', full_name: 'RJ Sriganth' },
    ...overrides,
  };
}

function createMockSchedule(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: 'sched-1',
    program_id: 'prog-1',
    episode_id: 'ep-123',
    start_time: '2026-11-09T03:30:00Z', // 09:00 AM IST
    end_time: '2026-11-09T04:30:00Z',   // 10:00 AM IST
    status: 'SCHEDULED',
    notes: 'Live morning broadcast slot',
    created_by: 'admin-1',
    studio_name: 'Studio A',
    created_at: '2026-11-02T10:00:00Z',
    updated_at: '2026-11-02T10:00:00Z',
    ...overrides,
  };
}

describe('Broadcast Lifecycle Tracking in QC Dashboard', () => {
  const refTime = new Date('2026-11-05T12:00:00Z');

  describe('Scenario 1: QC completed vs unapproved draft with no schedule', () => {
    it('classifies approved episode as NOT_SCHEDULED and unapproved episode as DRAFT when no schedule exists', () => {
      const approvedEp = createMockEpisode({ status: 'APPROVED' });
      const draftEp = createMockEpisode({ id: 'ep-draft', status: 'DRAFT' });

      const approvedResult = computeEpisodeLifecycle(approvedEp, [], refTime);
      const draftResult = computeEpisodeLifecycle(draftEp, [], refTime);

      expect(approvedResult.lifecycleStatus).toBe('NOT_SCHEDULED');
      expect(approvedResult.activeSchedule).toBeNull();
      expect(approvedResult.publishedAt).toBeNull();

      expect(draftResult.lifecycleStatus).toBe('DRAFT');
      expect(draftResult.activeSchedule).toBeNull();
      expect(draftResult.publishedAt).toBeNull();
    });
  });

  describe('Scenario 2: QC completed, schedule created', () => {
    it('classifies approved episode as SCHEDULED when a valid broadcast schedule is created', () => {
      const ep = createMockEpisode();
      const sched = createMockSchedule({ status: 'SCHEDULED' });
      const result = computeEpisodeLifecycle(ep, [sched], refTime);

      expect(result.lifecycleStatus).toBe('SCHEDULED');
      expect(result.activeSchedule?.id).toBe(sched.id);
      expect(result.activeSchedule?.start_time).toBe(sched.start_time);
    });

    it('classifies approved episode as SCHEDULED when broadcast is ON_AIR', () => {
      const ep = createMockEpisode();
      const sched = createMockSchedule({ status: 'ON_AIR' });
      const result = computeEpisodeLifecycle(ep, [sched], refTime);

      expect(result.lifecycleStatus).toBe('SCHEDULED');
      expect(result.activeSchedule?.status).toBe('ON_AIR');
    });

    it('classifies approved episode as SCHEDULED when scheduled for future homepage release', () => {
      const ep = createMockEpisode({
        show_on_homepage: true,
        homepage_publish_at: '2026-11-06T09:00:00Z', // In the future relative to refTime
        homepage_expires_at: '2026-11-06T23:00:00Z',
      });
      const result = computeEpisodeLifecycle(ep, [], refTime);

      expect(result.lifecycleStatus).toBe('SCHEDULED');
      expect(result.homepageScheduledAt).toBe('2026-11-06T09:00:00Z');
      expect(result.homepageExpiresAt).toBe('2026-11-06T23:00:00Z');
      expect(result.lifecycleTarget).toBe('HOMEPAGE');
    });

    it('classifies approved episode as SCHEDULED with target BOTH when both broadcast and homepage scheduled', () => {
      const ep = createMockEpisode({
        show_on_homepage: true,
        homepage_publish_at: '2026-11-07T09:00:00Z',
      });
      const sched = createMockSchedule({ status: 'SCHEDULED' });
      const result = computeEpisodeLifecycle(ep, [sched], refTime);

      expect(result.lifecycleStatus).toBe('SCHEDULED');
      expect(result.activeSchedule?.id).toBe(sched.id);
      expect(result.homepageScheduledAt).toBe('2026-11-07T09:00:00Z');
      expect(result.lifecycleTarget).toBe('BOTH');
    });
  });

  describe('Scenario 3: Schedule cancelled or removed', () => {
    it('returns to NOT_SCHEDULED when an approved episode schedule is cancelled', () => {
      const ep = createMockEpisode();
      const cancelledSched = createMockSchedule({ status: 'CANCELLED' });
      const result = computeEpisodeLifecycle(ep, [cancelledSched], refTime);

      expect(result.lifecycleStatus).toBe('NOT_SCHEDULED');
      expect(result.activeSchedule).toBeNull();
    });
  });

  describe('Scenario 4: Rescheduled episode', () => {
    it('picks the active schedule and remains SCHEDULED when previous schedule was cancelled', () => {
      const ep = createMockEpisode();
      const cancelledSched = createMockSchedule({ id: 'sched-old', status: 'CANCELLED' });
      const newSched = createMockSchedule({
        id: 'sched-new',
        start_time: '2026-11-10T04:00:00Z',
        end_time: '2026-11-10T05:00:00Z',
        status: 'SCHEDULED',
      });

      const result = computeEpisodeLifecycle(ep, [newSched, cancelledSched], refTime);

      expect(result.lifecycleStatus).toBe('SCHEDULED');
      expect(result.activeSchedule?.id).toBe('sched-new');
      expect(result.activeSchedule?.start_time).toBe('2026-11-10T04:00:00Z');
    });
  });

  describe('Scenario 5: Episode successfully published', () => {
    it('classifies episode as PUBLISHED when published on homepage', () => {
      const ep = createMockEpisode({
        show_on_homepage: true,
        homepage_publish_at: '2026-11-04T10:00:00Z',
      });
      const sched = createMockSchedule({ status: 'SCHEDULED' });

      const result = computeEpisodeLifecycle(ep, [sched], refTime);

      expect(result.lifecycleStatus).toBe('PUBLISHED');
      expect(result.publishedAt).toBe('2026-11-04T10:00:00Z');
    });

    it('classifies episode as PUBLISHED when broadcast has COMPLETED', () => {
      const ep = createMockEpisode({ show_on_homepage: false });
      const completedSched = createMockSchedule({
        status: 'COMPLETED',
        end_time: '2026-11-04T11:00:00Z',
      });

      const result = computeEpisodeLifecycle(ep, [completedSched], refTime);

      expect(result.lifecycleStatus).toBe('PUBLISHED');
      expect(result.publishedAt).toBe('2026-11-04T11:00:00Z');
    });

    it('does NOT classify as Published merely because scheduled time passed if broadcast not completed', () => {
      // Past start time, but status is still SCHEDULED (e.g. pending manual or system sync) and not on homepage
      const ep = createMockEpisode({ show_on_homepage: false });
      const pastSched = createMockSchedule({
        start_time: '2026-11-04T09:00:00Z',
        end_time: '2026-11-04T10:00:00Z',
        status: 'SCHEDULED',
      });

      const result = computeEpisodeLifecycle(ep, [pastSched], refTime);

      expect(result.lifecycleStatus).toBe('SCHEDULED');
    });
  });

  describe('Scenario 6: Episode unpublished, expired, or failed', () => {
    it('reverts to SCHEDULED if removed from homepage and an active schedule exists', () => {
      const ep = createMockEpisode({ show_on_homepage: false, homepage_publish_at: null });
      const sched = createMockSchedule({ status: 'SCHEDULED' });

      const result = computeEpisodeLifecycle(ep, [sched], refTime);

      expect(result.lifecycleStatus).toBe('SCHEDULED');
    });

    it('reverts to NOT_SCHEDULED if an approved episode is unscheduled from homepage and no active schedule exists', () => {
      const ep = createMockEpisode({ show_on_homepage: false, homepage_publish_at: null });

      const result = computeEpisodeLifecycle(ep, [], refTime);

      expect(result.lifecycleStatus).toBe('NOT_SCHEDULED');
    });

    it('classifies episode as EXPIRED (never DRAFT or NOT_SCHEDULED) once homepage expiry has passed', () => {
      const ep = createMockEpisode({
        show_on_homepage: true,
        homepage_publish_at: '2026-11-01T10:00:00Z',
        homepage_expires_at: '2026-11-04T23:59:59Z',
      });

      const result = computeEpisodeLifecycle(ep, [], refTime);

      expect(result.lifecycleStatus).toBe('EXPIRED');
      expect(result.publishedAt).toBe('2026-11-01T10:00:00Z');
    });

    it('classifies episode as FAILED when publish_status is FAILED and retains publish_error', () => {
      const ep = createMockEpisode({
        publish_status: 'FAILED',
        publish_error: 'Audio asset unavailable at publish time',
        scheduled_at: '2026-11-05T10:00:00Z',
      });

      const result = computeEpisodeLifecycle(ep, [], refTime);

      expect(result.lifecycleStatus).toBe('FAILED');
      expect(result.publishError).toBe('Audio asset unavailable at publish time');
    });
  });

  describe('Scenario 7: Lifecycle Counts', () => {
    it('accurately counts episodes in each lifecycle status', () => {
      const ep1: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-1' }),
        lifecycleStatus: 'NOT_SCHEDULED',
        activeSchedule: null,
        publishedAt: null,
      };
      const ep2: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-2', status: 'DRAFT' }),
        lifecycleStatus: 'DRAFT',
        activeSchedule: null,
        publishedAt: null,
      };
      const ep3: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-3' }),
        lifecycleStatus: 'SCHEDULED',
        activeSchedule: createMockSchedule(),
        publishedAt: null,
      };
      const ep4: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-4' }),
        lifecycleStatus: 'PUBLISHED',
        activeSchedule: null,
        publishedAt: '2026-11-04T10:00:00Z',
      };
      const ep5: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-5' }),
        lifecycleStatus: 'EXPIRED',
        activeSchedule: null,
        publishedAt: '2026-11-01T10:00:00Z',
      };
      const ep6: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-6' }),
        lifecycleStatus: 'FAILED',
        activeSchedule: null,
        publishedAt: null,
      };

      const counts = qcService.getLifecycleCounts([ep1, ep2, ep3, ep4, ep5, ep6]);

      expect(counts.all).toBe(6);
      expect(counts.notScheduled).toBe(1);
      expect(counts.draft).toBe(1);
      expect(counts.scheduled).toBe(1);
      expect(counts.published).toBe(1);
      expect(counts.expired).toBe(1);
      expect(counts.failed).toBe(1);
    });
  });

  describe('Scenario 8: QC Status Ordering & Date-Wise Grouping', () => {
    it('orders categories: Not Scheduled -> Draft -> Scheduled -> Published -> Expired', () => {
      const pub: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-pub', title: 'Published Episode' }),
        lifecycleStatus: 'PUBLISHED',
        publishedAt: '2026-11-05T10:00:00Z',
      };
      const sched: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-sched', title: 'Scheduled Episode' }),
        lifecycleStatus: 'SCHEDULED',
        activeSchedule: createMockSchedule({ start_time: '2026-11-07T10:00:00Z' }),
      };
      const notSched: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-not-sched', title: 'Not Scheduled Episode' }),
        lifecycleStatus: 'NOT_SCHEDULED',
        reviewed_at: '2026-11-05T09:00:00Z',
      };
      const draft: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-draft', title: 'Draft Episode', status: 'DRAFT' }),
        lifecycleStatus: 'DRAFT',
        reviewed_at: '2026-11-05T09:00:00Z',
      };
      const exp: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-exp', title: 'Expired Episode' }),
        lifecycleStatus: 'EXPIRED',
        publishedAt: '2026-11-02T09:00:00Z',
      };

      const sorted = sortCompletedQCEpisodes([pub, exp, draft, sched, notSched]);

      expect(sorted.map((e) => e.id)).toEqual(['ep-not-sched', 'ep-draft', 'ep-sched', 'ep-pub', 'ep-exp']);
      expect(sorted[0].lifecycleStatus).toBe('NOT_SCHEDULED');
      expect(sorted[1].lifecycleStatus).toBe('DRAFT');
      expect(sorted[2].lifecycleStatus).toBe('SCHEDULED');
      expect(sorted[3].lifecycleStatus).toBe('PUBLISHED');
      expect(sorted[4].lifecycleStatus).toBe('EXPIRED');
    });

    it('sorts Not Scheduled episodes by QC completion date (newest first)', () => {
      const olderNs: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-older', title: 'Older Review', reviewed_at: '2026-11-01T10:00:00Z' }),
        lifecycleStatus: 'NOT_SCHEDULED',
      };
      const newerNs: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-newer', title: 'Newer Review', reviewed_at: '2026-11-05T14:00:00Z' }),
        lifecycleStatus: 'NOT_SCHEDULED',
      };
      const newestNs: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-newest', title: 'Newest Review', reviewed_at: '2026-11-05T18:00:00Z' }),
        lifecycleStatus: 'NOT_SCHEDULED',
      };

      const sorted = sortCompletedQCEpisodes([olderNs, newestNs, newerNs]);

      expect(sorted.map((e) => e.id)).toEqual(['ep-newest', 'ep-newer', 'ep-older']);
    });

    it('sorts Scheduled episodes by nearest upcoming release date first (ascending)', () => {
      const laterSched: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-later', title: 'Later Next Week' }),
        lifecycleStatus: 'SCHEDULED',
        homepageScheduledAt: '2026-11-10T09:00:00Z', // 10 Nov
      };
      const soonerSched: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-sooner', title: 'Tomorrow Morning' }),
        lifecycleStatus: 'SCHEDULED',
        activeSchedule: createMockSchedule({ start_time: '2026-11-06T09:00:00Z' }), // 6 Nov
      };
      const middleSched: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-middle', title: 'This Weekend' }),
        lifecycleStatus: 'SCHEDULED',
        homepageScheduledAt: '2026-11-08T10:00:00Z', // 8 Nov
      };

      const sorted = sortCompletedQCEpisodes([laterSched, soonerSched, middleSched]);

      // Nearest upcoming release date first: 6 Nov -> 8 Nov -> 10 Nov
      expect(sorted.map((e) => e.id)).toEqual(['ep-sooner', 'ep-middle', 'ep-later']);
    });

    it('sorts Published episodes by most recently published first (descending)', () => {
      const earlierPub: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-pub-earlier', title: 'Published 3 days ago' }),
        lifecycleStatus: 'PUBLISHED',
        publishedAt: '2026-11-02T10:00:00Z',
      };
      const latestPub: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-pub-latest', title: 'Published today' }),
        lifecycleStatus: 'PUBLISHED',
        publishedAt: '2026-11-05T14:00:00Z',
      };
      const middlePub: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ep-pub-middle', title: 'Published yesterday' }),
        lifecycleStatus: 'PUBLISHED',
        publishedAt: '2026-11-04T10:00:00Z',
      };

      const sorted = sortCompletedQCEpisodes([earlierPub, latestPub, middlePub]);

      // Most recently published first: 5 Nov -> 4 Nov -> 2 Nov
      expect(sorted.map((e) => e.id)).toEqual(['ep-pub-latest', 'ep-pub-middle', 'ep-pub-earlier']);
    });

    it('correctly orders a complete mixed list with all criteria combined', () => {
      const ns1: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ns-1', reviewed_at: '2026-11-05T16:00:00Z' }),
        lifecycleStatus: 'NOT_SCHEDULED',
      };
      const ns2: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'ns-2', reviewed_at: '2026-11-03T10:00:00Z' }),
        lifecycleStatus: 'NOT_SCHEDULED',
      };
      const sc1: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'sc-1' }),
        lifecycleStatus: 'SCHEDULED',
        activeSchedule: createMockSchedule({ start_time: '2026-11-06T09:00:00Z' }),
      };
      const sc2: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'sc-2' }),
        lifecycleStatus: 'SCHEDULED',
        homepageScheduledAt: '2026-11-10T12:00:00Z',
      };
      const pb1: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'pb-1' }),
        lifecycleStatus: 'PUBLISHED',
        publishedAt: '2026-11-05T12:00:00Z',
      };
      const pb2: EpisodeWithLifecycle = {
        ...createMockEpisode({ id: 'pb-2' }),
        lifecycleStatus: 'PUBLISHED',
        publishedAt: '2026-11-01T10:00:00Z',
      };

      // Shuffled input
      const input = [pb2, sc2, ns2, pb1, ns1, sc1];
      const result = sortCompletedQCEpisodes(input);

      // Expected:
      // 1. Not Scheduled (top): ns-1 (Nov 5) -> ns-2 (Nov 3)
      // 2. Scheduled (middle): sc-1 (Nov 6) -> sc-2 (Nov 10)
      // 3. Published (bottom): pb-1 (Nov 5) -> pb-2 (Nov 1)
      expect(result.map((e) => e.id)).toEqual(['ns-1', 'ns-2', 'sc-1', 'sc-2', 'pb-1', 'pb-2']);
    });
  });
});
