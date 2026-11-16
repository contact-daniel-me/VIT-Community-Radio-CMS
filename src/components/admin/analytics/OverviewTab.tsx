import type { AnalyticsOverviewData } from '@/services/analyticsService';
import { AnalyticsErrorCard } from './AnalyticsErrorCard';

interface OverviewTabProps {
  data: AnalyticsOverviewData | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function OverviewTab({ data, loading, error, onRetry }: OverviewTabProps) {
  if (loading && !data) {
    return (
      <div className="analytics-kpi-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="analytics-kpi-card" style={{ opacity: 0.6 }}>
            <div className="analytics-kpi-header">Loading...</div>
            <div className="analytics-kpi-val">&mdash;</div>
            <div className="analytics-kpi-sub">Updating statistics</div>
          </div>
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <AnalyticsErrorCard
        title="Analytics Overview Unavailable"
        error={error}
        onRetry={onRetry}
      />
    );
  }

  if (!data) {
    return (
      <div className="analytics-section" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <p className="muted small">No analytics overview data available for this range.</p>
        {onRetry && (
          <button type="button" className="btn btn-outline small" onClick={onRetry} style={{ marginTop: '0.75rem' }}>
            Reload Overview
          </button>
        )}
      </div>
    );
  }

  const { website, live, listening, booking } = data;

  const formatSeconds = (sec: number) => {
    if (sec < 60) return `${Math.round(sec)}s`;
    const mins = Math.floor(sec / 60);
    const remainder = Math.round(sec % 60);
    return `${mins}m ${remainder}s`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* 1. Live Snapshot */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.85rem' }}>
          <span className="live-pulse-dot" />
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Live Real-Time Activity</h3>
          <span className="small muted">(Active in past 45s)</span>
        </div>
        <div className="analytics-kpi-grid">
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">
              <span>Active Sessions</span>
              <span className="live-pulse-badge">Live</span>
            </div>
            <div className="analytics-kpi-val highlight">{live.total_active_sessions}</div>
            <div className="analytics-kpi-sub">Concurrent browser connections</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">
              <span>Registered Users</span>
              <span className="live-pulse-badge">Online</span>
            </div>
            <div className="analytics-kpi-val">{live.active_registered_users}</div>
            <div className="analytics-kpi-sub">Logged-in station members</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">
              <span>Anonymous Visitors</span>
              <span className="live-pulse-badge">Browsing</span>
            </div>
            <div className="analytics-kpi-val">{live.active_anonymous_visitors}</div>
            <div className="analytics-kpi-sub">Unregistered public listeners</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">
              <span>Audio Listeners</span>
              <span className="live-pulse-badge">Streaming</span>
            </div>
            <div className="analytics-kpi-val highlight">{live.active_audio_listeners}</div>
            <div className="analytics-kpi-sub">Currently tuned into radio audio</div>
          </div>
        </div>
      </div>

      {/* 2. Website Traffic & Audience */}
      <div>
        <h3 style={{ margin: '0 0 0.85rem', fontSize: '1.05rem', fontWeight: 600 }}>Website Statistics</h3>
        <div className="analytics-kpi-grid">
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Total Visitors</div>
            <div className="analytics-kpi-val">{website.total_visitors.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Distinct client visitors</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Unique Visitors</div>
            <div className="analytics-kpi-val">{website.unique_visitors.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Distinct anonymous/user IDs</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Total Sessions</div>
            <div className="analytics-kpi-val">{website.total_sessions.toLocaleString()}</div>
            <div className="analytics-kpi-sub">User browser sessions</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Page Views</div>
            <div className="analytics-kpi-val">{website.page_views.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Total pages rendered</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">New Visitors</div>
            <div className="analytics-kpi-val">{website.new_visitors.toLocaleString()}</div>
            <div className="analytics-kpi-sub">First-time station visits</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Returning Visitors</div>
            <div className="analytics-kpi-val">{website.returning_visitors.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Repeat station listeners</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Avg Engagement Time</div>
            <div className="analytics-kpi-val">{formatSeconds(website.avg_engagement_seconds)}</div>
            <div className="analytics-kpi-sub">Active duration per session</div>
          </div>
        </div>
      </div>

      {/* 3. Audio Listening Statistics */}
      <div>
        <h3 style={{ margin: '0 0 0.85rem', fontSize: '1.05rem', fontWeight: 600 }}>Listening Statistics</h3>
        <div className="analytics-kpi-grid">
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Total Audio Plays</div>
            <div className="analytics-kpi-val">{listening.total_audio_plays.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Verified audio playbacks</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Unique Listeners</div>
            <div className="analytics-kpi-val">{listening.unique_listeners.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Individual listeners</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Total Listening Time</div>
            <div className="analytics-kpi-val highlight">{listening.total_listening_hours} hrs</div>
            <div className="analytics-kpi-sub">{Math.round(listening.total_listening_seconds / 60).toLocaleString()} total minutes</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Avg Listening Duration</div>
            <div className="analytics-kpi-val">{formatSeconds(listening.avg_listening_seconds)}</div>
            <div className="analytics-kpi-sub">Actual playback time per session</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Completed Sessions</div>
            <div className="analytics-kpi-val">{listening.completed_listening_sessions.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Listened to completion</div>
          </div>
        </div>
      </div>

      {/* 4. Studio Booking Statistics */}
      <div>
        <h3 style={{ margin: '0 0 0.85rem', fontSize: '1.05rem', fontWeight: 600 }}>Studio Booking Statistics</h3>
        <div className="analytics-kpi-grid">
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Total Requests</div>
            <div className="analytics-kpi-val">{booking.total_booking_requests.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Submitted by RJs & teams</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Pending Bookings</div>
            <div className="analytics-kpi-val highlight">{booking.pending_bookings.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Awaiting admin review</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Approved Bookings</div>
            <div className="analytics-kpi-val">{booking.approved_bookings.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Confirmed recording slots</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Rejected / Cancelled</div>
            <div className="analytics-kpi-val">{booking.rejected_or_cancelled_bookings.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Slots released or rejected</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Completed Bookings</div>
            <div className="analytics-kpi-val">{booking.completed_bookings.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Successfully held sessions</div>
          </div>
        </div>
      </div>
    </div>
  );
}
