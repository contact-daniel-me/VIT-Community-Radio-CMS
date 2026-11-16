import { supabase } from '@/lib/supabase';
import { unwrap, unwrapMaybe } from '@/lib/query';
import { dataCache } from '@/lib/dataCache';
import type {
  PublicChartRow,
  PublicEpisodeRow,
  PublicNowPlayingRow,
  PublicProgramRow,
  PublicScheduleRow,
  PublicTopAudioRow,
  PublicApprovedEpisodeRow,
} from '@/types/database';

/**
 * The only data an anonymous visitor can reach.
 *
 * Backed by centralized dataCache with Stale-While-Revalidate and in-flight deduplication.
 * This guarantees instantaneous UI rendering for homepage visitors, eliminates duplicate queries,
 * and remains resilient on unstable or high-latency 3G mobile connections.
 */
export const publicService = {
  async getNowPlaying(): Promise<PublicNowPlayingRow | null> {
    return dataCache.fetch(
      'public:now_playing',
      () => unwrapMaybe(supabase.from('v_public_now_playing').select('*').maybeSingle()),
      { ttlMs: 15_000, staleWhileRevalidate: true },
    );
  },

  /** The top 10 featured audio tracks for the homepage. */
  async getTopAudio(): Promise<PublicTopAudioRow[]> {
    return dataCache.fetch(
      'public:top_audio',
      () => unwrap(supabase.from('v_public_top_audio').select('*').order('display_order', { ascending: true })),
      { ttlMs: 60_000, staleWhileRevalidate: true },
    );
  },

  async getTodaySchedule(): Promise<PublicScheduleRow[]> {
    return dataCache.fetch(
      'public:today_schedule',
      () => unwrap(supabase.from('v_public_schedule_today').select('*').order('start_time')),
      { ttlMs: 30_000, staleWhileRevalidate: true },
    );
  },

  /** Active programmes, busiest first, for the Featured Shows section. */
  async getShows(limit = 8): Promise<PublicProgramRow[]> {
    return dataCache.fetch(
      `public:shows:${limit}`,
      () =>
        unwrap(
          supabase
            .from('v_public_programs')
            .select('*')
            .order('aired_episode_count', { ascending: false })
            .order('name')
            .limit(limit),
        ),
      { ttlMs: 120_000, staleWhileRevalidate: true },
    );
  },

  /**
   * The Fixed Point Chart: the fixed weekly shape of the broadcast day.
   */
  async getFixedPointChart(): Promise<PublicChartRow[]> {
    return dataCache.fetch(
      'public:fixed_point_chart',
      () =>
        unwrap(
          supabase
            .from('v_public_fixed_point_chart')
            .select('*')
            .order('start_time')
            .order('end_time'),
        ),
      { ttlMs: 300_000, staleWhileRevalidate: true },
    );
  },

  /** Episodes that have actually been broadcast. Never unaired content. */
  async getRecentEpisodes(limit = 6): Promise<PublicEpisodeRow[]> {
    return dataCache.fetch(
      `public:recent_episodes:${limit}`,
      () =>
        unwrap(
          supabase
            .from('v_public_recent_episodes')
            .select('*')
            .order('aired_at', { ascending: false })
            .limit(limit),
        ),
      { ttlMs: 60_000, staleWhileRevalidate: true },
    );
  },

  /** All approved episodes with audio, regardless of broadcast status. */
  async getApprovedEpisodes(limit = 10): Promise<PublicApprovedEpisodeRow[]> {
    return dataCache.fetch(
      `public:approved_episodes:${limit}`,
      () =>
        unwrap(
          supabase
            .from('v_public_approved_episodes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit),
        ),
      { ttlMs: 30_000, staleWhileRevalidate: true },
    );
  },
};
