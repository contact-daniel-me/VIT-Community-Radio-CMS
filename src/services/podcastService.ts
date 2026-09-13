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

const RSS_URL = 'https://anchor.fm/s/dd6c2248/podcast/rss';

async function fetchFallbackRSS(): Promise<PodcastEpisodeRow[]> {
  try {
    const res = await fetch(RSS_URL);
    if (!res.ok) return [];
    const text = await res.text();

    const extractText = (xml: string, tag: string) => {
      const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
      const plainRe = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
      const cdataM = xml.match(cdataRe);
      if (cdataM) return cdataM[1].trim();
      const plainM = xml.match(plainRe);
      return plainM ? plainM[1].trim() : '';
    };

    const stripHtml = (html: string) =>
      html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#039;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();

    const itemChunks = text.split(/<item[\s>]/i).slice(1);
    const episodes: PodcastEpisodeRow[] = [];

    for (const chunk of itemChunks) {
      const itemXml = chunk.split(/<\/item>/i)[0];
      const rss_guid = extractText(itemXml, 'guid');
      if (!rss_guid) continue;

      const audio_url = itemXml.match(/<enclosure[^>]*url="([^"]*)"/i)?.[1] || '';
      const title = stripHtml(extractText(itemXml, 'title')) || 'Untitled Episode';
      const description =
        stripHtml(extractText(itemXml, 'description') || extractText(itemXml, 'itunes:summary')) || null;
      const artwork_url = itemXml.match(/<itunes:image[^>]*href="([^"]*)"/i)?.[1] || null;
      const duration = extractText(itemXml, 'itunes:duration') || null;
      const pubDateRaw = extractText(itemXml, 'pubDate');
      const pub_date = pubDateRaw ? new Date(pubDateRaw).toISOString() : null;
      const spotify_url = extractText(itemXml, 'link') || null;
      const epNumRaw = extractText(itemXml, 'itunes:episode');
      const episode_number = epNumRaw ? parseInt(epNumRaw, 10) || null : null;

      episodes.push({
        id: rss_guid, // Use guid as a fallback id since we don't have db uuid
        rss_guid,
        title,
        description,
        audio_url,
        spotify_url,
        artwork_url,
        duration,
        pub_date,
        episode_number,
        last_synced_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    return episodes;
  } catch (e) {
    console.error('Failed to fetch fallback RSS:', e);
    return [];
  }
}

export const PAGE_SIZE = 9;

export interface EpisodeQuery {
  search?: string;
  sort?: 'newest' | 'oldest';
  page?: number;
  fromDate?: string;
  toDate?: string;
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
    const { search = '', sort = 'newest', page = 0, fromDate, toDate } = query;
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
    
    // Server-side date filtering
    if (fromDate) {
      q = q.gte('pub_date', `${fromDate}T00:00:00.000Z`);
    }
    if (toDate) {
      q = q.lte('pub_date', `${toDate}T23:59:59.999Z`);
    }

    q = q
      .order('pub_date', { ascending: sort === 'oldest', nullsFirst: false })
      .range(from, to);

    const { data, error, count } = await q;

    if (error) throw new Error(error.message);

    let episodes = (data as PodcastEpisodeRow[]) ?? [];
    let total = count ?? 0;

    // Fallback to client-side RSS if the database is completely empty
    if (total === 0 && !search && !fromDate && !toDate) {
      const fallback = await fetchFallbackRSS();
      total = fallback.length;
      
      // RSS is typically newest first. If they want oldest first:
      if (sort === 'oldest') {
        fallback.reverse();
      }
      
      episodes = fallback.slice(from, to + 1);
    }

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
