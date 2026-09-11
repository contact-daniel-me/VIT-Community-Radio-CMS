/**
 * The station lineup: what is on air now, what is on next, and what the rest of
 * the station day holds.
 *
 * A slot comes into being in two ways, and both are real data:
 *
 *   * `schedules` -- the broadcast log an administrator builds on the Schedule
 *     screen, and what the booking trigger writes when a session is confirmed.
 *     This is the authoritative record and carries the programme and episode.
 *   * `studio_bookings` -- the RJ's confirmed studio session. It carries the
 *     jockey's name, which a schedule row does not, and it still exists for
 *     bookings made before the trigger did.
 *
 * So the lineup is the union of the two, matched on the instant a slot starts,
 * with the booking filling in what the schedule cannot say. Nothing is invented
 * here: a slot appears only because a row exists for it.
 *
 * Everything in this file is pure. Given the same rows and the same clock it
 * produces the same lineup, which is what lets it be tested without a browser
 * or a database -- and the clock is passed in rather than read, so "is this on
 * air" is decided in one place instead of in three components.
 */
import type {
  BookingStatus,
  CurrentBroadcastRow,
  ScheduleDetailsRow,
  ScheduleStatus,
} from '@/types/database';
import { slotStartsAt } from '@/utils/studio';

/** Where a slot came from. A slot present in both sources reads as SCHEDULE. */
export type SlotSource = 'SCHEDULE' | 'BOOKING';

export interface StationSlot {
  /** Stable React key: the schedule id when there is one, else the booking id. */
  id: string;
  source: SlotSource;
  scheduleId: string | null;
  bookingId: string | null;
  /** The VCR reference, when the slot came from a studio booking. */
  reference: string | null;
  /**
   * Never null in practice for a schedule -- the view joins programs -- but the
   * booking path can only offer what its join returned.
   */
  programName: string | null;
  episodeTitle: string | null;
  hostName: string | null;
  /** UTC instants. Display formatting converts them to station time. */
  startsAt: string;
  endsAt: string;
  /** The stored status. Use `statusAt()` for what to show at a given moment. */
  status: ScheduleStatus;
}

/**
 * The booking columns the lineup needs, described structurally so any select
 * carrying them fits -- the service decides what to join.
 */
export interface LineupBooking {
  id: string;
  reference: string;
  /** YYYY-MM-DD, station-local by definition. */
  booking_date: string;
  /** HH:MM or HH:MM:SS, station-local. */
  start_time: string;
  end_time: string;
  status: BookingStatus;
  rj?: { full_name: string } | null;
  program?: { name: string } | null;
  episode?: { title: string } | null;
}

/**
 * A booking status expressed in schedule terms, so one table and one badge can
 * render both sources. NO_SHOW is a slot that did not happen, which is what
 * CANCELLED already means on air.
 */
const BOOKING_TO_SCHEDULE_STATUS: Record<BookingStatus, ScheduleStatus> = {
  CONFIRMED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'CANCELLED',
};

function toMs(iso: string): number {
  return new Date(iso).getTime();
}

/** Station-local date + time -> a real instant. IST has no daylight saving. */
function bookingInstant(date: string, time: string): string {
  return slotStartsAt(date, time.slice(0, 5)).toISOString();
}

function slotFromSchedule(row: ScheduleDetailsRow): StationSlot {
  return {
    id: row.id,
    source: 'SCHEDULE',
    scheduleId: row.id,
    bookingId: null,
    reference: null,
    programName: row.program_name ?? null,
    episodeTitle: row.episode_title ?? null,
    hostName: row.host_name ?? null,
    startsAt: row.start_time,
    endsAt: row.end_time,
    status: row.status,
  };
}

function slotFromBooking(booking: LineupBooking): StationSlot {
  return {
    id: booking.id,
    source: 'BOOKING',
    scheduleId: null,
    bookingId: booking.id,
    reference: booking.reference ?? null,
    programName: booking.program?.name ?? null,
    episodeTitle: booking.episode?.title ?? null,
    hostName: booking.rj?.full_name ?? null,
    startsAt: bookingInstant(booking.booking_date, booking.start_time),
    endsAt: bookingInstant(booking.booking_date, booking.end_time),
    status: BOOKING_TO_SCHEDULE_STATUS[booking.status],
  };
}

/**
 * Merge the two sources into one ordered lineup.
 *
 * A booking and a schedule that start at the same instant are the same slot --
 * that is exactly what the booking trigger creates -- so the schedule row is
 * kept and the booking only fills the gaps in it: the jockey's name, and the
 * programme or episode when the schedule join had nothing to offer.
 */
