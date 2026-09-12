import type { PodcastEpisode } from '@/services/podcastService';
import { useGlobalAudio } from '@/hooks/GlobalAudioContext';

interface Props {
  episode: PodcastEpisode;
}

export function SpotifyEpisodeCard({ episode }: Props) {
  const { currentTrack, isPlaying, playTrack, pause } = useGlobalAudio();

  const isCurrentTrack = currentTrack?.storage_path === episode.audioUrl;
  const isCurrentlyPlaying = isCurrentTrack && isPlaying;

  const handleToggle = () => {
    if (isCurrentlyPlaying) {
      pause();
    } else {
      playTrack({
        display_order: 0,
        episode_id: episode.id,
        title: episode.title,
        description: episode.summary,
        host_name: '',
        duration_seconds: 0,
        program_name: 'Podcast Episode',
        program_category: 'Podcast',
        storage_path: episode.audioUrl,
        file_name: episode.title,
        audio_duration_seconds: 0,
        created_at: new Date().toISOString(),
      });
    }
  };

  return (
    <div className="spotify-episode-card">
      <div className="spotify-episode-artwork">
        {episode.artworkUrl ? (
          <img src={episode.artworkUrl} alt="" loading="lazy" />
        ) : (
          <div className="spotify-episode-artwork-placeholder" />
        )}
        <button
          className="spotify-episode-play-btn"
          onClick={handleToggle}
          aria-label={isCurrentlyPlaying ? `Pause ${episode.title}` : `Play ${episode.title}`}
        >
          {isCurrentlyPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>

      <div className="spotify-episode-content">
        <div className="spotify-episode-meta">
          <time dateTime={new Date(episode.pubDate).toISOString()}>
            {new Date(episode.pubDate).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </time>
          {episode.duration && (
            <>
              <span className="dot">&middot;</span>
              <span>{episode.duration}</span>
            </>
          )}
        </div>
        <h3 className="spotify-episode-title">{episode.title}</h3>
        <p className="spotify-episode-summary">{episode.summary}</p>
        
        <div className="spotify-episode-actions">
          <a
            href={episode.spotifyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="spotify-episode-link"
          >
            Open in Spotify
          </a>
          <a
            href={episode.audioUrl}
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
