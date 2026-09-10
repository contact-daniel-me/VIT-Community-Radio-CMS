import { supabase } from '@/lib/supabase';
import { AppError } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type { EpisodeRow, QcReviewRow } from '@/types/database';
import { episodeService, type EpisodeWithRelations } from './episodeService';

export interface QcReviewWithReviewer extends QcReviewRow {
  reviewer: { id: string; full_name: string } | null;
}

export const qcService = {
  /** Oldest submission first: the QC desk works a queue, not a pile. */
  async getPendingQC(): Promise<EpisodeWithRelations[]> {
    const episodes = await episodeService.getEpisodes({ status: 'PENDING_QC' });
    return [...episodes].sort((a, b) =>
      (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''),
    );
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
