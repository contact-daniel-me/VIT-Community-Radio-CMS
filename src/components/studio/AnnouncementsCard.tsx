import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { announcementService } from '@/services/announcementService';
import { AnnouncementDialog } from './AnnouncementDialog';
import { Empty, Loading } from '@/components/ui';
import type { AnnouncementRow } from '@/types/database';

function getStatusBadge(ann: AnnouncementRow) {
  const now = new Date();
  
  if (ann.status === 'DRAFT') {
    return <span className="badge badge-grey">⚪ Draft</span>;
  }
  
  if (ann.expires_at && new Date(ann.expires_at) <= now) {
    return <span className="badge badge-red">🔴 Expired</span>;
  }
  
  if (ann.status === 'PUBLISHED') {
    return <span className="badge badge-green">🟢 Published</span>;
  }
  
  if (ann.status === 'SCHEDULED') {
    if (ann.scheduled_at && new Date(ann.scheduled_at) > now) {
      return <span className="badge badge-amber">🟡 Scheduled</span>;
    }
    return <span className="badge badge-green">🟢 Published</span>;
  }
  
  return <span className="badge badge-grey">Archived</span>;
}

export function AnnouncementsCard() {
  const announcements = useAsync(() => announcementService.getAllAnnouncements(), []);
  const [showCreate, setShowCreate] = useState(false);

  const latest = useMemo(() => {
    if (!announcements.data) return [];
    return announcements.data.slice(0, 3);
  }, [announcements.data]);

  return (
    <>
      <section className="card stack fade-in" style={{ gap: '1rem', padding: '1.2rem', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="row spread align-center">
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Station Announcements</h3>
          <Link to="/announcements" className="link small" style={{ fontWeight: 500 }}>
            View all &rarr;
          </Link>
        </div>

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
            {latest.map(ann => (
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
                  <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>📢</span>
                  <span>{ann.title}</span>
                </h4>
                <p className="small" style={{ margin: 0, color: 'var(--ink)', opacity: 0.9, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  {ann.message}
                </p>
                <div className="row align-center" style={{ gap: '0.5rem', marginTop: '0.2rem' }}>
                  {getStatusBadge(ann)}
                  <span className="small muted">
                    &middot; {
                      new Date(ann.created_at).toLocaleDateString(undefined, { 
                        month: 'short', 
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })
                    }
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

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
      </section>

      {showCreate && (
        <AnnouncementDialog 
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            void announcements.reload();
          }}
        />
      )}
    </>
  );
}
