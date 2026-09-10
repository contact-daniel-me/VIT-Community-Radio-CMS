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
