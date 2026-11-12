import { supabase } from '@/lib/supabase';
import { AppError } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type {
  ContentLifecycleBucket,
  EpisodeRow,
  QcReviewRow,
  ScheduleRow,
  ScheduleDetailsRow,
} from '@/types/database';
import { episodeService, type EpisodeWithRelations } from './episodeService';

export type BroadcastLifecycleStatus =
  | 'NOT_SCHEDULED'
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'EXPIRED'
  | 'FAILED';

export interface EpisodeWithLifecycle extends EpisodeWithRelations {
  lifecycleStatus: BroadcastLifecycleStatus;
  activeSchedule?: ScheduleRow | ScheduleDetailsRow | null;
  publishedAt?: string | null;
  homepageScheduledAt?: string | null;
  homepageExpiresAt?: string | null;
  publishError?: string | null;
  publishAttempts?: number;
  lifecycleTarget?: 'BROADCAST' | 'HOMEPAGE' | 'BOTH' | null;
}

export interface LifecycleCounts {
  all: number;
  notScheduled: number;
  draft: number;
  scheduled: number;
  published: number;
  expired: number;
  failed: number;
}

export interface QcReviewWithReviewer extends QcReviewRow {
  reviewer: { id: string; full_name: string } | null;
}

function parseValidDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Pure helper to resolve any episode's canonical publishing lifecycle bucket
 * (for Episodes table, Dashboard summary, and Release cards without broadcast schedule queries).
 */
export function resolveEpisodePublishStatus(
  ep: Pick<
    EpisodeRow,
    | 'status'
    | 'publish_status'
    | 'scheduled_at'
    | 'published_at'
    | 'expires_at'
    | 'publish_error'
    | 'show_on_homepage'
    | 'homepage_publish_at'
    | 'homepage_expires_at'
  >,
  now: Date = new Date(),
  epSchedules: Pick<ScheduleRow, 'status' | 'start_time' | 'end_time'>[] = [],
): ContentLifecycleBucket {
  if (ep.status === 'ARCHIVED' || ep.publish_status === 'ARCHIVED') {
    return 'ARCHIVED';
  }
  if (ep.publish_status === 'FAILED') return 'FAILED';
  if (ep.publish_status === 'EXPIRED') return 'EXPIRED';

  const expTime = parseValidDate(ep.expires_at ?? ep.homepage_expires_at);
  const schedTime = parseValidDate(ep.scheduled_at ?? ep.homepage_publish_at);

  if (ep.publish_status === 'PUBLISHED') {
    if (expTime && expTime <= now) return 'EXPIRED';
    return 'PUBLISHED';
  }

  if (ep.publish_status === 'SCHEDULED') {
    if (schedTime && schedTime <= now) {
      if (expTime && expTime <= now) return 'EXPIRED';
      return 'PUBLISHED';
    }
    return 'SCHEDULED';
  }

  // Fallback for pre-migration rows (or test mocks) using homepage flags and schedules
  if (ep.show_on_homepage) {
    if (expTime && expTime <= now) return 'EXPIRED';
    if (schedTime && schedTime > now) return 'SCHEDULED';
    return 'PUBLISHED';
  }

  if (expTime && expTime <= now && (ep.published_at || ep.homepage_publish_at)) {
    return 'EXPIRED';
  }

  if (epSchedules.some((s) => s.status === 'COMPLETED')) {
    return 'PUBLISHED';
  }

  if (epSchedules.some((s) => s.status === 'SCHEDULED' || s.status === 'ON_AIR')) {
    return 'SCHEDULED';
  }

  return ep.status === 'APPROVED' ? 'NOT_SCHEDULED' : 'DRAFT';
}

/**
 * Pure helper to compute an episode's publishing + broadcast lifecycle status.
 * Persists published/expired/failed transitions permanently and never demotes
 * previously published content back to Draft automatically.
 */
