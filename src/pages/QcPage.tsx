import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { Banner, Empty, UnifiedStatusBadge, Loading, PageHeader } from '@/components/ui';
import { AudioPlayer } from '@/components/AudioPlayer';
import { qcService } from '@/services/qcService';
import { episodeService } from '@/services/episodeService';
import { can } from '@/lib/permissions';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatDuration } from '@/utils/datetime';

export function QcPage() {
  const profile = useCurrentUser();
  const reviewer = can.reviewQC(profile.role);

  const queue = useAsync(() => qcService.getPendingQC(), []);
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

  const [openId, setOpenId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredQueue = (queue.data ?? []).filter(ep => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (ep.title || '').toLowerCase().includes(q) || (ep.program?.name || '').toLowerCase().includes(q);
  });

  const filteredMine = (mine.data ?? []).filter(ep => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (ep.title || '').toLowerCase().includes(q) || (ep.program?.name || '').toLowerCase().includes(q);
  });

  const decide = async (episodeId: string, decision: 'APPROVE' | 'REJECT') => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (decision === 'APPROVE') {
        await qcService.approveEpisode(episodeId, comment);
        setNotice('Approved. The episode can now be scheduled.');
      } else {
        await qcService.rejectEpisode(episodeId, comment);
        setNotice('Sent back to the producer with your notes.');
      }
      setComment('');
      setOpenId(null);
      await queue.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  // Non-reviewers get a read-only view of where their own content stands.
  if (!reviewer) {
    return (
      <>
        <PageHeader 
          title="QC status" 
          description="Where your submitted episodes stand." 
          actions={
            <input 
              type="search" 
              placeholder="Search by title or program..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          }
        />
        <section className="card">
          {mine.loading ? (
            <Loading />
          ) : (mine.data ?? []).length === 0 ? (
            <Empty>You have nothing in the QC pipeline.</Empty>
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
                  {filteredMine.map((episode) => (
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
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="QC queue"
        description="Oldest submission first. Approve for air, or reject with a reason the producer can act on."
        actions={
          <input 
            type="search" 
            placeholder="Search by title or program..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        }
      />

      <Banner>{error}</Banner>
      <Banner kind="success">{notice}</Banner>

      {queue.loading ? (
        <Loading />
      ) : queue.error ? (
        <Banner>{queue.error}</Banner>
      ) : filteredQueue.length === 0 ? (
        <section className="card">
          <Empty>{searchQuery ? 'No results found.' : 'Nothing waiting for review. Good work.'}</Empty>
        </section>
      ) : (
        filteredQueue.map((episode) => {
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
              <p className="small muted" style={{ marginTop: '0.5rem', marginBottom: '0.2rem' }}>Final Audio for QC</p>
              <AudioPlayer storagePath={episode.final_audio_file?.storage_path} />

              {open && (
                <div style={{ marginTop: '0.9rem' }}>
                  <label htmlFor={`comment-${episode.id}`}>
                    Review notes{' '}
                    <span className="hint">(optional)</span>
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
                      Approve
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={busy}
                      onClick={() => void decide(episode.id, 'REJECT')}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}
    </>
  );
}
