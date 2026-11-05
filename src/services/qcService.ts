import { supabase } from '@/lib/supabase';
import { AppError } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type { EpisodeRow, QcReviewRow, ScheduleRow, ScheduleDetailsRow } from '@/types/database';
import { episodeService, type EpisodeWithRelations } from './episodeService';

export type BroadcastLifecycleStatus = 'NOT_SCHEDULED' | 'SCHEDULED' | 'PUBLISHED';

export interface EpisodeWithLifecycle extends EpisodeWithRelations {
  lifecycleStatus: BroadcastLifecycleStatus;
  activeSchedule?: ScheduleRow | ScheduleDetailsRow | null;
  publishedAt?: string | null;
  homepageScheduledAt?: string | null;
  homepageExpiresAt?: string | null;
  lifecycleTarget?: 'BROADCAST' | 'HOMEPAGE' | 'BOTH' | null;
}

export interface LifecycleCounts {
  all: number;
  notScheduled: number;
  scheduled: number;
  published: number;
}

export interface QcReviewWithReviewer extends QcReviewRow {
  reviewer: { id: string; full_name: string } | null;
}

/**
 * Pure helper to compute an episode's broadcast lifecycle status.
 * Handles both Broadcast Transmission schedules (schedules / v_schedule_details)
 * and Homepage Release schedules (show_on_homepage & homepage_publish_at).
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
  lifecycleTarget: 'BROADCAST' | 'HOMEPAGE' | 'BOTH' | null;
} {
  const hasHomepage = Boolean(episode.show_on_homepage);
  const pubTime = episode.homepage_publish_at ? new Date(episode.homepage_publish_at) : null;
  const expTime = episode.homepage_expires_at ? new Date(episode.homepage_expires_at) : null;

  // 1. Check Homepage Release states:
  // A) Homepage Live/Published: enabled, publish time arrived (or null/immediate), and not expired
  const isHomepagePublished =
    hasHomepage &&
    (!pubTime || pubTime <= now) &&
    (!expTime || expTime > now);

  // B) Homepage Scheduled: enabled, publish time in the future, and not expired
  const isHomepageScheduled =
    hasHomepage &&
    Boolean(pubTime && pubTime > now) &&
    Boolean(!expTime || (pubTime && expTime > pubTime));

  // 2. Check Broadcast Schedule states:
  const completedSchedule = epSchedules.find((s) => s.status === 'COMPLETED');
  const activeBroadcastSchedule = epSchedules.find(
    (s) => s.status === 'SCHEDULED' || s.status === 'ON_AIR',
  );

  // 3. Status Resolution:
  // Step A: Published (either active homepage release or broadcast completed)
  if (isHomepagePublished || completedSchedule) {
    const publishedAt = isHomepagePublished
      ? (episode.homepage_publish_at ?? episode.reviewed_at ?? episode.updated_at)
      : (completedSchedule?.end_time ?? completedSchedule?.start_time ?? episode.reviewed_at);

    return {
      lifecycleStatus: 'PUBLISHED',
      activeSchedule: completedSchedule ?? activeBroadcastSchedule ?? null,
      publishedAt,
      homepageScheduledAt: null,
      homepageExpiresAt: isHomepagePublished ? (episode.homepage_expires_at ?? null) : null,
      lifecycleTarget:
        isHomepagePublished && completedSchedule ? 'BOTH' : isHomepagePublished ? 'HOMEPAGE' : 'BROADCAST',
    };
  }

  // Step B: Scheduled (either upcoming broadcast slot or scheduled future homepage release)
  if (activeBroadcastSchedule || isHomepageScheduled) {
    return {
      lifecycleStatus: 'SCHEDULED',
      activeSchedule: activeBroadcastSchedule ?? null,
      publishedAt: null,
      homepageScheduledAt: isHomepageScheduled ? (episode.homepage_publish_at ?? null) : null,
      homepageExpiresAt: isHomepageScheduled ? (episode.homepage_expires_at ?? null) : null,
      lifecycleTarget:
        activeBroadcastSchedule && isHomepageScheduled ? 'BOTH' : activeBroadcastSchedule ? 'BROADCAST' : 'HOMEPAGE',
    };
  }

  // Step C: Not Scheduled
  return {
    lifecycleStatus: 'NOT_SCHEDULED',
    activeSchedule: null,
    publishedAt: null,
    homepageScheduledAt: null,
    homepageExpiresAt: null,
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
  if (ep.homepageScheduledAt) {
    const t = toEpoch(ep.homepageScheduledAt);
    if (t > 0) dates.push(t);
  } else if (ep.homepage_publish_at) {
    const t = toEpoch(ep.homepage_publish_at);
    if (t > 0) dates.push(t);
  }
  if (dates.length > 0) {
    dates.sort((a, b) => a - b);
    return new Date(dates[0]).toISOString();
  }
  return getEpisodeReviewedDate(ep);
}

export function getEpisodePublicationDate(ep: EpisodeWithLifecycle): string {
  return ep.publishedAt ?? ep.homepage_publish_at ?? ep.reviewed_at ?? ep.updated_at ?? '';
}

/**
 * Reorganizes QC Done episodes in the requested business order:
 * 1. Not Scheduled (top) – sorted by QC review/completion date (newest first).
 * 2. Scheduled (middle) – sorted by scheduled broadcast/release date (nearest upcoming first).
 * 3. Published (bottom) – sorted by actual publication date (most recently published first).
 */
