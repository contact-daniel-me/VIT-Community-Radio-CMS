import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';
import {
  computeEpisodeLifecycle,
  qcService,
  resolveEpisodePublishStatus,
  sortCompletedQCEpisodes,
  type EpisodeWithLifecycle,
} from '../../src/services/qcService';
import type { EpisodeWithRelations } from '../../src/services/episodeService';
import { computeAnnouncementLifecycleStatus } from '../../src/services/announcementService';
import type { AnnouncementRow, ScheduleRow } from '../../src/types/database';

function makeMockEpisode(overrides: Partial<EpisodeWithRelations> = {}): EpisodeWithRelations {
  return {
    id: 'ep-mock-1',
    episode_id: 'EP-2026-0001',
    program_id: 'prog-mock-1',
    title: 'Campus Radio Hour',
    description: 'Student showcase episode',
    episode_number: 1,
    host_name: null,
    status: 'APPROVED',
    audio_file_id: 'audio-mock-1',
    final_audio_file_id: null,
    duration_seconds: 1800,
    submitted_at: '2026-11-01T10:00:00Z',
    reviewed_at: '2026-11-02T10:00:00Z',
    created_by: 'rj-1',
    assigned_rj: 'rj-1',
    archived_at: null,
    raw_file_delete_at: null,
    show_on_homepage: false,
    homepage_publish_at: null,
    homepage_expires_at: null,
    publish_status: 'DRAFT',
    scheduled_at: null,
    published_at: null,
    expires_at: null,
    publish_error: null,
    publish_attempts: 0,
    last_publish_attempt_at: null,
    created_at: '2026-11-01T09:00:00Z',
    updated_at: '2026-11-02T10:00:00Z',
    program: null,
    audio_file: null,
    final_audio_file: null,
    author: null,
    assignee: null,
    ...overrides,
  };
}

