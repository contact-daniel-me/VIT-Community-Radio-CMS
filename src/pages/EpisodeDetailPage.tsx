import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import {
  Banner,
  ConfirmButton,
  Empty,
  EpisodeStatusBadge,
  Loading,
  PageHeader,
} from '@/components/ui';
import { AudioPlayer } from '@/components/AudioPlayer';
import { DeleteEpisodeDialog } from '@/components/DeleteEpisodeDialog';
import { episodeService } from '@/services/episodeService';
import { audioService } from '@/services/audioService';
import { qcService } from '@/services/qcService';
import { userService } from '@/services/userService';
import { can } from '@/lib/permissions';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatDuration, formatFileSize } from '@/utils/datetime';

export function EpisodeDetailPage() {
  const { episodeId = '' } = useParams();
  const profile = useCurrentUser();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const episode = useAsync(() => episodeService.getEpisode(episodeId), [episodeId]);
  const reviews = useAsync(() => qcService.getReviewHistory(episodeId), [episodeId]);
  const rjs = useAsync(() => userService.getActiveUsersByRole('RJ'), []);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [showReject, setShowReject] = useState(false);

  const [draft, setDraft] = useState<{
    title: string;
    description: string;
    host_name: string;
    episode_number: string;
    assigned_rj: string;
  } | null>(null);

  if (episode.loading) return <Loading />;
  if (episode.error) return <Banner>{episode.error}</Banner>;
  if (!episode.data) return <Banner>That episode does not exist.</Banner>;

  const ep = episode.data;
  const editable = can.editEpisode(profile.role, ep, profile.id);
  // Only an administrator, and only for something that never reached the air.
  // The database refuses the rest regardless of what is drawn here.
  const deletable =
    profile.role === 'ADMIN' && (ep.status === 'DRAFT' || ep.status === 'REJECTED');
  const isReviewer = can.reviewQC(profile.role);
  const needsAudio = ep.program?.requires_audio ?? true;

  const refresh = async () => {
    await Promise.all([episode.reload(), reviews.reload()]);
  };

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(successMessage);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setError(null);
    setDraft({
      title: ep.title,
      description: ep.description ?? '',
      host_name: ep.host_name ?? '',
      episode_number: ep.episode_number ? String(ep.episode_number) : '',
      assigned_rj: ep.assigned_rj ?? '',
    });
  };

  const saveDraft = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    await run(
      () =>
        episodeService.updateEpisode(ep.id, {
          title: draft.title.trim(),
          description: draft.description || null,
          host_name: draft.host_name || null,
          episode_number: draft.episode_number ? Number(draft.episode_number) : null,
          assigned_rj: draft.assigned_rj || null,
        }),
      'Episode saved.',
    );
    setDraft(null);
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      await audioService.replaceAudio(ep.id, file, profile.id, ep.audio_file_id);
      setNotice(`Uploaded ${file.name}.`);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const latestRejection = (reviews.data ?? []).find((r) => r.decision === 'REJECTED');

  return (
    <>
      <PageHeader
        title={ep.title}
        description={`${ep.program?.name ?? 'Unknown program'}${
          ep.episode_number ? ` · Episode ${ep.episode_number}` : ''
        }`}
        actions={
          <>
            <EpisodeStatusBadge status={ep.status} />
            <button type="button" className="small" onClick={() => navigate('/admin/episodes')}>
              Back to episodes
            </button>
          </>
        }
      />

      <Banner>{error}</Banner>
      <Banner kind="success">{notice}</Banner>

      {ep.status === 'REJECTED' && latestRejection && (
        <Banner kind="info">
          <strong>QC rejected this episode.</strong> {latestRejection.comment}
          {editable
            ? ' Make the changes, then submit it again.'
            : ' A producer can reopen it for editing.'}
        </Banner>
      )}

      <div className="grid grid-main-side">
        <div>
          <section className="card">
            <div className="card-title">
              <h2>Details</h2>
              {editable && !draft && (
                <button type="button" className="small" onClick={startEditing}>
                  Edit
                </button>
              )}
            </div>

            {draft ? (
              <form onSubmit={saveDraft}>
                <div className="form-grid cols-2">
                  <div className="span-2">
                    <label htmlFor="d-title">Title</label>
                    <input
                      id="d-title"
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      required
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <label htmlFor="d-number">Episode number</label>
                    <input
                      id="d-number"
                      type="number"
                      min={1}
                      value={draft.episode_number}
                      onChange={(e) => setDraft({ ...draft, episode_number: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="d-host">Host</label>
                    <input
                      id="d-host"
                      value={draft.host_name}
                      onChange={(e) => setDraft({ ...draft, host_name: e.target.value })}
                      maxLength={120}
                    />
                  </div>
                  {profile.role !== 'RJ' && (
                    <div className="span-2">
                      <label htmlFor="d-rj">Assigned RJ</label>
                      <select
                        id="d-rj"
                        value={draft.assigned_rj}
                        onChange={(e) => setDraft({ ...draft, assigned_rj: e.target.value })}
                      >
                        <option value="">Nobody</option>
                        {(rjs.data ?? []).map((rj) => (
                          <option key={rj.id} value={rj.id}>
                            {rj.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="span-2">
                    <label htmlFor="d-desc">Description</label>
                    <textarea
                      id="d-desc"
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      maxLength={4000}
                    />
                  </div>
                </div>
                <div className="actions-row">
                  <button type="submit" className="primary" disabled={busy}>
                    Save changes
                  </button>
                  <button type="button" onClick={() => setDraft(null)} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="stack">
                <p style={{ margin: 0 }}>
                  {ep.description || <span className="muted">No description yet.</span>}
                </p>
                <p className="small muted" style={{ margin: 0 }}>
                  Host: {ep.host_name ?? '--'} &middot; Assigned RJ:{' '}
                  {ep.assignee?.full_name ?? 'nobody'} &middot; Created by{' '}
                  {ep.author?.full_name ?? 'unknown'} on {formatDateTime(ep.created_at)}
                </p>
                {!editable && ep.status !== 'DRAFT' && ep.status !== 'REJECTED' && (
                  <p className="small muted" style={{ margin: 0 }}>
                    Content is locked while the episode is {ep.status.replace('_', ' ')}.
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-title">
              <h2>Audio</h2>
              {ep.audio_file && (
                <span className="small muted">
                  {formatDuration(ep.audio_file.duration_seconds)} &middot;{' '}
                  {formatFileSize(ep.audio_file.file_size)}
                </span>
              )}
            </div>

            {ep.audio_file ? (
              <>
                <p className="small" style={{ margin: 0 }}>
                  {ep.audio_file.file_name}
                </p>
                <AudioPlayer storagePath={ep.audio_file.storage_path} />
              </>
            ) : (
              <Empty>
                {needsAudio
                  ? 'No audio yet. This program requires audio before QC.'
                  : 'No audio. This program allows live slots without a file.'}
              </Empty>
            )}

            {editable && (
              <div className="actions-row">
                <input
                  ref={fileInput}
                  type="file"
                  accept="audio/mpeg,.mp3"
                  disabled={uploading}
                  onChange={(e) => void onUpload(e.target.files?.[0])}
                  aria-label="Upload audio file"
                />
                {uploading && <span className="small muted">Uploading...</span>}
                {ep.audio_file && !uploading && (
                  <ConfirmButton
                    className="small"
                    confirmLabel="Delete audio?"
                    onConfirm={() =>
                      void run(
                        () => audioService.deleteAudio(ep.audio_file!.id),
                        'Audio removed.',
                      )
                    }
                  >
                    Remove audio
                  </ConfirmButton>
                )}
              </div>
            )}
            <p className="small muted" style={{ marginTop: '0.5rem' }}>
              MP3 only, up to 200 MB. Uploading again replaces the current file.
            </p>
          </section>

          {isReviewer && ep.status === 'PENDING_QC' && (
            <section className="card">
              <h2>QC review</h2>
              <p className="small muted">
                Listen to the audio above, then approve it for scheduling or send it back with a
                reason.
              </p>
              <div className="actions-row">
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void run(() => qcService.approveEpisode(ep.id), 'Episode approved.')
                  }
                >
                  Approve
                </button>
                <button type="button" disabled={busy} onClick={() => setShowReject(!showReject)}>
                  Reject
                </button>
              </div>

              {showReject && (
                <div style={{ marginTop: '0.75rem' }}>
                  <label htmlFor="reject-comment">
                    What needs fixing? <span className="hint">(required)</span>
                  </label>
                  <textarea
                    id="reject-comment"
                    value={rejectComment}
                    onChange={(e) => setRejectComment(e.target.value)}
                    placeholder="e.g. Background hum from 04:12, and the guest name is mispronounced."
                  />
                  <div className="actions-row">
                    <button
                      type="button"
                      className="danger"
                      disabled={busy || rejectComment.trim().length < 5}
                      onClick={() =>
                        void run(async () => {
                          await qcService.rejectEpisode(ep.id, rejectComment);
                          setShowReject(false);
                          setRejectComment('');
                        }, 'Episode sent back for changes.')
                      }
                    >
                      Confirm rejection
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <div>
          <section className="card">
            <h2>Workflow</h2>
            <div className="stack small">
              <div>
                Status: <EpisodeStatusBadge status={ep.status} />
              </div>
              <div className="muted">Submitted: {formatDateTime(ep.submitted_at)}</div>
              <div className="muted">Reviewed: {formatDateTime(ep.reviewed_at)}</div>
            </div>

            <div className="actions-row">
              {editable && can.submitEpisode(profile.role, ep, profile.id) && (
                <button
                  type="button"
                  className="primary"
                  disabled={busy || (needsAudio && !ep.audio_file_id)}
                  onClick={() =>
                    void run(() => episodeService.submitForQC(ep.id), 'Sent to the QC queue.')
                  }
                >
                  Submit for QC
                </button>
              )}

              {(ep.status === 'REJECTED' || ep.status === 'APPROVED') &&
                (can.manageProgram(profile.role) ||
                  (profile.role === 'RJ' && ep.status === 'REJECTED')) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => episodeService.reopenEpisode(ep.id),
                        'Episode reopened as a draft.',
                      )
                    }
                  >
                    Reopen for editing
                  </button>
                )}

              {can.archiveEpisode(profile.role) && ep.status !== 'ARCHIVED' && (
                <ConfirmButton
                  className="small"
                  confirmLabel="Archive it?"
                  disabled={busy}
                  onConfirm={() =>
                    void run(() => episodeService.archiveEpisode(ep.id), 'Episode archived.')
                  }
                >
                  Archive
                </ConfirmButton>
              )}

              {deletable && (
                <button
                  type="button"
                  className="small danger-action"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </button>
              )}
            </div>

            {needsAudio && !ep.audio_file_id && editable && (
              <p className="small muted" style={{ marginTop: '0.5rem' }}>
                Upload the audio before submitting for QC.
              </p>
            )}
          </section>

          <section className="card">
            <h2>QC history</h2>
            {reviews.loading ? (
              <Loading />
            ) : (reviews.data ?? []).length === 0 ? (
              <Empty>Not reviewed yet.</Empty>
            ) : (
              <div className="stack">
                {(reviews.data ?? []).map((review) => (
                  <div key={review.id} className="list-item small">
                    <span
                      className={`badge ${
                        review.decision === 'APPROVED' ? 'badge-green' : 'badge-red'
                      }`}
                    >
                      {review.decision === 'APPROVED' ? 'Approved' : 'Rejected'}
                    </span>{' '}
                    <span className="muted">
                      {review.reviewer?.full_name ?? 'QC'} &middot;{' '}
                      {formatDateTime(review.created_at)}
                    </span>
                    {review.comment && <p style={{ margin: '0.3rem 0 0' }}>{review.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {ep.status === 'APPROVED' && can.schedule(profile.role) && (
            <section className="card">
              <h2>Ready to schedule</h2>
              <p className="small muted">
                This episode is cleared by QC. Book a slot from the{' '}
                <Link to="/schedule">Schedule</Link> page.
              </p>
            </section>
          )}
        </div>
      </div>

      {confirmDelete && (
        <DeleteEpisodeDialog
          episode={ep}
          onClose={() => setConfirmDelete(false)}
          onDeleted={(title) => {
            setConfirmDelete(false);
            // The episode this page is about no longer exists, so there is
            // nothing to reload -- go back to the list and say what happened.
            navigate('/admin/episodes', {
              replace: true,
              state: { notice: `"${title}" was deleted.` },
            });
          }}
        />
      )}
    </>
  );
}
