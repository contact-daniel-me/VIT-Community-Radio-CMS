import { AUDIO_BUCKET, supabase } from '@/lib/supabase';
import { AppError, assertWritten } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type { AudioFileRow, EpisodeRow, EpisodeStatus } from '@/types/database';

/** An episode with the joined bits every list and detail screen needs. */
export interface EpisodeWithRelations extends EpisodeRow {
  program: { id: string; name: string; requires_audio: boolean; active: boolean } | null;
  audio_file: AudioFileRow | null;
  author: { id: string; full_name: string } | null;
  assignee: { id: string; full_name: string } | null;
}

const EPISODE_SELECT = `
  *,
  program:programs!episodes_program_id_fkey (id, name, requires_audio, active),
  audio_file:audio_files!episodes_audio_file_id_fkey (*),
  author:profiles!episodes_created_by_fkey (id, full_name),
  assignee:profiles!episodes_assigned_rj_fkey (id, full_name)
`;

export interface EpisodeInput {
  program_id: string;
  title: string;
  description?: string | null;
  episode_number?: number | null;
  host_name?: string | null;
  assigned_rj?: string | null;
}

export interface EpisodeFilters {
  programId?: string;
  status?: EpisodeStatus | EpisodeStatus[];
  mineOnly?: string;
  search?: string;
  limit?: number;
}

export const episodeService = {
  async getEpisodes(filters: EpisodeFilters = {}): Promise<EpisodeWithRelations[]> {
    let query = supabase
      .from('episodes')
      .select(EPISODE_SELECT)
      .order('created_at', { ascending: false });

    if (filters.programId) query = query.eq('program_id', filters.programId);
    if (filters.status) {
      query = Array.isArray(filters.status)
        ? query.in('status', filters.status)
        : query.eq('status', filters.status);
    }
    if (filters.mineOnly) {
      query = query.or(`created_by.eq.${filters.mineOnly},assigned_rj.eq.${filters.mineOnly}`);
    }
    if (filters.search?.trim()) query = query.ilike('title', `%${filters.search.trim()}%`);
    if (filters.limit) query = query.limit(filters.limit);

    return unwrap(query.returns<EpisodeWithRelations[]>());
  },

  async getEpisode(id: string): Promise<EpisodeWithRelations> {
    return unwrap(
      supabase
        .from('episodes')
        .select(EPISODE_SELECT)
        .eq('id', id)
        .single()
        .returns<EpisodeWithRelations>(),
    );
  },

  async createEpisode(input: EpisodeInput, createdBy: string): Promise<EpisodeRow> {
    return unwrap(
      supabase
        .from('episodes')
        .insert({
          ...input,
          title: input.title.trim(),
          created_by: createdBy,
          // status is intentionally not settable here: new episodes are DRAFT,
          // and the RLS insert policy enforces it.
        })
        .select('*')
        .single(),
    );
  },

  /**
   * Only DRAFT and REJECTED episodes are writable. If the row is locked, RLS
   * filters it out and nothing is returned -- assertWritten turns that silence
   * into a clear message.
   */
  async updateEpisode(id: string, patch: Partial<EpisodeInput>): Promise<EpisodeRow> {
    const rows = await unwrap(supabase.from('episodes').update(patch).eq('id', id).select('*'));
    return assertWritten(rows, 'episode');
  },

  async submitForQC(id: string): Promise<EpisodeRow> {
    return unwrap(supabase.rpc('submit_episode_for_qc', { p_episode_id: id }));
  },

  /** Rejected (or approved but unscheduled) content goes back to DRAFT for editing. */
  async reopenEpisode(id: string): Promise<EpisodeRow> {
    return unwrap(supabase.rpc('reopen_episode', { p_episode_id: id }));
  },

  async archiveEpisode(id: string): Promise<EpisodeRow> {
    return unwrap(supabase.rpc('archive_episode', { p_episode_id: id }));
  },

  /**
   * Permanently remove a draft or rejected episode.
   *
   * The bucket is cleared BEFORE the row, and the order is not interchangeable.
   * Deleting the episode first strands its audio: the storage policy that
   * authorises the delete matches on the episode, so once the episode is gone
   * the object cannot be removed at all. That mistake has already been made
   * once in this project and left orphaned files behind.
   *
   * A storage object that has already vanished is not an error -- the point is
   * to end with the bucket clear, and it is.
   */
  async deleteEpisode(id: string): Promise<{ title: string; removedFiles: number }> {
    const audio = await unwrap(
      supabase.from('audio_files').select('storage_path').eq('episode_id', id),
    );

    const paths = audio.map((row) => row.storage_path).filter(Boolean);
    if (paths.length > 0) {
      const { error } = await supabase.storage.from(AUDIO_BUCKET).remove(paths);
      // Storage refusing is worth stopping for: carrying on would delete the
      // row and leave the audio behind with no way to reach it.
      if (error && !/not found/i.test(error.message)) {
        throw new AppError(
          'CONFLICT',
          'The audio could not be removed, so the episode was left alone.',
          error,
        );
      }
    }

    const result = await unwrap(supabase.rpc('delete_episode', { p_episode_id: id }));
    return { title: result.title, removedFiles: paths.length };
  },

  /** Episodes cleared by QC and therefore eligible for the schedule grid. */
  async getSchedulableEpisodes(programId?: string): Promise<EpisodeWithRelations[]> {
    return this.getEpisodes({ status: 'APPROVED', programId });
  },
};
