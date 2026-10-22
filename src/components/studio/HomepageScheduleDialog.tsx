import { useEffect, useRef, useState } from 'react';
import { episodeService, type EpisodeWithRelations } from '@/services/episodeService';
import { AppError, errorMessage } from '@/lib/errors';
import { Banner } from '@/components/ui';
import { stationLocalToIso } from '@/utils/datetime';

function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toLocalTimeString(d: Date): string {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

interface HomepageScheduleDialogProps {
  episode: EpisodeWithRelations;
  onClose: () => void;
  onSaved: (notice: string) => void;
}

export function HomepageScheduleDialog({
  episode,
  onClose,
  onSaved,
}: HomepageScheduleDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<'immediate' | 'schedule'>(() => {
    if (episode.homepage_publish_at) {
      const pubDate = new Date(episode.homepage_publish_at);
      if (pubDate > new Date()) return 'schedule';
    }
    return 'immediate';
  });

  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');

  const [hasExpiry, setHasExpiry] = useState(() => {
    if (!episode.homepage_expires_at) return false;
    return new Date(episode.homepage_expires_at) > new Date();
  });
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize dates
  useEffect(() => {
    const now = new Date();
    if (episode.homepage_publish_at) {
      const d = new Date(episode.homepage_publish_at);
      setStartDate(toLocalDateString(d));
      setStartTime(toLocalTimeString(d));
    } else {
      setStartDate(toLocalDateString(now));
      setStartTime(toLocalTimeString(now));
    }

    if (episode.homepage_expires_at) {
      const expDate = new Date(episode.homepage_expires_at);
      if (expDate > now) {
        setEndDate(toLocalDateString(expDate));
        setEndTime(toLocalTimeString(expDate));
        setHasExpiry(true);
      } else {
        // Was expired: default to 7 days in future and leave expiry untoggled unless user enables it
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        setEndDate(toLocalDateString(nextWeek));
        setEndTime(toLocalTimeString(nextWeek));
        setHasExpiry(false);
      }
    } else {
      // Default expiry 7 days later
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      setEndDate(toLocalDateString(nextWeek));
      setEndTime(toLocalTimeString(nextWeek));
      setHasExpiry(false);
    }
  }, [episode]);

  // Handle escape key
  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const applyQuickExpiry = (days: number) => {
    setHasExpiry(true);
    let baseTime = Date.now();
    if (mode === 'schedule' && startDate && startTime) {
      const parsed = new Date(`${startDate}T${startTime}:00`).getTime();
      if (!isNaN(parsed) && parsed > baseTime) baseTime = parsed;
    }
    const target = new Date(baseTime + days * 24 * 60 * 60 * 1000);
    setEndDate(toLocalDateString(target));
    setEndTime(toLocalTimeString(target));
  };

  const handleSave = async () => {
    setError(null);
    setBusy(true);

    try {
      let publishAtIso: string | null = null;
      let expiresAtIso: string | null = null;

      if (mode === 'schedule') {
        if (!startDate || !startTime) {
          throw new AppError('VALIDATION', 'Please select both a start date and time for the schedule.');
        }
        publishAtIso = stationLocalToIso(`${startDate}T${startTime}`);
        if (!publishAtIso) {
          throw new AppError('VALIDATION', 'Invalid schedule start date or time.');
        }
      } else {
        // Immediate: record current time
        publishAtIso = new Date().toISOString();
      }

      if (hasExpiry) {
        if (!endDate || !endTime) {
          throw new AppError('VALIDATION', 'Please select both an expiration date and time.');
        }
        expiresAtIso = stationLocalToIso(`${endDate}T${endTime}`);
        if (!expiresAtIso) {
          throw new AppError('VALIDATION', 'Invalid expiration date or time.');
        }

        const baseTimestamp = publishAtIso ? new Date(publishAtIso).getTime() : Date.now();
        if (new Date(expiresAtIso).getTime() <= baseTimestamp) {
          throw new AppError('VALIDATION', 'The expiration time must be after the publish / release time.');
        }
      }

      await episodeService.scheduleHomepageEpisode(
        episode.id,
        true,
        publishAtIso,
        expiresAtIso,
      );

      const notice = mode === 'schedule'
        ? `Scheduled "${episode.title}" to appear on homepage at ${startDate} ${startTime}.`
        : `Published "${episode.title}" to the homepage!`;
      onSaved(notice);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Are you sure you want to remove this episode from the homepage?')) return;
    setError(null);
    setBusy(true);

    try {
      await episodeService.scheduleHomepageEpisode(episode.id, false, null, null);
      onSaved(`"${episode.title}" has been removed from the homepage.`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-labelledby="homepage-schedule-title"
        style={{ maxWidth: '580px' }}
      >
        <div className="dialog-head">
          <div>
            <p className="dialog-eyebrow">HOMEPAGE RELEASE · SPOTIFY-STYLE</p>
            <h2 id="homepage-schedule-title" className="dialog-title">
              Homepage Schedule
            </h2>
            <p className="dialog-slot">
              {episode.title} {episode.program?.name ? `· ${episode.program.name}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="small"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ padding: '0.3rem 0.6rem' }}
          >
            ✕
          </button>
        </div>

        <div className="dialog-body">
          <Banner>{error}</Banner>

          <p className="small muted" style={{ marginTop: 0, marginBottom: '1.25rem' }}>
            Configure when this QC-approved episode appears in the homepage carousel and when it
            automatically disappears, just like scheduling podcast releases on Spotify.
          </p>

          <div className="stack" style={{ gap: '1.25rem' }}>
            {/* Start / Publish Time */}
            <div
              style={{
                background: 'var(--surface-sunken)',
                padding: '1rem',
                borderRadius: 'var(--r-md, 8px)',
                border: '1px solid var(--border)',
              }}
            >
              <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.6rem' }}>
                1. When should this show on the homepage?
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.95rem' }}>
                  <input
                    type="radio"
                    name="publish-mode"
                    value="immediate"
                    checked={mode === 'immediate'}
                    onChange={() => setMode('immediate')}
                  />
                  <span>
                    <strong>Show immediately</strong> (goes live as soon as saved)
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.95rem' }}>
                  <input
                    type="radio"
                    name="publish-mode"
                    value="schedule"
                    checked={mode === 'schedule'}
                    onChange={() => setMode('schedule')}
                  />
                  <span>
                    <strong>Schedule for later</strong> (Spotify release schedule)
                  </span>
                </label>
              </div>

              {mode === 'schedule' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <div>
                    <label className="small muted" htmlFor="schedule-start-date">
                      Start date:
                    </label>
                    <input
                      id="schedule-start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="small muted" htmlFor="schedule-start-time">
                      Start time:
                    </label>
                    <input
                      id="schedule-start-time"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Expiry / Disappear Time */}
            <div
              style={{
                background: 'var(--surface-sunken)',
                padding: '1rem',
                borderRadius: 'var(--r-md, 8px)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={hasExpiry}
                    onChange={(e) => setHasExpiry(e.target.checked)}
                  />
                  <span>2. Automatically disappear from homepage</span>
                </label>
                {!hasExpiry && <span className="small muted">(Indefinite)</span>}
              </div>

              {hasExpiry ? (
                <>
                  <p className="small muted" style={{ margin: '0.2rem 0 0.75rem' }}>
                    The episode will be taken off the homepage carousel once this time passes.
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label className="small muted" htmlFor="schedule-end-date">
                        Disappear date:
                      </label>
                      <input
                        id="schedule-end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="small muted" htmlFor="schedule-end-time">
                        Disappear time:
                      </label>
                      <input
                        id="schedule-end-time"
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: '0.75rem' }}>
                    <span className="small muted" style={{ marginRight: '0.5rem' }}>
                      Quick duration:
                    </span>
                    <div style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="small secondary"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                        onClick={() => applyQuickExpiry(1)}
                      >
                        +24 Hours
                      </button>
                      <button
                        type="button"
                        className="small secondary"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                        onClick={() => applyQuickExpiry(3)}
                      >
                        +3 Days
                      </button>
                      <button
                        type="button"
                        className="small secondary"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                        onClick={() => applyQuickExpiry(7)}
                      >
                        +7 Days
                      </button>
                      <button
                        type="button"
                        className="small secondary"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                        onClick={() => applyQuickExpiry(30)}
                      >
                        +30 Days
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="small muted" style={{ margin: '0.3rem 0 0' }}>
                  Without an expiration time, the episode remains on the homepage until an administrator
                  manually unpublishes it.
                </p>
              )}
            </div>
          </div>

          <div
            className="dialog-actions"
            style={{
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '1.5rem',
              borderTop: '1px solid var(--border)',
              paddingTop: '1rem',
            }}
          >
            <div>
              {episode.show_on_homepage && (
                <button
                  type="button"
                  className="small danger"
                  disabled={busy}
                  onClick={handleRemove}
                >
                  {busy ? 'Working…' : 'Remove from homepage'}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="small" disabled={busy} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="small primary"
                disabled={busy}
                onClick={handleSave}
              >
                {busy ? 'Saving schedule…' : 'Save schedule'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
