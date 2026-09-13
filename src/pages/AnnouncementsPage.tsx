import { useState, useMemo } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { announcementService } from '@/services/announcementService';
import { AnnouncementDialog } from '@/components/studio/AnnouncementDialog';
import { Banner, Empty, Loading, PageHeader, ConfirmButton } from '@/components/ui';
import { errorMessage } from '@/lib/errors';

import type { AnnouncementRow } from '@/types/database';

type Tab = 'all' | 'published' | 'scheduled' | 'draft' | 'expired';

export function AnnouncementsPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const announcements = useAsync(() => announcementService.getAllAnnouncements(), []);

  const groups = useMemo(() => {
    const list = announcements.data ?? [];
    const now = new Date();
    
    return {
      all: list,
      draft: list.filter(a => a.status === 'DRAFT'),
      expired: list.filter(a => a.expires_at && new Date(a.expires_at) <= now),
      published: list.filter(a => a.status === 'PUBLISHED' && (!a.expires_at || new Date(a.expires_at) > now)),
      scheduled: list.filter(a => a.status === 'SCHEDULED' && (!a.expires_at || new Date(a.expires_at) > now))
    };
  }, [announcements.data]);

  const list = groups[tab];

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
      <PageHeader
        title="Station Announcements"
        description="Manage announcements displayed on the public website."
        actions={
          <button className="btn btn-solid small" onClick={() => setShowCreate(true)}>
            + Create Announcement
          </button>
        }
      />

      <Banner>{error}</Banner>

      <div className="tabs" role="tablist" aria-label="Announcement filters">
        {(['all', 'published', 'scheduled', 'draft', 'expired'] as Tab[]).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            className={`tab ${tab === key ? 'is-active' : ''}`}
            onClick={() => setTab(key)}
          >
            {key[0].toUpperCase() + key.slice(1)}
            <span className="tab-count">{groups[key].length}</span>
          </button>
        ))}
      </div>

      {announcements.loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty>No announcements found.</Empty>
      ) : (
        <div className="stack" style={{ gap: '1.5rem', marginTop: '1.5rem' }}>
          {list.map(ann => {
            const now = new Date();
            let displayStatus: string = ann.status;
            if (ann.expires_at && new Date(ann.expires_at) <= now) displayStatus = 'EXPIRED';
            else if (ann.status === 'SCHEDULED' && ann.scheduled_at && new Date(ann.scheduled_at) <= now) displayStatus = 'PUBLISHED';
            
            return (
              <div key={ann.id} className="card stack fade-in" style={{ gap: '1rem' }}>
                <div className="row spread align-center">
                  <h3 style={{ margin: 0 }}>{ann.title}</h3>
                  <div className="row align-center" style={{ gap: '0.5rem' }}>
                    {displayStatus === 'DRAFT' && <span className="badge badge-grey">Draft</span>}
                    {displayStatus === 'PUBLISHED' && <span className="badge badge-green">Published</span>}
                    {displayStatus === 'SCHEDULED' && <span className="badge badge-amber">Scheduled</span>}
                    {displayStatus === 'EXPIRED' && <span className="badge badge-red">Expired</span>}
                  </div>
                </div>
                
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--ink)' }}>{ann.message}</p>
                
                <div className="row wrap" style={{ gap: '1.5rem', color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
                  {ann.published_at && (
                    <div>Published: {new Date(ann.published_at).toLocaleString()}</div>
                  )}
                  {ann.scheduled_at && (
                    <div>Scheduled for: {new Date(ann.scheduled_at).toLocaleString()}</div>
                  )}
                  {ann.expires_at && (
                    <div>Expires: {new Date(ann.expires_at).toLocaleString()}</div>
                  )}
                  {ann.author && (
                    <div>By: {ann.author.full_name}</div>
                  )}
                </div>

                <div className="actions-row" style={{ paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <button className="btn small" onClick={() => setEditing(ann)}>Edit</button>
                  <ConfirmButton
                    className="small danger"
                    confirmLabel="Delete announcement?"
                    onConfirm={() => void deleteAnnouncement(ann.id)}
                    disabled={busyId === ann.id}
                  >
                    Delete
                  </ConfirmButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
