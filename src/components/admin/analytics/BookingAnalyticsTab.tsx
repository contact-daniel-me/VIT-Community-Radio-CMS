import type { BookingAnalyticsData } from '@/services/analyticsService';
import { FunnyLoading } from '@/components/ui';
import { AnalyticsErrorCard } from './AnalyticsErrorCard';

interface BookingAnalyticsTabProps {
  data: BookingAnalyticsData | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function BookingAnalyticsTab({ data, loading, error, onRetry }: BookingAnalyticsTabProps) {
  if (loading && !data) {
    return <FunnyLoading label="Compiling studio booking funnel & conversion metrics..." />;
  }

  if (error && !data) {
    return (
      <AnalyticsErrorCard
        title="Studio Booking Analytics Unavailable"
        error={error}
        onRetry={onRetry}
      />
    );
  }

  if (!data) {
    return (
      <div className="analytics-section" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <p className="muted small">No booking analytics data available for this range.</p>
        {onRetry && (
          <button type="button" className="btn btn-outline small" onClick={onRetry} style={{ marginTop: '0.75rem' }}>
            Reload Booking Metrics
          </button>
        )}
      </div>
    );
  }

  const { funnel, statuses, studios, timeline } = data;

  const funnelSteps = [
    { label: '1. Booking Page Viewed', count: funnel.page_views },
    { label: '2. Booking Form Opened', count: funnel.form_opened },
    { label: '3. Request Submitted', count: funnel.submitted },
    { label: '4. Booking Approved', count: funnel.approved },
    { label: '5. Session Completed', count: funnel.completed },
  ];

  const maxFunnelCount = Math.max(...funnelSteps.map((s) => s.count), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Conversion Funnel */}
      <div className="analytics-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Studio Booking Funnel</h3>
            <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
              Full lifecycle from visiting the studio calendar to finished recording session
            </p>
          </div>
          <div className="live-pulse-badge">
            Overall Conversion: <strong>{funnel.conversion_rate}%</strong>
          </div>
        </div>

        <div className="funnel-container">
          {funnelSteps.map((step, idx) => {
            const pct = Math.max((step.count / maxFunnelCount) * 100, step.count > 0 ? 3 : 0);
            const prevCount = idx > 0 ? funnelSteps[idx - 1].count : step.count;
            const dropoffPct = prevCount > 0 ? Math.round((step.count / prevCount) * 100) : 0;

            return (
              <div key={idx} className="funnel-step">
                <div className="funnel-step-label">{step.label}</div>
                <div className="funnel-bar-track">
                  <div className="funnel-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="funnel-step-count">{step.count.toLocaleString()}</div>
                <div className="funnel-step-rate">
                  {idx === 0 ? '100%' : `${dropoffPct}% step`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Status Breakdown Cards */}
      <div className="analytics-section">
        <h4 className="analytics-section-title">Authoritative Booking Statuses</h4>
        <div className="analytics-kpi-grid">
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Total Requests</div>
            <div className="analytics-kpi-val">{statuses.total_requests}</div>
            <div className="analytics-kpi-sub">Total incoming submissions</div>
          </div>
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Pending Review</div>
            <div className="analytics-kpi-val highlight">{statuses.pending}</div>
            <div className="analytics-kpi-sub">Awaiting admin review</div>
          </div>
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Approved / Confirmed</div>
            <div className="analytics-kpi-val">{statuses.approved}</div>
            <div className="analytics-kpi-sub">Authoritative confirmed slots</div>
          </div>
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Completed Sessions</div>
            <div className="analytics-kpi-val">{statuses.completed}</div>
            <div className="analytics-kpi-sub">Broadcasted or finished</div>
          </div>
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Rejected / Cancelled</div>
            <div className="analytics-kpi-val">{statuses.rejected + statuses.cancelled}</div>
            <div className="analytics-kpi-sub">{statuses.cancelled} cancelled &middot; {statuses.rejected} rejected</div>
          </div>
        </div>
      </div>

      {/* 3. Studios & Facility Preferences */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        <div className="analytics-section">
          <h4 className="analytics-section-title">Most Requested Studios</h4>
          {studios.length === 0 ? (
            <p className="small muted">No studio booking requests in this date range.</p>
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Facility</th>
                    <th>Bookings</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {studios.map((st, i) => {
                    const totalSt = studios.reduce((acc, curr) => acc + curr.total_bookings, 0) || 1;
                    const pct = Math.round((st.total_bookings / totalSt) * 100);
                    return (
                      <tr key={i}>
                        <td>
                          <strong>{st.studio_facility}</strong>
                        </td>
                        <td>{st.total_bookings}</td>
                        <td>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Daily Timeline */}
        <div className="analytics-section">
          <h4 className="analytics-section-title">Booking Activity Timeline</h4>
          {timeline.length === 0 ? (
            <p className="small muted">No booking activity recorded for this period.</p>
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Requests</th>
                    <th>Confirmed</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((row) => (
                    <tr key={row.date}>
                      <td>
                        <strong>{row.date}</strong>
                      </td>
                      <td>{row.requests}</td>
                      <td>{row.confirmed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
