/**
 * Working out what, if anything, the station is broadcasting on YouTube.
 *
 * Kept separate from the route handler so it can be tested without a network
 * or an API key. The leading underscore keeps Vercel from treating this file
 * as an endpoint of its own.
 *
 * Why not search.list, which is the usual answer to "is this channel live":
 * it costs 100 quota units a call against a 10,000/day default, which is about
 * one check every fifteen minutes before the key runs dry. A live stream is
 * also an upload, so reading the channel's uploads playlist and then asking
 * videos.list about those ids costs 1 unit each -- two units a check, which a
 * sixty-second cache can comfortably afford.
 */

/** What the browser is allowed to know. No key, no quota detail, no raw API. */
export type LiveStatus =
  | {
      state: 'live';
      videoId: string;
      title: string;
      channelUrl: string;
    }
  | {
      state: 'upcoming';
      videoId: string;
      title: string;
      /** ISO 8601, straight from YouTube. */
      scheduledStartTime: string | null;
      channelUrl: string;
    }
  | {
      state: 'offline';
      channelUrl: string;
    };

/** The handful of fields this code reads back from videos.list. */
export interface YouTubeVideo {
  id: string;
  snippet?: {
    title?: string;
    liveBroadcastContent?: string;
  };
  liveStreamingDetails?: {
    scheduledStartTime?: string;
    actualStartTime?: string;
    actualEndTime?: string;
  };
}

export const CHANNEL_ID = 'UCnAwfsKlMCMpPg3xaAX5ZfQ';
export const CHANNEL_URL = 'https://www.youtube.com/@vitradiolive';

/**
 * A channel's uploads playlist id is its channel id with the second character
 * changed from C to U. This is a long-standing YouTube convention and saves a
 * channels.list call on every request.
 */
export function uploadsPlaylistId(channelId: string): string {
  if (!/^UC[A-Za-z0-9_-]{10,}$/.test(channelId)) {
    throw new Error(`not a channel id: ${channelId}`);
  }
  return `UU${channelId.slice(2)}`;
}

/**
 * Choose what to show.
 *
 * A stream that has ended still reports liveBroadcastContent 'none' but keeps
 * its liveStreamingDetails, so actualEndTime is the thing that distinguishes
 * "on air now" from "was on air this morning" -- without that check a finished
 * broadcast would sit on the page all day claiming to be live.
 *
 * When several are live, the one that started earliest wins: that is the day's
 * broadcast rather than a test stream opened alongside it.
 */
export function pickBroadcast(
  videos: YouTubeVideo[],
  channelUrl: string = CHANNEL_URL,
): LiveStatus {
  const live = videos
    .filter(
      (v) =>
        v.snippet?.liveBroadcastContent === 'live' && !v.liveStreamingDetails?.actualEndTime,
    )
    .sort((a, b) =>
      (a.liveStreamingDetails?.actualStartTime ?? '').localeCompare(
        b.liveStreamingDetails?.actualStartTime ?? '',
      ),
    );

  if (live.length > 0) {
    const chosen = live[0];
    return {
      state: 'live',
      videoId: chosen.id,
      title: chosen.snippet?.title?.trim() || 'VIT Community Radio Live',
      channelUrl,
    };
  }

  // Nothing on air. The soonest scheduled stream is worth showing, but only if
  // it has a start time in the future -- an "upcoming" video whose slot has
  // passed was never started and would read as a broken promise.
  const now = Date.now();
  const upcoming = videos
    .filter((v) => v.snippet?.liveBroadcastContent === 'upcoming')
    .filter((v) => {
      const at = v.liveStreamingDetails?.scheduledStartTime;
      return at ? Date.parse(at) > now : false;
    })
    .sort((a, b) =>
      (a.liveStreamingDetails?.scheduledStartTime ?? '').localeCompare(
        b.liveStreamingDetails?.scheduledStartTime ?? '',
      ),
    );

  if (upcoming.length > 0) {
    const next = upcoming[0];
    return {
      state: 'upcoming',
      videoId: next.id,
      title: next.snippet?.title?.trim() || 'VIT Community Radio Live',
      scheduledStartTime: next.liveStreamingDetails?.scheduledStartTime ?? null,
      channelUrl,
    };
  }

  return { state: 'offline', channelUrl };
}
