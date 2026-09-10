import { useState, type FormEvent } from 'react';
import { Banner } from '@/components/ui';
import { episodeService } from '@/services/episodeService';
import { errorMessage } from '@/lib/errors';
import type { EpisodeRow } from '@/types/database';

/**
 * Deleting an episode, with the word typed out.
 *
 * A two-tap confirm is right for reversible things -- deactivating a user,
 * cancelling a booking. This is neither reversible nor recoverable: the row,
 * its audio row and the file in the bucket all go, and nothing in the CMS
 * brings them back. Typing the word is the point: it costs a couple of seconds
 * and it cannot be done by accident, which is exactly the trade a destructive
 * action should make.
 *
 * The refusals themselves live in the database (migration 18). Anything past
 * QC, scheduled, reviewed or on the front page is refused there, whatever this
 * form does, and the reason is shown as it comes back.
 */
const REQUIRED = 'delete';

export function DeleteEpisodeDialog({
  episode,
  onClose,
  onDeleted,
}: {
  episode: Pick<EpisodeRow, 'id' | 'title' | 'status'>;
  onClose: () => void;
  onDeleted: (title: string) => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim().toLowerCase() === REQUIRED;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!matches || busy) return;

    setBusy(true);
    setError(null);
    try {
      const { title } = await episodeService.deleteEpisode(episode.id);
      onDeleted(title);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="del-title">
        <header className="dialog-head">
          <div>
            <p className="dialog-eyebrow">Permanent</p>
            <h2 id="del-title" className="dialog-title">
              Delete &ldquo;{episode.title}&rdquo;?
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="dialog-body">
          <Banner>{error}</Banner>

          <p className="small">
            This removes the episode, its audio record and the file in storage. It cannot be
            undone, and the recording cannot be recovered afterwards.
          </p>
          <p className="small muted">
            Only drafts and rejected episodes can be deleted. Anything QC has approved,
            scheduled or broadcast is kept &mdash; archive those instead.
          </p>

          <form onSubmit={submit} className="booking-form">
            <div className="field">
              <label htmlFor="del-confirm">
                Type <strong>{REQUIRED}</strong> to confirm
              </label>
              <input
                id="del-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={busy}
                aria-describedby="del-hint"
              />
              <p id="del-hint" className="small muted">
                {matches
                  ? 'That matches. The delete button is now active.'
                  : `The button stays disabled until the box reads "${REQUIRED}".`}
              </p>
            </div>

            <div className="dialog-actions">
              <button
                type="submit"
                className="btn btn-solid danger-action"
                disabled={!matches || busy}
              >
                {busy ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
