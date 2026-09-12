import { useAsync } from '@/hooks/useAsync';
import { useHashScroll } from '@/hooks/useHashScroll';
import { publicService } from '@/services/publicService';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Hero } from '@/components/site/Hero';
import { EpisodeCard } from '@/components/site/Cards';
import { SpotifyShow } from '@/components/site/SpotifyShow';
import { CommunityCTA, SiteFooter } from '@/components/site/CommunityCTA';
import { RadioPlayer } from '@/components/site/RadioPlayer';

/**
 * The public front page.
 *
 * Data comes from the four anonymous-safe views and nothing else, so this page
 * works signed out. Each section degrades on its own: if the archive is empty
 * the section says so rather than the page failing.
 */
export function HomePage() {
  const station = useAsync(async () => {
    const [nowPlaying, schedule, episodes, chart, programmes] = await Promise.all([
      publicService.getNowPlaying(),
      publicService.getTodaySchedule(),
      publicService.getRecentEpisodes(5).catch(() => []),
      // The chart and the roster are what the Schedule and About sections stand
      // on, and neither should take the page down if a view is unavailable.
      publicService.getFixedPointChart().catch(() => []),
      publicService.getShows(50).catch(() => []),
    ]);
    return { nowPlaying, schedule, episodes, chart, programmes };
  }, []);

  // The header tabs are links to /#schedule, /#episodes and /#about.
  useHashScroll(!station.loading);

  const now = station.data?.nowPlaying ?? null;

  return (
    <div className="site">
      <SiteHeader />

      <main id="main">
        <Hero now={now} />

        <section className="section" id="episodes">
          <div className="section-head">
            <div>
              <p className="eyebrow">From the archive</p>
              <h2 className="section-title">Recently on air</h2>
            </div>
            <p className="section-note">Only episodes that have already been broadcast</p>
          </div>

          {(station.data?.episodes ?? []).length === 0 ? (
            <p className="section-empty">
              {station.loading ? (
                'Loading episodes…'
              ) : (
                <>
                  Nothing has aired yet &mdash; the archive fills up as shows go out. Until then,{' '}
                  <a href="#schedule">the weekly chart</a> shows what is on and when.
                </>
              )}
            </p>
          ) : (
            <div className="episode-list">
              {(station.data?.episodes ?? []).map((episode) => (
                <EpisodeCard key={episode.id} episode={episode} />
              ))}
            </div>
          )}

          <div className="section-subhead">
            <div>
              <p className="eyebrow">On demand</p>
              <h3 className="section-subtitle">The official show on Spotify</h3>
            </div>
            <p className="section-note">Full episodes, listen any time</p>
          </div>

          <SpotifyShow />
        </section>


        <CommunityCTA />
      </main>

      <SiteFooter />
      <RadioPlayer now={now} />
    </div>
  );
}
