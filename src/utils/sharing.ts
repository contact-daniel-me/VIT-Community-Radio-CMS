/**
 * Utility functions for Published Episode Sharing.
 *
 * Strict Sharing Eligibility Rules:
 * 1. Allow sharing ONLY for episodes with 'PUBLISHED' status.
 * 2. An episode MUST be available and visible on the Radio Home Page:
 *    - episode.status === 'APPROVED'
 *    - Has QC-approved final audio or playable audio
 *    - episode.show_on_homepage === true
 *    - Publish time has passed (homepage_publish_at <= now, if set)
 *    - Not expired (homepage_expires_at > now and expires_at > now, if set)
 * 3. Draft, pending QC approval, rejected, not scheduled, scheduled (not yet published),
 *    expired, and other unavailable episodes MUST NEVER be shareable.
 */

export interface ShareableEpisodeCandidate {
  id?: string;
  episode_id?: string;
  status?: string;
  publish_status?: string;
  show_on_homepage?: boolean;
  homepage_publish_at?: string | null;
  homepage_expires_at?: string | null;
  scheduled_at?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
  final_audio_file_id?: string | null;
  audio_file_id?: string | null;
}

/**
 * Checks whether an episode is eligible for public sharing.
 *
 * @param episode Episode record or partial fields
 * @param resolvedPublishStatus Optional resolved lifecycle status from resolveEpisodePublishStatus
 * @param now Optional reference date (defaults to current time)
 */
export function isEpisodePublishedAndShareable(
  episode: ShareableEpisodeCandidate | null | undefined,
  resolvedPublishStatus?: string | null,
  now: Date = new Date(),
): boolean {
  if (!episode) return false;

  // 1. Strict Requirement: Must have QC approval
  if (episode.status !== 'APPROVED') return false;

  // 2. Strict Requirement: Must have final audio
  if (!episode.final_audio_file_id && !episode.audio_file_id) return false;

  // 3. Strict Requirement: Must be selected for display on the Radio Home Page
  if (episode.show_on_homepage !== true) return false;

  // 4. Must not be a future release (must be currently live/published on homepage)
  const pubTime = episode.homepage_publish_at || episode.published_at || episode.scheduled_at;
  if (pubTime && new Date(pubTime) > now) {
    return false;
  }

  // 5. Must not be expired from homepage
  const expTime = episode.homepage_expires_at || episode.expires_at;
  if (expTime && new Date(expTime) <= now) {
    return false;
  }

  // 6. Strict Requirement: Status must be PUBLISHED
  const effectiveStatus = (resolvedPublishStatus || episode.publish_status || '').toUpperCase();
  return effectiveStatus === 'PUBLISHED';
}

/**
 * Backward compatibility alias for isEpisodePublishedAndShareable.
 */
export const isEpisodeScheduledAndShareable = isEpisodePublishedAndShareable;

/**
 * Generates the unique public URL for a published episode.
 * Uses the configured production domain (VITE_PUBLIC_SITE_URL or VITE_APP_URL)
 * when available, falling back to window.location.origin.
 */
export function buildEpisodeShareUrl(episodeId: string): string {
  const configuredDomain = (
    import.meta.env.VITE_PUBLIC_SITE_URL ||
    import.meta.env.VITE_APP_URL ||
    import.meta.env.VITE_SITE_URL ||
    ''
  ).trim().replace(/\/+$/, '');

  const baseOrigin = configuredDomain || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${baseOrigin}/?episode=${encodeURIComponent(episodeId)}`;
}
