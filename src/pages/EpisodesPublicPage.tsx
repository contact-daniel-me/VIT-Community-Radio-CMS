import { useState, useEffect, useRef, useCallback } from 'react';
import { podcastService, PAGE_SIZE } from '@/services/podcastService';
import type { PodcastEpisodeRow } from '@/services/podcastService';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/CommunityCTA';
import { SpotifyEpisodeCard } from '@/components/site/SpotifyEpisodeCard';
import { EpisodeSkeletonGrid } from '@/components/site/EpisodeSkeleton';

const DEBOUNCE_MS = 300;

export function EpisodesPublicPage() {
  const [episodes, setEpisodes] = useState<PodcastEpisodeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce search input.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, DEBOUNCE_MS);
  };

  // Reset and reload when search/sort/dates change.
  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPage(0);
    try {
      const result = await podcastService.getEpisodes({
        search: debouncedSearch,
        sort: sortOrder,
        page: 0,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setEpisodes(result.episodes);
      setTotal(result.total);
      setHasMore(result.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load episodes.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, sortOrder, fromDate, toDate]);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  // Load the next page without replacing existing episodes.
  const loadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const result = await podcastService.getEpisodes({
        search: debouncedSearch,
        sort: sortOrder,
        page: nextPage,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setEpisodes((prev) => {
        // Deduplicate by id in case of race conditions.
        const seen = new Set(prev.map((e) => e.id));
        const fresh = result.episodes.filter((e) => !seen.has(e.id));
        return [...prev, ...fresh];
      });
      setTotal(result.total);
      setHasMore(result.hasMore);
      setPage(nextPage);
    } catch {
      // Non-blocking — existing episodes stay visible.
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="site">
      <SiteHeader />

      <main id="main">
        <section className="section">
          <div className="section-head">
            <div>
              <p className="eyebrow">On demand</p>
              <h1 className="section-title">Episodes Library</h1>
            </div>
            <p className="section-note">
              {loading ? 'Loading…' : `${total.toLocaleString()} episodes`}
            </p>
          </div>

          <div className="episodes-controls-wrapper">
            <div className="episodes-controls">
              <input
                type="search"
                placeholder="Search episodes..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="episodes-search-input"
                aria-label="Search episodes"
              />
              <div className="episodes-date-filters">
                <label className="episodes-date-label">
                  <span className="sr-only">From Date</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    aria-label="From Date"
                    className="episodes-date-input"
                  />
                </label>
                <span className="episodes-date-separator">to</span>
                <label className="episodes-date-label">
                  <span className="sr-only">To Date</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    aria-label="To Date"
                    className="episodes-date-input"
                  />
                </label>
              </div>
              <select
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(e.target.value as 'newest' | 'oldest');
                }}
                className="episodes-sort-select"
                aria-label="Sort order"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
              {(search || fromDate || toDate) && (
                <button
                  type="button"
                  className="btn btn-ghost episodes-clear-btn"
                  onClick={() => {
                    setSearch('');
                    setDebouncedSearch('');
                    setFromDate('');
                    setToDate('');
                    setSortOrder('newest');
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {error && (
            <p className="section-empty episodes-error">
              {error} &mdash; Please try again later.
            </p>
          )}

          <div className="spotify-episodes-grid">
            {loading ? (
              <EpisodeSkeletonGrid count={PAGE_SIZE} />
            ) : episodes.length === 0 ? (
              <p className="section-empty episodes-empty" style={{ gridColumn: '1/-1' }}>
                {debouncedSearch
                  ? `No episodes found for "${debouncedSearch}".`
                  : 'No episodes available yet. Check back soon!'}
              </p>
            ) : (
              episodes.map((ep) => (
                <SpotifyEpisodeCard key={ep.id} episode={ep} />
              ))
            )}

            {/* Skeleton cards at the end while loading more */}
            {loadingMore && <EpisodeSkeletonGrid count={PAGE_SIZE} />}
          </div>

          {hasMore && !loading && (
            <div className="episodes-load-more">
              <button
                className="btn btn-ghost episodes-load-more-btn"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more episodes'}
              </button>
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
