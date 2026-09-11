/**
 * Calendar derivation.
 *
 * The grid and its slot states are pure functions, so they are tested directly
 * rather than through a rendered DOM: given the same bookings and the same
 * clock they always produce the same result, which is what the calendar and the
 * mobile day list both draw.
 *
 * These cover the frontend half of the booking rules. The authoritative half
 * lives in 06-studio-bookings.spec.ts, which exercises the database.
 */
import { describe, expect, it } from 'vitest';
import {
  bookableSlots,
  deriveWeek,
  buildGrid,
  formatSlotTime,
  isoDate,
  mondayOf,
  weekdaysFrom,
} from '../../src/utils/studio';
import type { StudioBookingRow } from '../../src/types/database';

/** A weekday far enough ahead to clear the 24-hour notice window. */
function futureWeekday(days = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return isoDate(d);
}

function pastWeekday(days = 7): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return isoDate(d);
}

function booking(date: string, start: string, over: Partial<StudioBookingRow> = {}): StudioBookingRow {
  return {
    id: `id-${date}-${start}`,
    reference: 'VCR-2026-000001',
    rj_id: 'rj-1',
    booking_date: date,
    start_time: `${start}:00`,
    end_time: `${start}:00`,
    program_id: '12345678-1234-1234-1234-123456789abc',
    language: 'TAMIL',
    script_status: 'PENDING',
    script_approver: null,
    self_edit: true,
    editor_id: null,
    status: 'CONFIRMED',
    origin: 'RJ',
    override_reason: null,
    notes: null,
    episode_id: null,
    created_by: 'rj-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

describe('the studio grid', () => {
  it('runs 09:00 to 18:00 in 30-minute rows', () => {
    const grid = buildGrid();
    expect(grid).toHaveLength(18);
    expect(grid[0].start).toBe('09:00');
    expect(grid[0].end).toBe('09:30');
    expect(grid.at(-1)?.start).toBe('17:30');
    expect(grid.at(-1)?.end).toBe('18:00');
  });

  it('marks exactly the two lunch rows', () => {
    const lunch = buildGrid().filter((s) => s.isLunch);
    expect(lunch.map((s) => s.start)).toEqual(['13:00', '13:30']);
  });

  it('offers 16 bookable slots, none of them at lunch', () => {
    const slots = bookableSlots();
    expect(slots).toHaveLength(16);
    expect(slots.some((s) => s.isLunch)).toBe(false);
    expect(slots.some((s) => s.start === '13:00' || s.start === '13:30')).toBe(false);
  });

  it('gives five weekdays, Monday first, never a weekend', () => {
    const days = weekdaysFrom(mondayOf(new Date()));
    expect(days).toHaveLength(5);
    for (const day of days) {
      const dow = new Date(`${day}T12:00:00`).getDay();
      expect(dow).toBeGreaterThanOrEqual(1);
      expect(dow).toBeLessThanOrEqual(5);
    }
  });

  it('formats slot times for people, not machines', () => {
    expect(formatSlotTime('09:00')).toBe('9:00 AM');
    expect(formatSlotTime('12:30')).toBe('12:30 PM');
    expect(formatSlotTime('17:30')).toBe('5:30 PM');
  });
});

describe('slot states', () => {
  const viewer = 'rj-1';

  it('marks lunch rows as LUNCH whatever else is true', () => {
    const date = futureWeekday();
    const [day] = deriveWeek([date], [{ booking_date: date, start_time: '13:00:00' }], [], viewer);
    const lunch = day.slots.filter((s) => s.isLunch);
    expect(lunch.every((s) => s.state === 'LUNCH')).toBe(true);
  });

  it("marks another person's booking as BOOKED and carries no booking data", () => {
    const date = futureWeekday();
    const [day] = deriveWeek([date], [{ booking_date: date, start_time: '10:00:00' }], [], viewer);
    const slot = day.slots.find((s) => s.start === '10:00');
    expect(slot?.state).toBe('BOOKED');
    // Privacy: occupancy only, nothing about whose booking it is.
    expect(slot?.booking).toBeNull();
  });

  it('marks the viewer own booking as MINE', () => {
    const date = futureWeekday();
    const mine = booking(date, '11:00');
    const [day] = deriveWeek(
      [date],
      [{ booking_date: date, start_time: '11:00:00' }],
      [mine],
      viewer,
    );
    const slot = day.slots.find((s) => s.start === '11:00');
    expect(slot?.state).toBe('MINE');
    expect(slot?.booking?.reference).toBe('VCR-2026-000001');
  });

  it('ignores the viewer cancelled bookings, so the slot reads as free', () => {
    const date = futureWeekday();
    const cancelled = booking(date, '11:30', { status: 'CANCELLED' });
    const [day] = deriveWeek([date], [], [cancelled], viewer);
    const slot = day.slots.find((s) => s.start === '11:30');
    expect(slot?.state).toBe('AVAILABLE');
    expect(slot?.booking).toBeNull();
  });

  it('marks past slots as PAST', () => {
    const date = pastWeekday();
    const [day] = deriveWeek([date], [], [], viewer);
    expect(day.slots.filter((s) => !s.isLunch).every((s) => s.state === 'PAST')).toBe(true);
  });

  it('marks slots inside the 24-hour window as NOTICE, not AVAILABLE', () => {
    // A slot two hours from now: same day, definitely inside the window.
    const soon = new Date(Date.now() + 2 * 3600 * 1000);
    const date = isoDate(soon);
    const start = `${String(soon.getHours()).padStart(2, '0')}:00`;

    const [day] = deriveWeek([date], [], [], viewer);
    const slot = day.slots.find((s) => s.start === start);
    // Only meaningful when that hour is inside opening hours and not lunch.
    if (slot && !slot.isLunch) {
      expect(['NOTICE', 'PAST']).toContain(slot.state);
      expect(slot.state).not.toBe('AVAILABLE');
    }
  });

  it('marks a far-future free slot as AVAILABLE', () => {
    const date = futureWeekday();
    const [day] = deriveWeek([date], [], [], viewer);
    const slot = day.slots.find((s) => s.start === '15:00');
    expect(slot?.state).toBe('AVAILABLE');
  });

  it('builds one column per weekday with the full row template', () => {
    const days = weekdaysFrom(mondayOf(new Date()));
    const week = deriveWeek(days, [], [], viewer);
    expect(week).toHaveLength(5);
    expect(week.every((d) => d.slots.length === 18)).toBe(true);
  });

  it('shows nothing as MINE for a signed-out visitor', () => {
    const date = futureWeekday();
    const [day] = deriveWeek(
      [date],
      [{ booking_date: date, start_time: '10:00:00' }],
      [],
      null,
    );
    expect(day.slots.some((s) => s.state === 'MINE')).toBe(false);
    expect(day.slots.find((s) => s.start === '10:00')?.state).toBe('BOOKED');
  });
});
