import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { publicService } from '@/services/publicService';
import { SiteHeader } from '@/components/site/SiteHeader';
import { Hero } from '@/components/site/Hero';
import { ScheduleTimeline } from '@/components/site/ScheduleTimeline';
import { EpisodeCard } from '@/components/site/Cards';
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
  const [playRequestedAt, setPlayRequestedAt] = useState(0);

  const station = useAsync(async () => {
    const [nowPlaying, schedule, episodes] = await Promise.all([
      publicService.getNowPlaying(),
      publicService.getTodaySchedule(),
      publicService.getRecentEpisodes(5).catch(() => []),
    ]);
    return { nowPlaying, schedule, episodes };
  }, []);

  const now = station.data?.nowPlaying ?? null;
  const live = now?.broadcast_status === 'ON_AIR';

  return (
    <div className="site">
      <SiteHeader />

      <main id="main">
        <Hero
          now={now}
          canListen={live}
          onListen={() => setPlayRequestedAt(Date.now())}
        />

        <section className="section" id="schedule">
          <div className="section-head">
            <div>
              <p className="eyebrow">Today on 90.8</p>
              <h2 className="section-title">The day&rsquo;s line-up</h2>
            </div>
            <p className="section-note">All times in station time (IST)</p>
          </div>

          {station.loading ? (
            <p className="section-empty">Loading the schedule&hellip;</p>
          ) : station.error ? (
            <p className="section-empty">The schedule is unavailable right now.</p>
          ) : (
            <ScheduleTimeline slots={station.data?.schedule ?? []} />
          )}
        </section>

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
              {station.loading
                ? 'Loading episodes…'
                : 'Nothing has aired yet. The archive fills up as shows go out.'}
            </p>
          ) : (
            <div className="episode-list">
              {(station.data?.episodes ?? []).map((episode) => (
                <EpisodeCard key={episode.id} episode={episode} />
              ))}
            </div>
          )}
        </section>

        <CommunityCTA />
      </main>

      <SiteFooter />
      <RadioPlayer now={now} playRequestedAt={playRequestedAt} />
    </div>
  );
}
