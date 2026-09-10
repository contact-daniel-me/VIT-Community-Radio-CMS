/**
 * The two copy-paste bundles in supabase/deploy/.
 *
 * Both are generated, so both can silently drift from the migrations they were
 * built from. Each is applied here as ONE batch -- exactly as the Supabase SQL
 * Editor does -- against the state it is actually meant for:
 *
 *   fresh_project_setup.sql  an empty project
 *   full_setup.sql           a project that already has migrations 01-07
 *
 * The second is the one that matters for the live station project, and it is
 * the only check that the 08-12 dependency order is genuinely correct.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

describe('fresh-project bundle', () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
    await pg.exec(readFileSync(join(repoRoot, 'tests', 'harness', 'bootstrap.sql'), 'utf8'));
    await pg.exec(
      readFileSync(join(repoRoot, 'supabase', 'deploy', 'fresh_project_setup.sql'), 'utf8'),
    );
  }, 120_000);

  afterAll(async () => {
    await pg?.close();
  });

  it('creates the full schema in a single batch', async () => {
    const { rows } = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'activity_logs',
      'audio_files',
      'broadcast_state',
      'episodes',
      'profiles',
      'programs',
      'qc_reviews',
      'schedules',
      'station_slots',
      'studio_bookings',
    ]);
  });

  it('installs every workflow function', async () => {
    const { rows } = await pg.query<{ proname: string }>(
      `select proname from pg_proc
        where pronamespace = 'public'::regnamespace and prokind = 'f'
        order by proname`,
    );
    const names = rows.map((r) => r.proname);
    for (const fn of [
      'approve_episode',
      'archive_episode',
      'cancel_schedule',
      'end_broadcast',
      'reject_episode',
      'reopen_episode',
      'schedule_episode',
      'start_broadcast',
      'submit_episode_for_qc',
      'sync_broadcast_state',
    ]) {
      expect(names).toContain(fn);
    }
  });

  it('leaves RLS enabled on every table', async () => {
    const { rows } = await pg.query<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
    );
    expect(rows.filter((r) => !r.rowsecurity)).toEqual([]);
  });

  it('includes the seed data and the five dev accounts', async () => {
    const users = await pg.query<{ count: number }>(
      `select count(*)::int as count from public.profiles`,
    );
    expect(users.rows[0].count).toBe(5);

    // Five development samples plus the 25 real programmes from migration 10.
    const programs = await pg.query<{ count: number }>(
      `select count(*)::int as count from public.programs`,
    );
    expect(programs.rows[0].count).toBe(30);

    const chart = await pg.query<{ count: number }>(
      `select count(*)::int as count from public.station_slots`,
    );
    expect(chart.rows[0].count).toBe(13);

    const episodes = await pg.query<{ count: number }>(
      `select count(*)::int as count from public.episodes`,
    );
    expect(episodes.rows[0].count).toBe(9);
  });

  it('creates the storage bucket and its four policies', async () => {
    const bucket = await pg.query<{ id: string }>(
      `select id from storage.buckets where id = 'radio-audio'`,
    );
    expect(bucket.rows).toHaveLength(1);

    const policies = await pg.query<{ policyname: string }>(
      `select policyname from pg_policies
        where schemaname = 'storage' and tablename = 'objects'`,
    );
    expect(policies.rows).toHaveLength(4);
  });

  it('applies the seed completely, not just the inserts', async () => {
    // The seed's UPDATE statements only succeed while the workflow flag is set.
    // If that flag were scoped wrongly for the SQL Editor, the inserts would
    // still land but the audio pointers and schedules would not.
    const audio = await pg.query<{ count: number }>(
      `select count(*)::int as count from public.episodes where audio_file_id is not null`,
    );
    expect(audio.rows[0].count).toBe(8);

    const schedules = await pg.query<{ count: number }>(
      `select count(*)::int as count from public.schedules`,
    );
    expect(schedules.rows[0].count).toBe(5);

    const reviews = await pg.query<{ count: number }>(
      `select count(*)::int as count from public.qc_reviews`,
    );
    expect(reviews.rows[0].count).toBe(5);
  });

  it('leaves the status guard armed once seeding is done', async () => {
    // seed.sql switches app.workflow on. If the bundle leaked that, direct
    // status writes would be permitted forever after.
    const setting = await pg.query<{ v: string | null }>(
      `select current_setting('app.workflow', true) as v`,
    );
    expect(setting.rows[0].v).not.toBe('on');

    // The invariant that actually matters, tested directly.
    let message = '';
    try {
      await pg.query(
        `update public.episodes set status = 'APPROVED'
          where status = 'DRAFT'`,
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/Episode status cannot be set directly/i);
  });
});


/**
 * The upgrade path: 01-07 already applied, then the 08-12 bundle on top.
 * This is the exact situation of the live project.
 */
