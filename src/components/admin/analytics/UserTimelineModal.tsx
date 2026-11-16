import { useEffect, useState } from 'react';
import { analyticsService, type UserActivityWithProfile } from '@/services/analyticsService';
import { FunnyLoading } from '@/components/ui';

interface UserTimelineModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
}

export function UserTimelineModal({ userId, userName, onClose }: UserTimelineModalProps) {
  const [logs, setLogs] = useState<UserActivityWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await analyticsService.getUserTimeline(userId, 50);
        if (!cancelled) {
          setLogs(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || 'Failed to load timeline');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="timeline-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="User Timeline">
      <div className="timeline-modal" onClick={(e) => e.stopPropagation()}>
        <div className="timeline-modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>User Activity Timeline</h3>
            <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
              Chronological actions recorded for <strong>{userName}</strong>
            </p>
          </div>
          <button type="button" className="btn btn-outline small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="timeline-modal-body">
          {loading && <FunnyLoading label="Assembling user activity trail..." />}

          {error && (
            <div className="banner banner-error">
              {error}
            </div>
          )}

          {!loading && !error && logs.length === 0 && (
            <p className="muted small text-center" style={{ padding: '2rem 0' }}>
              No recorded activity for this user in the selected audit trail.
            </p>
          )}

          {!loading && !error && logs.length > 0 && (
            <div className="timeline-chain">
              {logs.map((item, idx) => {
                const date = new Date(item.created_at);
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

                return (
                  <div key={item.id} className="timeline-node">
                    <span className="timeline-node-dot" />
                    <span className="timeline-node-time">
                      #{logs.length - idx} &middot; {dateStr} at {timeStr}
                    </span>
                    <span className="timeline-node-action">
                      {item.activity_description || item.event_name.replace(/_/g, ' ')}
                    </span>
                    {item.page_path && (
                      <span className="timeline-node-page">
                        {item.page_path}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
