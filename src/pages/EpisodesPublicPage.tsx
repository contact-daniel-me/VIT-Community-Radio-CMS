import { useState, useMemo } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { podcastService } from '@/services/podcastService';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/CommunityCTA';
import { SpotifyEpisodeCard } from '@/components/site/SpotifyEpisodeCard';

export function EpisodesPublicPage() {
  const { data: episodes, loading, error } = useAsync(() => podcastService.getEpisodes(), []);
  
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const filteredEpisodes = useMemo(() => {
    if (!episodes) return [];
    
    let filtered = episodes.filter((ep) => {
      const q = search.toLowerCase();
      return ep.title.toLowerCase().includes(q) || ep.summary.toLowerCase().includes(q);
    });

    filtered = filtered.sort((a, b) => {
      const timeA = new Date(a.pubDate).getTime();
      const timeB = new Date(b.pubDate).getTime();
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

    return filtered;
  }, [episodes, search, sortOrder]);

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
            <p className="section-note">The complete archive of all our shows</p>
          </div>

          <div className="episodes-controls">
            <input
              type="text"
              placeholder="Search episodes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="episodes-search-input"
            />
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
              className="episodes-sort-select"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>

          {error && <p className="section-empty error">Failed to load episodes.</p>}
          {loading && <p className="section-empty">Loading episodes...</p>}
          
          {!loading && !error && filteredEpisodes.length === 0 && (
            <p className="section-empty">No episodes found matching your search.</p>
          )}

          <div className="spotify-episodes-grid">
            {filteredEpisodes.map((ep) => (
              <SpotifyEpisodeCard key={ep.id} episode={ep} />
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