export function sortCompletedQCEpisodes(episodes: EpisodeWithLifecycle[]): EpisodeWithLifecycle[] {
  const STATUS_PRIORITY: Record<BroadcastLifecycleStatus, number> = {
    NOT_SCHEDULED: 1,
    SCHEDULED: 2,
    PUBLISHED: 3,
  };

  return [...episodes].sort((a, b) => {
    // 1. Status Ordering: NOT_SCHEDULED (1) -> SCHEDULED (2) -> PUBLISHED (3)
    const priorityDiff = STATUS_PRIORITY[a.lifecycleStatus] - STATUS_PRIORITY[b.lifecycleStatus];
    if (priorityDiff !== 0) return priorityDiff;

    // 2. Intra-category date ordering:
    if (a.lifecycleStatus === 'NOT_SCHEDULED') {
      // Newest QC review / completion date first (descending)
      const diff = toEpoch(getEpisodeReviewedDate(b)) - toEpoch(getEpisodeReviewedDate(a));
      if (diff !== 0) return diff;
      return (a.title || '').localeCompare(b.title || '');
    }

    if (a.lifecycleStatus === 'SCHEDULED') {
      // Nearest upcoming release date first (ascending: earlier date comes first)
      const diff = toEpoch(getEpisodeScheduledDate(a)) - toEpoch(getEpisodeScheduledDate(b));
      if (diff !== 0) return diff;
      // Tie-breaker: newest reviewed first
      const revDiff = toEpoch(getEpisodeReviewedDate(b)) - toEpoch(getEpisodeReviewedDate(a));
      if (revDiff !== 0) return revDiff;
      return (a.title || '').localeCompare(b.title || '');
    }

    if (a.lifecycleStatus === 'PUBLISHED') {
      // Most recently published first (descending: newer publication date comes first)
      const diff = toEpoch(getEpisodePublicationDate(b)) - toEpoch(getEpisodePublicationDate(a));
      if (diff !== 0) return diff;
      // Tie-breaker: newest reviewed first
      const revDiff = toEpoch(getEpisodeReviewedDate(b)) - toEpoch(getEpisodeReviewedDate(a));
      if (revDiff !== 0) return revDiff;
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

  /** Most recently approved first: episodes that have completed quality checks, with their broadcast lifecycle status. */
  async getCompletedQC(): Promise<EpisodeWithLifecycle[]> {
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

    // Also fetch unlinked active schedules (where episode_id might not have been set on the slot)
    const { data: unlinkedSchedules } = await supabase
      .from('v_schedule_details')
      .select('*')
      .is('episode_id', null)
      .in('status', ['SCHEDULED', 'ON_AIR'])
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
    let scheduled = 0;
    let published = 0;

    for (const ep of episodes) {
      if (ep.lifecycleStatus === 'NOT_SCHEDULED') notScheduled++;
      else if (ep.lifecycleStatus === 'SCHEDULED') scheduled++;
      else if (ep.lifecycleStatus === 'PUBLISHED') published++;
    }

    return {
      all: episodes.length,
      notScheduled,
      scheduled,
      published,
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
