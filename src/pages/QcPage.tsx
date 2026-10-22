import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { Banner, Empty, UnifiedStatusBadge, Loading, PageHeader } from '@/components/ui';
import { AudioPlayer } from '@/components/AudioPlayer';
import { qcService } from '@/services/qcService';
import { episodeService, type EpisodeWithRelations } from '@/services/episodeService';
import { can } from '@/lib/permissions';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatDuration } from '@/utils/datetime';

type QcTab = 'pending' | 'done';

export function QcPage() {
  const profile = useCurrentUser();
  const reviewer = can.reviewQC(profile.role);

  const [tab, setTab] = useState<QcTab>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Reviewer queries: QC Pending and QC Done
  const pendingQueue = useAsync(() => (reviewer ? qcService.getPendingQC() : Promise.resolve([])), [reviewer]);
  const completedQueue = useAsync(() => (reviewer ? qcService.getCompletedQC() : Promise.resolve([])), [reviewer]);

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

  const filteredPending = filterList(pendingQueue.data ?? []);
  const filteredCompleted = filterList(completedQueue.data ?? []);

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
    try {
      if (decision === 'APPROVE') {
        await qcService.approveEpisode(episodeId, comment);
        setNotice('Approved. The episode can now be scheduled for broadcast.');
      } else {
        await qcService.rejectEpisode(episodeId, comment);
        setNotice('Sent back to the producer with your review notes.');
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
          <span className="tab-count">{filteredCompleted.length}</span>
        </button>
      </div>

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
              : 'No episodes have completed QC review yet.'}
          </Empty>
        </section>
      ) : (
        filteredCompleted.map((episode) => (
          <section key={episode.id} className="card">
            <div className="card-title">
              <div>
                <div className="row align-center wrap" style={{ gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <h2 style={{ margin: 0 }}>
                    <Link to={`/admin/episodes/${episode.id}`}>{episode.title}</Link>
                  </h2>
                  <UnifiedStatusBadge episode={episode} />
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  {episode.program?.name} &middot; Host{' '}
                  {episode.host_name ?? episode.assignee?.full_name ?? '--'} &middot; Reviewed{' '}
                  {formatDateTime(episode.reviewed_at ?? episode.updated_at)} &middot;{' '}
                  {formatDuration(episode.final_audio_file?.duration_seconds)}
                </p>
              </div>
              <Link to={`/admin/episodes/${episode.id}`} className="button small secondary">
                View episode
              </Link>
            </div>

            {episode.description && <p className="small">{episode.description}</p>}
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
        ))
      )}
    </>
  );
}
