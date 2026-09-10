import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';

describe('schema and constraints', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db?.close();
  });

  it('creates all ten core tables', async () => {
    const rows = await db.sql<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'activity_logs',
      'audio_files',
      'broadcast_state',
      'episodes',
      'homepage_featured_audio',
      'profiles',
      'programs',
      'qc_reviews',
      'schedules',
      'station_slots',
      'studio_bookings',
    ]);
  });

  it('loads the real Fixed Point Chart, Monday to Friday', async () => {
    const slots = await db.sql<{
      title: string;
      start_time: string;
      end_time: string;
      days: number[];
      kind: string;
    }>(
      `select title, start_time::text, end_time::text, days, kind::text
         from public.station_slots order by start_time, end_time`,
    );

    expect(slots).toHaveLength(13);
    expect(slots[0].title).toBe('Signature Tune & Radio Anthem');
    expect(slots[0].start_time).toBe('09:00:00');
    expect(slots.at(-1)?.title).toBe('Closing Announcement (Evening)');
    // The published chart is a weekday chart.
    expect(slots.every((s) => s.days.join() === '1,2,3,4,5')).toBe(true);
  });

  it('keeps the nested Campus Quiz inside the afternoon rebroadcast', async () => {
    // schedules forbids overlap; the Fixed Point Chart depends on allowing it.
    const rows = await db.sql<{ title: string }>(
      `select q.title
         from public.station_slots q
         join public.station_slots r on r.kind = 'REBROADCAST'
          and q.start_time >= r.start_time and q.end_time <= r.end_time
        where q.kind = 'FEATURE'`,
    );
    expect(rows.map((r) => r.title)).toContain('The Campus Quiz');
  });

  it('creates the real programmes and links the chart to them', async () => {
    const linked = await db.sql<{ title: string; name: string }>(
      `select s.title, p.name
         from public.station_slots s join public.programs p on p.id = s.program_id
        order by s.start_time`,
    );
    expect(linked.map((r) => r.name)).toEqual([
      'Dhinam Oru Thiravukool',
      'Sevichelvam',
      'Data Chunks',
      'The Campus Quiz',
    ]);

    const count = await db.sql<{ count: number }>(
      `select count(*)::int as count from public.programs`,
    );
    expect(count[0].count).toBe(25);
  });

  it('is idempotent -- re-running the line-up migration adds nothing', async () => {
    const before = await db.sql<{ p: number; s: number }>(
      `select (select count(*) from public.programs)::int as p,
              (select count(*) from public.station_slots)::int as s`,
    );
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20250101000010_real_station_lineup.sql'),
      'utf8',
    );
    await db.raw.exec(sql);
    const after = await db.sql<{ p: number; s: number }>(
      `select (select count(*) from public.programs)::int as p,
              (select count(*) from public.station_slots)::int as s`,
    );
    expect(after[0]).toEqual(before[0]);
  });

  it('enables row level security on every table', async () => {
    const rows = await db.sql<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !r.rowsecurity)).toEqual([]);
  });

  it('keeps broadcast_state a singleton', async () => {
    const rows = await db.sql<{ count: number }>(
      `select count(*)::int as count from public.broadcast_state`,
    );
    expect(rows[0].count).toBe(1);

    await expectFailure(
      () => db.sql(`insert into public.broadcast_state (id) values (false)`),
      /broadcast_state_id_check|violates check constraint/i,
    );
  });

  it('creates the radio-audio bucket as private', async () => {
    const rows = await db.sql<{ id: string; public: boolean; file_size_limit: string }>(
      `select id, public, file_size_limit from storage.buckets where id = 'radio-audio'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].public).toBe(false);
  });

  it('creates a profile automatically for every auth user', async () => {
    const id = await db.createUser({
      email: 'schema.test@vit.ac.in',
      fullName: 'Schema Test',
      role: 'PRODUCER',
    });
    const rows = await db.sql<{ full_name: string; role: string; email: string }>(
      `select full_name, role, email from public.profiles where id = $1`,
      [id],
    );
    expect(rows[0]).toMatchObject({
      full_name: 'Schema Test',
      role: 'PRODUCER',
      email: 'schema.test@vit.ac.in',
    });
  });

  it('never takes a role from user-controlled signup metadata', async () => {
    const rows = await db.sql<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ('sneaky@vit.ac.in', '{"full_name":"Sneaky","role":"ADMIN"}'::jsonb)
       returning id`,
    );
    const profile = await db.sql<{ role: string }>(
      `select role from public.profiles where id = $1`,
      [rows[0].id],
    );
    expect(profile[0].role).toBe('RJ');
  });

  it('rejects a rejection review with no comment', async () => {
    const admin = await db.createUser({
      email: 'ctest@vit.ac.in',
      fullName: 'C Test',
      role: 'ADMIN',
    });
    const program = await db.sql<{ id: string }>(
      `insert into public.programs (name, created_by) values ('Constraint Show', $1) returning id`,
      [admin],
    );
    const episode = await db.sql<{ id: string }>(
      `insert into public.episodes (program_id, title, created_by) values ($1, 'Ep', $2) returning id`,
      [program[0].id, admin],
    );
    await expectFailure(
      () =>
        db.sql(
          `insert into public.qc_reviews (episode_id, reviewer_id, decision) values ($1, $2, 'REJECTED')`,
          [episode[0].id, admin],
        ),
      /rejection_needs_comment/i,
    );
  });

  it('refuses overlapping schedule slots', async () => {
    const admin = await db.createUser({
      email: 'overlap@vit.ac.in',
      fullName: 'Overlap Admin',
      role: 'ADMIN',
    });
    const program = await db.sql<{ id: string }>(
      `insert into public.programs (name, created_by) values ('Overlap Show', $1) returning id`,
      [admin],
    );
    await db.sql(
      `insert into public.schedules (program_id, start_time, end_time, created_by)
       values ($1, now() + interval '1 day', now() + interval '1 day 1 hour', $2)`,
      [program[0].id, admin],
    );
    await expectFailure(
      () =>
        db.sql(
          `insert into public.schedules (program_id, start_time, end_time, created_by)
           values ($1, now() + interval '1 day 30 minutes', now() + interval '1 day 2 hours', $2)`,
          [program[0].id, admin],
        ),
      /schedules_no_overlap|conflicting key|exclusion/i,
    );
  });

  it('refuses an audio pointer belonging to a different episode', async () => {
    const admin = await db.createUser({
      email: 'ptr@vit.ac.in',
      fullName: 'Pointer Admin',
      role: 'ADMIN',
    });
    const program = await db.sql<{ id: string }>(
      `insert into public.programs (name, created_by) values ('Pointer Show', $1) returning id`,
      [admin],
    );
    const eps = await db.sql<{ id: string }>(
      `insert into public.episodes (program_id, title, created_by)
       values ($1, 'Ep A', $2), ($1, 'Ep B', $2) returning id`,
      [program[0].id, admin],
    );
    const audio = await db.sql<{ id: string }>(
      `insert into public.audio_files (episode_id, file_name, storage_path, mime_type, file_size, uploaded_by)
       values ($1::uuid, 'a.mp3', 'episodes/' || ($1::uuid)::text || '/a.mp3', 'audio/mpeg', 1024, $2::uuid)
       returning id`,
      [eps[0].id, admin],
    );
    await expectFailure(
      () =>
        db.sql(`update public.episodes set audio_file_id = $1 where id = $2`, [
          audio[0].id,
          eps[1].id,
        ]),
      /does not belong to episode/i,
    );
  });
  it('accepts MP3 audio and refuses every other format', async () => {
    const admin = await db.createUser({
      email: 'mp3@vit.ac.in',
      fullName: 'MP3 Admin',
      role: 'ADMIN',
    });
    const program = await db.sql<{ id: string }>(
      `insert into public.programs (name, created_by) values ('MP3 Show', $1) returning id`,
      [admin],
    );
    const episode = await db.sql<{ id: string }>(
      `insert into public.episodes (program_id, title, created_by) values ($1, 'MP3 Ep', $2) returning id`,
      [program[0].id, admin],
    );

    const insertAudio = (mime: string, name: string) =>
      db.sql(
        `insert into public.audio_files (episode_id, file_name, storage_path, mime_type, file_size, uploaded_by)
         values ($1::uuid, $2, 'episodes/' || ($1::uuid)::text || '/' || $2, $3, 1024, $4::uuid)`,
        [episode[0].id, name, mime, admin],
      );

    // Both spellings of MP3 are allowed: audio/mpeg is correct, audio/mp3 is
    // the alias some browsers report for the same file.
    await insertAudio('audio/mpeg', 'take-1.mp3');
    await insertAudio('audio/mp3', 'take-2.mp3');

    for (const mime of ['audio/wav', 'audio/x-wav', 'audio/aac', 'audio/mp4', 'audio/ogg']) {
      await expectFailure(
        () => insertAudio(mime, `take-${mime.replace('/', '-')}.bin`),
        /audio_files_mp3_only|violates check constraint/i,
      );
    }
  });

  it('allows only MP3 into the storage bucket', async () => {
    const rows = await db.sql<{ allowed_mime_types: string[] }>(
      `select allowed_mime_types from storage.buckets where id = 'radio-audio'`,
    );
    expect([...rows[0].allowed_mime_types].sort()).toEqual(['audio/mp3', 'audio/mpeg']);
  });

  // The service layer embeds related rows by constraint name, e.g.
  // "program:programs!episodes_program_id_fkey (id, name)". A rename would only
  // show up at runtime as a PostgREST 400, so the names are asserted here.
  it('keeps the foreign key names the embedded selects rely on', async () => {
    const rows = await db.sql<{ conname: string }>(
      `select conname from pg_constraint
        where contype = 'f' and connamespace = 'public'::regnamespace
        order by conname`,
    );
    const names = new Set(rows.map((r) => r.conname));
    for (const expected of [
      'episodes_program_id_fkey',
      'episodes_audio_file_id_fkey',
      'episodes_created_by_fkey',
      'episodes_assigned_rj_fkey',
      'audio_files_episode_id_fkey',
      'qc_reviews_reviewer_id_fkey',
      'activity_logs_user_id_fkey',
    ]) {
      expect(names).toContain(expected);
    }
  });
});
