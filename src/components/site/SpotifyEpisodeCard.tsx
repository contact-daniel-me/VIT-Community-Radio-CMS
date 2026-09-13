import type { PodcastEpisodeRow } from '@/services/podcastService';
import { useGlobalAudio } from '@/hooks/GlobalAudioContext';

interface Props {
  episode: PodcastEpisodeRow;
}

function formatDuration(dur: string | null): string {
  if (!dur) return '';
  return dur;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function SpotifyEpisodeCard({ episode }: Props) {
  const { currentTrack, isPlaying, playTrack, pause } = useGlobalAudio();

  const isCurrentTrack = currentTrack?.storage_path === episode.audio_url;
  const isCurrentlyPlaying = isCurrentTrack && isPlaying;

  const handleToggle = () => {
    if (isCurrentlyPlaying) {
      pause();
    } else {
      playTrack({
        display_order: 0,
        episode_id: episode.id,
        title: episode.title,
        description: episode.description,
        host_name: null,
        duration_seconds: null,
        program_name: 'Podcast Episode',
        program_category: 'Podcast',
        storage_path: episode.audio_url,
        file_name: episode.title,
        audio_duration_seconds: null,
        created_at: episode.created_at,
      });
    }
  };

  return (
    <div className={`spotify-episode-card${isCurrentTrack ? ' is-active' : ''}`} style={ { '--animation-order': (episode as any).index || 0 } as React.CSSProperties }>
      <div className="spotify-episode-artwork">
        {episode.artwork_url ? (
          <img className="spotify-episode-artwork-img" src={episode.artwork_url} alt="" loading="lazy" width="300" height="300" />
        ) : (
          <div className="spotify-episode-artwork-placeholder" />
        )}
        <div className="spotify-episode-artwork-overlay" />
        <button
          className="spotify-episode-play-btn"
          onClick={handleToggle}
          aria-label={isCurrentlyPlaying ? `Pause ${episode.title}` : `Play ${episode.title}`}
        >
          {isCurrentlyPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>

      <div className="spotify-episode-content">
        <div className="spotify-episode-meta">
          {isCurrentlyPlaying && (
            <div className="eq-bars" aria-hidden="true" title="Playing">
              <div className="eq-bar"></div>
              <div className="eq-bar"></div>
              <div className="eq-bar"></div>
            </div>
          )}
          {episode.pub_date && (
            <time dateTime={episode.pub_date}>{formatDate(episode.pub_date)}</time>
          )}
          {episode.duration && (
            <>
              <span className="dot" aria-hidden="true">&middot;</span>
              <span>{formatDuration(episode.duration)}</span>
            </>
          )}
          {episode.episode_number && (
            <>
              <span className="dot" aria-hidden="true">&middot;</span>
              <span>Ep. {episode.episode_number}</span>
            </>
          )}
        </div>

        <h3 className="spotify-episode-title">{episode.title}</h3>

        {episode.description && (
          <p className="spotify-episode-summary">{episode.description}</p>
        )}

        <div className="spotify-episode-actions">
          {episode.spotify_url && (
            <a
              href={episode.spotify_url}
              target="_blank"
              rel="noopener noreferrer"
              className="spotify-episode-action-btn primary"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 5.522 4.477 10 10 10s10-4.478 10-10c0-5.523-4.477-10-10-10zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.305-1.76-8.786-.963-.335.077-.67-.133-.746-.467-.077-.334.132-.67.466-.746 3.824-.873 7.058-.485 9.716 1.134.294.18.386.564.207.858zm1.22-3.25c-.226.367-.7.482-1.066.255-2.695-1.654-6.8-2.146-9.965-1.175-.41.126-.837-.102-.962-.51-.127-.41.103-.838.513-.964 3.65-1.12 8.35-.572 11.453 1.328.367.227.482.7.255 1.066zm.134-3.393c-3.226-1.914-8.54-2.09-11.616-1.156-.493.15-1.008-.128-1.158-.622-.15-.494.128-1.008.622-1.158 3.52-1.068 9.403-.865 13.11 1.336.444.264.59.84.327 1.283-.264.444-.84.59-1.284.327z" />
              </svg>
              Spotify
            </a>
          )}
          <a
            href={episode.audio_url}
            download
            className="spotify-episode-action-btn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download
          </a>
        </div>
      </div>
    </div>
  );
}
