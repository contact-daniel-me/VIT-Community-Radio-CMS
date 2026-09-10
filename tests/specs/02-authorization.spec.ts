/**
 * Authorization tests. Every case here simulates someone bypassing the React
 * app entirely and talking to the database with a valid JWT.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, minutesFromNow, type TestDb } from '../harness/db';

describe('row level security', () => {
  let db: TestDb;
  let admin: string;
  let producer: string;
  let rjOwner: string;
  let rjOther: string;
  let qc: string;
  let programId: string;
  let ownedEpisode: string;
  let approvedEpisode: string;

  beforeAll(async () => {
    db = await createTestDb();
    admin = await db.createUser({ email: 'adm@vit.ac.in', fullName: 'Admin', role: 'ADMIN' });
    producer = await db.createUser({ email: 'prd@vit.ac.in', fullName: 'Prod', role: 'PRODUCER' });
    rjOwner = await db.createUser({ email: 'rj1@vit.ac.in', fullName: 'RJ One', role: 'RJ' });
    rjOther = await db.createUser({ email: 'rj2@vit.ac.in', fullName: 'RJ Two', role: 'RJ' });
    qc = await db.createUser({ email: 'qc1@vit.ac.in', fullName: 'QC One', role: 'QC' });

    const program = await db.asUser<{ id: string }>(
      producer,
      `insert into public.programs (name, created_by) values ('Auth Test Show', $1) returning id`,
      [producer],
    );
    programId = program[0].id;

    const owned = await db.asUser<{ id: string }>(
      rjOwner,
      `insert into public.episodes (program_id, title, created_by) values ($1, 'Owned episode', $2) returning id`,
      [programId, rjOwner],
    );
    ownedEpisode = owned[0].id;

    // A fully approved episode with audio, used for scheduling checks.
    const approved = await db.asUser<{ id: string }>(
      producer,
      `insert into public.episodes (program_id, title, created_by) values ($1, 'Approved episode', $2) returning id`,
      [programId, producer],
    );
    approvedEpisode = approved[0].id;
    const audio = await db.asUser<{ id: string }>(
      producer,
      `insert into public.audio_files (episode_id, file_name, storage_path, mime_type, file_size, uploaded_by)
       values ($1::uuid, 'x.mp3', 'episodes/' || ($1::uuid)::text || '/x.mp3', 'audio/mpeg', 1000, $2::uuid)
       returning id`,
      [approvedEpisode, producer],
    );
    await db.asUser(producer, `update public.episodes set audio_file_id = $1 where id = $2`, [
      audio[0].id,
      approvedEpisode,
    ]);
    await db.asUser(producer, `select public.submit_episode_for_qc($1)`, [approvedEpisode]);
    await db.asUser(qc, `select public.approve_episode($1, 'ok')`, [approvedEpisode]);
  });

  afterAll(async () => {
    await db?.close();
  });

  // ---------------------------------------------------------------------------
  // anon
  // ---------------------------------------------------------------------------
  it('gives an unauthenticated visitor nothing at all', async () => {
    for (const table of [
      'profiles',
      'programs',
      'episodes',
      'audio_files',
      'qc_reviews',
      'schedules',
      'broadcast_state',
      'activity_logs',
    ]) {
      await expectFailure(
        () => db.asAnon(`select * from public.${table}`),
        /permission denied/i,
      );
    }
  });

  it('refuses anonymous RPC calls', async () => {
    await expectFailure(
      () => db.asAnon(`select public.approve_episode($1, null)`, [approvedEpisode]),
      /permission denied/i,
    );
  });

  // ---------------------------------------------------------------------------
  // programs
  // ---------------------------------------------------------------------------
  it('lets every station member read programs', async () => {
    for (const user of [admin, producer, rjOwner, qc]) {
      const rows = await db.asUser(user, `select id from public.programs`);
      expect(rows.length).toBeGreaterThan(0);
    }
  });

  it('stops an RJ and QC from creating programs', async () => {
    for (const user of [rjOwner, qc]) {
      await expectFailure(
        () =>
          db.asUser(
            user,
            `insert into public.programs (name, created_by) values ('Pirate Show', $1)`,
            [user],
          ),
        /violates row-level security/i,
      );
    }
  });

  it('stops a producer from forging another user as the program author', async () => {
    await expectFailure(
      () =>
        db.asUser(
          producer,
          `insert into public.programs (name, created_by) values ('Forged Show', $1)`,
          [admin],
        ),
      /violates row-level security/i,
    );
  });

  it('gives nobody a DELETE path on programs, episodes or schedules', async () => {
    // Not even a filtered no-op: DELETE is never granted, so these fail outright.
    // Business rule 13 -- deactivate, archive or cancel instead.
    for (const table of ['programs', 'episodes', 'schedules']) {
      await expectFailure(
        () => db.asUser(admin, `delete from public.${table}`),
        /permission denied/i,
      );
    }
  });

  // ---------------------------------------------------------------------------
  // episodes
  // ---------------------------------------------------------------------------
  it("stops an RJ editing another RJ's episode", async () => {
    const changed = await db.asUser(
      rjOther,
      `update public.episodes set title = 'Hijacked' where id = $1 returning id`,
      [ownedEpisode],
    );
    expect(changed).toHaveLength(0);
  });

  it('lets a producer edit any draft episode', async () => {
    const changed = await db.asUser(
      producer,
      `update public.episodes set description = 'Producer note' where id = $1 returning id`,
      [ownedEpisode],
    );
    expect(changed).toHaveLength(1);
  });

  it('stops QC from writing content', async () => {
    await expectFailure(
      () =>
        db.asUser(
          qc,
          `insert into public.episodes (program_id, title, created_by) values ($1, 'QC wrote this', $2)`,
          [programId, qc],
        ),
      /violates row-level security/i,
    );

    const changed = await db.asUser(
      qc,
      `update public.episodes set title = 'QC retitle' where id = $1 returning id`,
      [ownedEpisode],
    );
    expect(changed).toHaveLength(0);
  });

  it('stops an RJ from claiming authorship of an episode', async () => {
    await expectFailure(
      () =>
        db.asUser(
          rjOther,
          `insert into public.episodes (program_id, title, created_by) values ($1, 'Forged', $2)`,
          [programId, rjOwner],
        ),
      /violates row-level security/i,
    );
  });

  // ---------------------------------------------------------------------------
  // QC actions
  // ---------------------------------------------------------------------------
  it('stops a producer or RJ from approving content', async () => {
    await db.asUser(rjOwner, `select public.submit_episode_for_qc($1)`, [ownedEpisode]).catch(
      () => undefined,
    );

    for (const user of [producer, rjOwner]) {
      await expectFailure(
        () => db.asUser(user, `select public.approve_episode($1, null)`, [ownedEpisode]),
        /Only QC reviewers can approve/i,
      );
      await expectFailure(
        () => db.asUser(user, `select public.reject_episode($1, 'nope not good')`, [ownedEpisode]),
        /Only QC reviewers can reject/i,
      );
    }
  });

  it('keeps the QC ledger immutable', async () => {
    await expectFailure(
      () =>
        db.asUser(
          qc,
          `insert into public.qc_reviews (episode_id, reviewer_id, decision, comment)
           values ($1, $2, 'APPROVED', 'forged')`,
          [approvedEpisode, qc],
        ),
      /violates row-level security|permission denied/i,
    );
    await expectFailure(
      () => db.asUser(admin, `delete from public.qc_reviews where episode_id = $1`, [approvedEpisode]),
      /permission denied/i,
    );
    await expectFailure(
      () => db.asUser(admin, `update public.qc_reviews set comment = 'edited'`),
      /permission denied/i,
    );
  });

  // ---------------------------------------------------------------------------
  // schedules and broadcast
  // ---------------------------------------------------------------------------
  it('stops an RJ and QC from scheduling', async () => {
    for (const user of [rjOwner, qc]) {
      await expectFailure(
        () =>
          db.asUser(
            user,
            `select public.schedule_episode($1, $2, $3::timestamptz, $4::timestamptz, null)`,
            [programId, approvedEpisode, minutesFromNow(600), minutesFromNow(660)],
          ),
        /Only producers and administrators can create schedules/i,
      );
    }
  });

  it('stops QC from putting the station on air', async () => {
    const slot = await db.asUser<{ id: string }>(
      producer,
      `select id from public.schedule_episode($1, $2, $3::timestamptz, $4::timestamptz, null)`,
      [programId, approvedEpisode, minutesFromNow(700), minutesFromNow(760)],
    );
    await expectFailure(
      () => db.asUser(qc, `select public.start_broadcast($1)`, [slot[0].id]),
      /not allowed to put the station on air/i,
    );
  });

  it('lets nobody write broadcast_state directly', async () => {
    for (const user of [admin, producer]) {
      await expectFailure(
        () => db.asUser(user, `update public.broadcast_state set status = 'ON_AIR' where id`),
        /permission denied/i,
      );
    }
  });

  it('refuses a schedule on an inactive program (business rule 9)', async () => {
    const inactive = await db.asUser<{ id: string }>(
      producer,
      `insert into public.programs (name, active, created_by) values ('Retired Show', false, $1) returning id`,
      [producer],
    );
    await expectFailure(
      () =>
        db.asUser(
          producer,
          `select public.schedule_episode($1, null, $2::timestamptz, $3::timestamptz, null)`,
          [inactive[0].id, minutesFromNow(800), minutesFromNow(860)],
        ),
      /is inactive and cannot be scheduled/i,
    );
  });

  // ---------------------------------------------------------------------------
  // profiles: privilege escalation
  // ---------------------------------------------------------------------------
  it('stops a user promoting themselves to ADMIN', async () => {
    await expectFailure(
      () => db.asUser(rjOwner, `update public.profiles set role = 'ADMIN' where id = $1`, [rjOwner]),
      /Only an administrator can change a role/i,
    );
  });

  it('stops a user editing somebody else’s profile', async () => {
    const changed = await db.asUser(
      rjOwner,
      `update public.profiles set full_name = 'Renamed' where id = $1 returning id`,
      [rjOther],
    );
    expect(changed).toHaveLength(0);
  });

  it('lets a user rename themselves', async () => {
    const changed = await db.asUser(
      rjOwner,
      `update public.profiles set full_name = 'RJ One Updated' where id = $1 returning full_name`,
      [rjOwner],
    );
    expect(changed).toHaveLength(1);
  });

  it('lets an admin change another user’s role, but not their own', async () => {
    const changed = await db.asUser<{ role: string }>(
      admin,
      `update public.profiles set role = 'QC' where id = $1 returning role`,
      [rjOther],
    );
    expect(changed[0].role).toBe('QC');

    await expectFailure(
      () => db.asUser(admin, `update public.profiles set role = 'RJ' where id = $1`, [admin]),
      /cannot change your own role/i,
    );

    await db.asUser(admin, `update public.profiles set role = 'RJ' where id = $1`, [rjOther]);
  });

  it('cuts off a deactivated user immediately', async () => {
    const victim = await db.createUser({
      email: 'gone@vit.ac.in',
      fullName: 'Departed',
      role: 'PRODUCER',
    });
    const before = await db.asUser(victim, `select id from public.programs`);
    expect(before.length).toBeGreaterThan(0);

    await db.asUser(admin, `update public.profiles set active = false where id = $1`, [victim]);

    const after = await db.asUser(victim, `select id from public.programs`);
    expect(after).toHaveLength(0);

    await expectFailure(
      () =>
        db.asUser(victim, `insert into public.programs (name, created_by) values ('Zombie', $1)`, [
          victim,
        ]),
      /violates row-level security/i,
    );
  });

  // ---------------------------------------------------------------------------
  // activity log visibility
  // ---------------------------------------------------------------------------
  it('shows the full audit trail to admins and producers only', async () => {
    const adminRows = await db.asUser(admin, `select id from public.activity_logs`);
    const producerRows = await db.asUser(producer, `select id from public.activity_logs`);
    const rjRows = await db.asUser<{ user_id: string }>(
      rjOwner,
      `select user_id from public.activity_logs`,
    );

    expect(adminRows.length).toBeGreaterThan(0);
    expect(producerRows.length).toBe(adminRows.length);
    expect(rjRows.length).toBeLessThan(adminRows.length);
    expect(rjRows.every((r) => r.user_id === rjOwner)).toBe(true);
  });

  it('lets nobody forge or erase an audit entry', async () => {
    await expectFailure(
      () =>
        db.asUser(
          admin,
          `insert into public.activity_logs (user_id, action, entity_type) values ($1, 'FAKE', 'PROGRAM')`,
          [admin],
        ),
      /permission denied/i,
    );
    await expectFailure(
      () => db.asUser(admin, `delete from public.activity_logs`),
      /permission denied/i,
    );
  });
});
