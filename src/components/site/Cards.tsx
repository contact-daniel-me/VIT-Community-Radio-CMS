import type { PublicEpisodeRow } from '@/types/database';
import { formatDate, formatDuration } from '@/utils/datetime';

export function EpisodeCard({
  episode,
  onPlay,
}: {
  episode: PublicEpisodeRow;
  onPlay?: (episode: PublicEpisodeRow) => void;
}) {
  return (
    <article className="episode-row">
      <button
        type="button"
        className="episode-play"
        onClick={() => onPlay?.(episode)}
        aria-label={`Play ${episode.title}`}
        disabled={!onPlay}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M8 5.2v13.6a.6.6 0 0 0 .92.51l10.5-6.8a.6.6 0 0 0 0-1.02L8.92 4.69A.6.6 0 0 0 8 5.2Z" />
        </svg>
      </button>

      <div className="episode-body">
        <h3 className="episode-title">{episode.title}</h3>
        <p className="episode-meta">
          {episode.program_name}
          {episode.host_name ? ` · ${episode.host_name}` : ''}
        </p>
      </div>

      <div className="episode-side">
        <span className="episode-date">{formatDate(episode.aired_at)}</span>
        <span className="episode-duration">{formatDuration(episode.duration_seconds)}</span>
      </div>
    </article>
  );
}
