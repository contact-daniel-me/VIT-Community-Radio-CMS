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
    <div className={`spotify-episode-card${isCurrentTrack ? ' is-active' : ''}`}>
      <div className="spotify-episode-artwork">
        {episode.artwork_url ? (
          <img src={episode.artwork_url} alt="" loading="lazy" width="300" height="300" />
        ) : (
          <div className="spotify-episode-artwork-placeholder" />
        )}
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
              className="spotify-episode-link"
            >
              Open in Spotify
            </a>
          )}
          <a
            href={episode.audio_url}
            download
            className="spotify-episode-download"
          >
            Download
          </a>
        </div>
      </div>
    </div>
  );
}
