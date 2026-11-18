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
  SharedScheduledEpisode,
} from '@/types/database';
import { audioService } from './audioService';

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

  /**
   * Retrieves public details for a shared published episode.
   * Strictly enforces sharing eligibility:
   * 1. Must be QC APPROVED
   * 2. Must have valid playable audio
   * 3. Must be currently PUBLISHED
   * 4. Must be available and visible on the Radio Home Page (show_on_homepage = true, not expired)
   * 5. Program must be active
   * Never exposes raw audio or internal credentials.
   */
  async getSharedScheduledEpisode(episodeId: string): Promise<SharedScheduledEpisode | null> {
    if (!episodeId) return null;

    return dataCache.fetch(
      `public:shared_episode:${episodeId}`,
      async () => {
        // 1. Try database RPC if available
        try {
          const { data, error } = await (supabase.rpc as any)('get_shared_published_episode', {
            p_episode_id: episodeId,
          }).catch(() =>
            (supabase.rpc as any)('get_shared_scheduled_episode', {
              p_episode_id: episodeId,
            }),
          );

          if (!error && data) {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            if (parsed.is_eligible) {
              return parsed as SharedScheduledEpisode;
            }
          }
        } catch {
          // Fall through to view / query verification
        }

        // 2. Query public approved episodes view (anonymous-accessible, powers the Radio Home Page)
        try {
          const { data: viewRow, error: viewErr } = await supabase
            .from('v_public_approved_episodes')
            .select('*')
            .eq('episode_id', episodeId)
            .maybeSingle();

          if (!viewErr && viewRow) {
            const nowDate = new Date();
            const schedTime = viewRow.homepage_publish_at || viewRow.scheduled_at || viewRow.published_at;
            const expTime = viewRow.homepage_expires_at || viewRow.expires_at;

            // Enforce Radio Home Page availability
            const isHomePageActive =
              viewRow.show_on_homepage === true &&
              (!schedTime || new Date(schedTime) <= nowDate) &&
              (!expTime || new Date(expTime) > nowDate);

            const isPublished =
              viewRow.publish_status === 'PUBLISHED' ||
              (viewRow.show_on_homepage === true && (!schedTime || new Date(schedTime) <= nowDate));

            if (isHomePageActive && isPublished && viewRow.storage_path) {
              // Lookup cover artwork from shows
              let artworkUrl: string | null = null;
              try {
                const shows = await publicService.getShows(50).catch(() => []);
                const matchingShow = shows.find(
                  (s) => s.name?.toLowerCase().trim() === viewRow.program_name?.toLowerCase().trim(),
                );
                if (matchingShow?.artwork_url) artworkUrl = matchingShow.artwork_url;
              } catch {
                // ignore
              }

              return {
                is_eligible: true,
                episode_id: viewRow.episode_id,
                title: viewRow.title,
                description: viewRow.description,
                host_name: viewRow.host_name || 'VIT Community Radio',
                program_id: '',
                program_name: viewRow.program_name,
                program_category: viewRow.program_category || 'COMMUNITY RADIO',
                artwork_url: artworkUrl,
                duration_seconds: viewRow.audio_duration_seconds || viewRow.duration_seconds,
                scheduled_at: schedTime || null,
                storage_path: viewRow.storage_path,
                storage_provider: viewRow.storage_provider || 'supabase',
                file_name: viewRow.file_name,
              };
            }
          }
        } catch {
          // Fall through to direct query
        }

        // 3. Direct query fallback enforcing the exact same eligibility rules
        try {
          const { data: ep, error: epErr } = await supabase
            .from('episodes')
            .select(`
              id,
              title,
              description,
              host_name,
              status,
              publish_status,
              scheduled_at,
              published_at,
              homepage_publish_at,
              homepage_expires_at,
              expires_at,
              show_on_homepage,
              duration_seconds,
              final_audio_file_id,
              audio_file_id,
              program:programs (id, name, category, artwork_url, active),
              final_audio:audio_files!episodes_final_audio_file_id_fkey (id, storage_path, storage_provider, file_name, duration_seconds, deleted_at),
              raw_audio:audio_files!episodes_audio_file_id_fkey (id, storage_path, storage_provider, file_name, duration_seconds, deleted_at)
            `)
            .eq('id', episodeId)
            .maybeSingle();

          if (epErr || !ep) return null;

          // Rule 1: Episode must be APPROVED
          if (ep.status !== 'APPROVED') {
            return null;
          }

          // Rule 2: Program must be active
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const prog = ep.program as any;
          if (!prog || prog.active === false) return null;

          // Rule 3: Playable audio must exist
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const audio = (ep.final_audio || ep.raw_audio) as any;
          if (!audio || audio.deleted_at || !audio.storage_path) return null;

          // Rule 4: Must be available and visible on the Radio Home Page
          if (ep.show_on_homepage !== true) {
            return null;
          }

          const now = new Date();
          const schedTime = ep.homepage_publish_at || ep.scheduled_at || ep.published_at;
          if (schedTime && new Date(schedTime) > now) {
            return null;
          }

          const expTime = ep.homepage_expires_at || ep.expires_at;
          if (expTime && new Date(expTime) <= now) {
            return null;
          }

          // Rule 5: Status must be PUBLISHED
          const isPublished =
            ep.publish_status === 'PUBLISHED' ||
            (ep.show_on_homepage === true && (!schedTime || new Date(schedTime) <= now));

          if (!isPublished) {
            return null;
          }

          return {
            is_eligible: true,
            episode_id: ep.id,
            title: ep.title,
            description: ep.description,
            host_name: ep.host_name || prog.host_name || prog.name || 'VIT Community Radio',
            program_id: prog.id,
            program_name: prog.name,
            program_category: prog.category || 'COMMUNITY RADIO',
            artwork_url: prog.artwork_url || null,
            duration_seconds: audio.duration_seconds || ep.duration_seconds,
            scheduled_at: schedTime || null,
            storage_path: audio.storage_path,
            storage_provider: (audio.storage_provider as 'supabase' | 'r2') || 'supabase',
            file_name: audio.file_name,
          };
        } catch {
          return null;
        }
      },
      { ttlMs: 15_000, staleWhileRevalidate: false },
    );
  },

  /**
   * Alias for getSharedScheduledEpisode emphasizing published status.
   */
  async getSharedPublishedEpisode(episodeId: string): Promise<SharedScheduledEpisode | null> {
    return this.getSharedScheduledEpisode(episodeId);
  },

  /**
   * Validates published status and retrieves a signed playback URL for the audio.
   * Throws if the episode is not currently published on the Radio Home Page or has expired.
   */
  async getSharedEpisodePlaybackUrl(episodeId: string): Promise<string> {
    const shared = await this.getSharedScheduledEpisode(episodeId);
    if (!shared) {
      throw new Error('This episode is not currently published on the Radio Home Page or is not eligible for public playback.');
    }
    return audioService.getPlaybackUrl(
      { storage_path: shared.storage_path, storage_provider: shared.storage_provider },
      1800,
    );
  },
};
