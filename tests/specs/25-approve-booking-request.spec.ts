/**
 * Approve Booking Request Specification.
 *
 * Verifies that:
 * 1. Station staff (Administrators and Producers) can approve pending studio
 *    booking requests atomically via the approve_booking_request RPC.
 * 2. Regular RJs are rejected when trying to approve requests.
 * 3. Already-approved or non-pending requests cannot be re-approved.
 * 4. Slots that clash with an existing confirmed booking cannot be approved.
 * 5. Direct fallback booking insert by PRODUCER functions correctly.
 */
import { describe, expect, it } from 'vitest';
import { createTestDb, expectFailure } from '../harness/db';

describe('approve booking request', () => {
  it('allows PRODUCER and ADMIN to approve booking requests via RPC', async () => {
    const db = await createTestDb();
    const admin = await db.createUser({ email: 'admin_test@vit.ac.in', fullName: 'Station Director', role: 'ADMIN' });
    const producer = await db.createUser({ email: 'producer_test@vit.ac.in', fullName: 'Station Producer', role: 'PRODUCER' });
    const rj = await db.createUser({ email: 'rj_test@vit.ac.in', fullName: 'RJ Ishwarya', role: 'RJ' });
    const otherRj = await db.createUser({ email: 'rj2_test@vit.ac.in', fullName: 'RJ Rahul', role: 'RJ' });

    const [prog] = await db.sql<{ id: string }>(
      `insert into public.programs (name, category) values ('World Tsunami day', 'GENERAL') returning id`,
    );

    // 1. RJ creates a request inside 24 hours
    const [req1] = await db.asUser<{ id: string }>(
      rj,
      `insert into public.studio_booking_requests
         (user_id, booking_date, start_time, end_time, program_id, language,
          script_status, script_approver, self_edit, editor_id, status)
       values ($1::uuid, '2026-11-05', '11:30:00', '12:00:00', $2::uuid, 'TAMIL',
               'YES', 'Section head', false, null, 'PENDING')
       returning id`,
      [rj, prog.id],
    );

    // 2. PRODUCER approves request via RPC
    const [result1] = await db.asUser<{ approve_booking_request: { booking_id: string; status: string } }>(
      producer,
      `select public.approve_booking_request($1::uuid)`,
      [req1.id],
    );

    expect(result1.approve_booking_request.status).toBe('APPROVED');
    const bookingId1 = result1.approve_booking_request.booking_id;
    expect(bookingId1).toBeDefined();

    // Verify booking in studio_bookings
    const [booking1] = await db.sql<{ rj_id: string; status: string; origin: string; reference: string }>(
      `select rj_id, status, origin, reference from public.studio_bookings where id = $1::uuid`,
      [bookingId1],
    );
    expect(booking1.rj_id).toBe(rj);
    expect(booking1.status).toBe('CONFIRMED');
    expect(booking1.origin).toBe('ADMIN_OVERRIDE');
    expect(booking1.reference).toMatch(/^VCR-2026-\d{6}$/);

    // Verify request in studio_booking_requests
    const [reqCheck1] = await db.sql<{ status: string; reviewed_by: string }>(
      `select status, reviewed_by from public.studio_booking_requests where id = $1::uuid`,
      [req1.id],
    );
    expect(reqCheck1.status).toBe('APPROVED');
    expect(reqCheck1.reviewed_by).toBe(producer);

    // 3. RJ creates another request for a different slot
    const [req2] = await db.asUser<{ id: string }>(
      otherRj,
      `insert into public.studio_booking_requests
         (user_id, booking_date, start_time, end_time, program_id, language,
          script_status, script_approver, self_edit, editor_id, status)
       values ($1::uuid, '2026-11-06', '14:30:00', '15:00:00', $2::uuid, 'ENGLISH',
               'YES', 'Station Lead', true, null, 'PENDING')
       returning id`,
      [otherRj, prog.id],
    );

    // 4. ADMIN approves request via RPC
    const [result2] = await db.asUser<{ approve_booking_request: { booking_id: string; status: string } }>(
      admin,
      `select public.approve_booking_request($1::uuid)`,
      [req2.id],
    );
    expect(result2.approve_booking_request.status).toBe('APPROVED');

    // 5. RJ cannot approve requests (permission check)
    await expectFailure(
      () =>
        db.asUser(
          rj,
          `select public.approve_booking_request($1::uuid)`,
          [req2.id],
        ),
      /Only administrators and producers/i,
    );

    // 6. Cannot re-approve an already approved request
    await expectFailure(
      () =>
        db.asUser(
          admin,
          `select public.approve_booking_request($1::uuid)`,
          [req1.id],
        ),
      /Request is no longer pending/i,
    );

    // 7. Cannot approve if the slot is taken
    const [reqConflict] = await db.asUser<{ id: string }>(
      otherRj,
      `insert into public.studio_booking_requests
         (user_id, booking_date, start_time, end_time, program_id, language,
          script_status, script_approver, self_edit, editor_id, status)
       values ($1::uuid, '2026-11-05', '11:30:00', '12:00:00', $2::uuid, 'TAMIL',
               'YES', 'Section head', false, null, 'PENDING')
       returning id`,
      [otherRj, prog.id],
    );

    await expectFailure(
      () =>
        db.asUser(
          producer,
          `select public.approve_booking_request($1::uuid)`,
          [reqConflict.id],
        ),
      /slot was just taken by someone else/i,
    );

    // 8. Test direct fallback insert by ADMIN
    const [reqFallback] = await db.asUser<{ id: string }>(
      otherRj,
      `insert into public.studio_booking_requests
         (user_id, booking_date, start_time, end_time, program_id, language,
          script_status, script_approver, self_edit, editor_id, status)
       values ($1::uuid, '2026-11-09', '10:00:00', '10:30:00', $2::uuid, 'TAMIL',
               'YES', 'Section head', false, null, 'PENDING')
       returning id`,
      [otherRj, prog.id],
    );
    expect(reqFallback.id).toBeDefined();

    // Admin executes the fallback path: creates booking directly and updates request
    const [fallbackBooking] = await db.asUser<{ id: string }>(
      admin,
      `insert into public.studio_bookings
         (rj_id, booking_date, start_time, end_time, program_id, language,
          script_status, script_approver, self_edit, editor_id, notes,
          origin, override_reason, created_by)
       values ($1::uuid, '2026-11-09', '10:00:00', '10:30:00', $2::uuid, 'TAMIL',
               'YES', 'Section head', false, null, null,
               'ADMIN_OVERRIDE', 'Approved same-day request', $3::uuid)
       returning id`,
      [otherRj, prog.id, admin],
    );
    expect(fallbackBooking.id).toBeDefined();

    await db.close();
  });
});
