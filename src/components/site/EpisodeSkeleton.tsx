/**
 * EpisodeSkeleton — animated placeholder shown while episode data loads.
 * Matches the dimensions of SpotifyEpisodeCard so the layout does not shift.
 */
export function EpisodeSkeleton() {
  return (
    <div className="spotify-episode-card episode-skeleton" aria-hidden="true">
      <div className="spotify-episode-artwork episode-skeleton-artwork" />
      <div className="spotify-episode-content">
        <div className="episode-skeleton-line episode-skeleton-meta" />
        <div className="episode-skeleton-line episode-skeleton-title" />
        <div className="episode-skeleton-line episode-skeleton-title episode-skeleton-title-short" />
        <div className="episode-skeleton-line episode-skeleton-body" />
        <div className="episode-skeleton-line episode-skeleton-body" />
        <div className="episode-skeleton-line episode-skeleton-body episode-skeleton-body-short" />
        <div className="episode-skeleton-actions">
          <div className="episode-skeleton-line episode-skeleton-btn" />
          <div className="episode-skeleton-line episode-skeleton-btn" />
        </div>
      </div>
    </div>
  );
}

/** Renders `count` skeleton cards in the grid. */
export function EpisodeSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <EpisodeSkeleton key={i} />
      ))}
    </>
  );
}
