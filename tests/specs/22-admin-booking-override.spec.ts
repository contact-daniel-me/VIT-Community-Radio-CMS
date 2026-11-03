/**
 * Administrator Booking Override Specification.
 *
 * Verifies that:
 * 1. Administrators have unrestricted manual booking permissions:
 *    - Book past dates, current date, and future dates.
 *    - Book inside 24-hour notice window.
 *    - Book during lunch breaks (13:00 - 14:00).
 *    - Book outside normal operating hours (e.g. 08:00, 20:30).
 *    - Book during scheduled holiday/maintenance closures.
 *    - Book on behalf of other RJs.
 * 2. Overlapping bookings for administrators are recorded separately without
 *    overwriting or deleting existing bookings.
 * 3. Regular users continue to be blocked from past dates, lunch breaks,
 *    off-hours, closures, and double bookings.
 * 4. Regular users cannot forge origin = 'ADMIN_OVERRIDE'.
 * 5. Full audit records are generated containing administrator ID, booking ID,
 *    date, time slot, override reason, previous slot status, override type, and timestamp.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';

function weekdayFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('administrator booking override', () => {
  let db: TestDb;
  let admin: string;
  let rj: string;
  let otherRj: string;
  let defaultProgram: string;

  const book = (
    user: string,
    fields: Partial<Record<string, unknown>> & { date: string; start: string },
  ) =>
    db.asUser(
      user,
      `insert into public.studio_bookings
         (rj_id, booking_date, start_time, end_time, program_id, language,
          origin, override_reason, self_edit, editor_id, created_by, studio_name)
       values ($1::uuid, $2::date, $3::time, ($3::time + interval '30 minutes'),
               $4::uuid, $5::public.show_language, $6::public.booking_origin, $7, $8, $9::uuid, $10::uuid, $11)
       returning id, reference, status, origin, studio_name`,
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
        fields.studio ?? 'Studio 1',
      ],
    );

  beforeAll(async () => {
    db = await createTestDb();
    admin = await db.createUser({ email: 'override_admin@vit.ac.in', fullName: 'Station Director', role: 'ADMIN' });
    rj = await db.createUser({ email: 'override_rj@vit.ac.in', fullName: 'RJ Priya', role: 'RJ' });
    otherRj = await db.createUser({ email: 'override_rj2@vit.ac.in', fullName: 'RJ Rahul', role: 'RJ' });
    const progRows = await db.sql<{ id: string }>(
      `insert into public.programs (name, category) values ('Admin Override Special', 'GENERAL') returning id`,
    );
    defaultProgram = progRows[0].id;
  });

  afterAll(async () => {
    await db?.close();
  });

  // ---------------------------------------------------------------------------
  // 1. Past dates and immediate bookings
  // ---------------------------------------------------------------------------
  it('allows an administrator to book a past date slot', async () => {
    const pastDate = '2026-10-26'; // Monday, 26 October 2026 as mentioned in prompt
    const rows = await book(admin, {
      date: pastDate,
      start: '10:00',
      rj,
      origin: 'ADMIN_OVERRIDE',
      reason: 'Archival recording session for past broadcast',
      createdBy: admin,
    });
    expect(rows).toHaveLength(1);
    expect(String(rows[0].reference)).toMatch(/^VCR-\d{4}-\d{6}$/);
    expect(rows[0].origin).toBe('ADMIN_OVERRIDE');
  });

  it('allows an administrator to book inside the 24-hour notice window', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await book(admin, {
      date: today,
      start: '11:00',
      rj,
      origin: 'ADMIN_OVERRIDE',
      reason: 'Urgent guest recording on campus today',
      createdBy: admin,
    });
    expect(rows).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 2. Lunch breaks and off-operating hours
  // ---------------------------------------------------------------------------
  it('allows an administrator to book during lunch break (13:00 - 14:00)', async () => {
    const futureDate = weekdayFromNow(5);
    const rows = await book(admin, {
      date: futureDate,
      start: '13:00',
      rj,
      origin: 'ADMIN_OVERRIDE',
      reason: 'VIP interview during lunch recess',
      createdBy: admin,
    });
    expect(rows).toHaveLength(1);
  });

  it('allows an administrator to book outside normal operating hours (e.g. 08:00 and 20:30)', async () => {
    const futureDate = weekdayFromNow(6);
    // Morning before 09:00
    const morning = await book(admin, {
      date: futureDate,
      start: '08:00',
      rj,
      origin: 'ADMIN_OVERRIDE',
      reason: 'Early morning community broadcast',
      createdBy: admin,
    });
    expect(morning).toHaveLength(1);

    // Night after 20:00
    const night = await book(admin, {
      date: futureDate,
      start: '20:30',
      rj,
      origin: 'ADMIN_OVERRIDE',
      reason: 'Late night live broadcast session',
      createdBy: admin,
    });
    expect(night).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 3. Holiday closures override
  // ---------------------------------------------------------------------------
  it('allows an administrator to book during a scheduled holiday closure', async () => {
    const holidayDate = weekdayFromNow(8);
    // Insert holiday
    await db.asUser(
      admin,
      `insert into public.studio_holidays (start_date, end_date, reason) values ($1::date, $1::date, 'Diwali Studio Maintenance')`,
      [holidayDate],
    );

    // Regular RJ must be refused
    await expectFailure(
      () => book(rj, { date: holidayDate, start: '10:00' }),
      /holiday or scheduled closure/i,
    );

    // Administrator override succeeds
    const rows = await book(admin, {
      date: holidayDate,
      start: '10:00',
      rj,
      origin: 'ADMIN_OVERRIDE',
      reason: 'Special festival live broadcast despite maintenance',
      createdBy: admin,
    });
    expect(rows).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 4. Studio selection support
  // ---------------------------------------------------------------------------
  it('supports selecting and recording specific studio facility', async () => {
    const futureDate = weekdayFromNow(10);
    const rows = await book(admin, {
      date: futureDate,
      start: '15:00',
      rj,
      origin: 'ADMIN_OVERRIDE',
      reason: 'Podcast suite recording',
      studio: 'Studio 2 (Production Studio)',
      createdBy: admin,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].studio_name).toBe('Studio 2 (Production Studio)');
  });

  // ---------------------------------------------------------------------------
  // 5. Conflict management & overlapping bookings
  // ---------------------------------------------------------------------------
  it('allows administrator to create an overlapping booking without modifying the existing record', async () => {
    const slotDate = weekdayFromNow(12);
    const slotTime = '11:30';

    // 1. Regular RJ books the slot
    const original = await book(rj, {
      date: slotDate,
      start: slotTime,
    });
    expect(original).toHaveLength(1);
    const originalId = original[0].id as string;
    const originalRef = original[0].reference as string;

    // 2. Another RJ cannot double book it
    await expectFailure(
      () => book(otherRj, { date: slotDate, start: slotTime }),
      /duplicate key|studio_bookings_slot_key/i,
    );

    // 3. Administrator overrides and books the same slot
    const override = await book(admin, {
      date: slotDate,
      start: slotTime,
      rj: otherRj,
      origin: 'ADMIN_OVERRIDE',
      reason: 'Emergency broadcast taking priority, studio shared session',
      createdBy: admin,
    });
    expect(override).toHaveLength(1);
    const overrideId = override[0].id as string;
    const overrideRef = override[0].reference as string;

    // 4. Verify both bookings exist independently with status CONFIRMED
    const allBookings = await db.sql<{ id: string; reference: string; status: string; origin: string }>(
      `select id, reference, status, origin from public.studio_bookings
       where booking_date = $1::date and start_time = $2::time
       order by created_at`,
      [slotDate, `${slotTime}:00`],
    );

    expect(allBookings).toHaveLength(2);
    expect(allBookings[0].id).toBe(originalId);
    expect(allBookings[0].reference).toBe(originalRef);
    expect(allBookings[0].status).toBe('CONFIRMED');
    expect(allBookings[0].origin).toBe('RJ');

    expect(allBookings[1].id).toBe(overrideId);
    expect(allBookings[1].reference).toBe(overrideRef);
    expect(allBookings[1].status).toBe('CONFIRMED');
    expect(allBookings[1].origin).toBe('ADMIN_OVERRIDE');

    // 5. Regular RJ STILL cannot double book on top of this slot
    await expectFailure(
      () => book(rj, { date: slotDate, start: slotTime }),
      /duplicate key|studio_bookings_slot_key/i,
    );
  });

  // ---------------------------------------------------------------------------
  // 6. Security & regular user restrictions
  // ---------------------------------------------------------------------------
  it('stops regular users from bypassing restrictions with origin = ADMIN_OVERRIDE', async () => {
    const futureDate = weekdayFromNow(7);
    await expectFailure(
      () =>
        book(rj, {
          date: futureDate,
          start: '13:00', // lunch
          origin: 'ADMIN_OVERRIDE',
          reason: 'Attempting unauthorized override',
          createdBy: rj,
        }),
      /Only an administrator can create an override|violates row-level security/i,
    );
  });

  it('stops regular users from booking lunch break', async () => {
    const futureDate = weekdayFromNow(7);
    await expectFailure(
      () => book(rj, { date: futureDate, start: '13:00' }),
      /not_lunch|violates check constraint/i,
    );
  });

  it('stops regular users from booking outside operating hours', async () => {
    const futureDate = weekdayFromNow(7);
    await expectFailure(
      () => book(rj, { date: futureDate, start: '08:30' }),
      /operating_hours|violates check constraint/i,
    );
  });

  // ---------------------------------------------------------------------------
  // 7. Audit logging
  // ---------------------------------------------------------------------------
  it('generates a comprehensive audit record for every administrator override', async () => {
    const pastDate = '2026-10-25';
    const rows = await book(admin, {
      date: pastDate,
      start: '16:00',
      rj,
      origin: 'ADMIN_OVERRIDE',
      reason: 'Special guest archival audit test',
      createdBy: admin,
    });
    const bookingId = rows[0].id as string;

    const logs = await db.sql<{
      user_id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      metadata: Record<string, unknown>;
      created_at: string;
    }>(
      `select user_id, action, entity_type, entity_id, metadata, created_at
       from public.activity_logs
       where entity_id = $1::uuid and action = 'BOOKING_OVERRIDE_CREATED'`,
      [bookingId],
    );

    expect(logs).toHaveLength(1);
    const log = logs[0];
    expect(log.user_id).toBe(admin);
    expect(log.entity_id).toBe(bookingId);
    expect(log.entity_type).toBe('SCHEDULE');

    const meta = log.metadata;
    // Check all 8 required audit properties
    expect(meta.administrator_id).toBe(admin);
    expect(meta.booking_id).toBe(bookingId);
    expect(meta.booking_date).toBe(pastDate);
    expect(meta.selected_time_slot).toBe('16:00 - 16:30');
    expect(meta.override_reason).toBe('Special guest archival audit test');
    expect(meta.previous_slot_status).toBe('PAST');
    expect(meta.override_type).toBe('PAST_DATE_OVERRIDE');
    expect(meta.booking_timestamp).toBeDefined();
  });
});

