import { useMemo } from 'react';
import type { CalendarDay, CalendarSlot, SlotState } from '@/services/bookingService';
import { formatBookingDate, formatDayNumber, formatSlotTime, isoDate } from '@/utils/studio';

/**
 * The weekly studio grid.
 *
 * Monday to Sunday.
 * The weekday rule was previously enforced by `bookings_weekday_only` in the
 * database.
 */

const STATE_LABEL: Record<SlotState, string> = {
  AVAILABLE: 'Available',
  NOTICE: 'Inside 24 hours',
  BOOKED: 'Booked',
  MINE: 'Your booking',
  LUNCH: 'Lunch break',
  PAST: 'Past',
  BLOCKED: 'Blocked',
};

/** Which states a click should do something with. */
function isSelectable(state: SlotState): boolean {
  return state === 'AVAILABLE' || state === 'NOTICE' || state === 'MINE';
}

export function StudioCalendar({
  week,
  selected,
  onSelect,
  activeDate,
  onPickDate,
  isAdmin = false,
  today = isoDate(new Date()),
}: {
  week: CalendarDay[];
  selected: { date: string; start: string } | null;
  onSelect: (slot: CalendarSlot) => void;
  activeDate?: string;
  onPickDate?: (date: string) => void;
  isAdmin?: boolean;
  today?: string;
}) {
  // Every day shares the same row template, so the times column is taken once.
  const rows = useMemo(() => week[0]?.slots ?? [], [week]);

  return (
    <div className="cal" role="group" aria-label="Studio availability, Monday to Sunday">
      <div className="cal-scroll">
        <table className="cal-table">
          <caption className="sr-only">
            Studio availability by day and 30-minute slot.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="cal-corner">
                <span className="sr-only">Time</span>
              </th>
              {week.map((day) => {
                const isTodayDate = day.date === today;
                const isPastDate = day.date < today;
                const isUpcomingDate = day.date > today;
                const isActiveDate = activeDate === day.date;

                return (
                  <th
                    key={day.date}
                    scope="col"
                    className={`cal-head ${isTodayDate ? 'is-today' : ''} ${
                      isPastDate ? 'is-past' : ''
                    } ${isUpcomingDate ? 'is-upcoming' : ''} ${
                      day.isBlocked ? 'is-blocked' : ''
                    } ${isActiveDate ? 'is-active' : ''}`}
                  >
                    <button
                      type="button"
                      className="cal-head-btn"
                      onClick={() => onPickDate?.(day.date)}
                      title={`Select ${formatBookingDate(day.date)}`}
                      aria-label={`${formatBookingDate(day.date)}${
                        isTodayDate ? ' (Today)' : isPastDate ? ' (Past date)' : ''
                      }`}
                    >
                      <span className="cal-head-day">
                        {formatBookingDate(day.date, { short: true }).split(',')[0]}
                      </span>
                      <span className="cal-head-date">{formatDayNumber(day.date)}</span>
                      {isTodayDate && <span className="cal-today-tag">Today</span>}
                      {isPastDate && <span className="cal-past-tag">Past</span>}
                      {day.isBlocked && (
                        <span
                          className="cal-blocked-tag"
                          title={
                            day.holidayReason
                              ? `Studio closed: ${day.holidayReason}`
                              : 'Studio closed: Holiday / Maintenance'
                          }
                        >
                          Blocked
                        </span>
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.start} className={row.isLunch ? 'cal-row-lunch' : undefined}>
                <th scope="row" className="cal-time">
                  {formatSlotTime(row.start)}
                </th>

                {week.map((day) => {
                  const slot = day.slots[rowIndex];
                  const isSelected =
                    selected?.date === slot.date && selected?.start === slot.start;

                  if (slot.isLunch) {
                    // One labelled band per row rather than five identical cells.
                    return day === week[0] ? (
                      <td
                        key={slot.date}
                        className="cal-lunch"
                        colSpan={week.length}
                        aria-label="Lunch break, studio closed"
                      >
                        <span>Lunch break</span>
                      </td>
                    ) : null;
                  }

                  const slotSelectable =
                    isSelectable(slot.state) ||
                    (isAdmin && (slot.state === 'PAST' || slot.state === 'BOOKED'));

                  return (
                    <td key={slot.date} className="cal-cell">
                      <button
                        type="button"
                        className={`slot slot-${slot.state.toLowerCase()} ${
                          isSelected ? 'is-selected' : ''
                        } ${
                          isAdmin && (slot.state === 'PAST' || slot.state === 'BOOKED')
                            ? 'is-admin-selectable'
                            : ''
                        }`}
                        disabled={!slotSelectable}
                        aria-pressed={isSelected}
                        aria-label={`${formatBookingDate(slot.date)}, ${formatSlotTime(
                          slot.start,
                        )} to ${formatSlotTime(slot.end)} — ${STATE_LABEL[slot.state]}`}
                        onClick={() => onSelect(slot)}
                      >
                        {/* Never colour alone: each state carries a glyph and a
                            label for screen readers and colour-blind users. */}
                        <span aria-hidden="true" className="slot-mark">
                          {slot.state === 'MINE'
                            ? '●'
                            : slot.state === 'BOOKED'
                              ? '×'
                              : slot.state === 'PAST'
                                ? '–'
                                : slot.state === 'NOTICE'
                                  ? '!'
                                  : slot.state === 'BLOCKED'
                                    ? '⊘'
                                    : '+'}
                        </span>
                        <span className="slot-text">{STATE_LABEL[slot.state]}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="cal-closed-note">
        9:00 AM&ndash;8:00 PM &middot; 30-minute slots
      </p>
    </div>
  );
}

/**
 * Mobile: pick a day, then read that day down the page.
 *
 * A five-column grid at 390px is unusable, so the interaction changes shape
 * rather than shrinking.
 */
export function StudioDayList({
  week,
  activeDate,
  onPickDate,
  selected,
  onSelect,
  isAdmin = false,
  today = isoDate(new Date()),
}: {
  week: CalendarDay[];
  activeDate: string;
  onPickDate: (date: string) => void;
  selected: { date: string; start: string } | null;
  onSelect: (slot: CalendarSlot) => void;
  isAdmin?: boolean;
  today?: string;
}) {
  const day = week.find((d) => d.date === activeDate) ?? week[0];

  return (
    <div className="daylist">
      <div className="daylist-days" role="tablist" aria-label="Choose a day">
        {week.map((d) => {
          const isTodayDate = d.date === today;
          const isPastDate = d.date < today;

          return (
            <button
              key={d.date}
              type="button"
              role="tab"
              aria-selected={d.date === activeDate}
              className={`daylist-day ${d.date === activeDate ? 'is-active' : ''} ${
                isTodayDate ? 'is-today' : ''
              } ${isPastDate ? 'is-past' : ''} ${d.isBlocked ? 'is-blocked' : ''}`}
              onClick={() => onPickDate(d.date)}
            >
              <span className="daylist-dow">
                {formatBookingDate(d.date, { short: true }).split(',')[0]}
              </span>
              <span className="daylist-num">{formatDayNumber(d.date)}</span>
              {isTodayDate && (
                <span className="cal-today-tag" style={{ marginTop: '0.15rem' }}>
                  Today
                </span>
              )}
              {isPastDate && (
                <span className="cal-past-tag" style={{ marginTop: '0.15rem' }}>
                  Past
                </span>
              )}
              {d.isBlocked && (
                <span className="cal-blocked-tag" style={{ marginTop: '0.15rem' }}>
                  Blocked
                </span>
              )}
            </button>
          );
        })}
      </div>

      {day?.isBlocked && (
        <div
          className="banner banner-info"
          style={{ margin: '0 0 1rem 0', fontSize: '0.86rem' }}
          role="status"
        >
          <strong>Studio closed:</strong>{' '}
          {day.holidayReason ||
            'Studio bookings are unavailable on this date due to a holiday or scheduled closure.'}
        </div>
      )}

      <ul className="daylist-slots">
        {(day?.slots ?? [])
          .filter((s) => !s.isLunch)
          .map((slot) => {
            const isSelected =
              selected?.date === slot.date && selected?.start === slot.start;
            const slotSelectable =
              isSelectable(slot.state) ||
              (isAdmin && (slot.state === 'PAST' || slot.state === 'BOOKED'));

            return (
              <li key={slot.start}>
                <button
                  type="button"
                  className={`dayslot slot-${slot.state.toLowerCase()} ${
                    isSelected ? 'is-selected' : ''
                  } ${
                    isAdmin && (slot.state === 'PAST' || slot.state === 'BOOKED')
                      ? 'is-admin-selectable'
                      : ''
                  }`}
                  disabled={!slotSelectable}
                  onClick={() => onSelect(slot)}
                >
                  <span className="dayslot-time">
                    {formatSlotTime(slot.start)} &ndash; {formatSlotTime(slot.end)}
                  </span>
                  <span className="dayslot-state">{STATE_LABEL[slot.state]}</span>
                </button>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
