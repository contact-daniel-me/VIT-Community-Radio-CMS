import { useMemo } from 'react';
import type { CalendarDay, CalendarSlot, SlotState } from '@/services/bookingService';
import { formatBookingDate, formatDayNumber, formatSlotTime, isoDate } from '@/utils/studio';

/**
 * The weekly studio grid.
 *
 * Monday to Friday only — the studio is shut at weekends, so there is nothing
 * to draw for Saturday and Sunday and a greyed-out column would only add noise.
 * The weekday rule itself is enforced by `bookings_weekday_only` in the
 * database; this component simply never offers the days it would refuse.
 */

const STATE_LABEL: Record<SlotState, string> = {
  AVAILABLE: 'Available',
  NOTICE: 'Inside 24 hours',
  BOOKED: 'Booked',
  MINE: 'Your booking',
  LUNCH: 'Lunch break',
  PAST: 'Past',
};

/** Which states a click should do something with. */
function isSelectable(state: SlotState): boolean {
  return state === 'AVAILABLE' || state === 'NOTICE' || state === 'MINE';
}

export function StudioCalendar({
  week,
  selected,
  onSelect,
  today = isoDate(new Date()),
}: {
  week: CalendarDay[];
  selected: { date: string; start: string } | null;
  onSelect: (slot: CalendarSlot) => void;
  today?: string;
}) {
  // Every day shares the same row template, so the times column is taken once.
  const rows = useMemo(() => week[0]?.slots ?? [], [week]);

  return (
    <div className="cal" role="group" aria-label="Studio availability, Monday to Friday">
      <div className="cal-scroll">
        <table className="cal-table">
          <caption className="sr-only">
            Studio availability by day and 30-minute slot. The studio is closed at weekends.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="cal-corner">
                <span className="sr-only">Time</span>
              </th>
              {week.map((day) => (
                <th
                  key={day.date}
                  scope="col"
                  className={`cal-head ${day.date === today ? 'is-today' : ''}`}
                >
                  <span className="cal-head-day">
                    {formatBookingDate(day.date, { short: true }).split(',')[0]}
                  </span>
                  <span className="cal-head-date">{formatDayNumber(day.date)}</span>
                </th>
              ))}
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

                  return (
                    <td key={slot.date} className="cal-cell">
                      <button
                        type="button"
                        className={`slot slot-${slot.state.toLowerCase()} ${
                          isSelected ? 'is-selected' : ''
                        }`}
                        disabled={!isSelectable(slot.state)}
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
        Studio closed on weekends &middot; 9:00 AM&ndash;6:00 PM &middot; 30-minute slots
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
}: {
  week: CalendarDay[];
  activeDate: string;
  onPickDate: (date: string) => void;
  selected: { date: string; start: string } | null;
  onSelect: (slot: CalendarSlot) => void;
}) {
  const day = week.find((d) => d.date === activeDate) ?? week[0];

  return (
    <div className="daylist">
      <div className="daylist-days" role="tablist" aria-label="Choose a day">
        {week.map((d) => (
          <button
            key={d.date}
            type="button"
            role="tab"
            aria-selected={d.date === activeDate}
            className={`daylist-day ${d.date === activeDate ? 'is-active' : ''}`}
            onClick={() => onPickDate(d.date)}
          >
            <span className="daylist-dow">
              {formatBookingDate(d.date, { short: true }).split(',')[0]}
            </span>
            <span className="daylist-num">{formatDayNumber(d.date)}</span>
          </button>
        ))}
      </div>

      <ul className="daylist-slots">
        {(day?.slots ?? [])
          .filter((s) => !s.isLunch)
          .map((slot) => {
            const isSelected = selected?.date === slot.date && selected?.start === slot.start;
            return (
              <li key={slot.start}>
                <button
                  type="button"
                  className={`dayslot slot-${slot.state.toLowerCase()} ${
                    isSelected ? 'is-selected' : ''
                  }`}
                  disabled={!isSelectable(slot.state)}
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

      <p className="cal-closed-note">Studio closed on weekends</p>
    </div>
  );
}
