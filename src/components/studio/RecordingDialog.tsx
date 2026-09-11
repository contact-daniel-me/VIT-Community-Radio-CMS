import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Banner } from '@/components/ui';
import { useAsync } from '@/hooks/useAsync';
import { bookingService, type BookingWithPeople } from '@/services/bookingService';
import { episodeService } from '@/services/episodeService';
import { audioService } from '@/services/audioService';
import { programService } from '@/services/programService';
import { errorMessage } from '@/lib/errors';
import type { EpisodeRow, ProfileRow } from '@/types/database';
import { formatBookingDate, formatSlotTime } from '@/utils/studio';
import { formatFileSize } from '@/utils/datetime';

type Stage = 'form' | 'working' | 'done';

/**
 * Turn a finished studio session into a recording.
 *
 * The chain the brief asks for -- RJ -> show -> booking -> audio file -- is made
 * here, in this order, because each step depends on the previous one existing:
 *
 *   1. create the episode (DRAFT, owned by the RJ)
 *   2. upload the audio and point the episode at it   (audioService)
 *   3. link the booking to the episode                (booking.episode_id)
 *
 * If the upload fails, audioService already removes the orphaned object and
 * row. If the link fails the episode still exists and is reachable from
 * Episodes, so nothing is stranded -- the recording is never lost because a
 * later step went wrong.
 *
 * A programme has to be chosen because episodes belong to one; the booking only
 * captured a free-text show name.
 */
export function RecordingDialog({
  booking,
  profile,
  onClose,
  onUploaded,
}: {
  /** Only the plain row is needed, so this opens from the confirmation screen too. */
  booking: BookingWithPeople;
  profile: ProfileRow;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('form');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [episode, setEpisode] = useState<EpisodeRow | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [programId, setProgramId] = useState(booking.program_id);
  const [title, setTitle] = useState(booking.program?.name ?? '');

  const programs = useAsync(async () => {
    const list = await programService.getPrograms({ activeOnly: true });
    return list;
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!programId) {
      setError('Choose which programme this recording belongs to.');
      return;
    }
    if (title.trim().length < 2) {
      setError('Give the episode a title.');
      return;
    }
    if (!file) {
      setError('Choose the recording to upload.');
      return;
    }

    setStage('working');
    try {
      setProgress('Creating the episode…');
      const created = await episodeService.createEpisode(
        {
          program_id: programId,
          title: title.trim(),
          host_name: profile.full_name,
          assigned_rj: profile.id,
          description: `Recorded in the studio on ${formatBookingDate(booking.booking_date)} (${booking.reference}).`,
        },
        profile.id,
      );

      setProgress(`Uploading ${file.name}…`);
      await audioService.uploadAudio(created.id, file, profile.id);

      setProgress('Linking it to your booking…');
      // Best effort: the recording already exists and is usable without this.
      await bookingService.linkEpisode(booking.id, created.id).catch(() => undefined);

      setEpisode(created);
      setStage('done');
      onUploaded();
    } catch (cause) {
      setError(errorMessage(cause));
      setStage('form');
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && stage !== 'working' && onClose()}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="rec-title">
        <header className="dialog-head">
          <div>
            <p className="dialog-eyebrow">
              {stage === 'done' ? 'Uploaded' : 'Upload your recording'}
            </p>
            <h2 id="rec-title" className="dialog-title">
              {booking.program?.name}
            </h2>
            <p className="dialog-slot">
              {formatBookingDate(booking.booking_date)}
              <span className="dialog-dot">&middot;</span>
              {formatSlotTime(booking.start_time.slice(0, 5))}
              <span className="dialog-dot">&middot;</span>
              {booking.reference}
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
            disabled={stage === 'working'}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="dialog-body">
          <Banner>{error}</Banner>

          {stage === 'done' && episode ? (
            <div className="confirmed">
              <div className="confirmed-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="26" height="26">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 12.5l5.2 5.2L20 7"
                  />
                </svg>
              </div>
              <h3 className="confirmed-title">Recording uploaded</h3>
              <p className="small muted">
                It is saved as a draft episode. Review it, then send it to QC when you are
                happy.
              </p>
              <div className="dialog-actions">
                <Link to={`/episodes/${episode.id}`} className="btn btn-solid">
                  Open the episode
                </Link>
                <button type="button" className="btn btn-ghost" onClick={onClose}>
                  Back to my bookings
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="booking-form">
              <div className="field">
                <label htmlFor="r-program">Programme</label>
                <select
                  id="r-program"
                  value={programId}
                  onChange={(e) => setProgramId(e.target.value)}
                  disabled={stage === 'working'}
                  required
                >
                  <option value="">Choose a programme</option>
                  {(programs.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {programs.loading && <p className="small muted">Loading programmes…</p>}
              </div>

              <div className="field">
                <label htmlFor="r-title">Episode title</label>
                <input
                  id="r-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  disabled={stage === 'working'}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="r-file">Recording</label>
                <input
                  ref={fileInput}
                  id="r-file"
                  type="file"
                  accept="audio/mpeg,.mp3"
                  disabled={stage === 'working'}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file && (
                  <p className="small muted">
                    {file.name} &middot; {formatFileSize(file.size)}
                  </p>
                )}
                <p className="small muted">MP3 only, up to 200 MB.</p>
              </div>

              {stage === 'working' && (
                <p className="upload-progress" role="status">
                  <span className="upload-spinner" aria-hidden="true" />
                  {progress}
                </p>
              )}

              <div className="dialog-actions">
                <button type="submit" className="btn btn-solid" disabled={stage === 'working'}>
                  {stage === 'working' ? 'Uploading…' : 'Upload recording'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={onClose}
                  disabled={stage === 'working'}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
