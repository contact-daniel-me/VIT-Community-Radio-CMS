import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { useScheduledTransitionRefresh } from '@/hooks/useScheduledTransitionRefresh';
import { useSuccessFeedback } from '@/hooks/useSuccessFeedback';
import {
  Banner,
  ConfirmButton,
  Empty,
  Loading,
  PageHeader,
  PublishStatusBadge,
  UnifiedStatusBadge,
} from '@/components/ui';
import { AudioPlayer } from '@/components/AudioPlayer';
import { DeleteEpisodeDialog } from '@/components/DeleteEpisodeDialog';
import { HomepageScheduleDialog } from '@/components/studio/HomepageScheduleDialog';
import { episodeService } from '@/services/episodeService';
import { audioService } from '@/services/audioService';
import { mixotaService } from '@/services/mixotaService';
import { qcService, resolveEpisodePublishStatus } from '@/services/qcService';
import { userService } from '@/services/userService';
import { can } from '@/lib/permissions';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatDuration, formatFileSize } from '@/utils/datetime';
import { downloadSingleFile } from '@/utils/download';

export function EpisodeDetailPage() {
  const { episodeId = '' } = useParams();
  const profile = useCurrentUser();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showHomepageSchedule, setShowHomepageSchedule] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const episode = useAsync(async () => {
    await episodeService.syncContentLifecycle();
    return episodeService.getEpisode(episodeId);
  }, [episodeId]);
  const reviews = useAsync(() => qcService.getReviewHistory(episodeId), [episodeId]);
  const epSchedules = useAsync(
    () => (episodeId ? episodeService.getEpisodeScheduleSummaries([episodeId]) : Promise.resolve(new Map())),
    [episodeId],
  );
  const rjs = useAsync(() => userService.getActiveUsersByRole('RJ'), []);

  useScheduledTransitionRefresh(
    [
      episode.data?.scheduled_at ?? episode.data?.homepage_publish_at,
      episode.data?.expires_at ?? episode.data?.homepage_expires_at,
    ],
    () => {
      void Promise.all([episode.reload(), epSchedules.reload()]);
    },
  );

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [finalFile, setFinalFile] = useState<File | null>(null);
  const finalFileInput = useRef<HTMLInputElement>(null);
  const { celebratePublish, notifyUpload, notifyApproval, notifySave } = useSuccessFeedback();

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
  // Administrators can delete any episode, regardless of status.
  const deletable = profile.role === 'ADMIN';
  const isReviewer = can.reviewQC(profile.role);
  const needsAudio = ep.program?.requires_audio ?? true;
  const canAdminForceUpload = can.adminForceUploadAudio(profile.role);

  const refresh = async () => {
    await Promise.all([episode.reload(), reviews.reload()]);
  };

  const run = async (
    action: () => Promise<unknown>,
    successMessage: string,
    feedbackKind: 'save' | 'approval' = 'save',
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(successMessage);
      if (feedbackKind === 'approval') {
        notifyApproval({
          title: 'Episode approved',
          detail: ep.title,
          dedupeKey: `approve-episode:${ep.id}`,
        });
      } else {
        notifySave({
          title: successMessage,
          dedupeKey: `episode-save:${ep.id}:${successMessage}`,
        });
      }
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const publishEpisodeNow = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await episodeService.scheduleHomepageEpisode(
        ep.id,
        true,
        new Date().toISOString(),
        null,
      );
      if (resolveEpisodePublishStatus(saved) === 'PUBLISHED') {
        celebratePublish({
          showName: saved.title || ep.title,
          programName: ep.program?.name,
          dedupeKey: `publish-episode:${ep.id}`,
        });
        setNotice(`Your show is live! "${saved.title || ep.title}" is now published.`);
      } else {
        notifySave({
          title: `"${ep.title}" release updated.`,
          dedupeKey: `publish-episode-save:${ep.id}`,
        });
        setNotice(`"${ep.title}" release updated.`);
      }
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

  const onUpload = async () => {
    if (!rawFile) return;
    const newShowName = rawFile.name.replace(/\.[^/.]+$/, '').trim();
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setNotice(null);
    try {
      const uploaded = await audioService.replaceAudio(
        ep.id,
        rawFile,
        profile.id,
        ep.audio_file_id,
        'audio_file_id',
        (p) => setUploadProgress(p.percent),
      );
      if (draft && newShowName) {
        setDraft({ ...draft, title: newShowName });
      }
      setNotice(`Uploaded raw audio "${rawFile.name}". Show name updated to "${newShowName}".`);
      notifyUpload({
        title: 'Raw audio uploaded',
        detail: newShowName || rawFile.name,
        dedupeKey: `upload-raw:${uploaded.id}`,
      });
      setRawFile(null);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const onFinalUpload = async () => {
    if (!finalFile) return;
    const newShowName = finalFile.name.replace(/\.[^/.]+$/, '').trim();
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    setNotice(null);
    try {
      const uploaded = await audioService.replaceAudio(
        ep.id,
        finalFile,
        profile.id,
        ep.final_audio_file_id,
        'final_audio_file_id',
        (p) => setUploadProgress(p.percent),
      );
      if (draft && newShowName) {
        setDraft({ ...draft, title: newShowName });
      }
      setNotice(`Uploaded final audio "${finalFile.name}". Show name updated to "${newShowName}".`);
      notifyUpload({
        title: 'Final audio uploaded',
        detail: newShowName || finalFile.name,
        dedupeKey: `upload-final:${uploaded.id}`,
      });
      setFinalFile(null);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (finalFileInput.current) finalFileInput.current.value = '';
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
          <div className="row align-center" style={{ gap: '0.75rem' }}>
            <span style={{ fontFamily: 'monospace', opacity: 0.8, fontSize: '0.9em', letterSpacing: '0.5px', background: 'var(--surface-sunken)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
              {ep.episode_id}
            </span>
            <UnifiedStatusBadge episode={ep} />
            <button type="button" className="small" onClick={() => navigate('/admin/episodes')}>
              Back to episodes
            </button>
          </div>
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
              <h2>Audio Files</h2>
            </div>

            <div className="stack" style={{ gap: '1.5rem' }}>
              <div>
                <h3 className="row" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span className="badge badge-orange">{isReviewer ? 'Raw Audio — Reference Only' : 'Raw Audio'}</span>
                  {ep.audio_file && !ep.audio_file.deleted_at && (
                    <span className="small muted font-normal">
                      {formatDuration(ep.audio_file.duration_seconds)} &middot; {formatFileSize(ep.audio_file.file_size)}
                    </span>
                  )}
                  {ep.raw_file_delete_at && (!ep.audio_file || !ep.audio_file.deleted_at) && (
                    <span className="badge badge-amber" style={{ marginLeft: 'auto' }}>
                      {(() => {
                        const days = Math.ceil((new Date(ep.raw_file_delete_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        return days > 0 ? `${days} days remaining` : 'Scheduled for deletion today';
                      })()}
                    </span>
                  )}
                </h3>
                {ep.audio_file?.deleted_at ? (
                  <Empty>RAW audio has been automatically deleted.</Empty>
                ) : ep.audio_file ? (
                  <>
                    <p className="small" style={{ margin: '0 0 0.5rem' }}>{ep.audio_file.file_name}</p>
                    <AudioPlayer storagePath={ep.audio_file.storage_path} />
                  </>
                ) : (
                  <Empty>
                    {needsAudio
                      ? 'No raw audio yet. Upload the recording.'
                      : 'No audio. This program allows live slots without a file.'}
                  </Empty>
                )}
                {(editable || canAdminForceUpload || ep.audio_file) && (
                  <div className="actions-row">
                    {(editable || canAdminForceUpload) && (
                      <div className="row align-center" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                          ref={fileInput}
                          type="file"
                          accept="audio/mpeg,.mp3"
                          disabled={uploading}
                          onChange={(e) => setRawFile(e.target.files?.[0] ?? null)}
                          aria-label="Upload raw audio file"
                        />
                        {rawFile && (
                          <div className="row align-center" style={{ gap: '0.6rem', flexWrap: 'wrap', width: '100%', marginTop: '0.35rem' }}>
                            <span className="small muted">
                              Show name will update to: <strong style={{ color: 'var(--ink)' }}>{rawFile.name.replace(/\.[^/.]+$/, '').trim()}</strong>
                            </span>
                            <button
                              type="button"
                              className="btn btn-outline small"
                              onClick={() => void onUpload()}
                              disabled={uploading}
                            >
                              Upload &amp; update show name
                            </button>
                          </div>
                        )}
                        {uploading && rawFile && (
                          <div style={{ marginTop: '0.5rem', width: '100%', maxWidth: '360px' }}>
                            <div className="row align-center justify-between" style={{ fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                              <span className="small muted">Uploading raw audio...</span>
                              <span className="small font-mono">{uploadProgress !== null ? `${uploadProgress}%` : 'Processing...'}</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-sunken, #e5e5e5)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${uploadProgress ?? 0}%`, height: '100%', backgroundColor: 'var(--brand-red, #D32F2F)', transition: 'width 0.2s ease' }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {ep.audio_file && !ep.audio_file.deleted_at && (
                      <>
                        <button
                          type="button"
                          className="small"
                          onClick={() => void downloadSingleFile(ep.audio_file!.storage_path, ep.audio_file!.file_name)}
                        >
                          Download Raw
                        </button>
                        <button
                          type="button"
                          className="small"
                          title="Open in Mixota Audio Editor"
                          onClick={() => {
                            void mixotaService.openInMixota(
                              {
                                recordingId: ep.audio_file!.id,
                                episodeId: ep.id,
                                fileName: ep.audio_file!.file_name,
                                title: ep.title,
                                targetField: 'final_audio_file_id',
                              },
                              {
                                onExportComplete: (res) => {
                                  setNotice(`Received finished audio "${res.fileName}" from Mixota!`);
                                  notifyUpload({
                                    title: 'Finished audio updated via Mixota',
                                    detail: res.fileName,
                                    dedupeKey: `upload-mixota:${res.audioFileId}`,
                                  });
                                  void refresh();
                                },
                              },
                            );
                          }}
                        >
                          Edit in Mixota
                        </button>
                      </>
                    )}
                    {(editable || canAdminForceUpload) && ep.audio_file && !uploading && (
                      <ConfirmButton
                        className="small"
                        confirmLabel="Delete raw audio?"
                        onConfirm={() =>
                          void run(
                            () => audioService.deleteAudio(ep.audio_file!.id),
                            'Raw audio removed.',
                          )
                        }
                      >
                        Remove raw audio
                      </ConfirmButton>
                    )}
                  </div>
                )}
              </div>

              {/* Final Audio Section */}
              <div style={{ paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                <h3 className="row" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <span className="badge badge-pink">Final Audio</span>
                  {ep.final_audio_file && (
                    <span className="small muted font-normal">
                      {formatDuration(ep.final_audio_file.duration_seconds)} &middot; {formatFileSize(ep.final_audio_file.file_size)}
                    </span>
                  )}
                  <span className="badge badge-grey" style={{ marginLeft: 'auto' }}>Permanent</span>
                </h3>
                
                {ep.final_audio_file ? (
                  <>
                    <p className="small" style={{ margin: '0 0 0.5rem' }}>{ep.final_audio_file.file_name}</p>
                    <AudioPlayer storagePath={ep.final_audio_file.storage_path} />
                  </>
                ) : (
                  <Empty>No final edited audio uploaded yet.</Empty>
                )}
                
                {(editable || canAdminForceUpload || ep.final_audio_file) && (
                  <div className="actions-row">
                    {(editable || canAdminForceUpload) && (
                      <div className="row align-center" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                          ref={finalFileInput}
                          type="file"
                          accept="audio/mpeg,.mp3"
                          disabled={uploading}
                          onChange={(e) => setFinalFile(e.target.files?.[0] ?? null)}
                          aria-label="Upload final audio file"
                        />
                        {finalFile && (
                          <div className="row align-center" style={{ gap: '0.6rem', flexWrap: 'wrap', width: '100%', marginTop: '0.35rem' }}>
                            <span className="small muted">
                              Show name will update to: <strong style={{ color: 'var(--ink)' }}>{finalFile.name.replace(/\.[^/.]+$/, '').trim()}</strong>
                            </span>
                            <button
                              type="button"
                              className="btn btn-solid small"
                              onClick={() => void onFinalUpload()}
                              disabled={uploading}
                            >
                              Upload &amp; update show name
                            </button>
                          </div>
                        )}
                        {uploading && finalFile && (
                          <div style={{ marginTop: '0.5rem', width: '100%', maxWidth: '360px' }}>
                            <div className="row align-center justify-between" style={{ fontSize: '0.82rem', marginBottom: '0.25rem' }}>
                              <span className="small muted">Uploading final audio...</span>
                              <span className="small font-mono">{uploadProgress !== null ? `${uploadProgress}%` : 'Processing...'}</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--surface-sunken, #e5e5e5)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${uploadProgress ?? 0}%`, height: '100%', backgroundColor: 'var(--brand-red, #D32F2F)', transition: 'width 0.2s ease' }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {ep.final_audio_file && (
                      <>
                        <button
                          type="button"
                          className="small"
                          onClick={() => void downloadSingleFile(ep.final_audio_file!.storage_path, ep.final_audio_file!.file_name)}
                        >
                          Download Final
                        </button>
                        <button
                          type="button"
                          className="small"
                          title="Open in Mixota Audio Editor"
                          onClick={() => {
                            void mixotaService.openInMixota(
                              {
                                recordingId: ep.final_audio_file!.id,
                                episodeId: ep.id,
                                fileName: ep.final_audio_file!.file_name,
                                title: ep.title,
                                targetField: 'final_audio_file_id',
                              },
                              {
                                onExportComplete: (res) => {
                                  setNotice(`Received updated final audio "${res.fileName}" from Mixota!`);
                                  notifyUpload({
                                    title: 'Final audio updated via Mixota',
                                    detail: res.fileName,
                                    dedupeKey: `upload-mixota:${res.audioFileId}`,
                                  });
                                  void refresh();
                                },
                              },
                            );
                          }}
                        >
                          Edit in Mixota
                        </button>
                      </>
                    )}
                    {(editable || canAdminForceUpload) && ep.final_audio_file && !uploading && (
                      <ConfirmButton
                        className="small"
                        confirmLabel="Delete final audio?"
                        onConfirm={() =>
                          void run(
                            () => audioService.deleteAudio(ep.final_audio_file!.id, 'final_audio_file_id'),
                            'Final audio removed.',
                          )
                        }
                      >
                        Remove final audio
                      </ConfirmButton>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div
              className="audio-upload-guidelines"
              style={{
                marginTop: '1.25rem',
                padding: '0.85rem 1rem',
                background: 'var(--surface-sunken, #f8f8f8)',
                border: '1px solid var(--border-subtle, #e0e0e0)',
                borderRadius: '6px',
                fontSize: '0.84rem',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--ink, #1f1f1f)', marginBottom: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>🎙 Audio Upload &amp; Broadcast Guidelines</span>
                <span className="badge" style={{ fontSize: '0.75rem', padding: '0.1rem 0.45rem', backgroundColor: 'var(--brand-red, #D32F2F)', color: '#fff' }}>
                  100 MB Limit
                </span>
              </div>
              <div className="grid cols-2" style={{ gap: '0.4rem 1.5rem', margin: '0.4rem 0' }}>
                <div>
                  <span className="muted">Supported Format:</span> <strong>MP3 (.mp3)</strong>
                </div>
                <div>
                  <span className="muted">Maximum File Size:</span> <strong>100 MB</strong>
                </div>
                <div>
                  <span className="muted">Recommended Quality:</span> <strong>192 kbps, 44.1 kHz, Stereo (CBR)</strong>
                </div>
                <div>
                  <span className="muted">Recommended Duration:</span> <strong>Up to 60 minutes</strong>
                </div>
              </div>
              <p className="small muted" style={{ margin: '0.4rem 0 0', opacity: 0.85, lineHeight: 1.4 }}>
                Optimized for RJ speech, instrumental background music (BGM), station jingles, and SFX. Uploading again replaces the current file.
              </p>
            </div>
          </section>

          {isReviewer && ep.status === 'PENDING_QC' && (
            <section className="card">
              <h2>QC review</h2>
              <p className="small muted">
                Listen to the <strong>Final Audio</strong> above, then approve it for scheduling or send it back with a
                reason.
              </p>
              <div className="actions-row">
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void run(() => qcService.approveEpisode(ep.id), 'Episode approved.', 'approval')
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
                Status: <UnifiedStatusBadge episode={ep} />
              </div>
              <div className="muted">Submitted: {formatDateTime(ep.submitted_at)}</div>
              <div className="muted">Reviewed: {formatDateTime(ep.reviewed_at)}</div>
            </div>

            <div className="actions-row">
              {editable && can.submitEpisode(profile.role, ep, profile.id) && (
                <button
                  type="button"
                  className="primary"
                  disabled={busy || (needsAudio && !ep.final_audio_file_id)}
                  onClick={() =>
                    void run(() => episodeService.submitForQC(ep.id), 'Sent to QC Done.')
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

              {can.archiveEpisode(profile.role) && ep.status === 'ARCHIVED' && (
                <ConfirmButton
                  className="small"
                  confirmLabel="Activate it?"
                  disabled={busy}
                  onConfirm={() =>
                    void run(() => episodeService.activateEpisode(ep.id), 'Episode activated.')
                  }
                >
                  Activate
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

            {needsAudio && !ep.final_audio_file_id && editable && (
              <p className="small muted" style={{ marginTop: '0.5rem' }}>
                Upload the final edited audio before submitting for QC.
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

          {(ep.status === 'APPROVED' || ep.status === 'ARCHIVED') && (profile.role === 'ADMIN' || profile.role === 'PRODUCER') && (() => {
            const episodeScheduleList = epSchedules.data?.get(ep.id) ?? [];
            const pubStatus = resolveEpisodePublishStatus(ep, new Date(), episodeScheduleList);
            const schedAt = ep.scheduled_at ?? ep.homepage_publish_at ?? null;
            const pubAt = ep.published_at ?? (pubStatus === 'PUBLISHED' ? ep.homepage_publish_at : null) ?? null;
            const expAt = ep.expires_at ?? ep.homepage_expires_at ?? null;

            return (
              <section className="card" style={{ borderLeft: '4px solid var(--accent, #e50914)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <h2 style={{ margin: 0 }}>Publishing Lifecycle</h2>
                  <PublishStatusBadge status={pubStatus} />
                </div>

                <p className="small muted" style={{ marginTop: 0 }}>
                  Tracks Not Scheduled, Scheduled, Published, Expired, Failed, and Archived transitions across homepage &amp; broadcast releases.
                </p>

                {pubStatus === 'FAILED' && ep.publish_error && (
                  <div className="banner banner-error" style={{ marginBottom: '0.75rem' }}>
                    <strong>Publishing error:</strong> {ep.publish_error}
                  </div>
                )}

                <div className="stack small" style={{ marginBottom: '1rem' }}>
                  {(pubStatus === 'NOT_SCHEDULED' || pubStatus === 'DRAFT') && (
                    <div className="muted">
                      {pubStatus === 'NOT_SCHEDULED'
                        ? 'Not Scheduled \u2014 QC approved and ready to schedule for future publication or publish immediately.'
                        : 'In Draft \u2014 awaiting approval or release scheduling.'}
                    </div>
                  )}
                  {schedAt && (
                    <div>
                      <strong>Scheduled time:</strong> {formatDateTime(schedAt)}
                    </div>
                  )}
                  {pubAt && (
                    <div>
                      <strong>Published time:</strong> {formatDateTime(pubAt)}
                    </div>
                  )}
                  {(expAt || pubStatus === 'PUBLISHED') && (
                    <div>
                      <strong>Expiry time:</strong>{' '}
                      {expAt ? formatDateTime(expAt) : 'None (remains Published until archived)'}
                    </div>
                  )}
                  {ep.archived_at && (
                    <div>
                      <strong>Archived time:</strong> {formatDateTime(ep.archived_at)}
                    </div>
                  )}
                </div>

                {ep.status === 'APPROVED' && (
                  <div className="actions-row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="small primary"
                      disabled={busy}
                      onClick={() => setShowHomepageSchedule(true)}
                    >
                      {pubStatus === 'NOT_SCHEDULED' || pubStatus === 'DRAFT'
                        ? 'Schedule / Publish'
                        : pubStatus === 'EXPIRED'
                          ? 'Re-publish'
                          : 'Edit Schedule / Expiry'}
                    </button>

                    {(pubStatus === 'NOT_SCHEDULED' || pubStatus === 'DRAFT') && (
                      <button
                        type="button"
                        className="small"
                        disabled={busy}
                        onClick={() => void publishEpisodeNow()}
                      >
                        Publish Now
                      </button>
                    )}

                    {pubStatus === 'FAILED' && (
                      <button
                        type="button"
                        className="small"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => episodeService.retryPublish(ep.id),
                            `"${ep.title}" queued for publication retry.`,
                          )
                        }
                      >
                        Retry Publish
                      </button>
                    )}

                    {(pubStatus === 'SCHEDULED' || pubStatus === 'FAILED' || pubStatus === 'PUBLISHED' || pubStatus === 'EXPIRED') && (
                      <ConfirmButton
                        className="small danger"
                        confirmLabel={
                          pubStatus === 'SCHEDULED' || pubStatus === 'FAILED'
                            ? 'Unschedule and move to Not Scheduled?'
                            : 'Move episode to Not Scheduled?'
                        }
                        disabled={busy}
                        onConfirm={() =>
                          void run(
                            () => episodeService.unscheduleHomepageEpisode(ep.id),
                            `"${ep.title}" moved to Not Scheduled.`,
                          )
                        }
                      >
                        {pubStatus === 'SCHEDULED' || pubStatus === 'FAILED'
                          ? 'Unschedule'
                          : 'Move to Not Scheduled'}
                      </ConfirmButton>
                    )}

                    {(pubStatus === 'PUBLISHED' || pubStatus === 'EXPIRED') && (
                      <ConfirmButton
                        className="small"
                        confirmLabel="Archive this episode?"
                        disabled={busy}
                        onConfirm={() =>
                          void run(
                            () => episodeService.archiveEpisode(ep.id),
                            `"${ep.title}" archived.`,
                          )
                        }
                      >
                        Archive Episode
                      </ConfirmButton>
                    )}
                  </div>
                )}
              </section>
            );
          })()}

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

      {showHomepageSchedule && (
        <HomepageScheduleDialog
          episode={ep}
          onClose={() => setShowHomepageSchedule(false)}
          onSaved={(msg) => {
            setShowHomepageSchedule(false);
            setNotice(msg);
            void refresh();
          }}
        />
      )}
    </>
  );
}
