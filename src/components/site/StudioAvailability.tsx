import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { StudioCalendar, StudioDayList } from '@/components/studio/StudioCalendar';
import { BookingDialog } from '@/components/studio/BookingDialog';
import { UnifiedStatusBadge } from '@/components/ui';
import { bookingService, type BookingWithPeople } from '@/services/bookingService';
import { can } from '@/lib/permissions';
import type { CalendarSlot } from '@/utils/studio';
import {
  addDays,
  addMonths,
  addYears,
  formatBookingDate,
  formatSlotTime,
  getDisplayNotes,
  getDisplayShowName,
  isoDate,
  mondayOf,
  weekdaysFrom,
} from '@/utils/studio';

/**
 * The studio calendar and historical bookings overview.
 *
 * Works signed out for upcoming availability.
 * For administrators, provides full historical navigation across past weeks,
 * months, and years with detailed historical booking records and empty states.
 */
export function StudioAvailability({ showHeading = true }: { showHeading?: boolean } = {}) {
  const { session, profile } = useAuth();
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [selected, setSelected] = useState<CalendarSlot | null>(null);
  const [prompt, setPrompt] = useState<CalendarSlot | null>(null);
  const [activeDay, setActiveDay] = useState(() => {
    const today = isoDate(new Date());
    const days = weekdaysFrom(mondayOf(new Date()));
    return days.includes(today) ? today : days[0];
  });

  const signedIn = Boolean(session && profile);
  const mayBook = profile ? can.bookStudio(profile.role) : false;
  const isAdmin = profile ? can.viewHistoricalCalendar(profile.role) : false;
  const today = isoDate(new Date());
  const thisWeek = mondayOf(new Date());

  const week = useAsync(
    () => bookingService.getWeek(monday, profile?.id ?? null),
    [monday, profile?.id],
  );

  const activeBookings = useAsync(
    () =>
      isAdmin && activeDay
        ? bookingService.getBookingsForDate(activeDay, true)
        : Promise.resolve([] as BookingWithPeople[]),
    [isAdmin, activeDay],
  );

  useEffect(() => {
    const days = weekdaysFrom(monday);
    if (!days.includes(activeDay)) setActiveDay(days[0]);
  }, [monday, activeDay]);

  const refresh = useCallback(() => {
    void week.reload();
    if (isAdmin) void activeBookings.reload();
  }, [week, activeBookings, isAdmin]);

  const onSelect = (slot: CalendarSlot) => {
    setActiveDay(slot.date);

    if (slot.state === 'PAST') {
      // Past dates are not bookable. Selecting updates activeDay to view historical records.
      setSelected(null);
      return;
    }
    if (slot.state === 'BOOKED') {
      // Booked slots cannot be reserved. Selecting updates activeDay.
      setSelected(null);
      return;
    }
    if (slot.state === 'BLOCKED') {
      setPrompt(slot);
      return;
    }
    if (!signedIn) {
      // Never pretend to book. Explain what signing in would allow.
      setPrompt(slot);
      return;
    }
    if (!mayBook || slot.state === 'MINE') {
      setPrompt(slot);
      return;
    }
    setPrompt(null);
    setSelected(slot);
  };

  const days = weekdaysFrom(monday);
  const activeDayObj = week.data?.find((d) => d.date === activeDay);
  const activeDayIsBlocked = activeDayObj?.isBlocked;
  const activeHolidayReason = activeDayObj?.holidayReason;

  return (
    <section className="section" id="studio">
      {/* The CMS supplies its own PageHeader, so the section heading would be a
          duplicate there. */}
      {showHeading && (
        <div className="section-head">
          <div>
            <p className="eyebrow">Book the radio studio</p>
            <h2 className="section-title">Studio availability</h2>
          </div>
          <p className="section-note">
            Monday&ndash;Sunday &middot; 9:00 AM&ndash;8:00 PM &middot; 30-minute slots
          </p>
        </div>
      )}

      <div className="card studio-card">
        <div className="studio-toolbar">
          <div className="studio-range">
            <h3 className="studio-week">
              {formatBookingDate(days[0], { short: true })} &ndash;{' '}
              {formatBookingDate(days[6], { short: true })}
            </h3>
            {monday === thisWeek ? (
              <span className="badge badge-red">This week</span>
            ) : monday < thisWeek ? (
              <span className="badge badge-grey">Historical</span>
            ) : (
              <span className="badge badge-blue">Upcoming</span>
            )}
          </div>

          <div className="studio-nav-container">
            {isAdmin && (
              <div className="studio-date-picker-wrap">
                <label htmlFor="studio-jump-date" className="studio-jump-label">
                  Jump to date:
                </label>
                <input
                  id="studio-jump-date"
                  type="date"
                  value={activeDay}
                  onChange={(e) => {
                    const picked = e.target.value;
                    if (picked) {
                      setMonday(mondayOf(new Date(`${picked}T12:00:00`)));
                      setActiveDay(picked);
                    }
                  }}
                  className="studio-date-picker-input"
                  title="Jump directly to any date, month, or year"
                />
              </div>
            )}

            <div className="studio-nav">
              {isAdmin && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    onClick={() => setMonday(addYears(monday, -1))}
                    title="Navigate back 1 year"
                    aria-label="Previous year"
                  >
                    &laquo; Year
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    onClick={() => setMonday(addMonths(monday, -1))}
                    title="Navigate back 1 month"
                    aria-label="Previous month"
                  >
                    &lsaquo; Month
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={() => setMonday(addDays(monday, -7))}
                title="Go back 1 week"
                aria-label="Previous week"
              >
                &larr; Prev Week
              </button>
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={() => {
                  setMonday(thisWeek);
                  setActiveDay(today);
                }}
                disabled={monday === thisWeek && activeDay === today}
                title="Jump to current week and today"
              >
                This week
              </button>
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={() => setMonday(addDays(monday, 7))}
                title="Go forward 1 week"
                aria-label="Next week"
              >
                Next Week &rarr;
              </button>
              {isAdmin && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    onClick={() => setMonday(addMonths(monday, 1))}
                    title="Navigate forward 1 month"
                    aria-label="Next month"
                  >
                    Month &rsaquo;
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    onClick={() => setMonday(addYears(monday, 1))}
                    title="Navigate forward 1 year"
                    aria-label="Next year"
                  >
                    Year &raquo;
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {week.loading ? (
          <div className="cal-skeleton" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, row) => (
              <div key={row} className="cal-skeleton-row">
                {Array.from({ length: 6 }).map((__, col) => (
                  <span key={col} className="cal-skeleton-cell" />
                ))}
              </div>
            ))}
            <p className="loading">Loading studio availability&hellip;</p>
          </div>
        ) : week.error ? (
          <p className="section-empty" style={{ padding: '1.6rem 1.1rem' }}>
            Studio availability is unavailable right now. Please try again shortly.
          </p>
        ) : (
          <>
            <div className="studio-desktop">
              <StudioCalendar
                week={week.data ?? []}
                selected={selected}
                onSelect={onSelect}
                activeDate={activeDay}
                onPickDate={setActiveDay}
                isAdmin={isAdmin}
                today={today}
              />
            </div>
            <div className="studio-mobile">
              <StudioDayList
                week={week.data ?? []}
                activeDate={activeDay}
                onPickDate={setActiveDay}
                selected={selected}
                onSelect={onSelect}
                isAdmin={isAdmin}
                today={today}
              />
            </div>
          </>
        )}

        <ul className="cal-legend">
          <li><span className="key slot-available" aria-hidden="true">+</span> Available</li>
          <li><span className="key slot-notice" aria-hidden="true">!</span> Inside 24 hours</li>
          <li><span className="key slot-booked" aria-hidden="true">×</span> Booked</li>
          <li><span className="key slot-blocked" aria-hidden="true">⊘</span> Blocked</li>
          {signedIn && (
            <li><span className="key slot-mine" aria-hidden="true">●</span> Yours</li>
          )}
          <li><span className="key slot-past" aria-hidden="true">–</span> Past</li>
        </ul>
      </div>

      {/* Historical and date-specific bookings inspection panel for administrators */}
      {isAdmin && (
        <div className="card studio-historical-card" style={{ marginTop: '1.5rem' }}>
          <div
            className="card-header spread align-center wrap"
            style={{ gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.85rem' }}
          >
            <div>
              <div className="row align-center wrap" style={{ gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 650 }}>
                  Studio Bookings &middot; {formatBookingDate(activeDay)}
                </h3>
                {activeDay < today ? (
                  <span className="badge badge-grey">Historical</span>
                ) : activeDay === today ? (
                  <span className="badge badge-red">Today</span>
                ) : (
                  <span className="badge badge-blue">Upcoming</span>
                )}
              </div>
              <p
                style={{
                  margin: '0.25rem 0 0 0',
                  fontSize: '0.82rem',
                  color: 'var(--ink-faint)',
                }}
              >
                Comprehensive records of studio sessions, RJ allocations, and statuses for this date.
              </p>
            </div>

            <div className="row align-center" style={{ gap: '0.5rem' }}>
              <Link to="/bookings" className="btn btn-outline small">
                All studio bookings &rarr;
              </Link>
            </div>
          </div>

          {activeDayIsBlocked && (
            <div
              className="banner banner-info"
              style={{ margin: '0 0 1rem 0', fontSize: '0.86rem' }}
              role="status"
            >
              <strong>Studio closed / Blocked:</strong>{' '}
              {activeHolidayReason ||
                'Studio bookings were unavailable on this date due to a holiday or scheduled maintenance.'}
            </div>
          )}

          {activeBookings.loading ? (
            <p className="loading" style={{ padding: '1.5rem 0' }}>
              Loading bookings for {formatBookingDate(activeDay)}&hellip;
            </p>
          ) : activeBookings.error ? (
            <p className="section-empty">Could not load bookings for this date.</p>
          ) : (activeBookings.data?.length ?? 0) === 0 ? (
            <div
              className="studio-empty-day"
              style={{
                padding: '2.5rem 1rem',
                textAlign: 'center',
                background: 'var(--bg-sunk)',
                borderRadius: 'var(--r-md)',
              }}
            >
              <p style={{ fontWeight: 650, fontSize: '0.98rem', color: 'var(--ink)' }}>
                No bookings on this date
              </p>
              <p
                style={{
                  fontSize: '0.84rem',
                  color: 'var(--ink-faint)',
                  maxWidth: '440px',
                  margin: '0.35rem auto 0 auto',
                }}
              >
                {activeDay < today
                  ? `There were no studio recording sessions or bookings recorded on ${formatBookingDate(
                      activeDay,
                    )}.`
                  : `No studio recording sessions are currently booked for ${formatBookingDate(
                      activeDay,
                    )}.`}
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table studio-historical-table">
                <thead>
                  <tr>
                    <th>Time Slot</th>
                    <th>Reference</th>
                    <th>Show / Episode Title</th>
                    <th>RJ / Host</th>
                    <th>Editor</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {activeBookings.data!.map((b) => {
                    const showName = getDisplayShowName(
                      b.program?.name,
                      b.notes,
                      b.episode?.title,
                    );
                    const cleanNotes = getDisplayNotes(b.notes);
                    return (
                      <tr
                        key={b.id}
                        className={b.status === 'CANCELLED' ? 'row-cancelled' : undefined}
                      >
                        <td
                          style={{
                            whiteSpace: 'nowrap',
                            fontWeight: 600,
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.84rem',
                          }}
                        >
                          {formatSlotTime(b.start_time.slice(0, 5))} &ndash;{' '}
                          {formatSlotTime(b.end_time.slice(0, 5))}
                        </td>
                        <td>
                          <span
                            className="ref-tag"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                            }}
                          >
                            {b.reference}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{showName}</div>
                          {b.episode?.title &&
                            b.program?.name &&
                            b.episode.title !== b.program.name && (
                              <div
                                style={{ fontSize: '0.78rem', color: 'var(--ink-faint)' }}
                              >
                                {b.program.name}
                              </div>
                            )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 550 }}>
                            {b.rj?.full_name || 'Unassigned'}
                          </div>
                          {b.rj?.email && (
                            <div
                              style={{ fontSize: '0.78rem', color: 'var(--ink-faint)' }}
                            >
                              {b.rj.email}
                            </div>
                          )}
                        </td>
                        <td>
                          {b.self_edit ? (
                            <span className="badge badge-grey">Self-edit</span>
                          ) : b.editor?.full_name ? (
                            <span>{b.editor.full_name}</span>
                          ) : (
                            <span style={{ color: 'var(--ink-faint)' }}>&mdash;</span>
                          )}
                        </td>
                        <td>
                          <UnifiedStatusBadge booking={b} episode={b.episode} />
                        </td>
                        <td
                          style={{
                            maxWidth: '220px',
                            fontSize: '0.82rem',
                            color: 'var(--ink-muted)',
                          }}
                        >
                          {cleanNotes || (
                            <span style={{ color: 'var(--ink-faint)' }}>&mdash;</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {prompt && (
        <div className="studio-prompt" role="status">
          {prompt.state === 'BLOCKED' ? (
            <>
              <p className="studio-prompt-title">
                Studio closed &middot; {formatBookingDate(prompt.date)}
              </p>
              <p>
                Studio bookings are unavailable on this date due to a holiday or scheduled closure.
              </p>
              <button type="button" className="btn btn-ghost" onClick={() => setPrompt(null)}>
                Dismiss
              </button>
            </>
          ) : !signedIn ? (
            <>
              <p className="studio-prompt-title">
                {formatBookingDate(prompt.date)} &middot; {prompt.start}
              </p>
              <p>
                Studio slots are booked by the station team. Sign in to reserve this time, or
                request access if you are new.
              </p>
              <div className="row">
                <Link to="/login" className="btn btn-solid">Sign in to book</Link>
                <Link to="/register" className="btn btn-outline">Request access</Link>
                <button type="button" className="btn btn-ghost" onClick={() => setPrompt(null)}>
                  Dismiss
                </button>
              </div>
            </>
          ) : prompt.state === 'MINE' ? (
            <>
              <p className="studio-prompt-title">This slot is already yours</p>
              <p>
                <Link to="/bookings">See it under My bookings</Link> to review or cancel it.
              </p>
              <button type="button" className="btn btn-ghost" onClick={() => setPrompt(null)}>
                Dismiss
              </button>
            </>
          ) : (
            <>
              <p className="studio-prompt-title">Your role cannot book the studio</p>
              <p>Ask a station administrator if you need booking access.</p>
              <button type="button" className="btn btn-ghost" onClick={() => setPrompt(null)}>
                Dismiss
              </button>
            </>
          )}
        </div>
      )}

      {selected && profile && (
        <BookingDialog
          slot={{ date: selected.date, start: selected.start, end: selected.end }}
          profile={profile}
          onClose={() => setSelected(null)}
          onBooked={refresh}
        />
      )}
    </section>
  );
}