export function buildLineup(
  schedules: ScheduleDetailsRow[],
  bookings: LineupBooking[] = [],
): StationSlot[] {
  const byStart = new Map<number, StationSlot>();
  const slots: StationSlot[] = [];

  for (const row of schedules) {
    const slot = slotFromSchedule(row);
    slots.push(slot);

    // The exclusion constraint allows one live slot per instant, but cancelled
    // rows are kept, so a cancelled duplicate must not shadow the live one.
    const held = byStart.get(toMs(slot.startsAt));
    if (!held || (held.status === 'CANCELLED' && slot.status !== 'CANCELLED')) {
      byStart.set(toMs(slot.startsAt), slot);
    }
  }

  for (const booking of bookings) {
    const slot = slotFromBooking(booking);
    const scheduled = byStart.get(toMs(slot.startsAt));

    if (scheduled) {
      scheduled.bookingId = slot.bookingId;
      scheduled.reference = slot.reference;
      scheduled.hostName = scheduled.hostName ?? slot.hostName;
      scheduled.programName = scheduled.programName ?? slot.programName;
      scheduled.episodeTitle = scheduled.episodeTitle ?? slot.episodeTitle;
      continue;
    }

    byStart.set(toMs(slot.startsAt), slot);
    slots.push(slot);
  }

  return slots.sort((a, b) => toMs(a.startsAt) - toMs(b.startsAt));
}

/** Cancelled slots are still drawn, but can never be on air or next up. */
function isLive(slot: StationSlot): boolean {
  return slot.status !== 'CANCELLED';
}

/** The slot whose window contains `now`, if any. */
export function findOnAir(lineup: StationSlot[], now: number): StationSlot | null {
  return (
    lineup.find(
      (slot) => isLive(slot) && toMs(slot.startsAt) <= now && toMs(slot.endsAt) > now,
    ) ?? null
  );
}

/** The first slot that has not started yet. The caller decides the horizon. */
export function findNextUp(lineup: StationSlot[], now: number): StationSlot | null {
  return lineup.find((slot) => isLive(slot) && toMs(slot.startsAt) > now) ?? null;
}

/**
 * What the status badge should say at a given moment.
 *
 * The stored status only changes when somebody presses a button, so a slot that
 * finished an hour ago would otherwise still read "Scheduled" in the table.
 */
export function statusAt(slot: StationSlot, now: number): ScheduleStatus {
  if (slot.status === 'CANCELLED') return 'CANCELLED';
  if (toMs(slot.endsAt) <= now) return 'COMPLETED';
  if (toMs(slot.startsAt) <= now) return 'ON_AIR';
  return 'SCHEDULED';
}

/** How far through its window a slot is, 0 to 1. */
export function slotProgress(slot: StationSlot, now: number): number {
  const start = toMs(slot.startsAt);
  const span = toMs(slot.endsAt) - start;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (now - start) / span));
}

export interface OnAirState {
  live: boolean;
  slot: StationSlot | null;
  /**
   * When an operator actually pressed Start. Null for a slot that is on air
   * because its time has come rather than because somebody started it.
   */
  startedAt: string | null;
}

const OFF_AIR: OnAirState = { live: false, slot: null, startedAt: null };

/** A manually started broadcast whose slot is not in the fetched window. */
function slotFromBroadcast(current: CurrentBroadcastRow): StationSlot | null {
  if (!current.start_time || !current.end_time) return null;
  return {
    id: current.schedule_id ?? 'broadcast',
    source: 'SCHEDULE',
    scheduleId: current.schedule_id,
    bookingId: null,
    reference: null,
    programName: current.program_name,
    episodeTitle: current.episode_title,
    hostName: current.host_name,
    startsAt: current.start_time,
    endsAt: current.end_time,
    status: current.schedule_status ?? 'ON_AIR',
  };
}

/**
 * Is the station on air, and with what?
 *
 * A broadcast somebody started by hand wins, because that is a statement about
 * the transmitter rather than about the diary. Otherwise the clock decides: a
 * slot whose start has passed and whose end has not is on air.
 */
export function deriveOnAir(
  lineup: StationSlot[],
  current: CurrentBroadcastRow | null,
  now: number,
): OnAirState {
  if (current?.broadcast_status === 'ON_AIR') {
    const matched =
      (current.schedule_id
        ? lineup.find((slot) => slot.scheduleId === current.schedule_id)
        : null) ?? slotFromBroadcast(current);

    if (matched) return { live: true, slot: matched, startedAt: current.started_at };
  }

  const onAir = findOnAir(lineup, now);
  return onAir ? { live: true, slot: onAir, startedAt: null } : OFF_AIR;
}
