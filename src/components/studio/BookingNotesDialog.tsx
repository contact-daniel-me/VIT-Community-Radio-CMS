import { useEffect, useRef, useState } from 'react';
import { extractBookingScript, formatBookingDate, formatSlotTime, getDisplayNotes } from '@/utils/studio';

export interface BookingNotesDialogProps {
  booking: {
    reference: string;
    showTitle: string;
    rjName?: string | null;
    rjEmail?: string | null;
    date: string;
    startTime: string;
    endTime: string;
    status?: string | null;
    notes?: string | null;
    editorName?: string | null;
  };
  onClose: () => void;
}

/**
 * Modal dialog displaying the complete studio booking notes and submitted script.
 * Keeps table cells compact while providing full access to long notes and scripts.
 */
export function BookingNotesDialog({ booking, onClose }: BookingNotesDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [copiedSection, setCopiedSection] = useState<'script' | 'all' | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const cleanNotes = getDisplayNotes(booking.notes);
  const script = extractBookingScript(booking.notes);
  const rawNotes = booking.notes?.trim();

  const handleCopy = (text: string, section: 'script' | 'all') => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    });
  };

  const allNotesText =
    cleanNotes && script
      ? `${cleanNotes}\n\n[Submitted Script]\n${script.content}`
      : script
        ? script.content
        : (cleanNotes || rawNotes || '');

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="dialog notes-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-notes-modal-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className="dialog-head">
          <div>
            <p className="dialog-eyebrow">Studio Booking Notes</p>
            <h2 id="booking-notes-modal-title" className="dialog-title">
              {booking.showTitle}
            </h2>
            <p className="dialog-slot">
              {formatBookingDate(booking.date)} &middot;{' '}
              {formatSlotTime(booking.startTime.slice(0, 5))} &ndash;{' '}
              {formatSlotTime(booking.endTime.slice(0, 5))}
              <span className="dialog-dot">&middot;</span>
              <span className="ref-tag" style={{ fontFamily: 'var(--font-mono)' }}>
                {booking.reference}
              </span>
            </p>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close notes dialog"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                d="M6 6l12 12M18 6L6 18"
              />
            </svg>
          </button>
        </header>

        <div className="dialog-body notes-modal-body">
          {/* Metadata banner: Host, Editor, and Status */}
          <div className="notes-modal-meta">
            <div className="notes-meta-item">
              <span className="notes-meta-label">RJ / Host:</span>
              <span className="notes-meta-value">
                {booking.rjName || 'Unassigned'}
                {booking.rjEmail && (
                  <span className="notes-meta-sub"> ({booking.rjEmail})</span>
                )}
              </span>
            </div>
            {booking.editorName && (
              <div className="notes-meta-item">
                <span className="notes-meta-label">Editor:</span>
                <span className="notes-meta-value">{booking.editorName}</span>
              </div>
            )}
            {booking.status && (
              <div className="notes-meta-item">
                <span className="notes-meta-label">Status:</span>
                <span className="notes-meta-value" style={{ textTransform: 'capitalize' }}>
                  {booking.status.toLowerCase()}
                </span>
              </div>
            )}
          </div>

          {/* Clean Notes & Remarks Section */}
          {cleanNotes && (
            <div className="notes-section">
              <div className="notes-section-head">
                <h4 className="notes-section-title">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <span>Notes & Remarks</span>
                </h4>
              </div>
              <div className="notes-text-box">
                {cleanNotes}
              </div>
            </div>
          )}

          {/* Submitted Script Section */}
          {script && (
            <div className="notes-section">
              <div className="notes-section-head">
                <h4 className="notes-section-title">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  <span>Submitted Script {script.type === 'file' ? '(File)' : ''}</span>
                </h4>
                {script.type === 'text' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.76rem', padding: '0.2rem 0.55rem' }}
                    onClick={() => handleCopy(script.content, 'script')}
                  >
                    {copiedSection === 'script' ? '✓ Copied' : 'Copy script'}
                  </button>
                )}
              </div>
              {script.type === 'file' ? (
                <div className="notes-file-badge">
                  <span>📎 Attached script file:</span>
                  <strong>{script.content}</strong>
                </div>
              ) : (
                <div className="notes-script-box">
                  <pre>{script.content}</pre>
                </div>
              )}
            </div>
          )}

          {/* Fallback when neither cleanNotes nor script matched cleanly */}
          {!cleanNotes && !script && rawNotes && (
            <div className="notes-section">
              <div className="notes-section-head">
                <h4 className="notes-section-title">Full Notes</h4>
              </div>
              <div className="notes-text-box">
                {rawNotes}
              </div>
            </div>
          )}

          {!rawNotes && (
            <p style={{ color: 'var(--ink-muted)', fontStyle: 'italic', margin: '1rem 0' }}>
              No additional notes or script recorded for this session.
            </p>
          )}
        </div>

        <div className="dialog-actions notes-modal-actions">
          {allNotesText && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => handleCopy(allNotesText, 'all')}
            >
              {copiedSection === 'all' ? '✓ Copied notes' : 'Copy all notes'}
            </button>
          )}
          <button type="button" className="btn btn-solid" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