export function computeEpisodeLifecycle(
  episode: EpisodeWithRelations,
  epSchedules: (ScheduleRow | ScheduleDetailsRow)[],
  now: Date = new Date(),
): {
  lifecycleStatus: BroadcastLifecycleStatus;
  activeSchedule: ScheduleRow | ScheduleDetailsRow | null;
  publishedAt: string | null;
  homepageScheduledAt: string | null;
  homepageExpiresAt: string | null;
  publishError: string | null;
  publishAttempts: number;
  lifecycleTarget: 'BROADCAST' | 'HOMEPAGE' | 'BOTH' | null;
} {
  const persistedStatus = episode.publish_status;
  const schedIso = episode.scheduled_at ?? episode.homepage_publish_at ?? null;
  const pubIso = episode.published_at ?? null;
  const expIso = episode.expires_at ?? episode.homepage_expires_at ?? null;

  const schedTime = parseValidDate(schedIso);
  const expTime = parseValidDate(expIso);

  const completedSchedule = epSchedules.find((s) => s.status === 'COMPLETED') ?? null;
  const activeBroadcastSchedule =
    epSchedules.find((s) => s.status === 'SCHEDULED' || s.status === 'ON_AIR') ?? null;

  // 1. Explicit FAILED state
  if (persistedStatus === 'FAILED') {
    return {
      lifecycleStatus: 'FAILED',
      activeSchedule: activeBroadcastSchedule,
      publishedAt: null,
      homepageScheduledAt: schedIso,
      homepageExpiresAt: expIso,
      publishError: episode.publish_error ?? 'Scheduled publication failed',
      publishAttempts: episode.publish_attempts ?? 1,
      lifecycleTarget: activeBroadcastSchedule ? 'BOTH' : 'HOMEPAGE',
    };
  }

  // 2. Explicit EXPIRED state (or published/homepage release past configured expires_at)
  if (
    persistedStatus === 'EXPIRED' ||
    (persistedStatus === 'PUBLISHED' && expTime && expTime <= now) ||
    (expTime && expTime <= now && (Boolean(episode.show_on_homepage) || Boolean(pubIso)))
  ) {
    return {
      lifecycleStatus: 'EXPIRED',
      activeSchedule: completedSchedule ?? activeBroadcastSchedule,
      publishedAt:
        pubIso ??
        episode.homepage_publish_at ??
        completedSchedule?.end_time ??
        episode.reviewed_at ??
        null,
      homepageScheduledAt: schedIso,
      homepageExpiresAt: expIso,
      publishError: null,
      publishAttempts: episode.publish_attempts ?? 0,
      lifecycleTarget: completedSchedule ? 'BOTH' : 'HOMEPAGE',
    };
  }

  // 3. Explicit or due PUBLISHED state (homepage release, persisted publish, or completed broadcast)
  const isPersistedOrDueHomepagePublished =
    persistedStatus === 'PUBLISHED' ||
    (persistedStatus === 'SCHEDULED' && Boolean(schedTime && schedTime <= now) && (!expTime || expTime > now)) ||
    (Boolean(episode.show_on_homepage) &&
      (!schedTime || schedTime <= now) &&
      (!expTime || expTime > now));

  if (isPersistedOrDueHomepagePublished || completedSchedule) {
    const resolvedPublishedAt =
      pubIso ??
      (isPersistedOrDueHomepagePublished
        ? (episode.homepage_publish_at ?? episode.scheduled_at ?? episode.reviewed_at ?? episode.updated_at)
        : (completedSchedule?.end_time ?? completedSchedule?.start_time ?? episode.reviewed_at ?? episode.updated_at));

    return {
      lifecycleStatus: 'PUBLISHED',
      activeSchedule: completedSchedule ?? activeBroadcastSchedule,
      publishedAt: resolvedPublishedAt ?? null,
      homepageScheduledAt: schedIso,
      homepageExpiresAt: isPersistedOrDueHomepagePublished ? expIso : null,
      publishError: null,
      publishAttempts: episode.publish_attempts ?? 0,
      lifecycleTarget:
        isPersistedOrDueHomepagePublished && completedSchedule
          ? 'BOTH'
          : isPersistedOrDueHomepagePublished
            ? 'HOMEPAGE'
            : 'BROADCAST',
    };
  }

  // 4. Scheduled state (upcoming homepage release or upcoming/on-air broadcast slot)
  const isHomepageScheduled =
    (persistedStatus === 'SCHEDULED' || Boolean(episode.show_on_homepage)) &&
    Boolean(schedTime && schedTime > now) &&
    (!expTime || (schedTime && expTime > schedTime));

  if (activeBroadcastSchedule || isHomepageScheduled) {
    return {
      lifecycleStatus: 'SCHEDULED',
      activeSchedule: activeBroadcastSchedule,
      publishedAt: null,
      homepageScheduledAt: isHomepageScheduled ? schedIso : null,
      homepageExpiresAt: isHomepageScheduled ? expIso : null,
      publishError: null,
      publishAttempts: episode.publish_attempts ?? 0,
      lifecycleTarget:
        activeBroadcastSchedule && isHomepageScheduled
          ? 'BOTH'
          : activeBroadcastSchedule
            ? 'BROADCAST'
            : 'HOMEPAGE',
    };
  }

  // 5. Waiting to be scheduled: QC-approved items enter NOT_SCHEDULED; unapproved/saved drafts remain DRAFT
  return {
    lifecycleStatus: episode.status === 'APPROVED' ? 'NOT_SCHEDULED' : 'DRAFT',
    activeSchedule: null,
    publishedAt: null,
    homepageScheduledAt: null,
    homepageExpiresAt: null,
    publishError: null,
    publishAttempts: episode.publish_attempts ?? 0,
    lifecycleTarget: null,
  };
}

