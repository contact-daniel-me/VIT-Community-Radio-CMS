import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { publicService } from '@/services/publicService';
import { scheduleService } from '@/services/scheduleService';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/CommunityCTA';
import { ScheduleTimeline } from '@/components/site/ScheduleTimeline';
import { FixedPointChart } from '@/components/site/FixedPointChart';
import { Banner } from '@/components/ui';
import { can } from '@/lib/permissions';
import { errorMessage } from '@/lib/errors';

export function SchedulePublicPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'ADMIN';
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const station = useAsync(async () => {
    const [nowPlaying, schedule, chart, programmes] = await Promise.all([
      publicService.getNowPlaying(),
      publicService.getTodaySchedule(),
      publicService.getFixedPointChart().catch(() => []),
      publicService.getShows(50).catch(() => []),
    ]);
    return { nowPlaying, schedule, chart, programmes };
  }, []);

  const handleDelete = async (id: string) => {
    setError(null);
    setNotice(null);
    try {
      await scheduleService.deleteSchedule(id);
      setNotice('Slot deleted from schedule.');
      await station.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <div className="site">
      <SiteHeader />

      <main id="main">
        <section className="section" id="schedule">
          <div className="section-head">
            <div>
              <p className="eyebrow">Today on 90.8</p>
              <h2 className="section-title">The day&rsquo;s line-up</h2>
            </div>
            <div className="row" style={{ gap: '1rem', alignItems: 'center' }}>
              <p className="section-note">All times in station time (IST)</p>
              {profile && can.schedule(profile.role) && (
                <Link to="/schedule/edit" className="button small primary" style={{ textDecoration: 'none' }}>
                  Manage Schedule &rarr;
                </Link>
              )}
            </div>
          </div>

          {error && <Banner>{error}</Banner>}
          {notice && <Banner kind="success">{notice}</Banner>}

          {station.loading ? (
            <p className="section-empty">Loading the schedule&hellip;</p>
          ) : station.error ? (
            <p className="section-empty">The schedule is unavailable right now.</p>
          ) : (
            <ScheduleTimeline
              slots={station.data?.schedule ?? []}
              isAdmin={isAdmin}
              onDelete={handleDelete}
            />
          )}

          <div className="section-subhead" style={{ marginTop: '4rem' }}>
            <div>
              <p className="eyebrow">Weekly Schedule</p>
              <h3 className="section-subtitle">The Fixed Point Chart</h3>
            </div>
            <p className="section-note">
              Monday to Friday &middot; 9:00 AM to 6:00 PM
            </p>
          </div>

          {station.loading ? (
            <p className="section-empty">Loading the weekly chart&hellip;</p>
          ) : (
            <FixedPointChart slots={station.data?.chart ?? []} />
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
