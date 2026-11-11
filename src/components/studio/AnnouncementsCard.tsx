import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { can } from '@/lib/permissions';
import {
  announcementService,
  computeAnnouncementLifecycleStatus,
} from '@/services/announcementService';
import { AnnouncementDialog } from './AnnouncementDialog';
import { Banner, ConfirmButton, Empty, Loading, PublishStatusBadge } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/utils/datetime';
import type { AnnouncementRow, PublishLifecycleStatus } from '@/types/database';

export function AnnouncementsCard() {
  const profile = useCurrentUser();
  const isAdmin = can.manageAnnouncements(profile.role);
  const announcements = useAsync(() => announcementService.getAllAnnouncements(), []);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const latest = useMemo(() => {
    if (!announcements.data) return [];
    const now = new Date();
    const withStatus = announcements.data.map((ann) => ({
      ann,
      lifecycle: computeAnnouncementLifecycleStatus(ann, now) as PublishLifecycleStatus,
    }));
    // Non-managers only see currently active published announcements
    const visible = isAdmin
      ? withStatus
      : withStatus.filter((item) => item.lifecycle === 'PUBLISHED');
    return visible.slice(0, 3);
  }, [announcements.data, isAdmin]);

  const deleteAnnouncement = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await announcementService.deleteAnnouncement(id);
      await announcements.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <section className="card stack fade-in" style={{ gap: '1rem', padding: '1.2rem', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="row spread align-center">
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Station Announcements</h3>
          {isAdmin && (
            <Link to="/announcements" className="link small" style={{ fontWeight: 500 }}>
              View all &rarr;
            </Link>
          )}
        </div>
        <Banner>{error}</Banner>

        {announcements.loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loading />
          </div>
        ) : latest.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty>No announcements yet.</Empty>
          </div>
        ) : (
          <div className="stack" style={{ gap: '1rem', flex: 1, overflowY: 'auto' }}>
            {latest.map(({ ann, lifecycle }) => (
              <div
                key={ann.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  padding: '1rem',
                  background: 'var(--surface-hover)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem'
                }}
              >
                <h4 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <span>{ann.title}</span>
                </h4>
                <p className="small" style={{ margin: 0, color: 'var(--ink)', opacity: 0.9, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  {ann.message}
                </p>
                <div className="row spread align-center" style={{ marginTop: '0.2rem' }}>
                  <div className="row align-center" style={{ gap: '0.5rem' }}>
                    <PublishStatusBadge status={lifecycle} />
                    <span className="small muted">
                      &middot; {formatDateTime(ann.published_at ?? ann.scheduled_at ?? ann.created_at)}
                    </span>
                  </div>
                  {isAdmin && (
                    <div className="row align-center" style={{ gap: '0.5rem' }}>
                      <button className="link small" onClick={() => setEditing(ann)}>Edit</button>
                      <ConfirmButton 
                        className="link small danger" 
                        confirmLabel="Delete?"
                        onConfirm={() => void deleteAnnouncement(ann.id)}
                        disabled={busyId === ann.id}
                      >
                        Delete
                      </ConfirmButton>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
            <button 
              type="button" 
              className="btn btn-ghost" 
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setShowCreate(true)}
            >
              + Create Announcement
            </button>
          </div>
        )}
      </section>

      {(showCreate || editing) && (
        <AnnouncementDialog 
          existing={editing ?? undefined}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowCreate(false);
            setEditing(null);
            void announcements.reload();
          }}
        />
      )}
    </>
  );
}
