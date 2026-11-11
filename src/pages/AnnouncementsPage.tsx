import { useState, useMemo } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useScheduledTransitionRefresh } from '@/hooks/useScheduledTransitionRefresh';
import { useSuccessFeedback } from '@/hooks/useSuccessFeedback';
import {
  announcementService,
  computeAnnouncementLifecycleStatus,
  type AnnouncementWithAuthor,
} from '@/services/announcementService';
import { AnnouncementDialog } from '@/components/studio/AnnouncementDialog';
import {
  Banner,
  ConfirmButton,
  Empty,
  Loading,
  PageHeader,
  PublishStatusBadge,
} from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/utils/datetime';
import type { AnnouncementRow, PublishLifecycleStatus } from '@/types/database';

type Tab = 'all' | 'draft' | 'scheduled' | 'published' | 'expired' | 'failed';

export function AnnouncementsPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { notifySave } = useSuccessFeedback();

  const announcements = useAsync(() => announcementService.getAllAnnouncements(), []);

  useScheduledTransitionRefresh(
    (announcements.data ?? []).flatMap((a) => [a.scheduled_at, a.expires_at]),
    () => {
      void announcements.reload();
    },
  );

  const classified = useMemo(() => {
    const list = announcements.data ?? [];
    const now = new Date();
    return list.map((ann) => ({
      ann,
      lifecycle: computeAnnouncementLifecycleStatus(ann, now) as PublishLifecycleStatus,
    }));
  }, [announcements.data]);

  const groups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = (a: AnnouncementWithAuthor) =>
      !q ||
      a.title.toLowerCase().includes(q) ||
      a.message.toLowerCase().includes(q);

    const filtered = classified.filter((item) => matchesSearch(item.ann));
    return {
      all: filtered,
      draft: filtered.filter((i) => i.lifecycle === 'DRAFT'),
      scheduled: filtered.filter((i) => i.lifecycle === 'SCHEDULED'),
      published: filtered.filter((i) => i.lifecycle === 'PUBLISHED'),
      expired: filtered.filter((i) => i.lifecycle === 'EXPIRED'),
      failed: filtered.filter((i) => i.lifecycle === 'FAILED'),
    };
  }, [classified, searchQuery]);

  const list = groups[tab];

  const deleteAnnouncement = async (id: string) => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await announcementService.deleteAnnouncement(id);
      setNotice('Announcement deleted.');
      notifySave({ title: 'Announcement deleted', dedupeKey: `ann-del:${id}` });
      await announcements.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const unscheduleToDraft = async (ann: AnnouncementRow) => {
    setBusyId(ann.id);
    setError(null);
    setNotice(null);
    try {
      await announcementService.unscheduleToDraft(ann.id);
      setNotice(`"${ann.title}" moved to Draft.`);
      notifySave({ title: 'Moved to Draft', detail: ann.title, dedupeKey: `ann-unsched:${ann.id}` });
      await announcements.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const retryPublish = async (ann: AnnouncementRow) => {
    setBusyId(ann.id);
    setError(null);
    setNotice(null);
    try {
      await announcementService.retryAnnouncement(ann.id);
      setNotice(`"${ann.title}" queued for publication retry.`);
      notifySave({ title: 'Publication retry queued', detail: ann.title, dedupeKey: `ann-retry:${ann.id}` });
      await announcements.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const publishNow = async (ann: AnnouncementRow) => {
    setBusyId(ann.id);
    setError(null);
    setNotice(null);
    try {
      await announcementService.updateAnnouncement(ann.id, {
        status: 'PUBLISHED',
        published_at: new Date().toISOString(),
        publish_error: null,
      });
      setNotice(`"${ann.title}" published.`);
      notifySave({ title: 'Announcement published', detail: ann.title, dedupeKey: `ann-pub:${ann.id}` });
      await announcements.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const archiveAnnouncement = async (ann: AnnouncementRow) => {
    setBusyId(ann.id);
    setError(null);
    setNotice(null);
    try {
      await announcementService.updateAnnouncement(ann.id, {
        status: 'ARCHIVED',
      });
      setNotice(`"${ann.title}" archived.`);
      notifySave({ title: 'Announcement archived', detail: ann.title, dedupeKey: `ann-arch:${ann.id}` });
      await announcements.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const TAB_ITEMS: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'published', label: 'Published' },
    { key: 'expired', label: 'Expired' },
    { key: 'failed', label: 'Failed' },
  ];

  return (
    <>
      <PageHeader
        title="Station Announcements"
        description="Manage Draft, Scheduled, Published, Expired, and Failed announcements displayed on the public website."
        actions={
          <button className="btn btn-solid small" onClick={() => setShowCreate(true)}>
            + Create Announcement
          </button>
        }
      />

      <Banner>{error}</Banner>
      <Banner kind="success">{notice}</Banner>

      <div className="row spread wrap" style={{ gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div className="tabs" role="tablist" aria-label="Announcement lifecycle filters" style={{ margin: 0 }}>
          {TAB_ITEMS.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              className={`tab ${tab === key ? 'is-active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
              <span className="tab-count">{groups[key].length}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search announcements..."
          aria-label="Search announcements"
          style={{
            padding: '0.4rem 0.65rem',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--line)',
            fontSize: '0.88rem',
            minWidth: '220px',
          }}
        />
      </div>

      {announcements.loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty>No announcements found in this section.</Empty>
      ) : (
        <div className="stack" style={{ gap: '1.5rem', marginTop: '1.5rem' }}>
          {list.map(({ ann, lifecycle }) => (
            <div key={ann.id} className="card stack fade-in" style={{ gap: '1rem' }}>
              <div className="row spread align-center">
                <h3 style={{ margin: 0 }}>{ann.title}</h3>
                <div className="row align-center" style={{ gap: '0.5rem' }}>
                  <PublishStatusBadge status={lifecycle} />
                </div>
              </div>

              <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--ink)' }}>{ann.message}</p>

              {lifecycle === 'FAILED' && ann.publish_error && (
                <div className="banner banner-error" style={{ margin: 0 }}>
                  <strong>Publish failure:</strong> {ann.publish_error}
                </div>
              )}

              <div className="row wrap" style={{ gap: '1.5rem', color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
                {ann.published_at && (
                  <div>Published: {formatDateTime(ann.published_at)}</div>
                )}
                {ann.scheduled_at && (
                  <div>Scheduled for: {formatDateTime(ann.scheduled_at)}</div>
                )}
                {ann.expires_at ? (
                  <div>Expires: {formatDateTime(ann.expires_at)}</div>
                ) : lifecycle === 'PUBLISHED' ? (
                  <div>No expiration configured</div>
                ) : null}
                {ann.author && (
                  <div>By: {ann.author.full_name}</div>
                )}
              </div>

              <div className="actions-row wrap" style={{ paddingTop: '1rem', borderTop: '1px solid var(--border)', gap: '0.5rem' }}>
                <button className="btn small" onClick={() => setEditing(ann)}>Edit</button>
                {lifecycle === 'DRAFT' && (
                  <button
                    type="button"
                    className="btn small primary"
                    disabled={busyId === ann.id}
                    onClick={() => void publishNow(ann)}
                  >
                    Publish Now
                  </button>
                )}
                {(lifecycle === 'SCHEDULED' || lifecycle === 'FAILED') && (
                  <ConfirmButton
                    className="small"
                    confirmLabel="Move back to Draft?"
                    onConfirm={() => void unscheduleToDraft(ann)}
                    disabled={busyId === ann.id}
                  >
                    Unschedule to Draft
                  </ConfirmButton>
                )}
                {lifecycle === 'FAILED' && (
                  <button
                    type="button"
                    className="btn small primary"
                    disabled={busyId === ann.id}
                    onClick={() => void retryPublish(ann)}
                  >
                    Retry Publish
                  </button>
                )}
                {lifecycle === 'PUBLISHED' && (
                  <ConfirmButton
                    className="small"
                    confirmLabel="Archive announcement?"
                    onConfirm={() => void archiveAnnouncement(ann)}
                    disabled={busyId === ann.id}
                  >
                    Archive
                  </ConfirmButton>
                )}
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
          ))}
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
