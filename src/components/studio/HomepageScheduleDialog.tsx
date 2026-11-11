import { useEffect, useRef, useState } from 'react';
import { episodeService, type EpisodeWithRelations } from '@/services/episodeService';
import { AppError, errorMessage } from '@/lib/errors';
import { Banner } from '@/components/ui';
import { stationDateAndTime, stationLocalToIso } from '@/utils/datetime';

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

  const [title, setTitle] = useState(episode.title || '');
  const [description, setDescription] = useState(episode.description || '');

  const isAlreadyPublished =
    episode.publish_status === 'PUBLISHED' ||
    (Boolean(episode.show_on_homepage) &&
      (!episode.homepage_publish_at || new Date(episode.homepage_publish_at) <= new Date()) &&
      (!episode.homepage_expires_at || new Date(episode.homepage_expires_at) > new Date()));

  const existingScheduledIso = episode.scheduled_at ?? episode.homepage_publish_at ?? null;
  const existingExpiresIso = episode.expires_at ?? episode.homepage_expires_at ?? null;

  const [mode, setMode] = useState<'immediate' | 'schedule'>(() => {
    if (existingScheduledIso && episode.publish_status !== 'PUBLISHED') {
      const pubDate = new Date(existingScheduledIso);
      if (pubDate > new Date()) return 'schedule';
    }
    return 'immediate';
  });

  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');

  const [hasExpiry, setHasExpiry] = useState(() => {
    if (!existingExpiresIso) return false;
    return new Date(existingExpiresIso) > new Date();
  });
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form fields and dates in station timezone (IST)
  useEffect(() => {
    setTitle(episode.title || '');
    setDescription(episode.description || '');

    const now = new Date();
    const initialSchedIso = episode.scheduled_at ?? episode.homepage_publish_at;
    if (initialSchedIso) {
      const parts = stationDateAndTime(initialSchedIso);
      setStartDate(parts.date);
      setStartTime(parts.time);
    } else {
      const parts = stationDateAndTime(now);
      setStartDate(parts.date);
      setStartTime(parts.time);
    }

    const initialExpIso = episode.expires_at ?? episode.homepage_expires_at;
    if (initialExpIso) {
      const expDate = new Date(initialExpIso);
      if (expDate > now) {
        const parts = stationDateAndTime(expDate);
        setEndDate(parts.date);
        setEndTime(parts.time);
        setHasExpiry(true);
      } else {
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const parts = stationDateAndTime(nextWeek);
        setEndDate(parts.date);
        setEndTime(parts.time);
        setHasExpiry(false);
      }
    } else {
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const parts = stationDateAndTime(nextWeek);
      setEndDate(parts.date);
      setEndTime(parts.time);
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

  const applySameDayMidnightExpiry = () => {
    setHasExpiry(true);
    const todayStr = stationDateAndTime(new Date()).date;
    let targetDate = todayStr;
    if (mode === 'schedule' && startDate) {
      targetDate = startDate;
    }
    setEndDate(targetDate);
    setEndTime('23:59');
  };

  const applyQuickExpiry = (days: number) => {
    setHasExpiry(true);
    let baseTime = Date.now();
    if (mode === 'schedule' && startDate && startTime) {
      const iso = stationLocalToIso(`${startDate}T${startTime}`);
      const parsed = iso ? new Date(iso).getTime() : NaN;
      if (!isNaN(parsed) && parsed > baseTime) baseTime = parsed;
    }
    const target = new Date(baseTime + days * 24 * 60 * 60 * 1000);
    const parts = stationDateAndTime(target);
    setEndDate(parts.date);
    setEndTime(parts.time);
  };

  const handleSave = async () => {
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Please provide a title for the episode before saving the homepage schedule.');
      return;
    }

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
      } else if (isAlreadyPublished) {
        // Preserve existing publication timestamp when editing a live published episode
        publishAtIso = episode.published_at ?? episode.homepage_publish_at ?? new Date().toISOString();
      } else {
        // Immediate publish: record current time
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

        const baseTimestamp = mode === 'schedule' && publishAtIso
          ? new Date(publishAtIso).getTime()
          : Date.now();
        if (new Date(expiresAtIso).getTime() <= baseTimestamp) {
          throw new AppError('VALIDATION', 'The expiration time must be after the publish / release time.');
        }
      }

      const trimmedDescription = description.trim() ? description.trim() : null;

      await episodeService.scheduleHomepageEpisode(
        episode.id,
        true,
        publishAtIso,
        expiresAtIso,
        trimmedTitle,
        trimmedDescription,
      );

      const notice = mode === 'schedule'
        ? `Scheduled "${trimmedTitle}" to publish at ${startDate} ${startTime} IST.`
        : isAlreadyPublished
          ? `Updated published settings for "${trimmedTitle}".`
          : `Published "${trimmedTitle}" to the homepage!`;
      onSaved(notice);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    const promptMsg = isAlreadyPublished
      ? 'Move this published episode back to Draft and remove it from the homepage?'
      : 'Unschedule this episode and return it to Draft?';
    if (!confirm(promptMsg)) return;
    setError(null);
    setBusy(true);

    try {
      await episodeService.unscheduleHomepageEpisode(episode.id);
      onSaved(`"${episode.title}" has been moved back to Draft.`);
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
            <p className="dialog-eyebrow">HOMEPAGE RELEASE</p>
            <h2 id="homepage-schedule-title" className="dialog-title">
              Homepage Schedule
            </h2>
            <p className="dialog-slot">
              {title.trim() || episode.title} {episode.program?.name ? `· ${episode.program.name}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="small"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
            style={{ padding: '0.3rem 0.6rem' }}
          >
            ✕
          </button>
        </div>

        <div className="dialog-body">
          <Banner>{error}</Banner>

          <div className="stack" style={{ gap: '1.25rem' }}>
            {/* Episode Homepage Details (Title & Description) */}
            <div
              style={{
                background: 'var(--surface-sunken)',
                padding: '1rem',
                borderRadius: 'var(--r-md, 8px)',
                border: '1px solid var(--border)',
              }}
            >
              <label style={{ fontWeight: 600, display: 'block', marginBottom: '0.6rem' }}>
                Episode Homepage Details
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label
                    htmlFor="schedule-title"
                    className="small muted"
                    style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}
                  >
                    Homepage Title <span style={{ color: 'var(--accent, #e11d48)' }}>*</span>
                  </label>
                  <input
                    id="schedule-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter episode title for homepage"
                    required
                    disabled={busy}
                    style={{ width: '100%' }}
                  />
                  <p className="small muted" style={{ margin: '0.25rem 0 0', fontSize: '0.78rem' }}>
                    Headline displayed on the homepage carousel card.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="schedule-description"
                    className="small muted"
                    style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}
                  >
                    Homepage Description
                  </label>
                  <textarea
                    id="schedule-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description or highlights for homepage listeners..."
                    rows={3}
                    disabled={busy}
                    style={{
                      width: '100%',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      fontSize: '0.88rem',
                      lineHeight: '1.4',
                    }}
                  />
                  <p className="small muted" style={{ margin: '0.25rem 0 0', fontSize: '0.78rem' }}>
                    Optional summary shown beneath the title on the carousel.
                  </p>
                </div>
              </div>
            </div>

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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.75rem' }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    cursor: 'pointer',
                    fontSize: '0.92rem',
                    width: 'fit-content',
                  }}
                >
                  <input
                    type="radio"
                    name="publish-mode"
                    value="immediate"
                    checked={mode === 'immediate'}
                    onChange={() => setMode('immediate')}
                    style={{ width: 'auto', margin: 0, flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span>
                    <strong>Show immediately</strong> (goes live as soon as saved)
                  </span>
                </label>

                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    cursor: 'pointer',
                    fontSize: '0.92rem',
                    width: 'fit-content',
                  }}
                >
                  <input
                    type="radio"
                    name="publish-mode"
                    value="schedule"
                    checked={mode === 'schedule'}
                    onChange={() => setMode('schedule')}
                    style={{ width: 'auto', margin: 0, flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span>
                    <strong>Schedule for later</strong>
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
                <label
                  style={{
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={hasExpiry}
                    onChange={(e) => setHasExpiry(e.target.checked)}
                    style={{ width: 'auto', margin: 0, flexShrink: 0, cursor: 'pointer' }}
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
                        onClick={applySameDayMidnightExpiry}
                      >
                        Same Day (11:59 PM)
                      </button>
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
              {(episode.show_on_homepage ||
                episode.publish_status === 'SCHEDULED' ||
                episode.publish_status === 'PUBLISHED' ||
                episode.publish_status === 'FAILED' ||
                episode.publish_status === 'EXPIRED') && (
                <button
                  type="button"
                  className="small danger"
                  disabled={busy}
                  onClick={handleRemove}
                >
                  {busy
                    ? 'Working…'
                    : episode.publish_status === 'SCHEDULED' || episode.publish_status === 'FAILED'
                      ? 'Unschedule to Draft'
                      : 'Move to Draft'}
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
