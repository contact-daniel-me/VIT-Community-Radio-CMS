import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { useStationStatus } from '@/hooks/useStationStatus';
import { Banner, Loading, UnifiedStatusBadge } from '@/components/ui';
import { OnAirCard } from '@/components/OnAirCard';
import { qcService } from '@/services/qcService';
import { episodeService } from '@/services/episodeService';
import { activityService } from '@/services/activityService';
import { bookingService } from '@/services/bookingService';
import { scheduleService } from '@/services/scheduleService';
import { dashboardMetricsService } from '@/services/dashboardMetricsService';
import { slotStartsAt } from '@/utils/studio';
import { can } from '@/lib/permissions';
import { formatTime, formatDate } from '@/utils/datetime';
import { MetricCard, CompactEmptyState, QuickAction, PipelineVisual } from '@/components/ui/DashboardCards';
import { supabase } from '@/lib/supabase';

const CalendarIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>);
const ClockIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>);
const CloudUploadIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>);
const CheckCircleIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>);
const PodcastIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>);
const FolderIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>);
const MusicIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>);

export function DashboardPage() {
  const profile = useCurrentUser();
  const station = useStationStatus();

  const dashboard = useAsync(async () => {
    const today = new Date().toISOString().split('T')[0];
    const [
      pendingQc,
      recentEpisodes,
      _activity,
      myBookings,
      metrics,
      expiringAudio,
      upcomingBookings,
      todaysSchedule,
      totalEpisodesResult
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
      scheduleService.getTodaySchedule(today),
      supabase.from('episodes').select('*', { count: 'exact', head: true })
    ]);

    const awaitingUpload = myBookings.filter(
      (b) => b.status !== 'CANCELLED' && !b.episode_id && slotStartsAt(b.booking_date, b.start_time.slice(0, 5)).getTime() <= Date.now()
    );

    return { 
      pendingQc, 
      recentEpisodes, 
      awaitingUpload, 
      metrics, 
      expiringAudio, 
      upcomingBookings, 
      todaysSchedule,
      totalEpisodes: totalEpisodesResult.count || 0
    };
  }, [profile.id, profile.role]);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ status: 'success'|'error', message: string } | null>(null);

  if (dashboard.loading) return <Loading />;
  if (dashboard.error) return <Banner>{dashboard.error}</Banner>;
  if (!dashboard.data) return null;

  const { pendingQc, recentEpisodes, awaitingUpload, metrics, expiringAudio, upcomingBookings, todaysSchedule, totalEpisodes } = dashboard.data;


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
      setSyncResult({ status: 'success', message: `Last synced successfully\n${formatDate(new Date().toISOString())} - ${formatTime(new Date().toISOString())}` });
    } catch (e) {
      setSyncResult({ status: 'error', message: `Sync failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSyncing(false);
    }
  };

  const todayStr = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <div className="row spread align-center wrap" style={{ gap: '1.5rem', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '2rem', fontWeight: 800 }}>Good day, {profile.full_name.split(' ')[0]}</h1>
          <p className="muted" style={{ margin: 0, fontSize: '1.05rem' }}>Here's what's happening at VIT Community Radio today.</p>
        </div>
        <div className="row align-center wrap" style={{ gap: '2rem' }}>
          <div className="row align-center" style={{ gap: '0.75rem', color: 'var(--ink-muted)' }}>
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--ink)' }}>{todayStr}</div>
              <div className="small">{formatTime(new Date().toISOString())} (IST)</div>
            </div>
          </div>
          <div style={{ fontStyle: 'italic', color: 'var(--ink-muted)', fontSize: '1.05rem', borderLeft: '2px solid var(--line)', paddingLeft: '1.5rem', textAlign: 'left' }}>
            "Radio connects hearts"<br/>
            <span style={{ fontSize: '0.85rem' }}>– VIT Community Radio</span>
          </div>
        </div>
      </div>

      <Banner>{station.error}</Banner>

      {awaitingUpload.length > 0 && (
        <section className="card upload-nudge metric-pink" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, marginBottom: '0.25rem' }}>{awaitingUpload.length === 1 ? 'One session is waiting for its recording' : `${awaitingUpload.length} sessions are waiting for their recordings`}</h2>
            <p className="small" style={{ opacity: 0.9, margin: 0 }}>
              {awaitingUpload.slice(0, 3).map((b) => `${b.program?.name ?? 'Studio session'} (${b.reference})`).join(', ')}
              {awaitingUpload.length > 3 ? ' and more' : ''}
            </p>
          </div>
          <Link to="/bookings" className="button primary">Upload audio</Link>
        </section>
      )}

      {/* 1. METRICS ROW */}
      <section className="row wrap spread" style={{ gap: '1rem', marginBottom: '2rem' }}>
        <MetricCard title="Today's Slots" value={metrics.todays_slots} status="booked" icon={<CalendarIcon />} />
        <MetricCard title="Pending QC" value={metrics.pending_qc} status="approved" icon={<ClockIcon />} />
        <MetricCard title="Final Upload" value={metrics.pipeline.final_upload} status="final" icon={<CloudUploadIcon />} />
        <MetricCard title="QC Done" value={metrics.pipeline.qc_done} status="qc" icon={<CheckCircleIcon />} />
        <MetricCard title="Total Episodes" value={totalEpisodes} status="total" icon={<PodcastIcon />} />
      </section>

      {/* 2. MIDDLE GRID (On Air | Pipeline | Podcast Sync) */}
      <div className="grid grid-dashboard-3" style={{ gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* LEFT: ON AIR — stretches to its own content height */}
        <section className="card stack fade-in" style={{ gap: '1rem', padding: '0', overflow: 'hidden', alignSelf: 'stretch' }}>
          <div style={{ padding: '1rem 1rem 0' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>On Air / Next Up</h3>
          </div>
          <OnAirCard state={station.onAir} now={station.now} loading={station.loading} />
        </section>

        {/* CENTER: PIPELINE — sizes to content only */}
        <section style={{ display: 'flex', flexDirection: 'column', alignSelf: 'start' }}>
          <PipelineVisual metrics={metrics.pipeline} />
        </section>

        {/* RIGHT: PODCAST SYNC — stretches to its own content height */}
        {(profile.role === 'ADMIN' || profile.role === 'PRODUCER') && (
          <section className="card fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignSelf: 'stretch' }}>
            <div className="row spread align-center">
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Podcast Sync</h3>
              <button type="button" onClick={handlePodcastSync} disabled={syncing} className="primary small metric-red" style={{ borderRadius: '6px', fontWeight: 600 }}>
                {syncing ? 'Syncing...' : 'Sync Episodes Now'}
              </button>
            </div>
            
            <div className="card metric-green row align-center" style={{ padding: '1rem', gap: '1rem', border: 'none', background: 'var(--ok-wash)' }}>
              <div className="icon-box" style={{ background: '#dcfce7', color: '#15803d', boxShadow: 'none' }}><CheckCircleIcon /></div>
              <div>
                <strong style={{ display: 'block', color: '#15803d' }}>Last synced successfully</strong>
                <span className="small" style={{ color: '#15803d', opacity: 0.8 }}>
                  {syncResult && syncResult.status === 'success' ? syncResult.message.split('\n')[1] : '13 Sept 2026 - 08:35 PM'}
                </span>
              </div>
            </div>

            <div className="card metric-purple row align-center" style={{ padding: '1rem', gap: '1rem', border: 'none', background: '#f3e8ff' }}>
              <div className="icon-box" style={{ background: '#e9d5ff', color: '#7e22ce', boxShadow: 'none' }}><PodcastIcon /></div>
              <div>
                <strong style={{ display: 'block', color: '#7e22ce' }}>{totalEpisodes} episodes</strong>
                <span className="small" style={{ color: '#7e22ce', opacity: 0.8 }}>Updated from Spotify/Anchor RSS</span>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* 3. BOTTOM GRID (Schedule | Bookings | QC & Episodes) */}
      <div className="grid grid-dashboard-bottom" style={{ gap: '1.5rem', marginBottom: '2rem' }}>
        
        {/* COLUMN 1 */}
        <div className="stack" style={{ gap: '1.5rem' }}>
          {/* TODAY'S SCHEDULE */}
          <section className="card fade-in" style={{ flex: 1 }}>
            <div className="row spread align-center" style={{ marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Today's Schedule</h2>
              <Link to="/schedule" className="muted small" style={{ fontWeight: 600, textDecoration: 'none' }}>View full schedule →</Link>
            </div>
            {todaysSchedule.length === 0 ? (
              <CompactEmptyState message="Nothing scheduled today." actionText="Book a studio slot" actionLink="/bookings" />
            ) : (
              <div className="stack" style={{ gap: '0.25rem' }}>
                {todaysSchedule.slice(0, 5).map(slot => (
                  <div key={slot.id} className="row spread align-center list-item small" style={{ padding: '0.75rem 0' }}>
                    <div style={{ flex: 1 }}>
                      <div className="muted small" style={{ marginBottom: '0.2rem' }}>{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</div>
                      <strong style={{ display: 'block', fontSize: '0.95rem' }}>{slot.program_name ?? 'Live Broadcast'}</strong>
                      {slot.episode_title && <div className="muted small" style={{ marginTop: '0.2rem' }}>{slot.episode_title}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* QUICK ACTIONS */}
          <section className="card fade-in" style={{ background: 'var(--surface-raised)' }}>
            <h2 style={{ margin: 0, marginBottom: '1rem', fontSize: '1.1rem' }}>Quick Actions</h2>
            <div className="row wrap" style={{ gap: '0.75rem' }}>
              <QuickAction to="/bookings" label="Book Studio" icon={<CalendarIcon />} colorClass="metric-red" />
              <QuickAction to="/bookings" label="Upload Audio" icon={<CloudUploadIcon />} colorClass="metric-pink" />
              <QuickAction to="/admin/episodes" label="Final Upload" icon={<FolderIcon />} colorClass="metric-pink" />
              {can.reviewQC(profile.role) && <QuickAction to="/admin/qc" label="Review QC" icon={<CheckCircleIcon />} colorClass="metric-green" /> }
              <QuickAction to="/admin/episodes" label="Audio Library" icon={<FolderIcon />} colorClass="metric-blue" />
              <QuickAction to="/admin/episodes" label="Manage Episodes" icon={<MusicIcon />} colorClass="metric-purple" />
            </div>
          </section>
        </div>

        {/* COLUMN 2 */}
        <div className="stack" style={{ gap: '1.5rem' }}>
          {/* UPCOMING BOOKINGS */}
          <section className="card fade-in" style={{ flex: 1 }}>
            <div className="row spread align-center" style={{ marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Upcoming Bookings</h2>
              <Link to="/bookings" className="muted small" style={{ fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
            </div>
            {upcomingBookings.length === 0 ? (
              <CompactEmptyState message="No upcoming bookings." />
            ) : (
              <div className="stack" style={{ gap: '0.25rem' }}>
                {upcomingBookings.map(b => (
                  <div key={b.id} className="row spread align-center list-item small" style={{ padding: '0.75rem 0' }}>
                    <div style={{ flex: 1 }}>
                      <div className="muted small" style={{ marginBottom: '0.2rem' }}>{formatDate(b.booking_date)} &middot; {formatTime(b.booking_date + 'T' + b.start_time)} – {formatTime(b.booking_date + 'T' + b.end_time)}</div>
                      <strong style={{ display: 'block', fontSize: '0.95rem' }}>{b.program?.name ?? 'Studio Session'}</strong>
                      {b.episode && <div className="muted small" style={{ marginTop: '0.2rem' }}>{b.episode.status}</div>}
                    </div>
                    <UnifiedStatusBadge booking={b} episode={b.episode} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* COLUMN 3 */}
        <div className="stack" style={{ gap: '1.5rem' }}>
          {/* PENDING QC */}
          <section className="card fade-in">
            <div className="row spread align-center" style={{ marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Pending QC</h2>
              <Link to="/admin/qc" className="muted small" style={{ fontWeight: 600, textDecoration: 'none' }}>Review all →</Link>
            </div>
            
            {pendingQc.length === 0 ? (
              <CompactEmptyState message="QC queue is clear" />
            ) : (
              <div className="stack" style={{ gap: '0.5rem' }}>
                {pendingQc.slice(0, 3).map(ep => (
                  <div key={ep.id} className="list-item small row spread align-center" style={{ padding: '0.5rem 0' }}>
                    <div className="row align-center" style={{ gap: '0.75rem', flex: 1, minWidth: 0 }}>
                      <div className="icon-box" style={{ width: '32px', height: '32px', background: 'var(--bg-sunk)', boxShadow: 'none' }}><MusicIcon /></div>
                      <div style={{ overflow: 'hidden' }}>
                        <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.title}</strong>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>{formatDate(ep.created_at)} &middot; {ep.duration_seconds ? new Date(ep.duration_seconds * 1000).toISOString().substr(11, 8) : '--:--:--'}</div>
                      </div>
                    </div>
                    <UnifiedStatusBadge episode={ep} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* RECENT EPISODES */}
          <section className="card fade-in">
            <div className="row spread align-center" style={{ marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Recent Episodes</h2>
              <Link to="/admin/episodes" className="muted small" style={{ fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
            </div>
            {recentEpisodes.length === 0 ? (
              <CompactEmptyState message="No recent episodes." />
            ) : (
              <div className="stack" style={{ gap: '0.5rem' }}>
                {recentEpisodes.map(ep => (
                  <div key={ep.id} className="list-item small row spread align-center" style={{ padding: '0.5rem 0' }}>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: '1rem' }}>
                      <Link to={`/admin/episodes/${ep.id}`} style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none', color: 'var(--text)' }}>
                        {ep.title}
                      </Link>
                      <span className="muted" style={{ fontSize: '0.75rem' }}>{formatDate(ep.created_at)} &middot; {ep.duration_seconds ? new Date(ep.duration_seconds * 1000).toISOString().substr(11, 8) : '--:--:--'}</span>
                    </div>
                    <UnifiedStatusBadge episode={ep} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* RAW AUDIO RETENTION */}
          {expiringAudio.length > 0 ? (
            <section className="card fade-in" style={{ borderLeft: '4px solid var(--warn)' }}>
              <h2 style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                Storage & Retention
              </h2>
              <div className="small" style={{ color: 'var(--warn)', fontWeight: 600, marginBottom: '0.25rem' }}>
                ⚠ {expiringAudio.length} raw audio files expire within 7 days
              </div>
              <p className="muted small" style={{ margin: '0 0 1rem' }}>Raw files are automatically deleted after 30 days.</p>
              <Link to="/admin/episodes" className="button small secondary" style={{ display: 'block', textAlign: 'center' }}>View Audio Library →</Link>
            </section>
          ) : (
            <section className="card fade-in">
              <h2 style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                Storage & Retention
              </h2>
              <p className="muted small" style={{ margin: '0' }}>All raw audio files are within their 30-day retention period.</p>
            </section>
          )}

        </div>
      </div>

    </div>
  );
}
