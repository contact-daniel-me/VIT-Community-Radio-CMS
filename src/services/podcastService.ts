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

let inMemoryLatestRss: PodcastEpisodeRow[] = [];
let lastSyncCheckTime = 0;
const SYNC_COOLDOWN_MS = 60 * 1000; // 1 minute cooldown between automatic network checks

export const podcastService = {
  /**
   * Automatically checks the Spotify/Anchor RSS feed for new episodes and syncs them to Supabase.
   * Returns whether new episodes were detected and added.
   */
  async autoSyncLatest(force = false): Promise<{ hasNew: boolean; count: number }> {
    const now = Date.now();
    if (!force && now - lastSyncCheckTime < SYNC_COOLDOWN_MS && inMemoryLatestRss.length > 0) {
      return { hasNew: false, count: 0 };
    }
    lastSyncCheckTime = now;

    try {
      // 1. Fetch latest items from RSS feed
      const rssEpisodes = await fetchFallbackRSS();
      if (!rssEpisodes || rssEpisodes.length === 0) {
        return { hasNew: false, count: 0 };
      }
      inMemoryLatestRss = rssEpisodes;

      // 2. Get the latest pub_date currently in the database
      const { data: latestDbRow } = await supabase
        .from('podcast_episodes')
        .select('pub_date')
        .order('pub_date', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      const latestDbDate = latestDbRow?.pub_date ? new Date(latestDbRow.pub_date).getTime() : 0;

      // 3. Find episodes from RSS that are newer than what is in DB
      const newerEpisodes = rssEpisodes.filter((ep) => {
        if (!latestDbDate) return true;
        const epDate = ep.pub_date ? new Date(ep.pub_date).getTime() : 0;
        return epDate > latestDbDate;
      });

      // Take newer episodes (or at least top 30 to update metadata)
      const toSync = newerEpisodes.length > 0 ? newerEpisodes : rssEpisodes.slice(0, 30);

      // 4. Persist to database via security definer RPC
      const payload = toSync.map((e) => ({
        rss_guid: e.rss_guid,
        title: e.title,
        description: e.description,
        audio_url: e.audio_url,
        spotify_url: e.spotify_url,
        artwork_url: e.artwork_url,
        duration: e.duration,
        pub_date: e.pub_date,
        episode_number: e.episode_number,
      }));

      const { data: rpcRes, error } = await supabase.rpc('sync_podcast_episodes', {
        p_episodes: payload as unknown as import('@/types/database').Json,
      });

      if (error && import.meta.env.DEV) {
        console.warn('[podcastService] sync_podcast_episodes error:', error.message);
      }

      const syncedCount = (rpcRes as { synced?: number })?.synced ?? newerEpisodes.length;
      return {
        hasNew: newerEpisodes.length > 0,
        count: syncedCount,
      };
    } catch (e) {
      console.warn('[podcastService] autoSyncLatest failed gracefully:', e);
      return { hasNew: false, count: 0 };
    }
  },

  /**
   * Fetch a paginated slice of episodes from the Supabase cache.
   * Seamlessly merges any brand new RSS episodes into the top of the list.
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
      const fallback = inMemoryLatestRss.length > 0 ? inMemoryLatestRss : await fetchFallbackRSS();
      total = fallback.length;
      
      // RSS is typically newest first. If they want oldest first:
      if (sort === 'oldest') {
        fallback.reverse();
      }
      
      episodes = fallback.slice(from, to + 1);
    } else if (page === 0 && sort === 'newest' && !search && !fromDate && !toDate && inMemoryLatestRss.length > 0) {
      // If we have newer RSS episodes in memory that are newer than the top database row,
      // merge them so the user sees them immediately even if DB write is in progress.
      const topDbDate = episodes[0]?.pub_date ? new Date(episodes[0].pub_date).getTime() : 0;
      const freshItems = inMemoryLatestRss.filter((ep) => {
        const epDate = ep.pub_date ? new Date(ep.pub_date).getTime() : 0;
        return epDate > topDbDate;
      });

      if (freshItems.length > 0) {
        const seen = new Set(freshItems.map((e) => e.rss_guid));
        const merged = [...freshItems, ...episodes.filter((e) => !seen.has(e.rss_guid))];
        episodes = merged.slice(0, PAGE_SIZE);
        total += freshItems.length;
      }
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
