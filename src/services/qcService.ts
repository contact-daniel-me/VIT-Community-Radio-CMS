import { supabase } from '@/lib/supabase';
import { AppError } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type { EpisodeRow, QcReviewRow, ScheduleRow } from '@/types/database';
import { episodeService, type EpisodeWithRelations } from './episodeService';

export type BroadcastLifecycleStatus = 'NOT_SCHEDULED' | 'SCHEDULED' | 'PUBLISHED';

export interface EpisodeWithLifecycle extends EpisodeWithRelations {
  lifecycleStatus: BroadcastLifecycleStatus;
  activeSchedule?: ScheduleRow | null;
  publishedAt?: string | null;
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
 */
export function computeEpisodeLifecycle(
  episode: EpisodeWithRelations,
  epSchedules: ScheduleRow[],
  now: Date = new Date(),
): {
  lifecycleStatus: BroadcastLifecycleStatus;
  activeSchedule: ScheduleRow | null;
  publishedAt: string | null;
} {
  // 1. Check if Published:
  // A) Active homepage release
  const isHomepagePublished =
    Boolean(episode.show_on_homepage) &&
    (!episode.homepage_publish_at || new Date(episode.homepage_publish_at) <= now) &&
    (!episode.homepage_expires_at || new Date(episode.homepage_expires_at) > now);

  // B) Broadcast completed schedule
  const completedSchedule = epSchedules.find((s) => s.status === 'COMPLETED');

  if (isHomepagePublished || completedSchedule) {
    const publishedAt = isHomepagePublished
      ? (episode.homepage_publish_at ?? episode.reviewed_at ?? episode.updated_at)
      : (completedSchedule?.end_time ?? completedSchedule?.start_time ?? episode.reviewed_at);

    return {
      lifecycleStatus: 'PUBLISHED',
      activeSchedule: completedSchedule ?? null,
      publishedAt,
    };
  }

  // 2. Check if Scheduled:
  // Active broadcast schedule (SCHEDULED or ON_AIR)
  const activeSchedule = epSchedules.find(
    (s) => s.status === 'SCHEDULED' || s.status === 'ON_AIR',
  );

  if (activeSchedule) {
    return {
      lifecycleStatus: 'SCHEDULED',
      activeSchedule,
      publishedAt: null,
    };
  }

  // 3. Otherwise: Not Scheduled
  return {
    lifecycleStatus: 'NOT_SCHEDULED',
    activeSchedule: null,
    publishedAt: null,
  };
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
    const { data: schedules, error } = await supabase
      .from('schedules')
      .select('*')
      .in('episode_id', episodeIds)
      .order('start_time', { ascending: false });

    if (error) {
      console.error('Failed to fetch schedules for completed QC episodes:', error);
    }

    const schedulesByEpisode = new Map<string, ScheduleRow[]>();
    (schedules ?? []).forEach((s) => {
      if (!s.episode_id) return;
      const list = schedulesByEpisode.get(s.episode_id) ?? [];
      list.push(s);
      schedulesByEpisode.set(s.episode_id, list);
    });

    const now = new Date();
    const withLifecycle: EpisodeWithLifecycle[] = episodes.map((ep) => {
      const epSchedules = schedulesByEpisode.get(ep.id) ?? [];
      const lifecycle = computeEpisodeLifecycle(ep, epSchedules, now);
      return {
        ...ep,
        ...lifecycle,
      };
    });

    return withLifecycle.sort((a, b) =>
      (b.reviewed_at ?? b.updated_at ?? '').localeCompare(a.reviewed_at ?? a.updated_at ?? ''),
    );
  },

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