function toEpoch(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}

export function getEpisodeReviewedDate(ep: EpisodeWithRelations | EpisodeWithLifecycle): string {
  return ep.reviewed_at ?? ep.updated_at ?? ep.submitted_at ?? ep.created_at ?? '';
}

export function getEpisodeScheduledDate(ep: EpisodeWithLifecycle): string {
  const dates: number[] = [];
  if (ep.activeSchedule?.start_time) {
    const t = toEpoch(ep.activeSchedule.start_time);
    if (t > 0) dates.push(t);
  }
  const schedIso = ep.homepageScheduledAt ?? ep.scheduled_at ?? ep.homepage_publish_at;
  if (schedIso) {
    const t = toEpoch(schedIso);
    if (t > 0) dates.push(t);
  }
  if (dates.length > 0) {
    dates.sort((a, b) => a - b);
    return new Date(dates[0]).toISOString();
  }
  return getEpisodeReviewedDate(ep);
}

export function getEpisodePublicationDate(ep: EpisodeWithLifecycle): string {
  return ep.publishedAt ?? ep.published_at ?? ep.homepage_publish_at ?? ep.reviewed_at ?? ep.updated_at ?? '';
}

/**
 * Reorganizes QC Done episodes by lifecycle priority:
 * 1. Not Scheduled (top) – QC-approved & awaiting schedule/release, newest reviewed first
 * 2. Draft – unapproved/saved drafts, newest reviewed first
 * 3. Scheduled – nearest upcoming date first
 * 4. Published – most recently published first
 * 5. Failed – most recent attempt first
 * 6. Expired (bottom) – most recently expired first
 */
