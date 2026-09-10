import { useTheme } from '@/hooks/useTheme';

/**
 * The station's own Spotify show, embedded.
 *
 * Spotify's official iframe embed and nothing else: no SDK, no API key, no
 * OAuth. The embed is public, so it needs no credentials and none are added --
 * a listener signed in to Spotify gets full episodes, everyone else gets
 * previews, and that is Spotify's behaviour rather than anything decided here.
 *
 * The `si` share token from the copied link is deliberately dropped. It
 * identifies whoever generated the link rather than the show, and it has no
 * business being baked into a public page.
 *
 * The player follows the site theme, which means swapping the src, which
 * remounts the iframe. That resets playback -- unavoidable, since the theme
 * lives inside a cross-origin frame -- so it happens only when someone
 * deliberately toggles the theme, and `key` makes the swap a clean replace
 * rather than a mutated frame.
 */
const SHOW_ID = '6uOOkDQiomTEE0Re9TqQaA';
const SHOW_URL = `https://open.spotify.com/show/${SHOW_ID}`;

export function SpotifyShow() {
  const { theme } = useTheme();
  // theme=0 is Spotify's dark player; omitting it gives the light one.
  const src = `https://open.spotify.com/embed/show/${SHOW_ID}?utm_source=generator${
    theme === 'dark' ? '&theme=0' : ''
  }`;

  return (
    <div className="spotify">
      {/* The title is read aloud in place of the frame's contents, so it says
          whose show this is. Entities are not decoded inside a JSX attribute,
          so it stays plain text. */}
      <div className="spotify-frame">
        <iframe
          key={theme}
          src={src}
          title="VIT Community Radio: the official show on Spotify"
          width="100%"
          height="352"
          style={{ border: 0 }}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>

      <p className="spotify-note">
        Trouble loading the player?{' '}
        <a href={SHOW_URL} target="_blank" rel="noopener noreferrer">
          Open VIT Community Radio on Spotify
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
        .
      </p>
    </div>
  );
}
