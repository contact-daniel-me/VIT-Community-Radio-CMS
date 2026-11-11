import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { useScheduledTransitionRefresh } from '@/hooks/useScheduledTransitionRefresh';
import { useSuccessFeedback } from '@/hooks/useSuccessFeedback';
import { Banner, ConfirmButton, Empty, Loading, PageHeader, PublishStatusBadge, UnifiedStatusBadge } from '@/components/ui';
import { AudioPlayer } from '@/components/AudioPlayer';
import { HomepageScheduleDialog } from '@/components/studio/HomepageScheduleDialog';
import { qcService, type EpisodeWithLifecycle, type BroadcastLifecycleStatus } from '@/services/qcService';
import { episodeService, type EpisodeWithRelations } from '@/services/episodeService';
import { mixotaService } from '@/services/mixotaService';
import { can } from '@/lib/permissions';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatDuration, formatTime } from '@/utils/datetime';

type QcTab = 'pending' | 'done';
type LifecycleFilter = 'ALL' | BroadcastLifecycleStatus;

export function QcPage() {
  const profile = useCurrentUser();
  const reviewer = can.reviewQC(profile.role);

  const [tab, setTab] = useState<QcTab>('pending');
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [scheduleEpisode, setScheduleEpisode] = useState<EpisodeWithLifecycle | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { notifyApproval, notifySave } = useSuccessFeedback();

  // Reviewer queries: QC Pending and QC Done
  const pendingQueue = useAsync(() => (reviewer ? qcService.getPendingQC() : Promise.resolve([])), [reviewer]);
  const completedQueue = useAsync(() => (reviewer ? qcService.getCompletedQC() : Promise.resolve([])), [reviewer]);

  // Keep queue synced automatically when admin switches back to QC page after scheduling in another tab or page
  useEffect(() => {
    const handleSync = () => {
      if (document.visibilityState === 'visible') {
        void Promise.all([pendingQueue.reload(), completedQueue.reload()]);
      }
    };
    document.addEventListener('visibilitychange', handleSync);
    window.addEventListener('focus', handleSync);
    return () => {
      document.removeEventListener('visibilitychange', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, [pendingQueue, completedQueue]);

  // Non-reviewer query: their own submissions
  const mine = useAsync(
    () =>
      reviewer
        ? Promise.resolve([])
        : episodeService.getEpisodes({
            mineOnly: profile.id,
            status: ['PENDING_QC', 'REJECTED', 'APPROVED'],
          }),
    [reviewer, profile.id],
  );

  const filterList = (list: EpisodeWithRelations[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (ep) =>
        (ep.title || '').toLowerCase().includes(q) ||
        (ep.program?.name || '').toLowerCase().includes(q) ||
        (ep.host_name || '').toLowerCase().includes(q) ||
        (ep.assignee?.full_name || '').toLowerCase().includes(q) ||
        (ep.episode_id || '').toLowerCase().includes(q),
    );
  };

  const completedEpisodes: EpisodeWithLifecycle[] = completedQueue.data ?? [];
  const lifecycleCounts = qcService.getLifecycleCounts(completedEpisodes);

  useScheduledTransitionRefresh(
    completedEpisodes.flatMap((ep) => [
      ep.homepageScheduledAt ?? ep.scheduled_at ?? ep.homepage_publish_at,
      ep.homepageExpiresAt ?? ep.expires_at ?? ep.homepage_expires_at,
      ep.activeSchedule?.start_time,
      ep.activeSchedule?.end_time,
    ]),
    () => {
      void completedQueue.reload();
    },
  );

  const filterCompletedList = (list: EpisodeWithLifecycle[]) => {
    let result = list;
    if (lifecycleFilter !== 'ALL') {
      result = result.filter((ep) => ep.lifecycleStatus === lifecycleFilter);
    }
    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(
      (ep) =>
        (ep.title || '').toLowerCase().includes(q) ||
        (ep.program?.name || '').toLowerCase().includes(q) ||
        (ep.host_name || '').toLowerCase().includes(q) ||
        (ep.assignee?.full_name || '').toLowerCase().includes(q) ||
        (ep.episode_id || '').toLowerCase().includes(q),
    );
  };

  const filteredPending = filterList(pendingQueue.data ?? []);
  const filteredCompleted = filterCompletedList(completedEpisodes);

  // For non-reviewers
  const minePending = filterList(
    (mine.data ?? []).filter((e) => e.status === 'PENDING_QC' || e.status === 'REJECTED'),
  );
  const mineDone = filterList(
    (mine.data ?? []).filter((e) => e.status === 'APPROVED'),
  );

  const decide = async (episodeId: string, decision: 'APPROVE' | 'REJECT') => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const target = (pendingQueue.data ?? []).find((ep) => ep.id === episodeId);
    try {
      if (decision === 'APPROVE') {
        await qcService.approveEpisode(episodeId, comment);
        setNotice('Approved. The episode is in Draft ready to be scheduled or published.');
        notifyApproval({
          title: 'Episode approved',
          detail: target?.title,
          dedupeKey: `approve-episode:${episodeId}`,
        });
      } else {
        await qcService.rejectEpisode(episodeId, comment);
        setNotice('Sent back to the producer with your review notes.');
        notifySave({
          title: 'Episode sent back for changes',
          detail: target?.title,
          dedupeKey: `reject-episode:${episodeId}`,
        });
      }
      setComment('');
      setOpenId(null);
      await Promise.all([pendingQueue.reload(), completedQueue.reload()]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleLifecycleAction = async (
    episodeId: string,
    action: 'unschedule' | 'retry' | 'archive',
    title: string,
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (action === 'unschedule') {
        await episodeService.unscheduleHomepageEpisode(episodeId);
        setNotice(`"${title}" moved back to Draft.`);
        notifySave({ title: 'Moved to Draft', detail: title, dedupeKey: `qc-unschedule:${episodeId}` });
      } else if (action === 'retry') {
        await episodeService.retryPublish(episodeId);
        setNotice(`"${title}" queued for publication retry.`);
        notifySave({ title: 'Publication retry queued', detail: title, dedupeKey: `qc-retry:${episodeId}` });
      } else {
        await episodeService.archiveEpisode(episodeId);
        setNotice(`"${title}" archived.`);
        notifySave({ title: 'Episode archived', detail: title, dedupeKey: `qc-archive:${episodeId}` });
      }
      await completedQueue.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  // Non-reviewers get a read-only view of where their own content stands, organized into tabs.
  if (!reviewer) {
    return (
      <>
        <PageHeader
          title="QC Status"
          description="Track the quality check status of your submitted episodes."
          actions={
            <input
              type="search"
              placeholder="Search by title or program..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          }
        />

        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pending'}
            className={`tab ${tab === 'pending' ? 'is-active' : ''}`}
            onClick={() => setTab('pending')}
          >
            QC Pending
            <span className="tab-count">{minePending.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'done'}
            className={`tab ${tab === 'done' ? 'is-active' : ''}`}
            onClick={() => setTab('done')}
          >
            QC Done
            <span className="tab-count">{mineDone.length}</span>
          </button>
        </div>

        <section className="card">
          {mine.loading ? (
            <Loading label="Loading QC status..." />
          ) : tab === 'pending' ? (
            minePending.length === 0 ? (
              <Empty>
                {searchQuery.trim()
                  ? `No pending episodes match "${searchQuery.trim()}".`
                  : 'You have nothing in the QC pipeline.'}
              </Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Episode</th>
                      <th>Program</th>
                      <th>Submitted</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {minePending.map((episode) => (
                      <tr key={episode.id}>
                        <td>
                          <Link to={`/admin/episodes/${episode.id}`}>{episode.title}</Link>
                        </td>
                        <td>{episode.program?.name}</td>
                        <td className="small muted">{formatDateTime(episode.submitted_at)}</td>
                        <td>
                          <UnifiedStatusBadge episode={episode} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : mineDone.length === 0 ? (
            <Empty>
              {searchQuery.trim()
                ? `No completed QC episodes match "${searchQuery.trim()}".`
                : 'No episodes have completed QC yet.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Episode</th>
                    <th>Program</th>
                    <th>Reviewed</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mineDone.map((episode) => (
                    <tr key={episode.id}>
                      <td>
                        <Link to={`/admin/episodes/${episode.id}`}>{episode.title}</Link>
                      </td>
                      <td>{episode.program?.name}</td>
                      <td className="small muted">
                        {formatDateTime(episode.reviewed_at ?? episode.updated_at)}
                      </td>
                      <td>
                        <UnifiedStatusBadge episode={episode} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    );
  }

  // Reviewer View with QC Pending and QC Done tabs
  return (
    <>
      <PageHeader
        title="Quality Control"
        description="Review audio submissions for broadcast, and view approved episodes that completed QC."
        actions={
          <div className="row align-center wrap" style={{ gap: '0.5rem' }}>
            <input
              type="search"
              placeholder="Search by title or program..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="button"
              className="small secondary"
              title="Refresh QC queue"
              disabled={pendingQueue.loading || completedQueue.loading}
              onClick={() => void Promise.all([pendingQueue.reload(), completedQueue.reload()])}
            >
              {pendingQueue.loading || completedQueue.loading ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>
        }
      />

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pending'}
          className={`tab ${tab === 'pending' ? 'is-active' : ''}`}
          onClick={() => setTab('pending')}
        >
          QC Pending
          <span className="tab-count">{filteredPending.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'done'}
          className={`tab ${tab === 'done' ? 'is-active' : ''}`}
          onClick={() => setTab('done')}
        >
          QC Done
          <span className="tab-count">{completedEpisodes.length}</span>
        </button>
      </div>

      {tab === 'done' && (
        <div className="tabs-nav-wrap" style={{ marginTop: '0.75rem', marginBottom: '1.25rem' }}>
          <div className="tabs" role="tablist" aria-label="Broadcast Lifecycle filters" style={{ margin: 0 }}>
            <button
              type="button"
              role="tab"
              aria-selected={lifecycleFilter === 'ALL'}
              className={`tab ${lifecycleFilter === 'ALL' ? 'is-active' : ''}`}
              onClick={() => setLifecycleFilter('ALL')}
            >
              All Done
              <span className="tab-count">{lifecycleCounts.all}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lifecycleFilter === 'DRAFT'}
              className={`tab ${lifecycleFilter === 'DRAFT' ? 'is-active' : ''}`}
              onClick={() => setLifecycleFilter('DRAFT')}
            >
              Draft
              <span className="tab-count">{lifecycleCounts.draft}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lifecycleFilter === 'SCHEDULED'}
              className={`tab ${lifecycleFilter === 'SCHEDULED' ? 'is-active' : ''}`}
              onClick={() => setLifecycleFilter('SCHEDULED')}
            >
              Scheduled
              <span className="tab-count">{lifecycleCounts.scheduled}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lifecycleFilter === 'PUBLISHED'}
              className={`tab ${lifecycleFilter === 'PUBLISHED' ? 'is-active' : ''}`}
              onClick={() => setLifecycleFilter('PUBLISHED')}
            >
              Published
              <span className="tab-count">{lifecycleCounts.published}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lifecycleFilter === 'EXPIRED'}
              className={`tab ${lifecycleFilter === 'EXPIRED' ? 'is-active' : ''}`}
              onClick={() => setLifecycleFilter('EXPIRED')}
            >
              Expired
              <span className="tab-count">{lifecycleCounts.expired}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={lifecycleFilter === 'FAILED'}
              className={`tab ${lifecycleFilter === 'FAILED' ? 'is-active' : ''}`}
              onClick={() => setLifecycleFilter('FAILED')}
            >
              Failed
              <span className="tab-count">{lifecycleCounts.failed}</span>
            </button>
          </div>
        </div>
      )}

      <Banner>{error}</Banner>
      <Banner kind="success">{notice}</Banner>

      {tab === 'pending' ? (
        pendingQueue.loading ? (
          <Loading label="Loading pending QC submissions..." />
        ) : pendingQueue.error ? (
          <Banner>{pendingQueue.error}</Banner>
        ) : filteredPending.length === 0 ? (
          <section className="card">
            <Empty>
              {searchQuery.trim()
                ? `No pending QC files match "${searchQuery.trim()}".`
                : 'Nothing waiting for review. Good work.'}
            </Empty>
          </section>
        ) : (
          filteredPending.map((episode) => {
            const open = openId === episode.id;
            return (
              <section key={episode.id} className="card">
                <div className="card-title">
                  <div>
                    <h2 style={{ marginBottom: '0.15rem' }}>
                      <Link to={`/admin/episodes/${episode.id}`}>{episode.title}</Link>
                    </h2>
                    <p className="small muted" style={{ margin: 0 }}>
                      {episode.program?.name} &middot; Host{' '}
                      {episode.host_name ?? episode.assignee?.full_name ?? '--'} &middot; Submitted{' '}
                      {formatDateTime(episode.submitted_at)} &middot;{' '}
                      {formatDuration(episode.final_audio_file?.duration_seconds)}
                    </p>
                  </div>
                  <div className="row align-center" style={{ gap: '0.4rem' }}>
                    <button
                      type="button"
                      className="small"
                      onClick={() => {
                        setOpenId(open ? null : episode.id);
                        setComment('');
                      }}
                    >
                      {open ? 'Close' : 'Review'}
                    </button>
                    {episode.final_audio_file && (
                      <button
                        type="button"
                        className="small"
                        title="Open in Mixota Audio Editor"
                        onClick={() => {
                          void mixotaService.openInMixota({
                            recordingId: episode.final_audio_file!.id,
                            episodeId: episode.id,
                            fileName: episode.final_audio_file!.file_name,
                            title: episode.title,
                            targetField: 'final_audio_file_id',
                          });
                        }}
                      >
                        Inspect in Mixota
                      </button>
                    )}
                  </div>
                </div>

                {episode.description && <p className="small">{episode.description}</p>}
                <p className="small muted" style={{ marginTop: '0.5rem', marginBottom: '0.2rem' }}>
                  Final Audio for QC
                </p>
                <AudioPlayer
                  storagePath={episode.final_audio_file?.storage_path}
                  label={episode.final_audio_file?.file_name}
                />

                {open && (
                  <div style={{ marginTop: '0.9rem' }}>
                    <label htmlFor={`comment-${episode.id}`}>
                      Review notes{' '}
                      <span className="hint">(optional for approval; required for rejection)</span>
                    </label>
                    <textarea
                      id={`comment-${episode.id}`}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="e.g. Levels are clean, approved. / Background hum from 04:12, please re-record."
                    />
                    <div className="actions-row">
                      <button
                        type="button"
                        className="primary"
                        disabled={busy}
                        onClick={() => void decide(episode.id, 'APPROVE')}
                      >
                        {busy ? 'Approving...' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => void decide(episode.id, 'REJECT')}
                      >
                        {busy ? 'Rejecting...' : 'Reject'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            );
          })
        )
      ) : completedQueue.loading ? (
        <Loading label="Loading completed QC records..." />
      ) : completedQueue.error ? (
        <Banner>{completedQueue.error}</Banner>
      ) : filteredCompleted.length === 0 ? (
        <section className="card">
          <Empty>
            {searchQuery.trim()
              ? `No completed QC files match "${searchQuery.trim()}".`
              : lifecycleFilter === 'DRAFT'
              ? 'No QC-approved episodes are in Draft.'
              : lifecycleFilter === 'SCHEDULED'
              ? 'No QC-approved episodes are currently scheduled.'
              : lifecycleFilter === 'PUBLISHED'
              ? 'No episodes have been published yet.'
              : lifecycleFilter === 'EXPIRED'
              ? 'No published episodes have expired.'
              : lifecycleFilter === 'FAILED'
              ? 'No publication failures recorded.'
              : 'No episodes have completed QC review yet.'}
          </Empty>
        </section>
      ) : (
        filteredCompleted.map((episode, index) => {
          const isFirstOfGroup =
            lifecycleFilter === 'ALL' &&
            (index === 0 || filteredCompleted[index - 1].lifecycleStatus !== episode.lifecycleStatus);
          const canManageRelease = profile.role === 'ADMIN' || profile.role === 'PRODUCER';

          return (
            <Fragment key={episode.id}>
              {isFirstOfGroup && (
                <div
                  className="row align-center spread wrap"
                  style={{
                    marginTop: index === 0 ? '0.2rem' : '1.75rem',
                    marginBottom: '0.65rem',
                    paddingBottom: '0.35rem',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div className="row align-center" style={{ gap: '0.5rem' }}>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {episode.lifecycleStatus === 'DRAFT' && 'Draft (Ready to Schedule)'}
                      {episode.lifecycleStatus === 'SCHEDULED' && 'Scheduled for Release'}
                      {episode.lifecycleStatus === 'PUBLISHED' && 'Published'}
                      {episode.lifecycleStatus === 'EXPIRED' && 'Expired'}
                      {episode.lifecycleStatus === 'FAILED' && 'Failed Publications'}
                    </h3>
                    <PublishStatusBadge status={episode.lifecycleStatus} />
                    <span className="small muted">
                      ({filteredCompleted.filter((e) => e.lifecycleStatus === episode.lifecycleStatus).length})
                    </span>
                  </div>
                  <span className="small muted">
                    {episode.lifecycleStatus === 'DRAFT' && 'Newest reviewed first'}
                    {episode.lifecycleStatus === 'SCHEDULED' && 'Nearest upcoming release first'}
                    {episode.lifecycleStatus === 'PUBLISHED' && 'Most recently published first'}
                    {episode.lifecycleStatus === 'EXPIRED' && 'Historical expired releases'}
                    {episode.lifecycleStatus === 'FAILED' && 'Requires attention & retry'}
                  </span>
                </div>
              )}

              <section className="card">
            <div className="card-title">
              <div>
                <div className="row align-center wrap" style={{ gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <h2 style={{ margin: 0 }}>
                    <Link to={`/admin/episodes/${episode.id}`}>{episode.title}</Link>
                  </h2>
                  <UnifiedStatusBadge episode={episode} />
                  <PublishStatusBadge status={episode.lifecycleStatus} />
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  {episode.program?.name} &middot; Host{' '}
                  {episode.host_name ?? episode.assignee?.full_name ?? '--'} &middot; Reviewed{' '}
                  {formatDateTime(episode.reviewed_at ?? episode.updated_at)} &middot;{' '}
                  {formatDuration(episode.final_audio_file?.duration_seconds)}
                </p>
              </div>
              <div className="row align-center wrap" style={{ gap: '0.4rem' }}>
                {canManageRelease &&
                  (episode.lifecycleStatus === 'DRAFT' ||
                    episode.lifecycleStatus === 'SCHEDULED' ||
                    episode.lifecycleStatus === 'PUBLISHED' ||
                    episode.lifecycleStatus === 'EXPIRED') && (
                    <button
                      type="button"
                      className="small primary"
                      disabled={busy}
                      onClick={() => setScheduleEpisode(episode)}
                    >
                      {episode.lifecycleStatus === 'DRAFT'
                        ? 'Schedule / Publish'
                        : episode.lifecycleStatus === 'EXPIRED'
                          ? 'Re-publish'
                          : 'Manage Schedule'}
                    </button>
                  )}
                {canManageRelease && episode.lifecycleStatus === 'SCHEDULED' && episode.homepageScheduledAt && (
                  <ConfirmButton
                    className="small"
                    confirmLabel="Move to Draft?"
                    disabled={busy}
                    onConfirm={() => void handleLifecycleAction(episode.id, 'unschedule', episode.title)}
                  >
                    Unschedule
                  </ConfirmButton>
                )}
                {canManageRelease && episode.lifecycleStatus === 'FAILED' && (
                  <>
                    <button
                      type="button"
                      className="small primary"
                      disabled={busy}
                      onClick={() => void handleLifecycleAction(episode.id, 'retry', episode.title)}
                    >
                      Retry Publish
                    </button>
                    <ConfirmButton
                      className="small"
                      confirmLabel="Move to Draft?"
                      disabled={busy}
                      onConfirm={() => void handleLifecycleAction(episode.id, 'unschedule', episode.title)}
                    >
                      Move to Draft
                    </ConfirmButton>
                  </>
                )}
                {canManageRelease && episode.lifecycleStatus === 'PUBLISHED' && (
                  <ConfirmButton
                    className="small"
                    confirmLabel="Archive episode?"
                    disabled={busy}
                    onConfirm={() => void handleLifecycleAction(episode.id, 'archive', episode.title)}
                  >
                    Archive
                  </ConfirmButton>
                )}
                <Link to={`/admin/episodes/${episode.id}`} className="button small secondary">
                  View episode
                </Link>
              </div>
            </div>

            {episode.description && <p className="small">{episode.description}</p>}

            {/* Broadcast & Publishing Lifecycle Details */}
            {episode.lifecycleStatus === 'SCHEDULED' && (
              <div
                className="row align-center wrap small"
                style={{
                  marginTop: '0.65rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: 'var(--status-approved-badge-bg)',
                  border: '1px solid var(--status-approved-badge-border)',
                  color: 'var(--text)',
                  gap: '0.8rem',
                }}
              >
                {episode.activeSchedule && (
                  <div>
                    <strong style={{ color: 'var(--status-approved-badge-text)' }}>Broadcast Schedule:</strong>{' '}
                    {formatDate(episode.activeSchedule.start_time)} &middot;{' '}
                    {formatTime(episode.activeSchedule.start_time)} – {formatTime(episode.activeSchedule.end_time)}
                  </div>
                )}
                {episode.homepageScheduledAt && (
                  <div>
                    <strong style={{ color: 'var(--status-approved-badge-text)' }}>Scheduled Release:</strong>{' '}
                    {formatDateTime(episode.homepageScheduledAt)}
                    {episode.homepageExpiresAt && (
                      <span className="muted"> (expires {formatDateTime(episode.homepageExpiresAt)})</span>
                    )}
                  </div>
                )}
                {!episode.activeSchedule && !episode.homepageScheduledAt && (
                  <div>
                    <strong style={{ color: 'var(--status-approved-badge-text)' }}>Scheduled:</strong> Assigned for upcoming broadcast release.
                  </div>
                )}
                {(episode.program?.name || (episode.activeSchedule as any)?.program_name) && (
                  <div>
                    <strong>Program:</strong> {episode.program?.name || (episode.activeSchedule as any)?.program_name}
                  </div>
                )}
                {episode.activeSchedule?.notes && (
                  <div className="muted">
                    <em>{episode.activeSchedule.notes}</em>
                  </div>
                )}
              </div>
            )}

            {episode.lifecycleStatus === 'PUBLISHED' && (
              <div
                className="row align-center wrap small"
                style={{
                  marginTop: '0.65rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: 'var(--status-qc-done-badge-bg)',
                  border: '1px solid var(--status-qc-done-badge-border)',
                  color: 'var(--text)',
                  gap: '0.8rem',
                }}
              >
                <div>
                  <strong style={{ color: 'var(--status-qc-done-badge-text)' }}>Published:</strong>{' '}
                  {episode.publishedAt ? formatDateTime(episode.publishedAt) : 'Published'}
                  {episode.homepageExpiresAt ? (
                    <span className="muted"> (expires {formatDateTime(episode.homepageExpiresAt)})</span>
                  ) : (
                    <span className="muted"> (permanent — no expiry set)</span>
                  )}
                </div>
                {episode.program?.name && (
                  <div>
                    <strong>Program:</strong> {episode.program.name}
                  </div>
                )}
              </div>
            )}

            {episode.lifecycleStatus === 'EXPIRED' && (
              <div
                className="row align-center wrap small"
                style={{
                  marginTop: '0.65rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: 'var(--status-booked-badge-bg)',
                  border: '1px solid var(--status-booked-badge-border)',
                  color: 'var(--status-booked-badge-text)',
                  gap: '0.8rem',
                }}
              >
                <div>
                  <strong>Expired:</strong>{' '}
                  {episode.homepageExpiresAt ? formatDateTime(episode.homepageExpiresAt) : 'Configured expiry reached'}
                  {episode.publishedAt && (
                    <span className="muted"> &middot; Originally published {formatDateTime(episode.publishedAt)}</span>
                  )}
                </div>
              </div>
            )}

            {episode.lifecycleStatus === 'FAILED' && (
              <div
                className="row align-center wrap small"
                style={{
                  marginTop: '0.65rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  background: 'var(--accent-wash)',
                  border: '1px solid var(--accent-line)',
                  color: 'var(--accent)',
                  gap: '0.8rem',
                }}
              >
                <div>
                  <strong>Publication Failed:</strong> {episode.publishError ?? 'Unknown error occurred during publishing.'}
                </div>
              </div>
            )}

            {episode.lifecycleStatus === 'DRAFT' && (
              <div
                className="row spread align-center wrap small"
                style={{
                  marginTop: '0.65rem',
                  padding: '0.45rem 0.75rem',
                  borderRadius: '6px',
                  background: 'var(--status-audio-upload-badge-bg)',
                  border: '1px solid var(--status-audio-upload-badge-border)',
                  color: 'var(--status-audio-upload-badge-text)',
                  gap: '0.5rem',
                }}
              >
                <span>Draft &middot; QC approved and ready to schedule or publish</span>
                <div className="row align-center" style={{ gap: '0.75rem' }}>
                  {can.schedule(profile.role) && (
                    <Link
                      to="/schedule/edit"
                      className="small"
                      style={{ fontWeight: 600, color: 'inherit', textDecoration: 'underline' }}
                    >
                      Broadcast schedule &rarr;
                    </Link>
                  )}
                  {canManageRelease && (
                    <Link
                      to={`/admin/episodes/${episode.id}`}
                      className="small"
                      style={{ fontWeight: 600, color: 'inherit', textDecoration: 'underline' }}
                    >
                      Manage release &rarr;
                    </Link>
                  )}
                </div>
              </div>
            )}

            {episode.final_audio_file && (
              <div style={{ marginTop: '0.6rem' }}>
                <p className="small muted" style={{ marginBottom: '0.2rem' }}>
                  Approved Final Audio
                </p>
                <AudioPlayer
                  storagePath={episode.final_audio_file.storage_path}
                  label={episode.final_audio_file.file_name}
                />
              </div>
            )}
            </section>
          </Fragment>
        );
      })
    )}
    {scheduleEpisode && (
      <HomepageScheduleDialog
        episode={scheduleEpisode}
        onClose={() => setScheduleEpisode(null)}
        onSaved={(msg) => {
          setScheduleEpisode(null);
          setNotice(msg);
          void completedQueue.reload();
        }}
      />
    )}
    </>
  );
}
