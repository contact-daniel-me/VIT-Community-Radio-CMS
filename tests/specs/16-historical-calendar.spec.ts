import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';
import {
  addMonths,
  addYears,
  deriveWeek,
  formatBookingDate,
  getDisplayNotes,
  getDisplayShowName,
  isDateInPast,
  weekdaysFrom,
} from '../../src/utils/studio';
import { can } from '../../src/lib/permissions';

describe('Historical Studio Calendar & Bookings', () => {
  describe('Month and Year navigation logic', () => {
    it('shifts weeks accurately backward and forward by month', () => {
      const monday = '2026-10-19';
      const prevMonthMonday = addMonths(monday, -1);
      const nextMonthMonday = addMonths(monday, 1);

      expect(prevMonthMonday).toBe('2026-09-14');
      expect(nextMonthMonday).toBe('2026-11-16');

      // 6 months in the past
      const past6Months = addMonths(monday, -6);
      expect(past6Months.startsWith('2026-04')).toBe(true);
    });

    it('shifts weeks accurately backward and forward by year', () => {
      const monday = '2026-10-19';
      const prevYearMonday = addYears(monday, -1);
      const nextYearMonday = addYears(monday, 1);

      expect(prevYearMonday.startsWith('2025-10')).toBe(true);
      expect(nextYearMonday.startsWith('2027-10')).toBe(true);
    });

    it('identifies past dates correctly relative to today', () => {
      const today = '2026-10-23';
      expect(isDateInPast('2026-10-22', today)).toBe(true);
      expect(isDateInPast('2025-05-15', today)).toBe(true);
      expect(isDateInPast('2026-10-23', today)).toBe(false);
      expect(isDateInPast('2026-10-24', today)).toBe(false);
    });

    it('formats historical booking dates cleanly', () => {
      expect(formatBookingDate('2025-08-15')).toContain('15 August');
      expect(formatBookingDate('2025-08-15', { short: true })).toContain('15 Aug');
    });
  });

  describe('Historical calendar derivation and slot states', () => {
    const pastDays = weekdaysFrom('2025-03-10'); // Mon to Sun in March 2025
    const viewerId = 'viewer-123';

    it('derives historical occupied slots as BOOKED, not blank', () => {
      const occupied = [
        { booking_date: '2025-03-10', start_time: '10:00:00' },
        { booking_date: '2025-03-10', start_time: '10:30:00' },
      ];

      const week = deriveWeek(pastDays, occupied, [], viewerId);
      const mondaySlots = week[0].slots;

      const slot1000 = mondaySlots.find((s) => s.start === '10:00');
      const slot1030 = mondaySlots.find((s) => s.start === '10:30');
      const slot1100 = mondaySlots.find((s) => s.start === '11:00');

      expect(slot1000?.state).toBe('BOOKED');
      expect(slot1030?.state).toBe('BOOKED');
      expect(slot1100?.state).toBe('PAST');
    });

    it('preserves viewer own historical bookings as MINE', () => {
      const occupied = [{ booking_date: '2025-03-11', start_time: '14:00:00' }];
      const mine = [
        {
          id: 'booking-past-1',
          reference: 'VCR-2025-0012',
          rj_id: viewerId,
          booking_date: '2025-03-11',
          start_time: '14:00:00',
          end_time: '14:30:00',
          program_id: 'prog-1',
          language: 'ENGLISH' as const,
          script_status: 'YES' as const,
          script_approver: null,
          self_edit: true,
          editor_id: null,
          status: 'COMPLETED' as const,
          origin: 'RJ' as const,
          override_reason: null,
          notes: null,
          episode_id: null,
          created_by: viewerId,
          created_at: '2025-03-01T00:00:00Z',
          updated_at: '2025-03-01T00:00:00Z',
        },
      ];

      const week = deriveWeek(pastDays, occupied, mine, viewerId);
      const tuesdaySlots = week[1].slots;

      const mySlot = tuesdaySlots.find((s) => s.start === '14:00');
      expect(mySlot?.state).toBe('MINE');
      expect(mySlot?.booking?.reference).toBe('VCR-2025-0012');
    });

    it('marks blocked / holiday days in past weeks as BLOCKED', () => {
      const blockedMap = new Map<string, string | null>([
        ['2025-03-12', 'College Annual Day'],
      ]);

      const week = deriveWeek(pastDays, [], [], viewerId, blockedMap);
      const wednesday = week[2];

      expect(wednesday.isBlocked).toBe(true);
      expect(wednesday.holidayReason).toBe('College Annual Day');
      expect(wednesday.slots.filter((s) => !s.isLunch).every((s) => s.state === 'BLOCKED')).toBe(true);
    });
  });

  describe('Show name and notes parsing for historical displays', () => {
    it('extracts show name from structured notes or fallback to program name', () => {
      expect(getDisplayShowName('Morning Show', '[Show: Campus Vibes]\nExtra text')).toBe('Campus Vibes');
      expect(getDisplayShowName('Weekly Pulse', '[Other Show: Tech Talk]')).toBe('Tech Talk');
      expect(getDisplayShowName('Studio Tour', '[Studio Tour: VIP Delegation]')).toBe('VIP Delegation');
      expect(getDisplayShowName('Special Link', '[Special Link: Live Cricket]')).toBe('Live Cricket');
      expect(getDisplayShowName('General Talk', null, 'Episode 42: Quantum Computing')).toBe('Episode 42: Quantum Computing');
      expect(getDisplayShowName('General Talk', 'No bracketed show')).toBe('General Talk');
    });

    it('strips bracketed metadata from notes to present clean display notes', () => {
      const rawNotes = `[Show: Cultural Beat]
[Submitted Script:
Intro: Hello listeners!
Song 1: Melodies
Outro: Goodbye!
]
Please prepare the studio with 2 microphones.`;

      const clean = getDisplayNotes(rawNotes);
      expect(clean).toBe('Please prepare the studio with 2 microphones.');
      expect(getDisplayNotes('[Show: Test]')).toBeNull();
    });
  });

  describe('Admin vs regular user permissions', () => {
    it('allows ADMIN to view historical calendar navigation', () => {
      expect(can.viewHistoricalCalendar('ADMIN')).toBe(true);
    });

    it('forbids regular roles (RJ, QC, EDITOR) from historical calendar access', () => {
      expect(can.viewHistoricalCalendar('RJ')).toBe(false);
      expect(can.viewHistoricalCalendar('QC')).toBe(false);
      expect(can.viewHistoricalCalendar('EDITOR')).toBe(false);
      expect(can.viewHistoricalCalendar('SECTION_HEAD')).toBe(false);
    });
  });

  describe('Database tests for historical studio bookings and view occupancy', () => {
    let db: TestDb;
    let admin: string;
    let rj: string;
    let defaultProgram: string;

    beforeAll(async () => {
      db = await createTestDb({ seed: true });

      const adminRow = await db.sql(
        `select id from public.profiles where role = 'ADMIN' and active = true limit 1`,
      );
      admin = (adminRow[0] as { id: string }).id;

      const rjRow = await db.sql(
        `select id from public.profiles where role = 'RJ' and active = true limit 1`,
      );
      rj = (rjRow[0] as { id: string }).id;

      const progRow = await db.sql(`select id from public.programs limit 1`);
      defaultProgram = (progRow[0] as { id: string }).id;
    });

    afterAll(async () => {
      if (db) await db.close();
    });

    it('returns occupancy in v_public_studio_calendar for past dates older than 7 days', async () => {
      const pastDate = '2025-01-15'; // Over a year in the past

      // Insert an admin-approved historical booking directly with override
      const [inserted] = await db.asUser(
        admin,
        `insert into public.studio_bookings
           (rj_id, booking_date, start_time, end_time, program_id, language,
            origin, override_reason, self_edit, created_by, status)
         values ($1::uuid, $2::date, '10:00:00'::time, '10:30:00'::time,
                 $3::uuid, 'TAMIL'::public.show_language, 'ADMIN_OVERRIDE'::public.booking_origin,
                 'Historical booking entry test', true, $4::uuid, 'CONFIRMED'::public.booking_status)
         returning id, reference`,
        [rj, pastDate, defaultProgram, admin],
      );

      const bookingId = (inserted as { id: string }).id;

      try {
        // Query v_public_studio_calendar for that historical date
        const rows = await db.sql(
          `select * from public.v_public_studio_calendar where booking_date = $1::date and start_time = '10:00:00'::time`,
          [pastDate],
        );

        expect(rows).toHaveLength(1);
        const dateVal = (rows[0] as any).booking_date;
        const iso = dateVal instanceof Date ? dateVal.toISOString().slice(0, 10) : String(dateVal).slice(0, 10);
        expect(iso).toBe(pastDate);

        // Cancelled bookings should NOT be in v_public_studio_calendar
        await db.asUser(
          admin,
          `update public.studio_bookings set status = 'CANCELLED' where id = $1::uuid`,
          [bookingId],
        );

        const afterCancel = await db.sql(
          `select * from public.v_public_studio_calendar where booking_date = $1::date and start_time = '10:00:00'::time`,
          [pastDate],
        );

        expect(afterCancel).toHaveLength(0);

        // But in public.studio_bookings, the historical cancelled record still exists
        const bookingRecord = await db.asUser(
          admin,
          `select id, reference, status from public.studio_bookings where id = $1::uuid`,
          [bookingId],
        );
        expect(bookingRecord).toHaveLength(1);
        expect((bookingRecord[0] as any).status).toBe('CANCELLED');
      } finally {
        await db.sql(`delete from public.studio_bookings where id = $1::uuid`, [bookingId]);
      }
    });

    it('prevents regular users from booking past dates', async () => {
      const pastDate = '2025-01-16';

      await expectFailure(
        () =>
          db.asUser(
            rj,
            `insert into public.studio_bookings
               (rj_id, booking_date, start_time, end_time, program_id, language,
                origin, self_edit, created_by)
             values ($1::uuid, $2::date, '11:00:00'::time, '11:30:00'::time,
                     $3::uuid, 'TAMIL'::public.show_language, 'RJ'::public.booking_origin,
                     true, $1::uuid)`,
            [rj, pastDate, defaultProgram],
          ),
        /24 hours/,
      );
    });
  });
});
