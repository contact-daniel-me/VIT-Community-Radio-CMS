/**
 * The public homepage and self-registration.
 *
 * Both widen what an unauthenticated visitor can do, so both are tested from
 * the attacker's side: what exactly can `anon` read, and can a self-registered
 * account reach anything before an administrator approves it?
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';

describe('public site and registration', () => {
  let db: TestDb;
  let admin: string;

  beforeAll(async () => {
    db = await createTestDb({ seed: true });
    admin = '11111111-1111-4111-8111-111111111111'; // seeded ADMIN
  });

  afterAll(async () => {
    await db?.close();
  });

  // ---------------------------------------------------------------------------
  // What anonymous visitors can see
  // ---------------------------------------------------------------------------
  it('lets an anonymous visitor read the two public views', async () => {
    const nowPlaying = await db.asAnon(`select * from public.v_public_now_playing`);
    expect(nowPlaying).toHaveLength(1);

    const schedule = await db.asAnon(`select * from public.v_public_schedule_today`);
    expect(Array.isArray(schedule)).toBe(true);
  });

  it('still gives an anonymous visitor nothing from the tables themselves', async () => {
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

  it('exposes only the curated columns, and no internal ids', async () => {
    const nowPlaying = await db.asAnon<Record<string, unknown>>(
      `select * from public.v_public_now_playing`,
    );
    expect(Object.keys(nowPlaying[0]).sort()).toEqual([
      'broadcast_status',
      'end_time',
      'episode_title',
      'host_name',
      'program_name',
      'start_time',
      'started_at',
    ]);

    const schedule = await db.asAnon<Record<string, unknown>>(
      `select * from public.v_public_schedule_today limit 1`,
    );
    if (schedule.length > 0) {
      expect(Object.keys(schedule[0]).sort()).toEqual([
        'end_time',
        'episode_title',
        'host_name',
        'id',
        'program_name',
        'start_time',
        'status',
      ]);
    }
  });

  it('never shows cancelled slots publicly', async () => {
    const slot = await db.sql<{ id: string }>(
      `select id from public.schedules
        where status = 'SCHEDULED'
          and (start_time at time zone 'Asia/Kolkata')::date
              = (now() at time zone 'Asia/Kolkata')::date
        limit 1`,
    );
    expect(slot.length).toBeGreaterThan(0);

    await db.asUser(admin, `select public.cancel_schedule($1, 'Testing public visibility')`, [
      slot[0].id,
    ]);

    const publicRows = await db.asAnon<{ id: string }>(
      `select id from public.v_public_schedule_today`,
    );
    expect(publicRows.map((r) => r.id)).not.toContain(slot[0].id);
  });

  it('lets a pending user read their own profile, and nothing else', async () => {
    // Without this a pending registrant sees "we could not find that item"
    // instead of "waiting for approval" -- see migration 14. Only reachable
    // once email confirmation is off, because until then they cannot sign in.
    const pending = await db.sql<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ('pending.reader@vitstudent.ac.in', '{"full_name":"Pending Reader"}'::jsonb)
       returning id`,
    );
    const id = pending[0].id;

    const state = await db.sql<{ active: boolean; approved_at: string | null }>(
      `select active, approved_at from public.profiles where id = $1`,
      [id],
    );
    expect(state[0].active).toBe(false);
    expect(state[0].approved_at).toBeNull();

    const own = await db.asUser<{ email: string }>(
      id,
      `select email from public.profiles where id = $1`,
      [id],
    );
    expect(own).toHaveLength(1);
    expect(own[0].email).toBe('pending.reader@vitstudent.ac.in');

    // The widened policy must not leak anything beyond their own row.
    const others = await db.asUser(id, `select id from public.profiles where id <> $1`, [id]);
    expect(others).toHaveLength(0);
    const programs = await db.asUser(id, `select id from public.programs`);
    expect(programs).toHaveLength(0);
    const bookings = await db.asUser(id, `select id from public.studio_bookings`);
    expect(bookings).toHaveLength(0);
  });

  it('lets an anonymous visitor read shows, but only active ones', async () => {
    const shows = await db.asAnon<{ name: string }>(
      `select name from public.v_public_programs order by name`,
    );
    const names = shows.map((s) => s.name);
    expect(names.length).toBeGreaterThan(0);
    // "Exam Week Special" is seeded inactive and must not be advertised.
    expect(names).not.toContain('Exam Week Special');
  });

  it('publishes ONLY episodes that have actually been broadcast', async () => {
    const publicEpisodes = await db.asAnon<{ id: string; title: string }>(
      `select id, title from public.v_public_recent_episodes`,
    );

    // Everything public must have a COMPLETED schedule behind it.
    for (const episode of publicEpisodes) {
      const aired = await db.sql<{ count: number }>(
        `select count(*)::int as count from public.schedules
          where episode_id = $1 and status = 'COMPLETED'`,
        [episode.id],
      );
      expect(aired[0].count).toBeGreaterThan(0);
    }

    // And nothing still in the pipeline may appear.
    const unaired = await db.sql<{ title: string }>(
      `select title from public.episodes
        where status in ('DRAFT', 'PENDING_QC', 'REJECTED', 'ARCHIVED')`,
    );
    const publicTitles = publicEpisodes.map((e) => e.title);
    for (const row of unaired) {
      expect(publicTitles).not.toContain(row.title);
    }
  });

  it('never exposes a storage path through the public episode view', async () => {
    const rows = await db.asAnon<Record<string, unknown>>(
      `select * from public.v_public_recent_episodes limit 1`,
    );
    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      expect(columns).not.toContain('storage_path');
      expect(columns).not.toContain('audio_file_id');
      expect(columns).not.toContain('created_by');
    }
  });

  it('does not let an anonymous visitor write through the public views', async () => {
    await expectFailure(
      () =>
        db.asAnon(
          `update public.v_public_schedule_today set program_name = 'Pirate Radio'`,
        ),
      /permission denied|cannot (update|change)|not updatable|no.*rule/i,
    );
  });

  // ---------------------------------------------------------------------------
  // Registration = a request, not an entry
  // ---------------------------------------------------------------------------
  it('creates a self-registered account inactive and unapproved', async () => {
    const rows = await db.sql<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ('hopeful@vitstudent.ac.in', '{"full_name":"Hopeful Student"}'::jsonb)
       returning id`,
    );

    const profile = await db.sql<{
      full_name: string;
      role: string;
      active: boolean;
      approved_at: string | null;
    }>(
      `select full_name, role, active, approved_at from public.profiles where id = $1`,
      [rows[0].id],
    );

    expect(profile[0]).toMatchObject({
      full_name: 'Hopeful Student',
      role: 'RJ',
      active: false,
      approved_at: null,
    });
  });

  it('gives a pending account no access to anything', async () => {
    const rows = await db.sql<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ('pending@vitstudent.ac.in', '{"full_name":"Pending Person"}'::jsonb)
       returning id`,
    );
    const pending = rows[0].id;

    // Reads return nothing rather than erroring: every policy's USING clause
    // fails because app.current_role() is NULL for an inactive profile.
    for (const table of ['programs', 'episodes', 'schedules', 'studio_bookings']) {
      const visible = await db.asUser(pending, `select * from public.${table}`);
      expect(visible).toHaveLength(0);
    }

    // Since migration 14 there is exactly one exception, and it is deliberate:
    // their own profile row, so the app can tell them they are awaiting
    // approval instead of reporting "not found". Nobody else's row is visible.
    const ownProfile = await db.asUser<{ id: string }>(
      pending,
      `select id from public.profiles`,
    );
    expect(ownProfile.map((r) => r.id)).toEqual([pending]);

    // And writes are refused outright.
    await expectFailure(
      () =>
        db.asUser(
          pending,
          `insert into public.programs (name, created_by) values ('Unapproved Show', $1)`,
          [pending],
        ),
      /violates row-level security/i,
    );
  });

  it('cannot self-approve by editing its own profile', async () => {
    const rows = await db.sql<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ('sneaky2@vitstudent.ac.in', '{"full_name":"Sneaky Two"}'::jsonb)
       returning id`,
    );
    const pending = rows[0].id;

    // Since migration 14 the row IS visible to its owner, so the UPDATE now
    // reaches the guard trigger rather than being filtered to zero rows. The
    // outcome is stricter and clearer: an explicit refusal instead of a silent
    // no-op. Self-approval is still impossible.
    await expectFailure(
      () =>
        db.asUser(
          pending,
          `update public.profiles set active = true where id = $1`,
          [pending],
        ),
      /Only an administrator can change a role or activation state/i,
    );

    const check = await db.sql<{ active: boolean; approved_at: string | null }>(
      `select active, approved_at from public.profiles where id = $1`,
      [pending],
    );
    expect(check[0].active).toBe(false);
    expect(check[0].approved_at).toBeNull();
  });

  it('stamps approved_at when an administrator activates the account', async () => {
    const rows = await db.sql<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ('approved@vitstudent.ac.in', '{"full_name":"Approved Person"}'::jsonb)
       returning id`,
    );
    const person = rows[0].id;

    await db.asUser(admin, `update public.profiles set active = true where id = $1`, [person]);

    const after = await db.sql<{ active: boolean; approved_at: string | null }>(
      `select active, approved_at from public.profiles where id = $1`,
      [person],
    );
    expect(after[0].active).toBe(true);
    expect(after[0].approved_at).toBeTruthy();

    // Now they can actually see the station.
    const programs = await db.asUser(person, `select id from public.programs`);
    expect(programs.length).toBeGreaterThan(0);
  });

  it('keeps approved_at once set, so a later deactivation is distinguishable', async () => {
    const rows = await db.sql<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ('leaver@vitstudent.ac.in', '{"full_name":"Leaver"}'::jsonb)
       returning id`,
    );
    const person = rows[0].id;

    await db.asUser(admin, `update public.profiles set active = true where id = $1`, [person]);
    await db.asUser(admin, `update public.profiles set active = false where id = $1`, [person]);

    const after = await db.sql<{ active: boolean; approved_at: string | null }>(
      `select active, approved_at from public.profiles where id = $1`,
      [person],
    );
    expect(after[0].active).toBe(false);
    expect(after[0].approved_at).toBeTruthy(); // "removed", not "never approved"
  });

  it('still activates accounts provisioned with an explicit role', async () => {
    const rows = await db.sql<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data, raw_app_meta_data)
       values ('provisioned@vit.ac.in', '{"full_name":"Provisioned QC"}'::jsonb,
               '{"role":"QC"}'::jsonb)
       returning id`,
    );

    const profile = await db.sql<{ role: string; active: boolean; approved_at: string | null }>(
      `select role, active, approved_at from public.profiles where id = $1`,
      [rows[0].id],
    );
    expect(profile[0].role).toBe('QC');
    expect(profile[0].active).toBe(true);
    expect(profile[0].approved_at).toBeTruthy();
  });

  it('still refuses a role smuggled in through signup metadata', async () => {
    const rows = await db.sql<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ('escalate@vitstudent.ac.in', '{"full_name":"Escalator","role":"ADMIN"}'::jsonb)
       returning id`,
    );
    const profile = await db.sql<{ role: string; active: boolean }>(
      `select role, active from public.profiles where id = $1`,
      [rows[0].id],
    );
    expect(profile[0]).toMatchObject({ role: 'RJ', active: false });
  });
});
