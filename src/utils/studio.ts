import type { StudioBookingRow } from '@/types/database';

/**
 * The studio grid.
 *
 * These constants MIRROR the CHECK constraints in migration 11
 * (`bookings_operating_hours`, `bookings_half_hour`, `bookings_on_grid`,
 * `bookings_not_lunch`, `bookings_weekday_only`). They exist to DRAW the
 * calendar, never to decide whether a booking is legal — the database does
 * that, and it will reject anything these get wrong.
 *
 * If the station's hours ever change, the migration is the thing to change
 * first; this file follows it.
 */

export const STUDIO_OPEN = '09:00';
export const STUDIO_CLOSE = '18:00';
export const SLOT_MINUTES = 30;
export const LUNCH_START = '13:00';
export const LUNCH_END = '14:00';

/** Hours ahead an RJ must book. Enforced by app.enforce_booking_window(). */
export const BOOKING_NOTICE_HOURS = 24;

export interface GridSlot {
  /** 'HH:MM' start, matching studio_bookings.start_time. */
  start: string;
  /** 'HH:MM' end. */
  end: string;
  /** True for the 13:00 and 13:30 rows, which are drawn but never bookable. */
  isLunch: boolean;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Every row of the calendar, including the two lunch rows.
 *
 * Lunch is rendered rather than skipped: a gap in the grid reads as a rendering
 * bug, whereas a labelled LUNCH band reads as a decision.
 */
export function buildGrid(): GridSlot[] {
  const slots: GridSlot[] = [];
  const close = toMinutes(STUDIO_CLOSE);
  const lunchStart = toMinutes(LUNCH_START);
  const lunchEnd = toMinutes(LUNCH_END);

  for (let m = toMinutes(STUDIO_OPEN); m < close; m += SLOT_MINUTES) {
    slots.push({
      start: toHHMM(m),
      end: toHHMM(m + SLOT_MINUTES),
      isLunch: m >= lunchStart && m < lunchEnd,
    });
  }
  return slots;
}

/** The bookable rows only — what the database would actually accept. */
export function bookableSlots(): GridSlot[] {
  return buildGrid().filter((s) => !s.isLunch);
}

/** Monday of the week containing `date`, as YYYY-MM-DD. */
export function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const delta = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** The five working days of the week starting at `monday`. */
export function weekdaysFrom(monday: string): string[] {
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

/** Station-local instant for a slot, as a Date. */
export function slotStartsAt(date: string, start: string): Date {
  // Booking dates and times are station-local by definition, and IST has no
  // daylight saving, so a fixed offset is exact.
  return new Date(`${date}T${start}:00+05:30`);
}

export function isPast(date: string, start: string): boolean {
  return slotStartsAt(date, start).getTime() <= Date.now();
}

/**
 * Whether the 24-hour notice rule allows a normal booking.
 * The database decides for real; this only chooses which UI to show.
 */
export function withinNoticeWindow(date: string, start: string): boolean {
  const lead = slotStartsAt(date, start).getTime() - Date.now();
  return lead < BOOKING_NOTICE_HOURS * 3600 * 1000;
}

/** '09:30' -> '9:30 AM' */
export function formatSlotTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** '2026-09-16' -> 'Wednesday, 16 September' */
export function formatBookingDate(iso: string, opts: { short?: boolean } = {}): string {
  const d = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat('en-IN', {
    weekday: opts.short ? 'short' : 'long',
    day: 'numeric',
    month: opts.short ? 'short' : 'long',
  }).format(d);
}

export function formatDayNumber(iso: string): string {
  return String(new Date(`${iso}T12:00:00`).getDate());
}

export type SlotState =
  | 'AVAILABLE'   // free, and far enough ahead to book normally
  | 'NOTICE'      // free, but inside the 24-hour window
  | 'BOOKED'      // taken by somebody else
  | 'MINE'        // taken by the current user
  | 'LUNCH'
  | 'PAST';

export interface CalendarSlot extends GridSlot {
  date: string;
  state: SlotState;
  /** Only ever set for the viewer's own bookings. */
  booking: StudioBookingRow | null;
}

export interface CalendarDay {
  date: string;
  slots: CalendarSlot[];
}

/**
 * Turns the fixed grid plus whatever the caller can see into the calendar.
 *
 * Exported and pure so the derivation can be tested without a browser: given
 * the same bookings and clock, it always produces the same states.
 */
export function deriveWeek(
  days: string[],
  occupied: { booking_date: string; start_time: string }[],
  mine: StudioBookingRow[],
  viewerId: string | null,
): CalendarDay[] {
  // 'HH:MM:SS' comes back from postgres `time`; the grid uses 'HH:MM'.
  const key = (date: string, time: string) => `${date}|${time.slice(0, 5)}`;

  const takenKeys = new Set(occupied.map((o) => key(o.booking_date, o.start_time)));
  const mineByKey = new Map(
    mine
      .filter((b) => b.status !== 'CANCELLED')
      .map((b) => [key(b.booking_date, b.start_time), b]),
  );

  return days.map((date) => ({
    date,
    slots: buildGrid().map((slot) => {
      const k = key(date, slot.start);
      const ownBooking = mineByKey.get(k) ?? null;

      let state: SlotState;
      if (slot.isLunch) {
        state = 'LUNCH';
      } else if (ownBooking && viewerId) {
        state = 'MINE';
      } else if (takenKeys.has(k)) {
        state = 'BOOKED';
      } else if (isPast(date, slot.start)) {
        state = 'PAST';
      } else if (withinNoticeWindow(date, slot.start)) {
        state = 'NOTICE';
      } else {
        state = 'AVAILABLE';
      }

      // A slot the viewer owns stays visible as theirs even once it has passed,
      // so their own week does not silently empty out.
      if (ownBooking && slot.isLunch === false) state = 'MINE';

      return { ...slot, date, state, booking: ownBooking };
    }),
  }));
}

