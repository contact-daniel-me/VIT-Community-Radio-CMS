import type { AudioAnalyticsData } from '@/services/analyticsService';
import { FunnyLoading } from '@/components/ui';

interface AudioAnalyticsTabProps {
  data: AudioAnalyticsData | null;
  loading: boolean;
}

export function AudioAnalyticsTab({ data, loading }: AudioAnalyticsTabProps) {
  if (loading && !data) {
    return <FunnyLoading label="Analyzing radio broadcast stream telemetry..." />;
  }

  if (!data) {
    return (
      <div className="analytics-section">
        <p className="muted small">No audio analytics data available for this range.</p>
      </div>
    );
  }

  const { summary, hourly_distribution, daily_trends, device_breakdown, popular_content } = data;

  const formatSeconds = (sec: number) => {
    if (sec < 60) return `${Math.round(sec)}s`;
    const mins = Math.floor(sec / 60);
    const remainder = Math.round(sec % 60);
    return `${mins}m ${remainder}s`;
  };

  // Find max plays for hourly scaling
  const maxHourlyPlays = Math.max(...hourly_distribution.map((h) => h.plays), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Live Listeners & KPI Summary */}
      <div className="analytics-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span className="live-pulse-dot" />
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Live Radio Listeners</h3>
          <span className="live-pulse-badge">{summary.current_live_listeners} Currently Streaming</span>
        </div>

        <div className="analytics-kpi-grid" style={{ marginTop: '0.5rem' }}>
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Current Listeners</div>
            <div className="analytics-kpi-val highlight">{summary.current_live_listeners}</div>
            <div className="analytics-kpi-sub">Real-time live streaming</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Total Plays</div>
            <div className="analytics-kpi-val">{summary.total_plays.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Verified audio sessions</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Unique Listeners</div>
            <div className="analytics-kpi-val">{summary.unique_listeners.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Individual listeners</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Total Listening Time</div>
            <div className="analytics-kpi-val highlight">{summary.total_listening_hours} hrs</div>
            <div className="analytics-kpi-sub">{Math.round(summary.total_listening_seconds / 60).toLocaleString()} mins</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Avg Duration</div>
            <div className="analytics-kpi-val">{formatSeconds(summary.avg_listening_seconds)}</div>
            <div className="analytics-kpi-sub">Active listening per play</div>
          </div>

          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Completed Shows</div>
            <div className="analytics-kpi-val">{summary.completed_sessions.toLocaleString()}</div>
            <div className="analytics-kpi-sub">Finished full episode</div>
          </div>
        </div>
      </div>

      {/* 2. Hourly Listening Distribution */}
      <div className="analytics-section">
        <h4 className="analytics-section-title">Hourly Listening Distribution (00:00 &ndash; 23:00)</h4>
        <p className="small muted" style={{ margin: '-0.5rem 0 0.5rem' }}>
          Visual playback volume by hour of the day across selected period
        </p>

        {hourly_distribution.length === 0 ? (
          <p className="small muted">No hourly listener data recorded yet.</p>
        ) : (
          <div className="analytics-chart-wrap">
            <div className="analytics-bar-chart">
              {Array.from({ length: 24 }).map((_, hour) => {
                const hourData = hourly_distribution.find((h) => h.hour === hour);
                const plays = hourData?.plays ?? 0;
                const pct = (plays / maxHourlyPlays) * 100;
                const formattedHour = `${hour.toString().padStart(2, '0')}:00`;

                return (
                  <div key={hour} className="analytics-bar-col">
                    <div
                      className="analytics-bar"
                      style={{ height: `${Math.max(pct, plays > 0 ? 8 : 2)}%` }}
                    />
                    <div className="analytics-bar-tooltip">
                      <strong>{formattedHour}</strong>
                      <div>{plays} plays</div>
                      <div>{Math.round((hourData?.total_seconds ?? 0) / 60)} mins</div>
                    </div>
                    <span className="analytics-bar-label">
                      {hour % 3 === 0 ? hour : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 3. Popular Audio Content & Devices Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {/* Popular Audio Content */}
        <div className="analytics-section">
          <h4 className="analytics-section-title">Most Popular Audio Content</h4>
          {popular_content.length === 0 ? (
            <p className="small muted">No content listening records for this range.</p>
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Content / Stream</th>
                    <th>Type</th>
                    <th>Plays</th>
                    <th>Total Time</th>
                  </tr>
                </thead>
                <tbody>
                  {popular_content.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <strong>{item.audio_source_id === 'live_radio_90.8' ? 'Live Radio 90.8 FM' : item.audio_source_id}</strong>
                      </td>
                      <td>
                        <span className="small muted" style={{ textTransform: 'capitalize' }}>
                          {item.source_type}
                        </span>
                      </td>
                      <td>{item.plays.toLocaleString()}</td>
                      <td>{formatSeconds(item.total_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Device Breakdown */}
        <div className="analytics-section">
          <h4 className="analytics-section-title">Listening Device Breakdown</h4>
          {device_breakdown.length === 0 ? (
            <p className="small muted">No device data available.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
              {device_breakdown.map((dev) => {
                const totalPlays = summary.total_plays || 1;
                const pct = Math.round((dev.count / totalPlays) * 100);

                return (
                  <div key={dev.device_category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                      <strong>{dev.device_category}</strong>
                      <span>{dev.count} plays ({pct}%) &middot; {Math.round(dev.total_seconds / 60)} mins</span>
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

      {/* 4. Daily Trends Table */}
      {daily_trends.length > 0 && (
        <div className="analytics-section">
          <h4 className="analytics-section-title">Daily Listening Trends</h4>
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Plays</th>
                  <th>Unique Listeners</th>
                  <th>Total Time</th>
                  <th>Avg Per Play</th>
                </tr>
              </thead>
              <tbody>
                {daily_trends.map((day) => (
                  <tr key={day.date}>
                    <td>
                      <strong>{day.date}</strong>
                    </td>
                    <td>{day.plays.toLocaleString()}</td>
                    <td>{day.listeners.toLocaleString()}</td>
                    <td>{Math.round(day.total_seconds / 60)} mins</td>
                    <td>{formatSeconds(day.plays > 0 ? day.total_seconds / day.plays : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
