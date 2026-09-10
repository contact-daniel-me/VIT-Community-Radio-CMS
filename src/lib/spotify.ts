/**
 * The station's Spotify show, in one place.
 *
 * Shared by the Episodes section and the player bar so there is one show id
 * rather than two that can drift apart.
 *
 * The `si` token from a copied share link is deliberately absent: it
 * identifies whoever copied the link, not the show.
 */
export const SPOTIFY_SHOW_ID = '6uOOkDQiomTEE0Re9TqQaA';
export const SPOTIFY_SHOW_URL = `https://open.spotify.com/show/${SPOTIFY_SHOW_ID}`;

/**
 * Spotify's official embed URL.
 *
 * `theme=0` is their dark player; omitting it gives the light one, which takes
 * its colour from the show artwork rather than going white. There is no way to
 * restyle it from outside -- it is a cross-origin frame.
 */
export function spotifyEmbedSrc(theme: 'light' | 'dark'): string {
  return `https://open.spotify.com/embed/show/${SPOTIFY_SHOW_ID}?utm_source=generator${
    theme === 'dark' ? '&theme=0' : ''
  }`;
}

export interface SpotifyShowMeta {
  /** The episode the embed will play -- Spotify's own words, never invented. */
  title: string;
  artworkUrl: string | null;
}

/**
 * Public show metadata, for the artwork and title in the player.
 *
 * Spotify's oEmbed endpoint needs no key and sends
 * `access-control-allow-origin: *`, so the browser may call it directly. It
 * describes whichever episode the embed would play, which is exactly what the
 * bar should name.
 *
 * Only these two fields are taken. If the call fails the player falls back to
 * the station's own mark and name rather than inventing anything.
 */
export async function fetchShowMeta(signal?: AbortSignal): Promise<SpotifyShowMeta> {
  const response = await fetch(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(SPOTIFY_SHOW_URL)}`,
    { signal },
  );
  if (!response.ok) throw new Error(`Spotify returned ${response.status}`);

  const body: unknown = await response.json();
  const record = (body ?? {}) as Record<string, unknown>;
  return {
    title: typeof record.title === 'string' ? record.title : 'VIT Community Radio',
    artworkUrl: typeof record.thumbnail_url === 'string' ? record.thumbnail_url : null,
  };
}