function makeMockAnnouncement(overrides: Partial<AnnouncementRow> = {}): AnnouncementRow {
  return {
    id: 'ann-mock-1',
    title: 'Studio Maintenance',
    message: 'Studio A maintenance window',
    status: 'DRAFT',
    published_at: null,
    scheduled_at: null,
    expires_at: null,
    publish_error: null,
    publish_attempts: 0,
    last_publish_attempt_at: null,
    created_at: '2026-11-01T09:00:00Z',
    updated_at: '2026-11-01T09:00:00Z',
    created_by: 'admin-1',
    ...overrides,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Content Scheduling and Publishing Lifecycle (SQL + Services)', () => {
  let db: TestDb;
  let admin: string;
  let producer: string;
  let rj: string;
  let qc: string;
  let activeProgramId: string;

  async function makeApprovedEpisode(
    title: string,
    programId = activeProgramId,
  ): Promise<{ episodeId: string; audioId: string }> {
    const ep = await db.asUser<{ id: string }>(
      rj,
      `insert into public.episodes (program_id, title, description, created_by, assigned_rj)
       values ($1, $2, $3, $4, $4) returning id`,
      [programId, title, `${title} description`, rj],
    );
    const episodeId = ep[0].id;

    const audio = await db.sql<{ id: string }>(
      `insert into public.audio_files
         (episode_id, file_name, storage_path, mime_type, file_size, duration_seconds, uploaded_by)
       values ($1, $2, $3, 'audio/mpeg', 1048576, 300, $4) returning id`,
      [episodeId, `${title}.mp3`, `episodes/${episodeId}/audio.mp3`, rj],
    );
    const audioId = audio[0].id;
    await db.sql('update public.episodes set audio_file_id = $1 where id = $2', [audioId, episodeId]);
    await db.asUser(rj, 'select public.submit_episode_for_qc($1)', [episodeId]);
    await db.asUser(qc, 'select public.approve_episode($1)', [episodeId]);
    return { episodeId, audioId };
  }

  beforeAll(async () => {
    db = await createTestDb();
    admin = await db.createUser({ email: 'life-admin@vit.ac.in', fullName: 'Life Admin', role: 'ADMIN' });
    producer = await db.createUser({ email: 'life-prod@vit.ac.in', fullName: 'Life Producer', role: 'PRODUCER' });
    rj = await db.createUser({ email: 'life-rj@vit.ac.in', fullName: 'Life RJ', role: 'RJ' });
    qc = await db.createUser({ email: 'life-qc@vit.ac.in', fullName: 'Life QC', role: 'QC' });

    const prog = await db.asUser<{ id: string }>(
      producer,
      `insert into public.programs (name, created_by) values ('Lifecycle FM', $1) returning id`,
      [producer],
    );
    activeProgramId = prog[0].id;
  });

  afterAll(async () => {
    await db.close();
  });

  it('transitions Draft -> Scheduled -> Published -> Expired across SQL RPCs and sync_content_lifecycle', async () => {
    const { episodeId: promoteEpId } = await makeApprovedEpisode('Auto Promote Episode');
    const { episodeId: expireEpId } = await makeApprovedEpisode('Auto Expire Episode');
    const { episodeId: failEpId, audioId: failAudioId } = await makeApprovedEpisode('Auto Fail Episode');

    // Newly QC-approved episodes start cleanly as DRAFT
    const initial = await db.sql<{ publish_status: string }>(
      `select publish_status from public.episodes where id = $1`,
      [promoteEpId],
    );
    expect(initial[0].publish_status).toBe('DRAFT');

    // Schedule episodes & announcements against real upcoming timestamps
    const promoteAt = new Date(Date.now() + 900).toISOString();
    const expireAt = new Date(Date.now() + 900).toISOString();
    const failAt = new Date(Date.now() + 900).toISOString();

    await db.asUser(
      admin,
      `select public.schedule_episode_homepage($1, true, $2, null, $3, $4)`,
      [promoteEpId, promoteAt, 'Promoted Release', 'Teaser'],
    );
    await db.asUser(
      admin,
      `select public.schedule_episode_homepage($1, true, now() - interval '1 hour', $2, $3, $4)`,
      [expireEpId, expireAt, 'Expiring Release', 'Will expire'],
    );
    await db.asUser(
      admin,
      `select public.schedule_episode_homepage($1, true, $2, null, $3, $4)`,
      [failEpId, failAt, 'Failing Release', 'Will fail'],
    );

    // Soft-delete audio for failEpId so scheduled publishing fails eligibility check
    await db.sql(`update public.audio_files set deleted_at = now() where id = $1`, [failAudioId]);

    // Scheduled announcement + expiring announcement
    const schedAnn = await db.asUser<{ id: string }>(
      admin,
      `insert into public.announcements (title, message, status, scheduled_at, created_by)
       values ('Scheduled Notice', 'Starts shortly', 'SCHEDULED', $1, $2) returning id`,
      [promoteAt, admin],
    );
    const expAnn = await db.asUser<{ id: string }>(
      admin,
      `insert into public.announcements (title, message, status, published_at, expires_at, created_by)
       values ('Expiring Notice', 'Ends shortly', 'PUBLISHED', now() - interval '1 hour', $1, $2) returning id`,
      [expireAt, admin],
    );

    // Verify pre-window statuses
    const preStates = await db.sql<{ id: string; publish_status: string }>(
      `select id, publish_status from public.episodes where id = any($1::uuid[])`,
      [[promoteEpId, expireEpId, failEpId]],
    );
    expect(preStates.find((r) => r.id === promoteEpId)?.publish_status).toBe('SCHEDULED');
    expect(preStates.find((r) => r.id === expireEpId)?.publish_status).toBe('PUBLISHED');
    expect(preStates.find((r) => r.id === failEpId)?.publish_status).toBe('SCHEDULED');

    // Wait until scheduled/expiry window passes
    await sleep(1100);

    // Execute transactional lifecycle sync
    const syncRes = await db.asUser<{
      sync_content_lifecycle: {
        promoted_episodes: number;
        expired_episodes: number;
        failed_episodes: number;
        promoted_announcements: number;
        expired_announcements: number;
      };
    }>(admin, `select public.sync_content_lifecycle()`);

    const stats = syncRes[0].sync_content_lifecycle;
    expect(stats.promoted_episodes).toBeGreaterThanOrEqual(1);
    expect(stats.expired_episodes).toBeGreaterThanOrEqual(1);
    expect(stats.failed_episodes).toBeGreaterThanOrEqual(1);
    expect(stats.promoted_announcements).toBeGreaterThanOrEqual(1);
    expect(stats.expired_announcements).toBeGreaterThanOrEqual(1);

    // Promoted episode is permanently PUBLISHED and visible in v_public_approved_episodes
    const promotedRow = await db.sql<{
      publish_status: string;
      published_at: string | null;
      show_on_homepage: boolean;
    }>(
      `select publish_status, published_at, show_on_homepage from public.episodes where id = $1`,
      [promoteEpId],
    );
    expect(promotedRow[0].publish_status).toBe('PUBLISHED');
    expect(promotedRow[0].published_at).not.toBeNull();
    expect(promotedRow[0].show_on_homepage).toBe(true);

    const promotedPublic = await db.sql(
      `select episode_id from public.v_public_approved_episodes where episode_id = $1`,
      [promoteEpId],
    );
    expect(promotedPublic.length).toBe(1);

    // Expired episode is EXPIRED, hidden from v_public_approved_episodes, preserves published_at & expires_at
    const expiredRow = await db.sql<{
      publish_status: string;
      published_at: string | null;
      expires_at: string | null;
    }>(
      `select publish_status, published_at, expires_at from public.episodes where id = $1`,
      [expireEpId],
    );
    expect(expiredRow[0].publish_status).toBe('EXPIRED');
    expect(expiredRow[0].published_at).not.toBeNull();
    expect(expiredRow[0].expires_at).not.toBeNull();

    const expiredPublic = await db.sql(
      `select episode_id from public.v_public_approved_episodes where episode_id = $1`,
      [expireEpId],
    );
    expect(expiredPublic.length).toBe(0);

    // Failed episode retains FAILED status with publish_error and does NOT revert to DRAFT
    const failedRow = await db.sql<{
      publish_status: string;
      publish_error: string | null;
      publish_attempts: number;
    }>(
      `select publish_status, publish_error, publish_attempts from public.episodes where id = $1`,
      [failEpId],
    );
    expect(failedRow[0].publish_status).toBe('FAILED');
    expect(failedRow[0].publish_error).toBeTruthy();
    expect(failedRow[0].publish_attempts).toBeGreaterThanOrEqual(1);

    // Restore audio and retry publish -> Failed -> Scheduled, then sync promotes to Published
    await db.sql(`update public.audio_files set deleted_at = null where id = $1`, [failAudioId]);
    const retried = await db.asUser<{ publish_status: string; publish_error: string | null }>(
      admin,
      `select publish_status, publish_error from public.retry_episode_publish($1, null)`,
      [failEpId],
    );
    expect(retried[0].publish_status).toBe('SCHEDULED');
    expect(retried[0].publish_error).toBeNull();

    await db.asUser(admin, `select public.sync_content_lifecycle()`);
    const promotedAfterRetry = await db.sql<{ publish_status: string; published_at: string | null }>(
      `select publish_status, published_at from public.episodes where id = $1`,
      [failEpId],
    );
    expect(promotedAfterRetry[0].publish_status).toBe('PUBLISHED');
    expect(promotedAfterRetry[0].published_at).not.toBeNull();

    // Announcements promoted & expired cleanly
    const annStates = await db.sql<{ id: string; status: string; published_at: string | null }>(
      `select id, status, published_at from public.announcements where id = any($1::uuid[])`,
      [[schedAnn[0].id, expAnn[0].id]],
    );
    expect(annStates.find((a) => a.id === schedAnn[0].id)?.status).toBe('PUBLISHED');
    expect(annStates.find((a) => a.id === schedAnn[0].id)?.published_at).not.toBeNull();
    expect(annStates.find((a) => a.id === expAnn[0].id)?.status).toBe('EXPIRED');
    expect(annStates.find((a) => a.id === expAnn[0].id)?.published_at).not.toBeNull();

    // Idempotent repeated sync: stays PUBLISHED and logs ZERO duplicate transitions
    const logCountBefore = await db.sql<{ count: number }>(
      `select count(*)::int as count from public.activity_logs where entity_id = $1`,
      [promoteEpId],
    );
    const repeatSync = await db.asUser<{
      sync_content_lifecycle: { promoted_episodes: number; expired_episodes: number };
    }>(admin, `select public.sync_content_lifecycle()`);
    expect(repeatSync[0].sync_content_lifecycle.promoted_episodes).toBe(0);
    expect(repeatSync[0].sync_content_lifecycle.expired_episodes).toBe(0);

    const logCountAfter = await db.sql<{ count: number }>(
      `select count(*)::int as count from public.activity_logs where entity_id = $1`,
      [promoteEpId],
    );
    expect(logCountAfter[0].count).toBe(logCountBefore[0].count);
  });

  it('preserves original published_at when editing a live episode and supports unschedule & archive', async () => {
    const { episodeId } = await makeApprovedEpisode('Edit Live Metadata');
    const origPublishAt = '2026-10-01T10:00:00.000Z';

    const first = await db.asUser<{ published_at: string }>(
      admin,
      `select published_at from public.schedule_episode_homepage($1, true, $2, null, $3, $4)`,
      [episodeId, origPublishAt, 'Initial Live Title', 'Initial Live Desc'],
    );
    const savedPublishedAt = new Date(first[0].published_at).toISOString();
    expect(savedPublishedAt).toBe(origPublishAt);

    // Update metadata / expiry while already PUBLISHED: original published_at is preserved
    const futureExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const updated = await db.asUser<{
      publish_status: string;
      published_at: string;
      expires_at: string | null;
      title: string;
    }>(
      producer,
      `select publish_status, published_at, expires_at, title
       from public.schedule_episode_homepage($1, true, now(), $2, $3, $4)`,
      [episodeId, futureExpiry, 'Edited Live Title', 'Edited Live Desc'],
    );
    expect(updated[0].publish_status).toBe('PUBLISHED');
    expect(updated[0].title).toBe('Edited Live Title');
    expect(updated[0].expires_at).not.toBeNull();
    expect(new Date(updated[0].published_at).toISOString()).toBe(origPublishAt);

    // Explicit manual archive transition: Published -> Archived
    const archived = await db.asUser<{ status: string; archived_at: string | null }>(
      admin,
      `select status, archived_at from public.archive_episode($1)`,
      [episodeId],
    );
    expect(archived[0].status).toBe('ARCHIVED');
    expect(archived[0].archived_at).not.toBeNull();

    // Activate back and test explicit Scheduled -> Draft via unschedule_episode_homepage
    const { episodeId: schedEpId } = await makeApprovedEpisode('Manual Unschedule Target');
    const futureStart = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await db.asUser(
      admin,
      `select public.schedule_episode_homepage($1, true, $2, null, 'Scheduled Title', null)`,
      [schedEpId, futureStart],
    );
    const unscheduled = await db.asUser<{
      publish_status: string;
      show_on_homepage: boolean;
      scheduled_at: string | null;
    }>(
      admin,
      `select publish_status, show_on_homepage, scheduled_at from public.unschedule_episode_homepage($1)`,
      [schedEpId],
    );
    expect(unscheduled[0].publish_status).toBe('DRAFT');
    expect(unscheduled[0].show_on_homepage).toBe(false);
    expect(unscheduled[0].scheduled_at).toBeNull();
  });

  it('supports announcement unschedule, failure, and retry RPCs', async () => {
    const ann = await db.asUser<{ id: string }>(
      producer,
      `insert into public.announcements (title, message, status, scheduled_at, created_by)
       values ('Scheduled Event', 'Event at 5 PM', 'SCHEDULED', now() + interval '2 days', $1) returning id`,
      [producer],
    );

    const failed = await db.asUser<{ status: string; publish_error: string | null }>(
      admin,
      `select status, publish_error from public.fail_announcement_publish($1, 'Banner webhook timeout')`,
      [ann[0].id],
    );
    expect(failed[0].status).toBe('FAILED');
    expect(failed[0].publish_error).toBe('Banner webhook timeout');

    const retried = await db.asUser<{ status: string; publish_error: string | null }>(
      admin,
      `select status, publish_error from public.retry_announcement_publish($1, now())`,
      [ann[0].id],
    );
    expect(retried[0].status).toBe('SCHEDULED');
    expect(retried[0].publish_error).toBeNull();

    await db.asUser(admin, `select public.sync_content_lifecycle()`);
    const promotedAnn = await db.sql<{ status: string; published_at: string | null }>(
      `select status, published_at from public.announcements where id = $1`,
      [ann[0].id],
    );
    expect(promotedAnn[0].status).toBe('PUBLISHED');
    expect(promotedAnn[0].published_at).not.toBeNull();

    const drafted = await db.asUser<{ status: string; scheduled_at: string | null }>(
      admin,
      `select status, scheduled_at from public.unschedule_announcement($1)`,
      [ann[0].id],
    );
    expect(drafted[0].status).toBe('DRAFT');
    expect(drafted[0].scheduled_at).toBeNull();
  });

  it('blocks direct client SQL updates to guarded publish lifecycle columns via RLS + trg_guard_episode_publish_fields', async () => {
    const { episodeId: approvedId } = await makeApprovedEpisode('Guard Trigger Approved');
    const draftEp = await db.asUser<{ id: string }>(
      rj,
      `insert into public.episodes (program_id, title, description, created_by, assigned_rj)
       values ($1, 'Guard Trigger Draft', 'Draft desc', $2, $2) returning id`,
      [activeProgramId, rj],
    );

    // 1. Approved episode is protected by RLS content freeze (0 rows updated)
    const rlsAttempt = await db.asUser<{ id: string }>(
      admin,
      `update public.episodes set publish_status = 'PUBLISHED', published_at = now() where id = $1 returning id`,
      [approvedId],
    );
    expect(rlsAttempt.length).toBe(0);

    // 2. Editable DRAFT episode reaches trigger and is rejected by trg_guard_episode_publish_fields
    await expectFailure(
      () =>
        db.asUser(
          rj,
          `update public.episodes set publish_status = 'PUBLISHED', published_at = now() where id = $1`,
          [draftEp[0].id],
        ),
      /Publishing lifecycle fields must be changed through workflow functions/i,
    );
  });

  describe('Frontend Lifecycle Classifiers (Mutual Exclusivity & No Regression to Draft)', () => {
    const refTime = new Date('2026-11-10T12:00:00Z');

    it('keeps published episode without expiry permanently PUBLISHED long after scheduled_at passes', () => {
      const ep = makeMockEpisode({
        publish_status: 'PUBLISHED',
        show_on_homepage: true,
        scheduled_at: '2026-11-01T08:00:00Z',
        homepage_publish_at: '2026-11-01T08:00:00Z',
        published_at: '2026-11-01T08:00:00Z',
        expires_at: null,
        homepage_expires_at: null,
      });

      const status = resolveEpisodePublishStatus(ep, refTime);
      const lifecycle = computeEpisodeLifecycle(ep, [], refTime);

      expect(status).toBe('PUBLISHED');
      expect(lifecycle.lifecycleStatus).toBe('PUBLISHED');
      expect(lifecycle.publishedAt).toBe('2026-11-01T08:00:00Z');
    });

    it('keeps published episode with future expires_at as PUBLISHED until expiry is reached', () => {
      const ep = makeMockEpisode({
        publish_status: 'PUBLISHED',
        show_on_homepage: true,
        published_at: '2026-11-09T10:00:00Z',
        homepage_publish_at: '2026-11-09T10:00:00Z',
        expires_at: '2026-11-12T10:00:00Z',
        homepage_expires_at: '2026-11-12T10:00:00Z',
      });

      expect(resolveEpisodePublishStatus(ep, refTime)).toBe('PUBLISHED');
      expect(
        resolveEpisodePublishStatus(ep, new Date('2026-11-12T10:00:01Z')),
      ).toBe('EXPIRED');
    });

    it('classifies pre-migration episodes via broadcast schedules cleanly without reverting to DRAFT', () => {
      const legacyEp = makeMockEpisode({
        publish_status: undefined,
        show_on_homepage: false,
      });

      expect(
        resolveEpisodePublishStatus(legacyEp, refTime, [
          { status: 'SCHEDULED', start_time: '2026-11-11T10:00:00Z', end_time: '2026-11-11T11:00:00Z' },
        ]),
      ).toBe('SCHEDULED');

      expect(
        resolveEpisodePublishStatus(legacyEp, refTime, [
          { status: 'COMPLETED', start_time: '2026-11-08T10:00:00Z', end_time: '2026-11-08T11:00:00Z' },
        ]),
      ).toBe('PUBLISHED');
    });

    it('separates QC-approved unscheduled episodes (NOT_SCHEDULED) from unapproved/saved drafts (DRAFT)', () => {
      const unapprovedDraft = makeMockEpisode({ id: 'ep-draft', status: 'DRAFT' });
      const pendingQc = makeMockEpisode({ id: 'ep-pending', status: 'PENDING_QC' });
      const rejectedEp = makeMockEpisode({ id: 'ep-rejected', status: 'REJECTED' });
      const approvedUnscheduled = makeMockEpisode({ id: 'ep-approved-ns', status: 'APPROVED' });

      expect(resolveEpisodePublishStatus(unapprovedDraft, refTime)).toBe('DRAFT');
      expect(resolveEpisodePublishStatus(pendingQc, refTime)).toBe('DRAFT');
      expect(resolveEpisodePublishStatus(rejectedEp, refTime)).toBe('DRAFT');
      expect(resolveEpisodePublishStatus(approvedUnscheduled, refTime)).toBe('NOT_SCHEDULED');

      expect(computeEpisodeLifecycle(unapprovedDraft, [], refTime).lifecycleStatus).toBe('DRAFT');
      expect(computeEpisodeLifecycle(approvedUnscheduled, [], refTime).lifecycleStatus).toBe('NOT_SCHEDULED');
    });

    it('never classifies persisted EXPIRED or FAILED episodes back into DRAFT or NOT_SCHEDULED', () => {
      const expiredEp = makeMockEpisode({
        publish_status: 'EXPIRED',
        published_at: '2026-11-02T10:00:00Z',
        expires_at: '2026-11-05T10:00:00Z',
        show_on_homepage: false,
      });
      const failedEp = makeMockEpisode({
        id: 'ep-mock-fail',
        publish_status: 'FAILED',
        publish_error: 'Audio missing',
        scheduled_at: '2026-11-09T10:00:00Z',
      });

      expect(computeEpisodeLifecycle(expiredEp, [], refTime).lifecycleStatus).toBe('EXPIRED');
      expect(computeEpisodeLifecycle(failedEp, [], refTime).lifecycleStatus).toBe('FAILED');
    });

    it('counts mutually exclusive buckets for episodes and classifies announcements consistently', () => {
      const episodes: EpisodeWithLifecycle[] = [
        { ...makeMockEpisode({ id: '1' }), lifecycleStatus: 'NOT_SCHEDULED' },
        { ...makeMockEpisode({ id: '2', status: 'DRAFT' }), lifecycleStatus: 'DRAFT' },
        { ...makeMockEpisode({ id: '3' }), lifecycleStatus: 'SCHEDULED' },
        {
          ...makeMockEpisode({ id: '4' }),
          lifecycleStatus: 'PUBLISHED',
          publishedAt: '2026-11-09T10:00:00Z',
        },
        {
          ...makeMockEpisode({ id: '5' }),
          lifecycleStatus: 'EXPIRED',
          publishedAt: '2026-11-01T10:00:00Z',
        },
        {
          ...makeMockEpisode({ id: '6' }),
          lifecycleStatus: 'FAILED',
          publishError: 'Program inactive',
        },
      ];

      const counts = qcService.getLifecycleCounts(episodes);
      expect(counts.all).toBe(6);
      expect(counts.notScheduled).toBe(1);
      expect(counts.draft).toBe(1);
      expect(counts.scheduled).toBe(1);
      expect(counts.published).toBe(1);
      expect(counts.expired).toBe(1);
      expect(counts.failed).toBe(1);
      expect(
        counts.notScheduled +
          counts.draft +
          counts.scheduled +
          counts.published +
          counts.expired +
          counts.failed,
      ).toBe(counts.all);

      const anns: AnnouncementRow[] = [
        makeMockAnnouncement({ id: 'a-draft', status: 'DRAFT' }),
        makeMockAnnouncement({ id: 'a-sched', status: 'SCHEDULED', scheduled_at: '2026-11-15T10:00:00Z' }),
        makeMockAnnouncement({ id: 'a-due', status: 'SCHEDULED', scheduled_at: '2026-11-08T10:00:00Z', expires_at: null }),
        makeMockAnnouncement({ id: 'a-pub', status: 'PUBLISHED', published_at: '2026-11-09T10:00:00Z', expires_at: null }),
        makeMockAnnouncement({ id: 'a-exp', status: 'PUBLISHED', published_at: '2026-11-01T10:00:00Z', expires_at: '2026-11-05T10:00:00Z' }),
        makeMockAnnouncement({ id: 'a-fail', status: 'FAILED', publish_error: 'Timeout' }),
        makeMockAnnouncement({ id: 'a-arch', status: 'ARCHIVED' }),
      ];

      expect(computeAnnouncementLifecycleStatus(anns[0], refTime)).toBe('DRAFT');
      expect(computeAnnouncementLifecycleStatus(anns[1], refTime)).toBe('SCHEDULED');
      expect(computeAnnouncementLifecycleStatus(anns[2], refTime)).toBe('PUBLISHED');
      expect(computeAnnouncementLifecycleStatus(anns[3], refTime)).toBe('PUBLISHED');
      expect(computeAnnouncementLifecycleStatus(anns[4], refTime)).toBe('EXPIRED');
      expect(computeAnnouncementLifecycleStatus(anns[5], refTime)).toBe('FAILED');
      expect(computeAnnouncementLifecycleStatus(anns[6], refTime)).toBe('ARCHIVED');

      const sorted = sortCompletedQCEpisodes([
        episodes[4],
        episodes[3],
        episodes[5],
        episodes[2],
        episodes[1],
        episodes[0],
      ] as (EpisodeWithLifecycle & { activeSchedule?: ScheduleRow | null })[]);
      expect(sorted.map((e) => e.lifecycleStatus)).toEqual([
        'NOT_SCHEDULED',
        'DRAFT',
        'SCHEDULED',
        'PUBLISHED',
        'FAILED',
        'EXPIRED',
      ]);
    });

    it('exposes Not Scheduled alongside Draft, Scheduled, Published, Expired, and Failed across QC Done, Dashboard, and Episodes', () => {
      for (const relPath of [
        'src/pages/QcPage.tsx',
        'src/pages/DashboardPage.tsx',
        'src/pages/EpisodesPage.tsx',
      ]) {
        const src = readFileSync(resolve(process.cwd(), relPath), 'utf8');
        expect(src).toContain('NOT_SCHEDULED');
        expect(src).toContain('Not Scheduled');
        expect(src).toContain('Draft');
        expect(src).toContain('Scheduled');
        expect(src).toContain('Published');
        expect(src).toContain('Expired');
        expect(src).toContain('Failed');
      }
    });
  });
});
