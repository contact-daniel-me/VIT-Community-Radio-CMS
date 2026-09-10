import { supabase } from '@/lib/supabase';
import { unwrap, unwrapMaybe } from '@/lib/query';
import type {
  PublicEpisodeRow,
  PublicNowPlayingRow,
  PublicProgramRow,
  PublicScheduleRow,
} from '@/types/database';

/**
 * The only data an anonymous visitor can reach.
 *
 * These read two SECURITY DEFINER views that expose a fixed handful of columns
 * (programme, episode title, host, times). The tables themselves stay closed to
 * `anon`, so nothing here can widen by accident -- adding a column to the public
 * site means editing the view in a migration, deliberately.
 */
export const publicService = {
  async getNowPlaying(): Promise<PublicNowPlayingRow | null> {
    return unwrapMaybe(supabase.from('v_public_now_playing').select('*').maybeSingle());
  },

  async getTodaySchedule(): Promise<PublicScheduleRow[]> {
    return unwrap(
      supabase.from('v_public_schedule_today').select('*').order('start_time'),
    );
  },

  /** Active programmes, busiest first, for the Featured Shows section. */
  async getShows(limit = 8): Promise<PublicProgramRow[]> {
    return unwrap(
      supabase
        .from('v_public_programs')
        .select('*')
        .order('aired_episode_count', { ascending: false })
        .order('name')
        .limit(limit),
    );
  },

  /** Episodes that have actually been broadcast. Never unaired content. */
  async getRecentEpisodes(limit = 6): Promise<PublicEpisodeRow[]> {
    return unwrap(
      supabase
        .from('v_public_recent_episodes')
        .select('*')
        .order('aired_at', { ascending: false })
        .limit(limit),
    );
  },
};
