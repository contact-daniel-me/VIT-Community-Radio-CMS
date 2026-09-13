import { useEffect, useRef, useState } from 'react';
import { announcementService } from '@/services/announcementService';
import { errorMessage } from '@/lib/errors';
import { Banner } from '@/components/ui';
import type { AnnouncementRow } from '@/types/database';

export function AnnouncementDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing?: AnnouncementRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  
  const [title, setTitle] = useState(existing?.title ?? '');
  const [message, setMessage] = useState(existing?.message ?? '');
  const [mode, setMode] = useState<'publish' | 'schedule'>(
    existing?.scheduled_at ? 'schedule' : 'publish'
  );
  
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  
  const [hasExpiry, setHasExpiry] = useState(!!existing?.expires_at);
  const [expiryDate, setExpiryDate] = useState('');
  const [expiryTime, setExpiryTime] = useState('');
  
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing?.scheduled_at) {
      const d = new Date(existing.scheduled_at);
      setScheduledDate(d.toISOString().split('T')[0]);
      setScheduledTime(d.toTimeString().slice(0, 5));
    }
    if (existing?.expires_at) {
      const d = new Date(existing.expires_at);
      setExpiryDate(d.toISOString().split('T')[0]);
      setExpiryTime(d.toTimeString().slice(0, 5));
    }
  }, [existing]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (isDraft: boolean) => {
    setError(null);
    setBusy(true);

    try {
      let published_at = null;
      let scheduled_at = null;
      let expires_at = null;
      let status: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED' = isDraft ? 'DRAFT' : 'PUBLISHED';

      if (!isDraft) {
        if (mode === 'publish') {
          published_at = new Date().toISOString();
        } else {
          if (!scheduledDate || !scheduledTime) throw new Error('Please select a schedule date and time.');
          scheduled_at = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
          status = 'SCHEDULED';
        }
      }

      if (hasExpiry) {
        if (!expiryDate || !expiryTime) throw new Error('Please select an expiry date and time.');
        expires_at = new Date(`${expiryDate}T${expiryTime}:00`).toISOString();
      }

      const payload = {
        title,
        message,
        status,
        published_at,
        scheduled_at,
        expires_at,
      };

      if (existing) {
        await announcementService.updateAnnouncement(existing.id, payload);
      } else {
        await announcementService.createAnnouncement(payload);
      }
      
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="overlay fade-in" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog" ref={dialogRef} tabIndex={-1}>
        <div className="dialog-head">
          <h2 id="dialog-title">{existing ? 'Edit Announcement' : 'Create Announcement'}</h2>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="dialog-body">
          <Banner>{error}</Banner>

          <form
            id="announcement-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
            className="stack"
            style={{ gap: '1.5rem' }}
          >
            <div className="field">
              <label htmlFor="a-title">Title</label>
              <input
                id="a-title"
                type="text"
                className="text-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. Campus Radio Special"
              />
            </div>

            <div className="field">
              <label htmlFor="a-msg">Message</label>
              <textarea
                id="a-msg"
                className="text-input"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                placeholder="Enter your announcement here..."
              />
            </div>

            <fieldset className="field">
              <legend style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Publishing option</legend>
              <div className="row wrap" style={{ gap: '1rem' }}>
                <label className="radio-label row" style={{ gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'publish'}
                    onChange={() => setMode('publish')}
                  />
                  <span>Publish Now</span>
                </label>
                <label className="radio-label row" style={{ gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === 'schedule'}
                    onChange={() => setMode('schedule')}
                  />
                  <span>Schedule</span>
                </label>
              </div>
            </fieldset>

            {mode === 'schedule' && (
              <div className="row wrap" style={{ gap: '1rem', background: 'var(--surface)', padding: '1rem', borderRadius: 'var(--r-md)' }}>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="s-date">Schedule Date</label>
                  <input
                    id="s-date"
                    type="date"
                    className="text-input"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    required={mode === 'schedule'}
                  />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="s-time">Schedule Time</label>
                  <input
                    id="s-time"
                    type="time"
                    className="text-input"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    required={mode === 'schedule'}
                  />
                </div>
              </div>
            )}

            <div className="field">
              <label className="row" style={{ gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={hasExpiry}
                  onChange={(e) => setHasExpiry(e.target.checked)}
                />
                <span>Set Expiry Date &amp; Time (Optional)</span>
              </label>
              
              {hasExpiry && (
                <div className="row wrap fade-in" style={{ gap: '1rem' }}>
                  <div className="field" style={{ flex: 1 }}>
                    <input
                      type="date"
                      className="text-input"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      required={hasExpiry}
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <input
                      type="time"
                      className="text-input"
                      value={expiryTime}
                      onChange={(e) => setExpiryTime(e.target.value)}
                      required={hasExpiry}
                    />
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>

        <div className="dialog-actions row spread wrap" style={{ justifyContent: 'space-between' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void save(true)}
            disabled={busy || !title.trim() || !message.trim()}
          >
            Save Draft
          </button>
          
          <div className="row" style={{ gap: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="announcement-form" className="btn btn-solid" disabled={busy}>
              {busy ? 'Saving...' : mode === 'publish' ? 'Publish Announcement' : 'Schedule Announcement'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
