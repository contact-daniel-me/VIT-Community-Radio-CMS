import type { TrafficAudienceData } from '@/services/analyticsService';
import { FunnyLoading } from '@/components/ui';
import { AnalyticsErrorCard } from './AnalyticsErrorCard';

interface TrafficAudienceTabProps {
  data: TrafficAudienceData | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function TrafficAudienceTab({ data, loading, error, onRetry }: TrafficAudienceTabProps) {
  if (loading && !data) {
    return <FunnyLoading label="Aggregating audience acquisition channels & device data..." />;
  }

  if (error && !data) {
    return (
      <AnalyticsErrorCard
        title="Traffic & Audience Analytics Unavailable"
        error={error}
        onRetry={onRetry}
      />
    );
  }

  if (!data) {
    return (
      <div className="analytics-section" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <p className="muted small">No audience data available for this range.</p>
        {onRetry && (
          <button type="button" className="btn btn-outline small" onClick={onRetry} style={{ marginTop: '0.75rem' }}>
            Reload Traffic Metrics
          </button>
        )}
      </div>
    );
  }

  const { devices, sources, top_pages, visitor_types } = data;

  const totalSessions = sources.reduce((acc, curr) => acc + curr.sessions, 0) || 1;
  const totalVisitors = (visitor_types.new_visitors + visitor_types.returning_visitors) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Traffic Sources & Device Categories Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {/* Traffic Acquisition Channels */}
        <div className="analytics-section">
          <h4 className="analytics-section-title">Traffic Acquisition Sources</h4>
          {sources.length === 0 ? (
            <p className="small muted">No traffic source data available.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginTop: '0.5rem' }}>
              {sources.map((src) => {
                const pct = Math.round((src.sessions / totalSessions) * 100);
                return (
                  <div key={src.source}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                      <strong>{src.source}</strong>
                      <span>{src.sessions} sessions ({pct}%)</span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--color-bg-subtle, #f1f5f9)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)',
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Device Breakdown */}
        <div className="analytics-section">
          <h4 className="analytics-section-title">Audience Device Categories</h4>
          {devices.length === 0 ? (
            <p className="small muted">No device records available.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginTop: '0.5rem' }}>
              {devices.map((dev) => {
                const totalDev = devices.reduce((acc, curr) => acc + curr.sessions, 0) || 1;
                const pct = Math.round((dev.sessions / totalDev) * 100);
                return (
                  <div key={dev.device_category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                      <strong>{dev.device_category}</strong>
                      <span>{dev.visitors} visitors &middot; {dev.sessions} sessions ({pct}%)</span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--color-bg-subtle, #f1f5f9)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: 'var(--color-primary, #dc2626)',
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. Retention: New vs Returning */}
      <div className="analytics-section">
        <h4 className="analytics-section-title">Audience Retention (New vs. Returning)</h4>
        <div className="analytics-kpi-grid">
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">New Visitors</div>
            <div className="analytics-kpi-val highlight">{visitor_types.new_visitors.toLocaleString()}</div>
            <div className="analytics-kpi-sub">
              {Math.round((visitor_types.new_visitors / totalVisitors) * 100)}% of total visitors
            </div>
          </div>
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Returning Visitors</div>
            <div className="analytics-kpi-val">{visitor_types.returning_visitors.toLocaleString()}</div>
            <div className="analytics-kpi-sub">
              {Math.round((visitor_types.returning_visitors / totalVisitors) * 100)}% retention rate
            </div>
          </div>
        </div>
      </div>

      {/* 3. Top Visited Pages */}
      <div className="analytics-section">
        <h4 className="analytics-section-title">Most Popular Website Pages</h4>
        {top_pages.length === 0 ? (
          <p className="small muted">No page view records in this range.</p>
        ) : (
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Page Path</th>
                  <th>Page Views</th>
                  <th>Unique Visitors</th>
                </tr>
              </thead>
              <tbody>
                {top_pages.map((p, idx) => (
                  <tr key={idx}>
                    <td>
                      <code>{p.page_path}</code>
                    </td>
                    <td>{p.page_views.toLocaleString()}</td>
                    <td>{p.unique_visitors.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Google Analytics 4 Property Integration Details */}
      <div className="analytics-section" style={{ borderLeft: '4px solid var(--color-primary, #dc2626)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              Google Analytics 4 Property & Data API Integration
            </h4>
            <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
              Connected tracking container: <code>GTM-TLX6F4VZ</code>
            </p>
          </div>
          <span className="live-pulse-badge">Container Active</span>
        </div>

        <div className="small muted" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
          <p>
            Google Tag Manager and GA4 client telemetry are actively configured and deferred to maintain high initial render performance.
            Aggregate website demographics and geographic coordinates can be queried via the Google Analytics Data API.
          </p>

          <div style={{ background: 'var(--color-bg-subtle, #f8fafc)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--line, #e2e8f0)' }}>
            <strong>Configuration Requirements for Server-Side GA4 Data API:</strong>
            <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.25rem' }}>
              <li><strong>Environment Variable:</strong> <code>GA4_PROPERTY_ID</code> (e.g. <code>9-digit property ID</code>)</li>
              <li><strong>Service Account Credentials:</strong> <code>GOOGLE_APPLICATION_CREDENTIALS</code> with <em>Viewer</em> permission on the GA4 property.</li>
              <li><strong>Security Rule:</strong> Service account secrets must remain in backend serverless functions and are never exposed to browser client bundles.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
