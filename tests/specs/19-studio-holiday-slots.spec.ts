import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';
import { deriveWeek, weekdaysFrom, parseHolidaySlots, formatHolidayReason } from '../../src/utils/studio';

function weekdayFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('studio holiday slot-level blocking', () => {
  describe('pure slot helpers and calendar derivation', () => {
    it('parses slots array from native slots column', () => {
      const h = {
        id: '1',
        start_date: '2026-11-04',
        end_date: '2026-11-04',
        reason: 'Maintenance',
        slots: ['09:00', '09:30', '10:00'],
      };
      expect(parseHolidaySlots(h)).toEqual(['09:00', '09:30', '10:00']);
      expect(formatHolidayReason(h.reason)).toBe('Maintenance');
    });

    it('parses slots from fallback [SLOTS:...] tag in reason', () => {
      const h = {
        id: '2',
        start_date: '2026-11-04',
        end_date: '2026-11-04',
        reason: '[SLOTS:14:00,14:30] Equipment Calibration',
        slots: null,
      };
      expect(parseHolidaySlots(h)).toEqual(['14:00', '14:30']);
      expect(formatHolidayReason(h.reason)).toBe('Equipment Calibration');
    });

    it('returns null for full-day closures without slots', () => {
      const h = {
        id: '3',
        start_date: '2026-11-04',
        end_date: '2026-11-04',
        reason: 'Gandhi Jayanti',
        slots: null,
      };
      expect(parseHolidaySlots(h)).toBeNull();
      expect(formatHolidayReason(h.reason)).toBe('Gandhi Jayanti');
    });

    it('marks only specified slots as BLOCKED while keeping other slots on that date AVAILABLE', () => {
      const days = weekdaysFrom('2026-11-02');
      const testDate = days[1]; // Tuesday

      const blockedSlots = new Map<string, string | null>();
      blockedSlots.set(`${testDate}|09:00`, 'Morning Studio Maintenance');
      blockedSlots.set(`${testDate}|09:30`, 'Morning Studio Maintenance');

      const week = deriveWeek(
        days,
        [],
        [],
        null,
        new Map(),
        blockedSlots,
      );

      const tuesday = week.find((d) => d.date === testDate);
      expect(tuesday).toBeDefined();
      expect(tuesday!.isBlocked).toBe(false); // Date itself is not full-day blocked

      const s900 = tuesday!.slots.find((s) => s.start === '09:00');
      const s930 = tuesday!.slots.find((s) => s.start === '09:30');
      const s1000 = tuesday!.slots.find((s) => s.start === '10:00');
      const s1400 = tuesday!.slots.find((s) => s.start === '14:00');

      expect(s900?.state).toBe('BLOCKED');
      expect(s900?.holidayReason).toBe('Morning Studio Maintenance');
      expect(s930?.state).toBe('BLOCKED');
      expect(s930?.holidayReason).toBe('Morning Studio Maintenance');

      expect(s1000?.state).toBe('AVAILABLE');
      expect(s1400?.state).toBe('AVAILABLE');
    });
  });

  describe('database constraints and triggers for slot-level holidays', () => {
    let db: TestDb;
    let admin: string;
    let rj: string;
    let defaultProgram: string;

    const book = (
      user: string,
      fields: { date: string; start: string },
    ) =>
      db.asUser(
        user,
        `insert into public.studio_bookings
           (rj_id, booking_date, start_time, end_time, program_id, language,
            origin, override_reason, self_edit, created_by)
         values ($1::uuid, $2::date, $3::time, ($3::time + interval '30 minutes'),
                 $4::uuid, 'TAMIL', 'RJ', null, true, $1::uuid)
         returning id, reference`,
        [user, fields.date, fields.start, defaultProgram],
      );

    const bookRequest = (
      user: string,
      fields: { date: string; start: string },
    ) =>
      db.asUser(
        user,
        `insert into public.studio_booking_requests
           (user_id, booking_date, start_time, end_time, program_id, language,
            script_status, self_edit)
         values ($1::uuid, $2::date, $3::time, ($3::time + interval '30 minutes'),
                 $4::uuid, 'TAMIL', 'PENDING', true)
         returning id`,
        [user, fields.date, fields.start, defaultProgram],
      );

    beforeAll(async () => {
      db = await createTestDb();
      admin = await db.createUser({ email: 'admin_slots@vit.ac.in', fullName: 'Station Admin Slots', role: 'ADMIN' });
      rj = await db.createUser({ email: 'rj_slots@vit.ac.in', fullName: 'RJ Slots', role: 'RJ' });

      const progRows = await db.sql<{ id: string }>(
        `insert into public.programs (name, category) values ('Slot Holiday Show', 'GENERAL') returning id`,
      );
      defaultProgram = progRows[0].id;
    });

    afterAll(async () => {
      await db?.close();
    });

    it('allows creating a holiday for particular slots', async () => {
      const date = weekdayFromNow(60);
      const rows = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason, slots, created_by)
         values ($1::date, $1::date, 'Mic Calibration', array['09:00', '09:30']::text[], $2::uuid)
         returning id, reason, slots`,
        [date, admin],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].slots).toEqual(['09:00', '09:30']);

      await db.asUser(admin, `delete from public.studio_holidays where id = $1::uuid`, [rows[0].id]);
    });

    it('allows non-overlapping slot closures on the same date', async () => {
      const date = weekdayFromNow(61);
      // Morning block
      const [h1] = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason, slots, created_by)
         values ($1::date, $1::date, 'Morning Maintenance', array['09:00', '09:30']::text[], $2::uuid)
         returning id`,
        [date, admin],
      );

      // Afternoon block on same date
      const [h2] = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason, slots, created_by)
         values ($1::date, $1::date, 'Afternoon Maintenance', array['14:00', '14:30']::text[], $2::uuid)
         returning id`,
        [date, admin],
      );

      expect(h1.id).toBeDefined();
      expect(h2.id).toBeDefined();

      // Clean up
      await db.asUser(admin, `delete from public.studio_holidays where id in ($1::uuid, $2::uuid)`, [h1.id, h2.id]);
    });

    it('prevents overlapping slot closures on the same date', async () => {
      const date = weekdayFromNow(62);
      const [h1] = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason, slots, created_by)
         values ($1::date, $1::date, 'Morning Maintenance', array['09:00', '09:30', '10:00']::text[], $2::uuid)
         returning id`,
        [date, admin],
      );

      // Overlaps at 09:30
      await expectFailure(
        () =>
          db.asUser(
            admin,
            `insert into public.studio_holidays (start_date, end_date, reason, slots, created_by)
             values ($1::date, $1::date, 'Conflicting Block', array['09:30', '10:30']::text[], $2::uuid)`,
            [date, admin],
          ),
        /A holiday or closure has already been scheduled that overlaps with this date range\./,
      );

      await db.asUser(admin, `delete from public.studio_holidays where id = $1::uuid`, [h1.id]);
    });

    it('blocks bookings only for the blocked slots and allows bookings for unblocked slots on the same date', async () => {
      const date = weekdayFromNow(63);
      const [h] = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason, slots, created_by)
         values ($1::date, $1::date, 'Acoustic Test', array['10:00', '10:30']::text[], $2::uuid)
         returning id`,
        [date, admin],
      );

      // Booking 10:00 must fail
      await expectFailure(
        () => book(rj, { date, start: '10:00' }),
        /Studio bookings are unavailable for this slot due to a scheduled holiday or closure\./,
      );

      // Booking 11:00 (unblocked slot on same date) must succeed
      const allowedBooking = await book(rj, { date, start: '11:00' });
      expect(allowedBooking).toHaveLength(1);

      // Booking request at 10:30 (blocked) must fail
      await expectFailure(
        () => bookRequest(rj, { date, start: '10:30' }),
        /Studio bookings are unavailable for this slot due to a scheduled holiday or closure\./,
      );

      // Booking request at 11:30 (unblocked) must succeed
      const allowedReq = await bookRequest(rj, { date, start: '11:30' });
      expect(allowedReq).toHaveLength(1);

      // Clean up
      await db.sql(`delete from public.studio_bookings where id = $1::uuid`, [allowedBooking[0].id]);
      await db.sql(`delete from public.studio_booking_requests where id = $1::uuid`, [allowedReq[0].id]);
      await db.sql(`delete from public.studio_holidays where id = $1::uuid`, [h.id]);
    });
  });
});