describe('upgrade bundle (08-14)', () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
    await pg.exec(readFileSync(join(repoRoot, 'tests', 'harness', 'bootstrap.sql'), 'utf8'));

    // Bring the database to the state the live project is in: 01 through 07.
    const migrationsDir = join(repoRoot, 'supabase', 'migrations');
    const { readdirSync } = await import('node:fs');
    const applied = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => Number(f.slice(12, 14)) <= 7);

    expect(applied).toHaveLength(7);
    for (const file of applied) {
      await pg.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    }

    // Then the bundle, as one batch.
    await pg.exec(readFileSync(join(repoRoot, 'supabase', 'deploy', 'full_setup.sql'), 'utf8'));
  }, 120_000);

  afterAll(async () => {
    await pg?.close();
  });

  it('applies cleanly on top of 01-07 and adds both new tables', async () => {
    const { rows } = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'activity_logs',
      'audio_files',
      'broadcast_state',
      'episodes',
      'profiles',
      'programs',
      'qc_reviews',
      'schedules',
      'station_slots',
      'studio_bookings',
    ]);
  });

  it('adds the EDITOR and SECTION_HEAD roles', async () => {
    const { rows } = await pg.query<{ enumlabel: string }>(
      `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'user_role' order by e.enumsortorder`,
    );
    expect(rows.map((r) => r.enumlabel)).toEqual([
      'ADMIN',
      'PRODUCER',
      'RJ',
      'QC',
      'EDITOR',
      'SECTION_HEAD',
    ]);
  });

  it('adds profiles.phone', async () => {
    const { rows } = await pg.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('loads the Fixed Point Chart and the real programmes', async () => {
    const chart = await pg.query<{ count: number }>(
      `select count(*)::int as count from public.station_slots`,
    );
    expect(chart.rows[0].count).toBe(13);

    const programmes = await pg.query<{ count: number }>(
      `select count(*)::int as count from public.programs`,
    );
    // No seed in this bundle, so these are the 25 real programmes only.
    expect(programmes.rows[0].count).toBe(25);
  });

  it('creates every public view the site reads', async () => {
    const { rows } = await pg.query<{ table_name: string }>(
      `select table_name from information_schema.views
        where table_schema = 'public' and table_name like 'v_public%'
        order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      'v_public_fixed_point_chart',
      'v_public_now_playing',
      'v_public_programs',
      'v_public_recent_episodes',
      'v_public_schedule_today',
      'v_public_studio_calendar',
    ]);
  });

  it('leaves anon holding SELECT on the public views and nothing else', async () => {
    // Migration 13. PGlite has no Supabase default privileges to re-grant, so
    // this asserts the end state rather than reproducing the cause.
    const { rows } = await pg.query<{ table_name: string; privs: string }>(
      `select table_name, string_agg(distinct privilege_type, ',' order by privilege_type) privs
         from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public'
        group by table_name order by table_name`,
    );
    for (const row of rows) {
      expect(row.table_name.startsWith('v_public')).toBe(true);
      expect(row.privs).toBe('SELECT');
    }
  });

  it('installs the booking guards from 11 and 12', async () => {
    const { rows } = await pg.query<{ tgname: string }>(
      `select tgname from pg_trigger
        where tgrelid = 'public.studio_bookings'::regclass and not tgisinternal
        order by tgname`,
    );
    expect(rows.map((r) => r.tgname)).toContain('studio_bookings_window');
    expect(rows.map((r) => r.tgname)).toContain('studio_bookings_guard_status');
    expect(rows.map((r) => r.tgname)).toContain('studio_bookings_reference');
  });

  it('copies the migration SQL verbatim -- no logic is rewritten', async () => {
    const { readdirSync } = await import('node:fs');
    const bundle = readFileSync(
      join(repoRoot, 'supabase', 'deploy', 'full_setup.sql'),
      'utf8',
    );
    const migrationsDir = join(repoRoot, 'supabase', 'migrations');
    const upgrade = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => Number(f.slice(12, 14)) >= 8);

    expect(upgrade).toHaveLength(7);
    for (const file of upgrade) {
      const body = readFileSync(join(migrationsDir, file), 'utf8');
      expect(bundle).toContain(body);
    }
  });
});
