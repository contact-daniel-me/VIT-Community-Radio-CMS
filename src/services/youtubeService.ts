/**
 * The station's YouTube broadcast, as far as the browser is concerned.
 *
 * This talks to our own /api/youtube-live route and nothing else. No YouTube
 * endpoint is called from here and no API key exists in this bundle -- the key
 * lives in the serverless function's environment, which is why the lookup is
 * server-side at all.
 */

/** Mirrors LiveStatus in api/_youtube.ts. Kept in step by hand; it is small. */
export type LiveStatus =
  | { state: 'live'; videoId: string; title: string; channelUrl: string }
  | {
      state: 'upcoming';
      videoId: string;
      title: string;
      scheduledStartTime: string | null;
      channelUrl: string;
    }
  | { state: 'offline'; channelUrl: string };

export const CHANNEL_URL = 'https://www.youtube.com/@vitradiolive';

const OFFLINE: LiveStatus = { state: 'offline', channelUrl: CHANNEL_URL };

/** Anything unrecognised is treated as offline rather than trusted blindly. */
function parse(value: unknown): LiveStatus {
  if (!value || typeof value !== 'object') return OFFLINE;
  const body = value as Record<string, unknown>;
  const channelUrl = typeof body.channelUrl === 'string' ? body.channelUrl : CHANNEL_URL;

  if (body.state === 'live' && typeof body.videoId === 'string' && body.videoId) {
    return {
      state: 'live',
      videoId: body.videoId,
      title: typeof body.title === 'string' ? body.title : 'VIT Community Radio Live',
      channelUrl,
    };
  }

  if (body.state === 'upcoming' && typeof body.videoId === 'string' && body.videoId) {
    return {
      state: 'upcoming',
      videoId: body.videoId,
      title: typeof body.title === 'string' ? body.title : 'VIT Community Radio Live',
      scheduledStartTime:
        typeof body.scheduledStartTime === 'string' ? body.scheduledStartTime : null,
      channelUrl,
    };
  }

  return { state: 'offline', channelUrl };
}

export const youtubeService = {
  /**
   * In local development there is no serverless runtime, so `vite dev` answers
   * /api/* with index.html. That would parse as nothing useful, so a non-JSON
   * response is reported as offline rather than thrown -- the page then shows
   * its offline state instead of an error the developer cannot act on.
   */
  async getLiveStatus(signal?: AbortSignal): Promise<LiveStatus> {
    const response = await fetch('/api/youtube-live', {
      signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`The live check failed (${response.status}).`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return OFFLINE;
    }

    return parse(await response.json());
  },
};
