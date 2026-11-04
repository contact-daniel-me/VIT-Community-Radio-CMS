/**
 * Administrator Schedule Delete Specification.
 *
 * Verifies that:
 * 1. Administrators can delete broadcast schedules via the delete_schedule RPC.
 * 2. Administrators can delete broadcast schedules via direct table DELETE.
 * 3. Non-admin users (PRODUCER, RJ, QC) cannot delete schedules.
 * 4. Currently ON_AIR schedules cannot be deleted.
 */
import { describe, expect, it } from 'vitest';
import { createTestDb, expectFailure } from '../harness/db';

describe('administrator schedule delete', () => {
  it('allows administrators to delete schedules and blocks non-admins', async () => {
    const db = await createTestDb();
    const admin = await db.createUser({ email: 'sched_admin@vit.ac.in', fullName: 'Station Director', role: 'ADMIN' });
    const producer = await db.createUser({ email: 'sched_prod@vit.ac.in', fullName: 'Station Producer', role: 'PRODUCER' });
    const rj = await db.createUser({ email: 'sched_rj@vit.ac.in', fullName: 'RJ Ishwarya', role: 'RJ' });

    const [prog] = await db.sql<{ id: string }>(
      `insert into public.programs (name, category) values ('Morning Melody', 'GENERAL') returning id`,
    );

    // Create schedule slot 1
    const [s1] = await db.asUser<{ id: string }>(
      admin,
      `insert into public.schedules (program_id, start_time, end_time, status, created_by)
       values ($1::uuid, '2026-11-10 09:00:00+05:30', '2026-11-10 09:30:00+05:30', 'SCHEDULED', $2::uuid)
       returning id`,
      [prog.id, admin],
    );

    // Create schedule slot 2
    const [s2] = await db.asUser<{ id: string }>(
      admin,
      `insert into public.schedules (program_id, start_time, end_time, status, created_by)
       values ($1::uuid, '2026-11-10 10:00:00+05:30', '2026-11-10 10:30:00+05:30', 'SCHEDULED', $2::uuid)
       returning id`,
      [prog.id, admin],
    );

    // Create schedule slot 3
    const [s3] = await db.asUser<{ id: string }>(
      admin,
      `insert into public.schedules (program_id, start_time, end_time, status, created_by)
       values ($1::uuid, '2026-11-10 11:00:00+05:30', '2026-11-10 11:30:00+05:30', 'SCHEDULED', $2::uuid)
       returning id`,
      [prog.id, admin],
    );

    // 1. RJ and Producer cannot delete schedule
    await expectFailure(
      () => db.asUser(rj, `select public.delete_schedule($1::uuid)`, [s1.id]),
      /Only administrators can delete/i,
    );
    await expectFailure(
      () => db.asUser(producer, `select public.delete_schedule($1::uuid)`, [s1.id]),
      /Only administrators can delete/i,
    );
    // RJ cannot delete schedule row (RLS filters it out, 0 rows deleted)
    const rjDelete = await db.asUser(rj, `delete from public.schedules where id = $1::uuid returning id`, [s1.id]);
    expect(rjDelete.length).toBe(0);
    const stillThere = await db.sql(`select id from public.schedules where id = $1::uuid`, [s1.id]);
    expect(stillThere.length).toBe(1);

    // 2. Admin deletes slot 1 via RPC
    await db.asUser(admin, `select public.delete_schedule($1::uuid)`, [s1.id]);
    const check1 = await db.sql(`select id from public.schedules where id = $1::uuid`, [s1.id]);
    expect(check1.length).toBe(0);

    // 3. Admin deletes slot 2 via direct SQL DELETE
    await db.asUser(admin, `delete from public.schedules where id = $1::uuid`, [s2.id]);
    const check2 = await db.sql(`select id from public.schedules where id = $1::uuid`, [s2.id]);
    expect(check2.length).toBe(0);

    // 4. Cannot delete ON_AIR schedule
    await db.sql(`set app.workflow = 'on'`);
    await db.sql(`update public.schedules set status = 'ON_AIR' where id = $1::uuid`, [s3.id]);
    await db.sql(`set app.workflow = 'off'`);
    await expectFailure(
      () => db.asUser(admin, `select public.delete_schedule($1::uuid)`, [s3.id]),
      /currently on air/i,
    );

    await db.close();
  });
});
