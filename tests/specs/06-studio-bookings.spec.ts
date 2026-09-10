/**
 * Studio booking rules.
 *
 * Every case here talks to the database directly, the way an RJ with a valid
 * JWT and curl would. If a rule only holds because the React form enforces it,
 * these tests fail.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';

/** A weekday `days` ahead, as YYYY-MM-DD, skipping weekends. */
function weekdayFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('studio bookings', () => {
  let db: TestDb;
  let admin: string;
  let rj: string;
  let otherRj: string;
  let editor: string;
  let qc: string;

  const book = (
    user: string,
    fields: Partial<Record<string, unknown>> & { date: string; start: string },
  ) =>
    db.asUser(
      user,
      `insert into public.studio_bookings
         (rj_id, booking_date, start_time, end_time, show_name, language,
          origin, override_reason, self_edit, editor_id, created_by)
       values ($1::uuid, $2::date, $3::time, ($3::time + interval '30 minutes'),
               $4, $5::public.show_language, $6::public.booking_origin, $7, $8, $9::uuid, $10::uuid)
       returning id, reference`,
      [
        fields.rj ?? user,
        fields.date,
        fields.start,
        fields.show ?? 'Test Show',
        fields.language ?? 'TAMIL',
        fields.origin ?? 'RJ',
        fields.reason ?? null,
        fields.selfEdit ?? true,
        fields.editor ?? null,
        fields.createdBy ?? user,
      ],
    );

  beforeAll(async () => {
    db = await createTestDb();
    admin = await db.createUser({ email: 'ba@vit.ac.in', fullName: 'Admin', role: 'ADMIN' });
    rj = await db.createUser({ email: 'brj@vit.ac.in', fullName: 'RJ Daniel', role: 'RJ' });
    otherRj = await db.createUser({ email: 'brj2@vit.ac.in', fullName: 'RJ Two', role: 'RJ' });
    editor = await db.createUser({ email: 'bed@vit.ac.in', fullName: 'Editor', role: 'EDITOR' });
    qc = await db.createUser({ email: 'bqc@vit.ac.in', fullName: 'QC', role: 'QC' });
  });

  afterAll(async () => {
    await db?.close();
  });

  // ---------------------------------------------------------------- the grid
  it('accepts a valid weekday slot and issues a VCR reference', async () => {
    const rows = await book(rj, { date: weekdayFromNow(3), start: '09:00' });
    expect(rows).toHaveLength(1);
    expect(String((rows[0] as { reference: string }).reference)).toMatch(/^VCR-\d{4}-\d{6}$/);
  });

  it('refuses slots outside 09:00-18:00', async () => {
    for (const start of ['08:00', '08:30', '18:00', '19:00']) {
      await expectFailure(
        () => book(rj, { date: weekdayFromNow(4), start }),
        /operating_hours|bookings_time_order|violates check constraint/i,
      );
    }
  });

  it('refuses the 13:00-14:00 lunch break', async () => {
    for (const start of ['13:00', '13:30']) {
      await expectFailure(
        () => book(rj, { date: weekdayFromNow(4), start }),
        /not_lunch|violates check constraint/i,
      );
    }
    // 12:30 and 14:00 sit either side of lunch and must be bookable.
    await book(rj, { date: weekdayFromNow(4), start: '12:30' });
    await book(rj, { date: weekdayFromNow(4), start: '14:00' });
  });

  it('refuses off-grid start times', async () => {
    for (const start of ['09:15', '10:07', '11:45']) {
      await expectFailure(
        () => book(rj, { date: weekdayFromNow(5), start }),
        /on_grid|violates check constraint/i,
      );
    }
  });

  it('refuses weekends', async () => {
    const saturday = new Date();
    saturday.setDate(saturday.getDate() + ((6 - saturday.getDay() + 7) % 7 || 7) + 7);
    expect(saturday.getDay()).toBe(6);
    await expectFailure(
      () => book(rj, { date: saturday.toISOString().slice(0, 10), start: '10:00' }),
      /weekday_only|violates check constraint/i,
    );
  });

  // ------------------------------------------------------- the 24-hour rule
  it('refuses a booking less than 24 hours ahead', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const dow = new Date().getDay();
    if (dow >= 1 && dow <= 5) {
      await expectFailure(
        () => book(rj, { date: today, start: '09:00' }),
        /at least 24 hours in advance/i,
      );
    }

    // Tomorrow at 09:00 is inside the window whenever "now" is after 09:00.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDay() >= 1 && tomorrow.getDay() <= 5 && new Date().getHours() >= 10) {
      await expectFailure(
        () => book(rj, { date: tomorrow.toISOString().slice(0, 10), start: '09:00' }),
        /at least 24 hours in advance/i,
      );
    }
  });

  it('lets an admin override the 24-hour rule, with a reason', async () => {
    const today = new Date();
    const dow = today.getDay();
    if (dow < 1 || dow > 5) return; // nothing to assert at a weekend

    const date = today.toISOString().slice(0, 10);

    // Even an admin must say why.
    await expectFailure(
      () =>
        book(admin, {
          date,
          start: '15:00',
          rj,
          origin: 'ADMIN_OVERRIDE',
          createdBy: admin,
        }),
      /override_needs_reason|violates check constraint/i,
    );

    const rows = await book(admin, {
      date,
      start: '15:00',
      rj,
      origin: 'ADMIN_OVERRIDE',
      reason: 'Guest is only on campus today.',
      createdBy: admin,
    });
    expect(rows).toHaveLength(1);
  });

  it('refuses an override created by anyone who is not an admin', async () => {
    const date = weekdayFromNow(1);
    for (const user of [rj, editor, qc]) {
      await expectFailure(
        () =>
          book(user, {
            date,
            start: '16:00',
            rj: user,
            origin: 'ADMIN_OVERRIDE',
            reason: 'Trying to skip the queue',
            createdBy: user,
          }),
        /Only an administrator can create an override|violates row-level security/i,
      );
    }
  });

  // ------------------------------------------------------- double booking
  it('cannot double-book a slot', async () => {
    const date = weekdayFromNow(6);
    await book(rj, { date, start: '11:00' });
    await expectFailure(
      () => book(otherRj, { date, start: '11:00' }),
      /studio_bookings_slot_key|duplicate key/i,
    );
  });

  it('frees the slot again once cancelled, keeping the cancelled row', async () => {
    const date = weekdayFromNow(7);
    const first = await book(rj, { date, start: '10:30' });
    const id = (first[0] as { id: string }).id;

    await db.asUser(rj, `update public.studio_bookings set status = 'CANCELLED' where id = $1`, [
      id,
    ]);

    // Someone else can now take it...
    await book(otherRj, { date, start: '10:30' });

    // ...and the cancelled booking is still on record.
    const kept = await db.asUser(admin, `select id from public.studio_bookings where id = $1`, [id]);
    expect(kept).toHaveLength(1);
  });

  // ------------------------------------------------------------- people
  it('refuses an RJ assigning themselves as their own editor', async () => {
    await expectFailure(
      () =>
        book(rj, {
          date: weekdayFromNow(8),
          start: '09:30',
          selfEdit: false,
          editor: rj,
        }),
      /edit it myself|violates check constraint/i,
    );
  });

  it('refuses someone who is not an editor', async () => {
    await expectFailure(
      () =>
        book(rj, {
          date: weekdayFromNow(8),
          start: '10:00',
          selfEdit: false,
          editor: qc,
        }),
      /not an editor/i,
    );
  });

  it('accepts a real editor', async () => {
    const rows = await book(rj, {
      date: weekdayFromNow(8),
      start: '11:30',
      selfEdit: false,
      editor,
    });
    expect(rows).toHaveLength(1);
  });

  // --------------------------------------------------------- authorisation
  it('refuses an RJ booking on somebody else behalf', async () => {
    await expectFailure(
      () =>
        book(rj, {
          date: weekdayFromNow(9),
          start: '09:00',
          rj: otherRj,
          createdBy: rj,
        }),
      /violates row-level security/i,
    );
  });

  it('refuses QC creating bookings at all', async () => {
    await expectFailure(
      () => book(qc, { date: weekdayFromNow(9), start: '14:30' }),
      /violates row-level security/i,
    );
  });

  it("stops an RJ editing another RJ's booking", async () => {
    const date = weekdayFromNow(10);
    const created = await book(rj, { date, start: '12:00' });
    const id = (created[0] as { id: string }).id;

    const changed = await db.asUser(
      otherRj,
      `update public.studio_bookings set show_name = 'Hijacked' where id = $1 returning id`,
      [id],
    );
    expect(changed).toHaveLength(0);
  });

  // ------------------------------------------------------- cancellation (12)
  //
  // A past booking cannot be created by an RJ -- the 24-hour trigger refuses it,
  // which is the point of that rule. The admin override path is the one route
  // the database already allows for a slot in the past, so these fixtures use
  // it rather than weakening the trigger to make testing convenient.
  const pastBooking = async (date: string, start: string, owner: string) => {
    const rows = (await book(admin, {
      date,
      start,
      rj: owner,
      origin: 'ADMIN_OVERRIDE',
      reason: 'Fixture for the cancellation-window tests.',
      createdBy: admin,
    })) as { id: string }[];
    return rows[0].id;
  };

  it('lets an RJ cancel their own future booking', async () => {
    const date = weekdayFromNow(11);
    const created = await book(rj, { date, start: '15:00' });
    const id = (created[0] as { id: string }).id;

    const cancelled = await db.asUser<{ status: string }>(
      rj,
      `update public.studio_bookings set status = 'CANCELLED' where id = $1 returning status`,
      [id],
    );
    expect(cancelled[0].status).toBe('CANCELLED');
  });

  it('stops an RJ cancelling a booking once its slot has started', async () => {
    // Yesterday, so the slot has certainly begun.
    const past = new Date();
    past.setDate(past.getDate() - 1);
    while (past.getDay() === 0 || past.getDay() === 6) past.setDate(past.getDate() - 1);
    const id = await pastBooking(past.toISOString().slice(0, 10), '10:00', rj);

    await expectFailure(
      () =>
        db.asUser(rj, `update public.studio_bookings set status = 'CANCELLED' where id = $1`, [id]),
      /already started/i,
    );

    const still = await db.sql<{ status: string }>(
      `select status from public.studio_bookings where id = $1`,
      [id],
    );
    expect(still[0].status).toBe('CONFIRMED');
  });

  it('still lets an administrator settle a booking that has already started', async () => {
    const past = new Date();
    past.setDate(past.getDate() - 2);
    while (past.getDay() === 0 || past.getDay() === 6) past.setDate(past.getDate() - 1);
    const id = await pastBooking(past.toISOString().slice(0, 10), '11:00', rj);

    const settled = await db.asUser<{ status: string }>(
      admin,
      `update public.studio_bookings set status = 'NO_SHOW' where id = $1 returning status`,
      [id],
    );
    expect(settled[0].status).toBe('NO_SHOW');
  });

  it('leaves ordinary edits to a future booking untouched by the guard', async () => {
    const date = weekdayFromNow(12);
    const created = await book(rj, { date, start: '16:00' });
    const id = (created[0] as { id: string }).id;

    const edited = await db.asUser<{ show_name: string }>(
      rj,
      `update public.studio_bookings set show_name = 'Renamed Show' where id = $1 returning show_name`,
      [id],
    );
    expect(edited[0].show_name).toBe('Renamed Show');
  });

  it('gives an anonymous visitor occupancy only — no identity, no show details', async () => {
    const rows = await db.asAnon<Record<string, unknown>>(
      `select * from public.v_public_studio_calendar limit 1`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0]).sort()).toEqual(['booking_date', 'end_time', 'start_time']);

    // And the table itself stays closed.
    await expectFailure(
      () => db.asAnon(`select show_name from public.studio_bookings`),
      /permission denied/i,
    );
  });
});
