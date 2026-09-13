import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { useStationStatus } from '@/hooks/useStationStatus';
import { Banner, Loading, UnifiedStatusBadge } from '@/components/ui';
import { OnAirCard } from '@/components/OnAirCard';
import { qcService } from '@/services/qcService';
import { episodeService } from '@/services/episodeService';
import { activityService, describeAction, describeSubject } from '@/services/activityService';
import { bookingService } from '@/services/bookingService';
import { scheduleService } from '@/services/scheduleService';
import { dashboardMetricsService } from '@/services/dashboardMetricsService';
import { slotStartsAt } from '@/utils/studio';
import { can } from '@/lib/permissions';
import { formatRelative, formatTime, formatDate } from '@/utils/datetime';
import { MetricCard, CompactEmptyState, QuickAction, PipelineVisual } from '@/components/ui/DashboardCards';

export function DashboardPage() {
  const profile = useCurrentUser();
  const station = useStationStatus();

  const dashboard = useAsync(async () => {
    const today = new Date().toISOString().split('T')[0];
    const [
      pendingQc,
      recentEpisodes,
      activity,
      myBookings,
      metrics,
      expiringAudio,
      upcomingBookings,
      todaysSchedule
    ] = await Promise.all([
      qcService.getPendingQC(),
      episodeService.getEpisodes({
        limit: 5,
        ...(profile.role === 'RJ' ? { mineOnly: profile.id } : {}),
      }),
      can.viewFullActivity(profile.role) ? activityService.getRecentActivity(8) : Promise.resolve([]),
      bookingService.getMyBookings(profile.id).catch(() => []),
      dashboardMetricsService.getMetrics(),
      dashboardMetricsService.getExpiringRawAudio(),
      bookingService.getUpcomingBookings(5),
      scheduleService.getTodaySchedule(today)
    ]);

    const awaitingUpload = myBookings.filter(
      (b) => b.status !== 'CANCELLED' && !b.episode_id && slotStartsAt(b.booking_date, b.start_time.slice(0, 5)).getTime() <= Date.now()
    );

    return { pendingQc, recentEpisodes, activity, awaitingUpload, metrics, expiringAudio, upcomingBookings, todaysSchedule };
  }, [profile.id, profile.role]);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ status: 'success'|'error', message: string } | null>(null);

  if (dashboard.loading) return <Loading />;
  if (dashboard.error) return <Banner>{dashboard.error}</Banner>;
  if (!dashboard.data) return null;

  const { pendingQc, recentEpisodes, activity, awaitingUpload, metrics, expiringAudio, upcomingBookings, todaysSchedule } = dashboard.data;

  const handleClearAllActivity = async () => {
    if (!window.confirm('Are you sure you want to clear all recent activity?')) return;
    try {
      await activityService.clearAllActivity();
      dashboard.setData({ ...dashboard.data!, activity: [] });
    } catch (err) {
      console.error('Failed to clear all activity', err);
    }
  };

  const handleDeleteActivity = async (id: string) => {
    try {
      await activityService.deleteActivity(id);
      dashboard.setData({ ...dashboard.data!, activity: dashboard.data!.activity.filter(a => a.id !== id) });
    } catch (err) {
      console.error('Failed to delete activity', err);
    }
  };

  const handlePodcastSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-podcast-episodes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      });
      const json = await res.json() as { synced?: number; total_in_feed?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSyncResult({ status: 'success', message: `Synced successfully (${json.synced ?? 0} of ${json.total_in_feed ?? 0} updated)` });
    } catch (e) {
      setSyncResult({ status: 'error', message: `Sync failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div className="row spread align-center" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Good day, {profile.full_name.split(' ')[0]}</h1>
          <p className="muted small" style={{ margin: '0.2rem 0 0' }}>Station overview &middot; IST</p>
        </div>
      </div>

      <Banner>{station.error}</Banner>

      {awaitingUpload.length > 0 && (
        <section className="card upload-nudge" style={{ marginBottom: '1.5rem' }}>
          <div>
            <h2>{awaitingUpload.length === 1 ? 'One session is waiting for its recording' : `${awaitingUpload.length} sessions are waiting for their recordings`}</h2>
            <p className="small muted">
              {awaitingUpload.slice(0, 3).map((b) => `${b.program?.name ?? 'Studio session'} (${b.reference})`).join(', ')}
              {awaitingUpload.length > 3 ? ' and more' : ''}
            </p>
          </div>
          <Link to="/bookings" className="button primary">Upload audio</Link>
        </section>
      )}

      {/* 1. DASHBOARD OVERVIEW / STATISTICS */}
      <section className="row wrap spread" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
        <MetricCard title="Today's Slots" value={metrics.todays_slots} />
        <MetricCard title="Pending QC" value={metrics.pending_qc} />
        <MetricCard title="Final Upload" value={metrics.pipeline.final_upload} status="final" />
        <MetricCard title="QC Done" value={metrics.pipeline.qc_done} status="qc" />
      </section>

      {/* 2. STATUS PIPELINE */}
      <section style={{ marginBottom: '2rem' }}>
        <PipelineVisual metrics={metrics.pipeline} />
      </section>

      {/* MAIN GRID */}
      <div className="grid grid-2" style={{ gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* LEFT COLUMN */}
        <div className="stack" style={{ gap: '1.5rem' }}>
          
          {/* ON AIR & NEXT UP */}
          <section className="card stack fade-in" style={{ gap: '1rem', padding: '0' }}>
            <OnAirCard state={station.onAir} now={station.now} loading={station.loading} />
          </section>

          {/* TODAY'S SCHEDULE */}
          <section className="card fade-in">
            <h2 style={{ marginBottom: '1rem' }}>Today's Schedule</h2>
            {todaysSchedule.length === 0 ? (
              <CompactEmptyState message="Nothing scheduled today." actionText="Book a studio slot" actionLink="/bookings" />
            ) : (
              <div className="stack" style={{ gap: '0.75rem' }}>
                {todaysSchedule.slice(0, 5).map(slot => (
                  <div key={slot.id} className="row spread align-center list-item small">
                    <div>
                      <strong style={{ display: 'block' }}>{slot.program?.name ?? 'Live Broadcast'}</strong>
                      <span className="muted">{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</span>
                    </div>
                    {slot.episode && <UnifiedStatusBadge episode={slot.episode} />}
                  </div>
                ))}
                {todaysSchedule.length > 5 && (
                  <Link to="/schedule" className="button small secondary row justify-center" style={{ marginTop: '0.5rem' }}>View full schedule →</Link>
                )}
              </div>
            )}
          </section>

          {/* UPCOMING BOOKINGS */}
          <section className="card fade-in">
            <h2 style={{ marginBottom: '1rem' }}>Upcoming Bookings</h2>
            {upcomingBookings.length === 0 ? (
              <CompactEmptyState message="No upcoming bookings." />
            ) : (
              <div className="stack" style={{ gap: '0.75rem' }}>
                {upcomingBookings.map(b => (
                  <div key={b.id} className="row spread align-center list-item small">
                    <div>
                      <strong style={{ display: 'block' }}>{formatDate(b.booking_date)}</strong>
                      <span className="muted">{formatTime(b.booking_date + 'T' + b.start_time)} – {formatTime(b.booking_date + 'T' + b.end_time)}</span>
                      <div className="muted">{b.program?.name}</div>
                    </div>
                    <UnifiedStatusBadge booking={b} episode={b.episode} />
                  </div>
                ))}
                <Link to="/bookings" className="button small secondary row justify-center" style={{ marginTop: '0.5rem' }}>View all bookings →</Link>
              </div>
            )}
          </section>

        </div>

        {/* RIGHT COLUMN */}
        <div className="stack" style={{ gap: '1.5rem' }}>
          
          {/* PENDING QC */}
          <section className="card fade-in">
            <div className="row spread align-center" style={{ marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Pending QC</h2>
              {pendingQc.length > 0 && <span className="muted small">{pendingQc.length} items waiting</span>}
            </div>
            
            {pendingQc.length === 0 ? (
              <CompactEmptyState message="QC queue is clear" />
            ) : (
              <div className="stack" style={{ gap: '0.75rem' }}>
                {pendingQc.slice(0, 3).map(ep => (
                  <div key={ep.id} className="card list-item small bg-surface">
                    <div className="row spread align-center" style={{ marginBottom: '0.5rem' }}>
                      <strong>{ep.title}</strong>
                      <UnifiedStatusBadge episode={ep} />
                    </div>
                    <div className="row spread align-center">
                      <span className="muted">{formatDate(ep.created_at)}</span>
                      <Link to={`/admin/episodes/${ep.id}`} className="button small primary">Review QC</Link>
                    </div>
                  </div>
                ))}
                {pendingQc.length > 3 && (
                  <Link to="/admin/qc" className="button small secondary row justify-center" style={{ marginTop: '0.5rem' }}>View all pending →</Link>
                )}
              </div>
            )}
          </section>

          {/* RECENT EPISODES */}
          <section className="card fade-in">
            <h2 style={{ marginBottom: '1rem' }}>Recent Episodes</h2>
            {recentEpisodes.length === 0 ? (
              <CompactEmptyState message="No recent episodes." />
            ) : (
              <div className="stack" style={{ gap: '0.75rem' }}>
                {recentEpisodes.map(ep => (
                  <div key={ep.id} className="row spread align-center list-item small">
                    <div style={{ flex: 1, minWidth: 0, marginRight: '1rem' }}>
                      <Link to={`/admin/episodes/${ep.id}`} style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ep.title}
                      </Link>
                      <span className="muted">{formatDate(ep.created_at)} &middot; {ep.duration ? new Date(ep.duration * 1000).toISOString().substr(11, 8) : '--:--:--'}</span>
                    </div>
                    <UnifiedStatusBadge episode={ep} />
                  </div>
                ))}
                <Link to="/admin/episodes" className="button small secondary row justify-center" style={{ marginTop: '0.5rem' }}>View all episodes →</Link>
              </div>
            )}
          </section>

          {/* RAW AUDIO RETENTION (Only if available) */}
          {expiringAudio.length > 0 && (
            <section className="card fade-in" style={{ borderLeft: '4px solid var(--color-warning)' }}>
              <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--color-warning)' }}>⚠</span> RAW Audio Retention
              </h2>
              <div className="stack" style={{ gap: '0.5rem' }}>
                {expiringAudio.map(a => (
                  <div key={a.episode_id} className="row spread small list-item">
                    <span className="muted" style={{ fontWeight: 600 }}>{a.days_remaining} days remaining</span>
                    <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                  </div>
                ))}
                <Link to="/admin/episodes" className="button small secondary row justify-center" style={{ marginTop: '0.5rem' }}>View Audio Library →</Link>
              </div>
            </section>
          )}

          {/* PODCAST SYNC */}
          {(profile.role === 'ADMIN' || profile.role === 'PRODUCER') && (
            <section className="card row spread align-center fade-in">
              <div>
                <h2 style={{ margin: 0, marginBottom: '0.25rem' }}>Podcast Sync</h2>
                {syncResult ? (
                  <div className={`small ${syncResult.status === 'error' ? 'color-error' : 'color-success'}`}>
                    {syncResult.status === 'success' ? '✓ ' : '⚠ '} {syncResult.message}
                  </div>
                ) : (
                  <div className="muted small">Syncs approved episodes to Spotify</div>
                )}
              </div>
              <button type="button" onClick={handlePodcastSync} disabled={syncing} className="primary small">
                {syncing ? 'Syncing...' : 'Sync Episodes Now'}
              </button>
            </section>
          )}

        </div>
      </div>

      {/* QUICK ACTIONS */}
      <section className="card fade-in" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>Quick Actions</h2>
        <div className="row wrap" style={{ gap: '1rem' }}>
          <QuickAction to="/bookings" label="+ Book Studio" />
          <QuickAction to="/bookings" label="Upload Audio" />
          <QuickAction to="/admin/episodes" label="Final Upload" />
          {can.reviewQC(profile.role) && <QuickAction to="/admin/qc" label="Review QC" />}
          <QuickAction to="/admin/episodes" label="Episodes" />
          <QuickAction to="/schedule" label="Schedule" />
        </div>
      </section>

      {/* RECENT ACTIVITY */}
      {can.viewFullActivity(profile.role) && activity.length > 0 && (
        <section className="card fade-in" style={{ marginTop: '1rem' }}>
          <div className="row spread" style={{ marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>Recent activity</h2>
            <button type="button" className="small danger-action" onClick={handleClearAllActivity}>Clear All</button>
          </div>
          <div className="stack">
            {activity.map((entry) => (
              <div key={entry.id} className="list-item small row spread">
                <div>
                  <strong>{entry.user?.full_name ?? 'System'}</strong>{' '}
                  {describeAction(entry.action)}{' '}
                  <span className="muted">{describeSubject(entry)}</span>
                  <span className="muted"> &middot; {formatRelative(entry.created_at)}</span>
                </div>
                <button 
                  onClick={() => handleDeleteActivity(entry.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 }}
                  className="muted"
                  title="Delete activity"
                >Delete</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
