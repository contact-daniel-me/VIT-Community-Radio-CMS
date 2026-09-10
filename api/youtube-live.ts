import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  CHANNEL_ID,
  CHANNEL_URL,
  pickBroadcast,
  uploadsPlaylistId,
  type LiveStatus,
  type YouTubeVideo,
} from './_youtube';

/**
 * GET /api/youtube-live -- is the station broadcasting on YouTube right now?
 *
 * This exists so the API key never reaches a browser. The key is read from
 * process.env at request time and is deliberately NOT named VITE_*, which is
 * the whole safeguard: Vite only inlines VITE_ variables, so this one cannot
 * end up in the client bundle even by accident. The browser only ever sees the
 * small LiveStatus object below -- no key, no quota figures, no raw API body.
 *
 * The response is cached at the edge for a minute. Checking costs about two
 * quota units (see _youtube.ts), so a minute is affordable and means a stream
 * appears on the site within a minute of going live without hammering the API.
 *
 * Failures return 200 with state 'offline'. A page that says "we are not
 * broadcasting" is the right thing to show when the truth cannot be
 * established; an error banner would be about our plumbing, not their radio.
 */

const API = 'https://www.googleapis.com/youtube/v3';
const MAX_RECENT = 10;

/** Never let a slow upstream hold the request open. */
async function getJson(url: string, timeoutMs = 6000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`youtube responded ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function recentVideoIds(playlistId: string, key: string): Promise<string[]> {
  const url =
    `${API}/playlistItems?part=contentDetails&maxResults=${MAX_RECENT}` +
    `&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(key)}`;

  const body = (await getJson(url)) as {
    items?: { contentDetails?: { videoId?: string } }[];
  };

  return (body.items ?? [])
    .map((item) => item.contentDetails?.videoId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

async function describeVideos(ids: string[], key: string): Promise<YouTubeVideo[]> {
  if (ids.length === 0) return [];

  const url =
    `${API}/videos?part=snippet,liveStreamingDetails` +
    `&id=${encodeURIComponent(ids.join(','))}&key=${encodeURIComponent(key)}`;

  const body = (await getJson(url)) as { items?: YouTubeVideo[] };
  return body.items ?? [];
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const key = process.env.YOUTUBE_API_KEY?.trim();
  const channelId = process.env.YOUTUBE_CHANNEL_ID?.trim() || CHANNEL_ID;
  const offline: LiveStatus = { state: 'offline', channelUrl: CHANNEL_URL };

  // Unconfigured is not an error state for a visitor: the page simply shows
  // the channel link. The reason is logged for whoever deployed it.
  if (!key) {
    console.warn('YOUTUBE_API_KEY is not set; reporting the channel as offline.');
    response.setHeader('Cache-Control', 'public, s-maxage=60');
    response.status(200).json(offline);
    return;
  }

  try {
    const ids = await recentVideoIds(uploadsPlaylistId(channelId), key);
    const videos = await describeVideos(ids, key);
    const status = pickBroadcast(videos, CHANNEL_URL);

    // A minute at the edge, and up to ten more serving the last known answer
    // while a fresh one is fetched, so a quota blip never becomes a slow page.
    response.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    response.status(200).json(status);
  } catch (cause) {
    console.error('youtube-live lookup failed:', cause);
    // Shorter cache: this is a transient failure and should be retried sooner
    // than a genuine offline answer.
    response.setHeader('Cache-Control', 'public, s-maxage=30');
    response.status(200).json(offline);
  }
}
