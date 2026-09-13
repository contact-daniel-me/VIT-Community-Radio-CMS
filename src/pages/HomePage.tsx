import { useAsync } from '@/hooks/useAsync';
import { useHashScroll } from '@/hooks/useHashScroll';
import { publicService } from '@/services/publicService';
import { announcementService } from '@/services/announcementService';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Hero } from '@/components/site/Hero';
import { StationAnnouncements } from '@/components/site/StationAnnouncements';

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
    const [nowPlaying, schedule, chart, programmes, announcements] = await Promise.all([
      publicService.getNowPlaying(),
      publicService.getTodaySchedule(),
      // The chart and the roster are what the Schedule and About sections stand
      // on, and neither should take the page down if a view is unavailable.
      publicService.getFixedPointChart().catch(() => []),
      publicService.getShows(50).catch(() => []),
      announcementService.getActiveAnnouncements().catch(() => []),
    ]);
    return { nowPlaying, schedule, chart, programmes, announcements };
  }, []);

  // The header tabs are links to /#schedule, /#episodes and /#about.
  useHashScroll(!station.loading);

  const now = station.data?.nowPlaying ?? null;

  return (
    <div className="site">
      <SiteHeader />

      <main id="main">
        <Hero now={now} />

        {station.data?.announcements && station.data.announcements.length > 0 && (
          <StationAnnouncements announcements={station.data.announcements} />
        )}

        <section className="section" id="episodes">
          <div className="section-head">
            <div>
              <p className="eyebrow">On demand</p>
              <h2 className="section-title">The official show on Spotify</h2>
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
