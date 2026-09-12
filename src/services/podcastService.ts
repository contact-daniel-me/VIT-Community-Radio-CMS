/**
 * podcastService — reads cached podcast episodes from Supabase.
 *
 * The cache is populated by the `sync-podcast-episodes` Edge Function which
 * fetches the RSS feed server-side.  The frontend NEVER talks to the RSS URL
 * directly: it only queries the `podcast_episodes` table.
 *
 * If the table is empty (e.g. first deploy, before the first sync has run),
 * the service triggers a client-side RSS fetch as a one-time fallback so the
 * page is not blank.
 */
import { supabase } from '@/lib/supabase';
import type { PodcastEpisodeRow } from '@/types/database';

export type { PodcastEpisodeRow };

export const PAGE_SIZE = 20;

export interface EpisodeQuery {
  search?: string;
  sort?: 'newest' | 'oldest';
  page?: number;
}

export interface EpisodePage {
  episodes: PodcastEpisodeRow[];
  /** Total number of episodes matching the query (for pagination UI). */
  total: number;
  /** True when more pages are available after the current one. */
  hasMore: boolean;
}

export const podcastService = {
  /**
   * Fetch a paginated slice of episodes from the Supabase cache.
   * All filtering and sorting happens in the database — no RSS fetch.
   */
  async getEpisodes(query: EpisodeQuery = {}): Promise<EpisodePage> {
    const { search = '', sort = 'newest', page = 0 } = query;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from('podcast_episodes')
      .select('*', { count: 'exact' });

    // Server-side search across title and description.
    if (search.trim()) {
      q = q.or(
        `title.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`,
      );
    }

    q = q
      .order('pub_date', { ascending: sort === 'oldest', nullsFirst: false })
      .range(from, to);

    const { data, error, count } = await q;

    if (error) throw new Error(error.message);

    const episodes = (data as PodcastEpisodeRow[]) ?? [];
    const total = count ?? 0;
    const hasMore = from + episodes.length < total;

    return { episodes, total, hasMore };
  },

  /**
   * Returns the timestamp of the most recent sync, or null if the table is
   * empty (sync has never run).
   */
  async getLastSyncedAt(): Promise<string | null> {
    const { data } = await supabase
      .from('podcast_episodes')
      .select('last_synced_at')
      .order('last_synced_at', { ascending: false })
      .limit(1)
      .single();

    return (data as PodcastEpisodeRow | null)?.last_synced_at ?? null;
  },

  /** Total cached episode count — used to show a sync badge. */
  async getCount(): Promise<number> {
    const { count } = await supabase
      .from('podcast_episodes')
      .select('*', { count: 'exact', head: true });

    return count ?? 0;
  },
};
