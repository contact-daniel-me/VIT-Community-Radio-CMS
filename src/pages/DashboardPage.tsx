import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { Banner, Empty, EpisodeStatusBadge, Loading, ScheduleStatusBadge } from '@/components/ui';
import { NextUpCard, OnAirCard } from '@/components/OnAirCard';
import { broadcastService } from '@/services/broadcastService';
import { scheduleService } from '@/services/scheduleService';
import { qcService } from '@/services/qcService';
import { episodeService } from '@/services/episodeService';
import { activityService, describeAction, describeSubject } from '@/services/activityService';
import { bookingService } from '@/services/bookingService';
import { slotStartsAt } from '@/utils/studio';
import { can } from '@/lib/permissions';
import { formatRelative, formatTime } from '@/utils/datetime';

export function DashboardPage() {
  const profile = useCurrentUser();

  const dashboard = useAsync(async () => {
    // Close any slot whose end time has passed before reading the state, so the
    // dashboard never claims something finished hours ago is still on air.
    await broadcastService.syncBroadcastState().catch(() => undefined);

    const [snapshot, today, pendingQc, recentEpisodes, activity, myBookings] = await Promise.all([
      broadcastService.getSnapshot(),
      scheduleService.getTodaySchedule(),
      qcService.getPendingQC(),
      episodeService.getEpisodes({
        limit: 6,
        ...(profile.role === 'RJ' ? { mineOnly: profile.id } : {}),
      }),
      can.viewFullActivity(profile.role)
        ? activityService.getRecentActivity(8)
        : Promise.resolve([]),
      bookingService.getMyBookings(profile.id).catch(() => []),
    ]);

    // Sessions that have happened but have no recording attached yet. This is
    // the single thing an RJ is most likely to have forgotten, so it gets said
    // on the dashboard rather than waiting to be found under Bookings.
    const awaitingUpload = myBookings.filter(
      (b) =>
        b.status !== 'CANCELLED' &&
        !b.episode_id &&
        slotStartsAt(b.booking_date, b.start_time.slice(0, 5)).getTime() <= Date.now(),
    );

    return { snapshot, today, pendingQc, recentEpisodes, activity, awaitingUpload };
  }, [profile.id, profile.role]);

  if (dashboard.loading) return <Loading />;
  if (dashboard.error) return <Banner>{dashboard.error}</Banner>;
  if (!dashboard.data) return null;

  const { snapshot, today, pendingQc, recentEpisodes, activity, awaitingUpload } =
    dashboard.data;

  return (
    <>
      <h1>Good day, {profile.full_name.split(' ')[0]}</h1>
      <p className="muted small" style={{ margin: '0.2rem 0 1rem' }}>
        All times are shown in station time (IST).
      </p>

      {awaitingUpload.length > 0 && (
        <section className="card upload-nudge">
          <div>
            <h2>
              {awaitingUpload.length === 1
                ? 'One session is waiting for its recording'
                : `${awaitingUpload.length} sessions are waiting for their recordings`}
            </h2>
            <p className="small muted">
              {awaitingUpload
                .slice(0, 3)
                .map((b) => `${b.show_name} (${b.reference})`)
                .join(', ')}
              {awaitingUpload.length > 3 ? ' and more' : ''}
            </p>
          </div>
          <Link to="/bookings" className="btn btn-solid">
            Upload audio
          </Link>
        </section>
      )}

      <div className="grid grid-2">
        <OnAirCard current={snapshot.current} />
        <NextUpCard next={snapshot.next} />
      </div>

      <div className="grid grid-main-side" style={{ marginTop: '1rem' }}>
        <section className="card">
          <div className="card-title">
            <h2>Today&rsquo;s schedule</h2>
            <Link className="small" to="/schedule">
              Open schedule
            </Link>
          </div>

          {today.length === 0 ? (
            <Empty>Nothing scheduled for today.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Program</th>
                    <th>Episode</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {today.map((slot) => (
                    <tr key={slot.id}>
                      <td>
                        {formatTime(slot.start_time)}
                        <span className="muted"> - {formatTime(slot.end_time)}</span>
                      </td>
                      <td>{slot.program_name}</td>
                      <td>{slot.episode_title ?? <span className="muted">Live show</span>}</td>
                      <td>
                        <ScheduleStatusBadge status={slot.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div>
          <section className="card">
            <div className="card-title">
              <h2>Pending QC</h2>
              <Link className="small" to="/qc">
                Review
              </Link>
            </div>
            {pendingQc.length === 0 ? (
              <Empty>The QC queue is empty.</Empty>
            ) : (
              <div className="stack">
                {pendingQc.slice(0, 5).map((episode) => (
                  <div key={episode.id} className="list-item">
                    <Link to={`/episodes/${episode.id}`}>{episode.title}</Link>
                    <p className="small muted" style={{ margin: 0 }}>
                      {episode.program?.name} &middot; submitted{' '}
                      {formatRelative(episode.submitted_at)}
                    </p>
                  </div>
                ))}
                {pendingQc.length > 5 && (
                  <p className="small muted">and {pendingQc.length - 5} more</p>
                )}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-title">
              <h2>{profile.role === 'RJ' ? 'My recent episodes' : 'Recent episodes'}</h2>
              <Link className="small" to="/episodes">
                All
              </Link>
            </div>
            {recentEpisodes.length === 0 ? (
              <Empty>No episodes yet.</Empty>
            ) : (
              <div className="stack">
                {recentEpisodes.map((episode) => (
                  <div key={episode.id} className="list-item row spread">
                    <Link to={`/episodes/${episode.id}`}>{episode.title}</Link>
                    <EpisodeStatusBadge status={episode.status} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {can.viewFullActivity(profile.role) && activity.length > 0 && (
        <section className="card" style={{ marginTop: '1rem' }}>
          <h2>Recent activity</h2>
          <div className="stack">
            {activity.map((entry) => (
              <div key={entry.id} className="list-item small">
                <strong>{entry.user?.full_name ?? 'System'}</strong>{' '}
                {describeAction(entry.action)}{' '}
                <span className="muted">{describeSubject(entry)}</span>
                <span className="muted"> &middot; {formatRelative(entry.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
