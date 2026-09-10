import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { StudioCalendar, StudioDayList } from '@/components/studio/StudioCalendar';
import { BookingDialog } from '@/components/studio/BookingDialog';
import { bookingService } from '@/services/bookingService';
import { can } from '@/lib/permissions';
import type { CalendarSlot } from '@/utils/studio';
import { addDays, formatBookingDate, isoDate, mondayOf, weekdaysFrom } from '@/utils/studio';

/**
 * The public studio calendar.
 *
 * Works signed out. Occupancy comes from `v_public_studio_calendar`, which
 * carries only date and start/end time — no name, no email, no show title — so
 * a visitor sees that a slot is taken and nothing about who took it. A signed-in
 * RJ additionally gets their own bookings merged in, which is the only way
 * identity ever enters this view.
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

  const week = useAsync(
    () => bookingService.getWeek(monday, profile?.id ?? null),
    [monday, profile?.id],
  );

  useEffect(() => {
    const days = weekdaysFrom(monday);
    if (!days.includes(activeDay)) setActiveDay(days[0]);
  }, [monday, activeDay]);

  const refresh = useCallback(() => void week.reload(), [week]);

  const onSelect = (slot: CalendarSlot) => {
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
  const thisWeek = mondayOf(new Date());

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
            Monday&ndash;Friday &middot; 9:00 AM&ndash;6:00 PM &middot; 30-minute slots
          </p>
        </div>
      )}

      <div className="card studio-card">
        <div className="studio-toolbar">
          <div className="studio-range">
            <h3 className="studio-week">
              {formatBookingDate(days[0], { short: true })} &ndash;{' '}
              {formatBookingDate(days[4], { short: true })}
            </h3>
            {monday === thisWeek && <span className="badge badge-red">This week</span>}
          </div>

          <div className="studio-nav">
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => setMonday(addDays(monday, -7))}
              aria-label="Previous week"
            >
              &larr; Previous
            </button>
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => setMonday(thisWeek)}
              disabled={monday === thisWeek}
            >
              This week
            </button>
            <button
              type="button"
              className="btn btn-ghost small"
              onClick={() => setMonday(addDays(monday, 7))}
              aria-label="Next week"
            >
              Next &rarr;
            </button>
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
              <StudioCalendar week={week.data ?? []} selected={selected} onSelect={onSelect} />
            </div>
            <div className="studio-mobile">
              <StudioDayList
                week={week.data ?? []}
                activeDate={activeDay}
                onPickDate={setActiveDay}
                selected={selected}
                onSelect={onSelect}
              />
            </div>
          </>
        )}

        <ul className="cal-legend">
          <li><span className="key slot-available" aria-hidden="true">+</span> Available</li>
          <li><span className="key slot-notice" aria-hidden="true">!</span> Inside 24 hours</li>
          <li><span className="key slot-booked" aria-hidden="true">×</span> Booked</li>
          {signedIn && (
            <li><span className="key slot-mine" aria-hidden="true">●</span> Yours</li>
          )}
          <li><span className="key slot-past" aria-hidden="true">–</span> Past</li>
        </ul>
      </div>

      {prompt && (
        <div className="studio-prompt" role="status">
          {!signedIn ? (
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
