import { useEffect } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { youtubeService, type LiveStatus } from '@/services/youtubeService';

/**
 * Whether the station is broadcasting on YouTube, kept current.
 *
 * Shared by the Live page and the player bar so both agree, and so the bar on
 * every page can say "live on YouTube" without each page having to know.
 *
 * The poll matches the edge cache on /api/youtube-live: a minute. Callers on
 * the same page therefore cost nothing extra -- the second request is served
 * from cache. Polling pauses while the tab is hidden, since a backgrounded tab
 * has nobody to show the answer to, and resumes on the way back.
 */
const POLL_MS = 60_000;

export function useYouTubeLive() {
  const status = useAsync<LiveStatus>(() => youtubeService.getLiveStatus(), []);
  const { reload } = status;

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [reload]);

  return status;
}
