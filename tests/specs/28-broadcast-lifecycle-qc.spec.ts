/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';
import { computeEpisodeLifecycle, qcService, type EpisodeWithLifecycle } from '@/services/qcService';
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

  describe('Scenario 1: QC completed, no schedule', () => {
    it('classifies approved episode as NOT_SCHEDULED when no schedule exists', () => {
      const ep = createMockEpisode();
      const result = computeEpisodeLifecycle(ep, [], refTime);

      expect(result.lifecycleStatus).toBe('NOT_SCHEDULED');
      expect(result.activeSchedule).toBeNull();
      expect(result.publishedAt).toBeNull();
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
  });

  describe('Scenario 3: Schedule cancelled or removed', () => {
    it('returns to NOT_SCHEDULED when an existing schedule is cancelled', () => {
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

  describe('Scenario 6: Episode unpublished or publishing reversed', () => {
    it('reverts to SCHEDULED if removed from homepage and an active schedule exists', () => {
      const ep = createMockEpisode({ show_on_homepage: false, homepage_publish_at: null });
      const sched = createMockSchedule({ status: 'SCHEDULED' });

      const result = computeEpisodeLifecycle(ep, [sched], refTime);

      expect(result.lifecycleStatus).toBe('SCHEDULED');
    });

    it('reverts to NOT_SCHEDULED if removed from homepage and no active schedule exists', () => {
      const ep = createMockEpisode({ show_on_homepage: false, homepage_publish_at: null });

      const result = computeEpisodeLifecycle(ep, [], refTime);

      expect(result.lifecycleStatus).toBe('NOT_SCHEDULED');
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
        ...createMockEpisode({ id: 'ep-2' }),
        lifecycleStatus: 'NOT_SCHEDULED',
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

      const counts = qcService.getLifecycleCounts([ep1, ep2, ep3, ep4]);

      expect(counts.all).toBe(4);
      expect(counts.notScheduled).toBe(2);
      expect(counts.scheduled).toBe(1);
      expect(counts.published).toBe(1);
    });
  });
});
