/**
 * Deleting an account.
 *
 * Every case here calls the function the way the browser does -- as a signed-in
 * user with an ordinary session -- so the rules are proved where they are
 * enforced, in the database, not in the React form.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';

describe('delete_user', () => {
  let db: TestDb;
  let admin: string;
  let secondAdmin: string;
  let producer: string;

  beforeAll(async () => {
    db = await createTestDb();
    admin = await db.createUser({ email: 'del-adm@vit.ac.in', fullName: 'Admin One', role: 'ADMIN' });
    secondAdmin = await db.createUser({
      email: 'del-adm2@vit.ac.in',
      fullName: 'Admin Two',
      role: 'ADMIN',
    });
    producer = await db.createUser({
      email: 'del-prd@vit.ac.in',
      fullName: 'Prod',
      role: 'PRODUCER',
    });
  });

  afterAll(async () => {
    await db.close();
  });

  /** A fresh registration with nothing attached -- the case delete exists for. */
  const newcomer = async (tag: string) =>
    db.createUser({ email: `del-${tag}@vit.ac.in`, fullName: `Newcomer ${tag}`, role: 'RJ' });

  it('removes an account that has no station records', async () => {
    const target = await newcomer('plain');

    const result = await db.asUser<{ delete_user: { email: string } }>(
      admin,
      'select public.delete_user($1) as delete_user',
      [target],
    );
    expect(result[0].delete_user.email).toBe('del-plain@vit.ac.in');

    const profiles = await db.asUser(admin, 'select id from public.profiles where id = $1', [target]);
    expect(profiles).toHaveLength(0);
  });

  it('deletes the auth user too, not just the profile', async () => {
    const target = await newcomer('authrow');
    await db.asUser(admin, 'select public.delete_user($1)', [target]);

    // A leftover auth row would let them sign in with no profile, and would
    // block the address from ever registering again.
    const users = await db.sql('select id from auth.users where id = $1', [target]);
    expect(users).toHaveLength(0);
  });

  it('records the deletion in the activity log, with the email', async () => {
    const target = await newcomer('logged');
    await db.asUser(admin, 'select public.delete_user($1)', [target]);

    const logs = await db.asUser<{ action: string; metadata: { email: string }; user_id: string }>(
      admin,
      `select action, metadata, user_id from public.activity_logs
        where entity_type = 'PROFILE' and entity_id = $1 and action = 'PROFILE_DELETED'`,
      [target],
    );
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata.email).toBe('del-logged@vit.ac.in');
    // The trail names who did it, and that account still exists.
    expect(logs[0].user_id).toBe(admin);
  });

  it('refuses a non-administrator', async () => {
    const target = await newcomer('byproducer');
    await expectFailure(
      () => db.asUser(producer, 'select public.delete_user($1)', [target]),
      /only an administrator/i,
    );

    const still = await db.asUser(admin, 'select id from public.profiles where id = $1', [target]);
    expect(still).toHaveLength(1);
  });

  it('refuses to delete yourself', async () => {
    await expectFailure(
      () => db.asUser(admin, 'select public.delete_user($1)', [admin]),
      /your own account/i,
    );
  });

  it('refuses the last remaining administrator', async () => {
    // Take the second admin out of the running, leaving exactly one.
    await db.asUser(admin, 'update public.profiles set active = false where id = $1', [secondAdmin]);

    await expectFailure(
      () => db.asUser(secondAdmin, 'select public.delete_user($1)', [admin]),
      /only an administrator|last administrator/i,
    );

    await db.asUser(admin, 'update public.profiles set active = true where id = $1', [secondAdmin]);
  });

  it('refuses an unknown user', async () => {
    await expectFailure(
      () =>
        db.asUser(admin, 'select public.delete_user($1)', [
          '00000000-0000-0000-0000-000000000000',
        ]),
      /user not found/i,
    );
  });

  it('refuses when episodes are attached, and names them', async () => {
    const target = await newcomer('hasepisode');
    const program = await db.asUser<{ id: string }>(
      producer,
      `insert into public.programs (name, created_by) values ('Delete Test Show', $1) returning id`,
      [producer],
    );
    await db.asUser(
      target,
      `insert into public.episodes (program_id, title, created_by) values ($1, 'Their episode', $2)`,
      [program[0].id, target],
    );

    const message = await expectFailure(
      () => db.asUser(admin, 'select public.delete_user($1)', [target]),
      /1 episode\(s\)/i,
    );
    // The message has to be actionable, not just a refusal.
    expect(message).toMatch(/deactivate/i);

    const still = await db.asUser(admin, 'select id from public.profiles where id = $1', [target]);
    expect(still).toHaveLength(1);
  });

  it('refuses when a studio booking is attached', async () => {
    const target = await newcomer('hasbooking');
    const program = await db.asUser<{ id: string }>(
      producer,
      `insert into public.programs (name, created_by) values ('Delete Test Show 2', $1) returning id`,
      [producer],
    );
    await db.sql(
      // A real slot: half an hour, on the half hour, on a weekday, and far
      // enough ahead to clear the 24-hour rule.
      `insert into public.studio_bookings
         (rj_id, program_id, language, booking_date, start_time, end_time, created_by)
       values ($1, $2, 'TAMIL',
               date_trunc('week', current_date + interval '10 days')::date,
               '10:00', '10:30', $1)`,
      [target, program[0].id],
    );

    await expectFailure(
      () => db.asUser(admin, 'select public.delete_user($1)', [target]),
      /1 studio booking\(s\)/i,
    );
  });

  it('lists everything attached in one message', async () => {
    const target = await newcomer('multi');
    const program = await db.asUser<{ id: string }>(
      producer,
      `insert into public.programs (name, created_by) values ('Delete Multi Show', $1) returning id`,
      [producer],
    );
    await db.asUser(
      target,
      `insert into public.episodes (program_id, title, created_by) values ($1, 'One', $2)`,
      [program[0].id, target],
    );
    await db.sql(
      // A different half hour: only one booking may hold a given slot.
      `insert into public.studio_bookings
         (rj_id, program_id, language, booking_date, start_time, end_time, created_by)
       values ($1, $2, 'ENGLISH',
               date_trunc('week', current_date + interval '10 days')::date,
               '11:00', '11:30', $1)`,
      [target, program[0].id],
    );

    const message = await expectFailure(
      () => db.asUser(admin, 'select public.delete_user($1)', [target]),
      /episode\(s\)/i,
    );
    // One attempt, one complete answer -- not one refusal per attached thing.
    expect(message).toMatch(/studio booking\(s\)/i);
  });

  it('is not executable by anonymous callers', async () => {
    const grants = await db.sql<{ grantee: string }>(
      `select grantee from information_schema.role_routine_grants
        where routine_name = 'delete_user' and privilege_type = 'EXECUTE'`,
    );
    const grantees = grants.map((g) => g.grantee);
    expect(grantees).toContain('authenticated');
    expect(grantees).not.toContain('anon');
    expect(grantees).not.toContain('PUBLIC');
  });

  it('revokes the anon grant explicitly, not just from PUBLIC', async () => {
    // This cannot be proved against PGlite: hosted Supabase grants EXECUTE on
    // new public functions to anon through default privileges, which a local
    // Postgres does not do, so the grant check above passes here while the
    // deployed function is still reachable by anon. The deployed project was
    // exactly that until the revoke below was added, so the line is asserted
    // directly to stop it being dropped again.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20250101000015_delete_user.sql'),
      'utf8',
    );
    expect(sql).toMatch(/revoke\s+execute\s+on\s+function\s+public\.delete_user\(uuid\)\s+from\s+anon/i);
  });
});
