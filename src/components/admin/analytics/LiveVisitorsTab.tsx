import type { LiveVisitorsResponse, LiveRegisteredVisitor } from '@/services/analyticsService';
import { FunnyLoading } from '@/components/ui';
import { AnalyticsErrorCard } from './AnalyticsErrorCard';

interface LiveVisitorsTabProps {
  data: LiveVisitorsResponse | null;
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  onSelectUser: (userId: string, userName: string) => void;
}

export function LiveVisitorsTab({ data, loading, error, onRefresh, onSelectUser }: LiveVisitorsTabProps) {
  if (loading && !data) {
    return <FunnyLoading label="Connecting to live listener and visitor presence stream..." />;
  }

  if (error && !data) {
    return (
      <AnalyticsErrorCard
        title="Live Visitors Presence Unavailable"
        error={error}
        onRetry={onRefresh}
      />
    );
  }

  const registered = data?.registered_users ?? [];
  const anonymous = data?.anonymous_visitors ?? [];
  const totalActive = data?.total_active ?? 0;

  const listeningCount =
    registered.filter((r) => r.is_listening).length +
    anonymous.filter((a) => a.is_listening).length;

  const homepageCount =
    registered.filter((r) => r.current_path === '/').length +
    anonymous.filter((a) => a.current_path === '/').length;

  const formatAgo = (timestamp: string) => {
    const diff = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Live Visitor Summary */}
      <div className="analytics-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className="live-pulse-dot" />
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Active Live Visitors</h3>
            <span className="live-pulse-badge">{totalActive} Concurrent</span>
          </div>
          <button type="button" className="btn btn-outline small" onClick={onRefresh}>
            Refresh Live State
          </button>
        </div>

        <div className="analytics-kpi-grid" style={{ marginTop: '0.5rem' }}>
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Total Active</div>
            <div className="analytics-kpi-val highlight">{totalActive}</div>
            <div className="analytics-kpi-sub">All active connections</div>
          </div>
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Registered Users</div>
            <div className="analytics-kpi-val">{registered.length}</div>
            <div className="analytics-kpi-sub">Logged-in station accounts</div>
          </div>
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Anonymous Visitors</div>
            <div className="analytics-kpi-val">{anonymous.length}</div>
            <div className="analytics-kpi-sub">Public listeners</div>
          </div>
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">Audio Streaming</div>
            <div className="analytics-kpi-val highlight">{listeningCount}</div>
            <div className="analytics-kpi-sub">Currently tuned in</div>
          </div>
          <div className="analytics-kpi-card">
            <div className="analytics-kpi-header">On Homepage</div>
            <div className="analytics-kpi-val">{homepageCount}</div>
            <div className="analytics-kpi-sub">Viewing /</div>
          </div>
        </div>
      </div>

      {/* Authenticated Registered Users */}
      <div className="analytics-section">
        <h4 className="analytics-section-title">
          <span>Registered Station Users Online</span>
          <span className="small muted">({registered.length})</span>
        </h4>

        {registered.length === 0 ? (
          <p className="muted small" style={{ margin: '0.5rem 0' }}>
            No registered staff members are currently logged in.
          </p>
        ) : (
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Current Activity</th>
                  <th>Current Page</th>
                  <th>Device</th>
                  <th>Started</th>
                  <th>Last Seen</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {registered.map((user: LiveRegisteredVisitor) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell-pill">
                        <div className="user-avatar-circle">
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt="" className="user-avatar-img" />
                          ) : (
                            user.full_name.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <strong>{user.full_name}</strong>
                          <div className="small muted">{user.role}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 500 }}>
                        {user.current_activity}
                      </span>
                      {user.is_listening && (
                        <span className="live-pulse-badge" style={{ marginLeft: '6px' }}>
                          Streaming
                        </span>
                      )}
                    </td>
                    <td>
                      <code>{user.current_path}</code>
                    </td>
                    <td>{user.device_category}</td>
                    <td>{formatTime(user.started_at)}</td>
                    <td>{formatAgo(user.last_seen_at)}</td>
                    <td>
                      <span className={`live-pulse-badge ${user.status === 'idle' ? 'idle' : ''}`}>
                        <span className="live-pulse-dot" />
                        {user.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-outline small"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => onSelectUser(user.user_id, user.full_name)}
                      >
                        Timeline
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Anonymous Public Visitors */}
      <div className="analytics-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 className="analytics-section-title">
            <span>Anonymous Public Visitors</span>
            <span className="small muted">({anonymous.length})</span>
          </h4>
          <span className="small muted">Masked session IDs protect listener privacy</span>
        </div>

        {anonymous.length === 0 ? (
          <p className="muted small" style={{ margin: '0.5rem 0' }}>
            No anonymous listeners are currently browsing the public site.
          </p>
        ) : (
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Visitor ID</th>
                  <th>Current Activity</th>
                  <th>Current Page</th>
                  <th>Device</th>
                  <th>Connected Since</th>
                  <th>Last Active</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {anonymous.map((anon) => (
                  <tr key={anon.id}>
                    <td>
                      <code>{anon.masked_visitor_id}</code>
                    </td>
                    <td>
                      <span>{anon.current_activity}</span>
                      {anon.is_listening && (
                        <span className="live-pulse-badge" style={{ marginLeft: '6px' }}>
                          Streaming
                        </span>
                      )}
                    </td>
                    <td>
                      <code>{anon.current_path}</code>
                    </td>
                    <td>{anon.device_category}</td>
                    <td>{formatTime(anon.started_at)}</td>
                    <td>{formatAgo(anon.last_seen_at)}</td>
                    <td>
                      <span className={`live-pulse-badge ${anon.status === 'idle' ? 'idle' : ''}`}>
                        <span className="live-pulse-dot" />
                        {anon.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
