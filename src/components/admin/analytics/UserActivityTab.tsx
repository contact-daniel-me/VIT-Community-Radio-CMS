import { useEffect, useState, useTransition } from 'react';
import { analyticsService, type UserActivityWithProfile } from '@/services/analyticsService';
import { FunnyLoading } from '@/components/ui';

interface UserActivityTabProps {
  onSelectUser: (userId: string, userName: string) => void;
}

const EVENT_OPTIONS = [
  { value: 'ALL', label: 'All Activities' },
  { value: 'PAGE_VIEW', label: 'Page Views' },
  { value: 'USER_LOGIN', label: 'Logins' },
  { value: 'USER_LOGOUT', label: 'Logouts' },
  { value: 'AUDIO_PLAY', label: 'Audio Playbacks' },
  { value: 'AUDIO_PAUSE', label: 'Audio Pauses' },
  { value: 'BOOKING_FORM_OPEN', label: 'Booking Form Opens' },
  { value: 'BOOKING_SUBMITTED', label: 'Booking Submissions' },
];

export function UserActivityTab({ onSelectUser }: UserActivityTabProps) {
  const [logs, setLogs] = useState<UserActivityWithProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('ALL');
  const [page, setPage] = useState(0);
  const pageSize = 30;
  const [, startTransition] = useTransition();

  const loadLogs = async (p = page, q = search, evt = selectedEvent) => {
    try {
      setLoading(true);
      const res = await analyticsService.getUserActivityLogs({
        limit: pageSize,
        offset: p * pageSize,
        search: q,
        eventName: evt === 'ALL' ? undefined : evt,
      });
      setLogs(res.logs);
      setTotal(res.total);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs(0, search, selectedEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    startTransition(() => {
      void loadLogs(0, search, selectedEvent);
    });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    void loadLogs(newPage, search, selectedEvent);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Search and Filters */}
      <div className="analytics-section">
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Search by user name, page or activity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: '220px', padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
          />

          <select
            value={selectedEvent}
            onChange={(e) => {
              setSelectedEvent(e.target.value);
              setPage(0);
            }}
            style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
          >
            {EVENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button type="submit" className="btn btn-outline small">
            Filter
          </button>
        </form>
      </div>

      {/* Activity Table */}
      <div className="analytics-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 className="analytics-section-title">
            <span>User Activity Trail</span>
            <span className="small muted">({total} total records)</span>
          </h4>
          {totalPages > 1 && (
            <div className="small muted">
              Page {page + 1} of {totalPages}
            </div>
          )}
        </div>

        {loading && <FunnyLoading label="Filtering user activity audit log..." />}

        {!loading && logs.length === 0 && (
          <p className="muted small text-center" style={{ padding: '2rem 0' }}>
            No user activity records match the selected criteria.
          </p>
        )}

        {!loading && logs.length > 0 && (
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User / Session</th>
                  <th>Event</th>
                  <th>Description</th>
                  <th>Page</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((item) => {
                  const date = new Date(item.created_at);
                  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

                  return (
                    <tr key={item.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.82rem' }}>{dateStr}</span>
                        <div className="small muted">{time}</div>
                      </td>
                      <td>
                        {item.user ? (
                          <div className="user-cell-pill">
                            <div className="user-avatar-circle">
                              {item.user.avatar_url ? (
                                <img src={item.user.avatar_url} alt="" className="user-avatar-img" />
                              ) : (
                                item.user.full_name.slice(0, 2).toUpperCase()
                              )}
                            </div>
                            <div>
                              <strong>{item.user.full_name}</strong>
                              <div className="small muted">{item.user.role}</div>
                            </div>
                          </div>
                        ) : (
                          <span className="muted small">
                            <code>{item.anonymous_session_id ? `#A${item.anonymous_session_id.slice(-4)}` : 'Anonymous'}</code>
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            background: 'var(--color-bg-subtle, #f1f5f9)',
                            border: '1px solid var(--line, #e2e8f0)',
                          }}
                        >
                          {item.event_name}
                        </span>
                      </td>
                      <td>{item.activity_description || item.event_name}</td>
                      <td>
                        <code>{item.page_path}</code>
                      </td>
                      <td>
                        {item.user && (
                          <button
                            type="button"
                            className="btn btn-outline small"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => onSelectUser(item.user!.id, item.user!.full_name)}
                          >
                            Timeline
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-outline small"
              disabled={page === 0}
              onClick={() => handlePageChange(page - 1)}
            >
              Previous
            </button>
            <span className="small muted" style={{ display: 'flex', alignItems: 'center' }}>
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-outline small"
              disabled={page >= totalPages - 1}
              onClick={() => handlePageChange(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