export function sortCompletedQCEpisodes(episodes: EpisodeWithLifecycle[]): EpisodeWithLifecycle[] {
  const STATUS_PRIORITY: Record<BroadcastLifecycleStatus, number> = {
    NOT_SCHEDULED: 1,
    DRAFT: 2,
    SCHEDULED: 3,
    PUBLISHED: 4,
    FAILED: 5,
    EXPIRED: 6,
  };

  return [...episodes].sort((a, b) => {
    const priorityDiff = STATUS_PRIORITY[a.lifecycleStatus] - STATUS_PRIORITY[b.lifecycleStatus];
    if (priorityDiff !== 0) return priorityDiff;

    if (
      a.lifecycleStatus === 'NOT_SCHEDULED' ||
      a.lifecycleStatus === 'DRAFT' ||
      a.lifecycleStatus === 'FAILED'
    ) {
      const diff = toEpoch(getEpisodeReviewedDate(b)) - toEpoch(getEpisodeReviewedDate(a));
      if (diff !== 0) return diff;
      return (a.title || '').localeCompare(b.title || '');
    }

    if (a.lifecycleStatus === 'SCHEDULED') {
      const diff = toEpoch(getEpisodeScheduledDate(a)) - toEpoch(getEpisodeScheduledDate(b));
      if (diff !== 0) return diff;
      const revDiff = toEpoch(getEpisodeReviewedDate(b)) - toEpoch(getEpisodeReviewedDate(a));
      if (revDiff !== 0) return revDiff;
      return (a.title || '').localeCompare(b.title || '');
    }

    if (a.lifecycleStatus === 'PUBLISHED') {
      const diff = toEpoch(getEpisodePublicationDate(b)) - toEpoch(getEpisodePublicationDate(a));
      if (diff !== 0) return diff;
      const revDiff = toEpoch(getEpisodeReviewedDate(b)) - toEpoch(getEpisodeReviewedDate(a));
      if (revDiff !== 0) return revDiff;
      return (a.title || '').localeCompare(b.title || '');
    }

    if (a.lifecycleStatus === 'EXPIRED') {
      const expB = toEpoch(b.homepageExpiresAt ?? b.expires_at ?? getEpisodePublicationDate(b));
      const expA = toEpoch(a.homepageExpiresAt ?? a.expires_at ?? getEpisodePublicationDate(a));
      if (expB !== expA) return expB - expA;
      return (a.title || '').localeCompare(b.title || '');
    }

    return 0;
  });
}

