import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';
import { deriveWeek, weekdaysFrom } from '../../src/utils/studio';

/** A weekday `days` ahead as YYYY-MM-DD, skipping weekends. */
function weekdayFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('studio holidays and booking closures', () => {
  let db: TestDb;
  let admin: string;
  let rj: string;
  let editor: string;
  let defaultProgram: string;

  const book = (
    user: string,
    fields: Partial<Record<string, unknown>> & { date: string; start: string },
  ) =>
    db.asUser(
      user,
      `insert into public.studio_bookings
         (rj_id, booking_date, start_time, end_time, program_id, language,
          origin, override_reason, self_edit, editor_id, created_by)
       values ($1::uuid, $2::date, $3::time, ($3::time + interval '30 minutes'),
               $4::uuid, $5::public.show_language, $6::public.booking_origin, $7, $8, $9::uuid, $10::uuid)
       returning id, reference`,
      [
        fields.rj ?? user,
        fields.date,
        fields.start,
        fields.program ?? defaultProgram,
        fields.language ?? 'TAMIL',
        fields.origin ?? 'RJ',
        fields.reason ?? null,
        fields.selfEdit ?? true,
        fields.editor ?? null,
        fields.createdBy ?? user,
      ],
    );

  const bookRequest = (
    user: string,
    fields: { date: string; start: string; program?: string },
  ) =>
    db.asUser(
      user,
      `insert into public.studio_booking_requests
         (user_id, booking_date, start_time, end_time, program_id, language,
          script_status, self_edit)
       values ($1::uuid, $2::date, $3::time, ($3::time + interval '30 minutes'),
               $4::uuid, 'TAMIL', 'PENDING', true)
       returning id`,
      [user, fields.date, fields.start, fields.program ?? defaultProgram],
    );

  beforeAll(async () => {
    db = await createTestDb();
    admin = await db.createUser({ email: 'admin_holidays@vit.ac.in', fullName: 'Station Admin', role: 'ADMIN' });
    rj = await db.createUser({ email: 'rj_holidays@vit.ac.in', fullName: 'RJ Priya', role: 'RJ' });
    editor = await db.createUser({ email: 'editor_holidays@vit.ac.in', fullName: 'Editor Anand', role: 'EDITOR' });

    const progRows = await db.sql<{ id: string }>(
      `insert into public.programs (name, category) values ('Holiday Radio Show', 'GENERAL') returning id`,
    );
    defaultProgram = progRows[0].id;
  });

  afterAll(async () => {
    await db?.close();
  });

  // --------------------------------------------------------------------------
  // Authorization & Permissions
  // --------------------------------------------------------------------------
  describe('authorization & RLS permissions', () => {
    it('allows an administrator to create a holiday', async () => {
      const date = weekdayFromNow(30);
      const rows = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason, created_by)
         values ($1::date, $1::date, 'Public Holiday', $2::uuid)
         returning id, reason`,
        [date, admin],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].reason).toBe('Public Holiday');

      // Clean up
      await db.asUser(admin, `delete from public.studio_holidays where id = $1::uuid`, [rows[0].id]);
    });

    it('refuses holiday creation by non-admin users (RJ, Editor)', async () => {
      const date = weekdayFromNow(31);
      await expectFailure(
        () =>
          db.asUser(
            rj,
            `insert into public.studio_holidays (start_date, end_date, reason, created_by)
             values ($1::date, $1::date, 'Unauthorized Holiday', $2::uuid)`,
            [date, rj],
          ),
        /row-level security/i,
      );

      await expectFailure(
        () =>
          db.asUser(
            editor,
            `insert into public.studio_holidays (start_date, end_date, reason, created_by)
             values ($1::date, $1::date, 'Unauthorized Holiday', $2::uuid)`,
            [date, editor],
          ),
        /row-level security/i,
      );
    });

    it('refuses holiday updates and deletions by non-admin users', async () => {
      const date = weekdayFromNow(32);
      const [h] = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason, created_by)
         values ($1::date, $1::date, 'Admin Holiday', $2::uuid)
         returning id`,
        [date, admin],
      );

      // RJ trying to update returns 0 rows affected
      const updateAttempt = await db.asUser(
        rj,
        `update public.studio_holidays set reason = 'Hacked' where id = $1::uuid returning id`,
        [h.id],
      );
      expect(updateAttempt).toHaveLength(0);

      // RJ trying to delete returns 0 rows affected
      const deleteAttempt = await db.asUser(
        rj,
        `delete from public.studio_holidays where id = $1::uuid returning id`,
        [h.id],
      );
      expect(deleteAttempt).toHaveLength(0);

      // Admin can update
      const updated = await db.asUser(
        admin,
        `update public.studio_holidays set reason = 'Studio Maintenance' where id = $1::uuid returning reason`,
        [h.id],
      );
      expect(updated[0].reason).toBe('Studio Maintenance');

      // Admin can delete
      const deleted = await db.asUser(
        admin,
        `delete from public.studio_holidays where id = $1::uuid returning id`,
        [h.id],
      );
      expect(deleted).toHaveLength(1);
    });

    it('allows anyone to query holidays for calendar display', async () => {
      const date = weekdayFromNow(33);
      const [h] = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason, created_by)
         values ($1::date, $1::date, 'College Holiday', $2::uuid)
         returning id`,
        [date, admin],
      );

      // Query as RJ
      const rjRows = await db.asUser(rj, `select * from public.studio_holidays where id = $1::uuid`, [h.id]);
      expect(rjRows).toHaveLength(1);

      // Clean up
      await db.asUser(admin, `delete from public.studio_holidays where id = $1::uuid`, [h.id]);
    });
  });

  // --------------------------------------------------------------------------
  // Date validation and Constraints
  // --------------------------------------------------------------------------
  describe('holiday date validation and overlap prevention', () => {
    it('refuses end date earlier than start date', async () => {
      const start = weekdayFromNow(35);
      const end = weekdayFromNow(34);
      await expectFailure(
        () =>
          db.asUser(
            admin,
            `insert into public.studio_holidays (start_date, end_date, reason)
             values ($1::date, $2::date, 'Invalid Range')`,
            [start, end],
          ),
        /end date cannot be earlier than start date|check/i,
      );
    });

    it('refuses overlapping holiday ranges', async () => {
      const start = weekdayFromNow(36);
      const middle = weekdayFromNow(37);
      const end = weekdayFromNow(38);

      const [h] = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason)
         values ($1::date, $2::date, 'First Block')
         returning id`,
        [start, end],
      );

      // Overlap attempt inside or crossing range
      await expectFailure(
        () =>
          db.asUser(
            admin,
            `insert into public.studio_holidays (start_date, end_date, reason)
             values ($1::date, $2::date, 'Conflicting Block')`,
            [middle, end],
          ),
        /already been scheduled that overlaps/i,
      );

      // Clean up
      await db.asUser(admin, `delete from public.studio_holidays where id = $1::uuid`, [h.id]);
    });
  });

  // --------------------------------------------------------------------------
  // Blocking bookings on holiday dates
  // --------------------------------------------------------------------------
  describe('enforcing closure on studio bookings and requests', () => {
    it('blocks bookings on a single blocked date with the required message', async () => {
      const singleDate = weekdayFromNow(40);
      const [h] = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason, created_by)
         values ($1::date, $1::date, 'Festival Holiday', $2::uuid)
         returning id`,
        [singleDate, admin],
      );

      // Direct booking insert should be refused by backend trigger
      await expectFailure(
        () => book(rj, { date: singleDate, start: '10:00' }),
        /Studio bookings are unavailable on this date due to a holiday or scheduled closure\./,
      );

      // Booking request insert should also be refused
      await expectFailure(
        () => bookRequest(rj, { date: singleDate, start: '10:30' }),
        /Studio bookings are unavailable on this date due to a holiday or scheduled closure\./,
      );

      // Clean up
      await db.asUser(admin, `delete from public.studio_holidays where id = $1::uuid`, [h.id]);
    });

    it('blocks every date in a multi-day holiday range inclusive', async () => {
      const d1 = weekdayFromNow(42);
      const d2 = weekdayFromNow(43);
      const d3 = weekdayFromNow(44);

      const [h] = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason, created_by)
         values ($1::date, $2::date, 'Annual Maintenance', $3::uuid)
         returning id`,
        [d1, d3, admin],
      );

      // Day 1 (start)
      await expectFailure(
        () => book(rj, { date: d1, start: '11:00' }),
        /Studio bookings are unavailable on this date due to a holiday or scheduled closure\./,
      );

      // Day 2 (inclusive middle)
      await expectFailure(
        () => book(rj, { date: d2, start: '14:00' }),
        /Studio bookings are unavailable on this date due to a holiday or scheduled closure\./,
      );

      // Day 3 (end)
      await expectFailure(
        () => book(rj, { date: d3, start: '16:00' }),
        /Studio bookings are unavailable on this date due to a holiday or scheduled closure\./,
      );

      // Clean up
      await db.asUser(admin, `delete from public.studio_holidays where id = $1::uuid`, [h.id]);
    });

    it('reopens bookings when a holiday is removed', async () => {
      const date = weekdayFromNow(46);
      const [h] = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason, created_by)
         values ($1::date, $1::date, 'Temporary Closure', $2::uuid)
         returning id`,
        [date, admin],
      );

      // Refused while blocked
      await expectFailure(
        () => book(rj, { date, start: '10:00' }),
        /Studio bookings are unavailable on this date due to a holiday or scheduled closure\./,
      );

      // Admin removes the holiday
      await db.asUser(admin, `delete from public.studio_holidays where id = $1::uuid`, [h.id]);

      // Now booking succeeds
      const rows = await book(rj, { date, start: '10:00' });
      expect(rows).toHaveLength(1);
      expect(rows[0].reference).toMatch(/^VCR-/);
    });

    it('keeps existing bookings unchanged when a date is blocked', async () => {
      const date = weekdayFromNow(48);

      // 1. RJ makes a booking prior to date closure
      const [existing] = await book(rj, { date, start: '11:00' });
      expect(existing.reference).toMatch(/^VCR-/);

      // 2. Admin blocks the date
      const [h] = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason, created_by)
         values ($1::date, $1::date, 'Emergency Maintenance', $2::uuid)
         returning id`,
        [date, admin],
      );

      // 3. Existing booking still exists and is untouched
      const checkRows = await db.asUser(
        admin,
        `select id, status from public.studio_bookings where id = $1::uuid`,
        [existing.id],
      );
      expect(checkRows).toHaveLength(1);
      expect(checkRows[0].status).toBe('CONFIRMED');

      // 4. RJ can still cancel their existing booking without failure
      await db.asUser(
        rj,
        `update public.studio_bookings set status = 'CANCELLED' where id = $1::uuid`,
        [existing.id],
      );

      // 5. Clean up
      await db.asUser(admin, `delete from public.studio_holidays where id = $1::uuid`, [h.id]);
    });

    it('allows normal booking on dates that are not blocked', async () => {
      const holidayDate = weekdayFromNow(50);
      const freeDate = weekdayFromNow(57); // definitely distinct weekday

      const [h] = await db.asUser(
        admin,
        `insert into public.studio_holidays (start_date, end_date, reason, created_by)
         values ($1::date, $1::date, 'Specific Date Closure', $2::uuid)
         returning id`,
        [holidayDate, admin],
      );

      // Booking on free date succeeds
      const rows = await book(rj, { date: freeDate, start: '15:00' });
      expect(rows).toHaveLength(1);

      // Booking on holiday date fails
      await expectFailure(
        () => book(rj, { date: holidayDate, start: '15:00' }),
        /Studio bookings are unavailable on this date due to a holiday or scheduled closure\./,
      );

      // Clean up
      await db.asUser(admin, `delete from public.studio_holidays where id = $1::uuid`, [h.id]);
    });
  });

  // --------------------------------------------------------------------------
  // Calendar Slot Derivation
  // --------------------------------------------------------------------------
  describe('calendar deriveWeek representation', () => {
    it('marks all slots as BLOCKED on a holiday date and attaches reason', () => {
      const days = weekdaysFrom('2026-11-02'); // Monday 2026-11-02
      const blockedDate = days[2]; // Wednesday

      const blockedDates = new Map<string, string>();
      blockedDates.set(blockedDate, 'Deepavali Festival');

      const week = deriveWeek(
        days,
        [],
        [],
        null,
        blockedDates,
      );

      const wednesday = week.find((d) => d.date === blockedDate);
      expect(wednesday).toBeDefined();
      expect(wednesday!.isBlocked).toBe(true);
      expect(wednesday!.holidayReason).toBe('Deepavali Festival');

      // Every slot on wednesday must be BLOCKED
      for (const slot of wednesday!.slots) {
        expect(slot.state).toBe('BLOCKED');
      }

      // Monday (not blocked) has available slots
      const monday = week.find((d) => d.date === days[0]);
      expect(monday!.isBlocked).toBe(false);
      expect(monday!.slots.some((s) => s.state === 'AVAILABLE')).toBe(true);
    });
  });
});