export const qcService = {
  /** Oldest submission first: the QC desk works a queue, not a pile. */
  async getPendingQC(): Promise<EpisodeWithRelations[]> {
    const episodes = await episodeService.getEpisodes({ status: 'PENDING_QC' });
    return [...episodes].sort((a, b) =>
      (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''),
    );
  },

  /** Most recently approved first: episodes that have completed quality checks, with their lifecycle status. */
  async getCompletedQC(): Promise<EpisodeWithLifecycle[]> {
    await episodeService.syncContentLifecycle();

    const episodes = await episodeService.getEpisodes({ status: 'APPROVED' });
    if (episodes.length === 0) return [];

    const episodeIds = episodes.map((e) => e.id);

    // Prefer v_schedule_details to include joined program_name and metadata; fallback to schedules table
    let schedules: (ScheduleRow | ScheduleDetailsRow)[] = [];
    const { data: vDetails, error: vErr } = await supabase
      .from('v_schedule_details')
      .select('*')
      .in('episode_id', episodeIds)
      .order('start_time', { ascending: false });

    if (!vErr && vDetails) {
      schedules = vDetails;
    } else {
      if (vErr) console.warn('v_schedule_details query fallback to schedules table:', vErr);
      const { data: rawSchedules, error: rawErr } = await supabase
        .from('schedules')
        .select('*')
        .in('episode_id', episodeIds)
        .order('start_time', { ascending: false });

      if (rawSchedules) schedules = rawSchedules;
      if (rawErr) console.error('Failed to fetch schedules for completed QC episodes:', rawErr);
    }

    // Also fetch unlinked schedules (including COMPLETED historical airings)
    const { data: unlinkedSchedules } = await supabase
      .from('v_schedule_details')
      .select('*')
      .is('episode_id', null)
      .in('status', ['SCHEDULED', 'ON_AIR', 'COMPLETED'])
      .order('start_time', { ascending: false });

    const schedulesByEpisode = new Map<string, (ScheduleRow | ScheduleDetailsRow)[]>();
    (schedules ?? []).forEach((s) => {
      if (!s.episode_id) return;
      const list = schedulesByEpisode.get(s.episode_id) ?? [];
      list.push(s);
      schedulesByEpisode.set(s.episode_id, list);
    });

    // Fallback: match unlinked slots whose notes mention the episode title or episode identifier
    if (unlinkedSchedules && unlinkedSchedules.length > 0) {
      for (const ep of episodes) {
        if (schedulesByEpisode.has(ep.id)) continue;
        const matched = unlinkedSchedules.find((s) => {
          if (!s.notes) return false;
          const notesLower = s.notes.toLowerCase();
          return (
            (ep.title && notesLower.includes(ep.title.toLowerCase())) ||
            (ep.episode_id && notesLower.includes(ep.episode_id.toLowerCase()))
          );
        });
        if (matched) {
          schedulesByEpisode.set(ep.id, [matched]);
        }
      }
    }

    const now = new Date();
    const withLifecycle: EpisodeWithLifecycle[] = episodes.map((ep) => {
      const epSchedules = schedulesByEpisode.get(ep.id) ?? [];
      const lifecycle = computeEpisodeLifecycle(ep, epSchedules, now);
      return {
        ...ep,
        ...lifecycle,
      };
    });

    return sortCompletedQCEpisodes(withLifecycle);
  },

  sortCompletedQC: sortCompletedQCEpisodes,

  getLifecycleCounts(episodes: EpisodeWithLifecycle[]): LifecycleCounts {
    let notScheduled = 0;
    let draft = 0;
    let scheduled = 0;
    let published = 0;
    let expired = 0;
    let failed = 0;

    for (const ep of episodes) {
      if (ep.lifecycleStatus === 'NOT_SCHEDULED') notScheduled++;
      else if (ep.lifecycleStatus === 'DRAFT') draft++;
      else if (ep.lifecycleStatus === 'SCHEDULED') scheduled++;
      else if (ep.lifecycleStatus === 'PUBLISHED') published++;
      else if (ep.lifecycleStatus === 'EXPIRED') expired++;
      else if (ep.lifecycleStatus === 'FAILED') failed++;
    }

    return {
      all: episodes.length,
      notScheduled,
      draft,
      scheduled,
      published,
      expired,
      failed,
    };
  },

  async getPendingCount(): Promise<number> {
    const { count, error } = await supabase
      .from('episodes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDING_QC');
    if (error) throw error;
    return count ?? 0;
  },

  async approveEpisode(episodeId: string, comment?: string): Promise<EpisodeRow> {
    return unwrap(
      supabase.rpc('approve_episode', {
        p_episode_id: episodeId,
        p_comment: comment?.trim() || null,
      }),
    );
  },

  /** A rejection without a usable reason is refused by the database too. */
  async rejectEpisode(episodeId: string, comment: string): Promise<EpisodeRow> {
    const reason = comment.trim();
    if (reason.length < 5) {
      throw new AppError(
        'VALIDATION',
        'Explain what needs fixing so the producer can act on it (at least 5 characters).',
      );
    }
    return unwrap(
      supabase.rpc('reject_episode', { p_episode_id: episodeId, p_comment: reason }),
    );
  },

  async getReviewHistory(episodeId: string): Promise<QcReviewWithReviewer[]> {
    return unwrap(
      supabase
        .from('qc_reviews')
        .select('*, reviewer:profiles!qc_reviews_reviewer_id_fkey (id, full_name)')
        .eq('episode_id', episodeId)
        .order('created_at', { ascending: false })
        .returns<QcReviewWithReviewer[]>(),
    );
  },

  async getLatestReview(episodeId: string): Promise<QcReviewWithReviewer | null> {
    const history = await this.getReviewHistory(episodeId);
    return history[0] ?? null;
  },
};
