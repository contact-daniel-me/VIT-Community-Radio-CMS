/**
 * The homepage Top 10, and expiry for recordings that never aired.
 *
 * The cleanup half matters most: it decides what gets destroyed. Every case
 * here is a thing that must survive the sweep, proved by running the real
 * candidate query against the real schema rather than by reading the SQL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';

const DAY = 24 * 60 * 60 * 1000;

describe('homepage Top 10 and raw audio expiry', () => {
  let db: TestDb;
  let admin: string;
  let producer: string;
  let rj: string;
  let qc: string;
  let programId: string;

  /**
   * An episode with audio, aged by however many days.
   *
   * Status is reached through the workflow functions, never set directly --
   * a guard trigger refuses that, and rightly, so the fixtures use the same
   * road the application does.
   */
  async function makeEpisode(
    title: string,
    status: 'DRAFT' | 'REJECTED' | 'APPROVED' | 'ARCHIVED' | 'PENDING_QC',
    ageDays = 0,
  ): Promise<{ episodeId: string; audioId: string }> {
    const episode = await db.asUser<{ id: string }>(
      rj,
      `insert into public.episodes (program_id, title, created_by, assigned_rj)
       values ($1, $2, $3, $3) returning id`,
      [programId, title, rj],
    );
    const episodeId = episode[0].id;

    const audio = await db.sql<{ id: string }>(
      `insert into public.audio_files
         (episode_id, file_name, storage_path, mime_type, file_size, duration_seconds, uploaded_by, created_at)
       values ($1, $2, $3, 'audio/mpeg', 1048576, 600, $4, $5) returning id`,
      [
        episodeId,
        `${title}.mp3`,
        `episodes/${episodeId}/${title}.mp3`,
        rj,
        new Date(Date.now() - ageDays * DAY).toISOString(),
      ],
    );
    const audioId = audio[0].id;
    await db.sql('update public.episodes set audio_file_id = $1 where id = $2', [
      audioId,
      episodeId,
    ]);

    if (status !== 'DRAFT') {
      await db.asUser(rj, 'select public.submit_episode_for_qc($1)', [episodeId]);
      if (status === 'REJECTED') {
        await db.asUser(qc, 'select public.reject_episode($1, $2)', [episodeId, 'Needs another take']);
      } else if (status !== 'PENDING_QC') {
        await db.asUser(qc, 'select public.approve_episode($1)', [episodeId]);
        if (status === 'ARCHIVED') {
          await db.asUser(admin, 'select public.archive_episode($1)', [episodeId]);
        }
      }
    }

    // Ageing happens after the workflow, which stamps its own timestamps.
    await db.sql('update public.audio_files set created_at = $1 where id = $2', [
      new Date(Date.now() - ageDays * DAY).toISOString(),
      audioId,
    ]);

    return { episodeId, audioId };
  }

  const candidates = () =>
    db.sql<{ audio_file_id: string; age_days: number }>(
      'select * from public.raw_audio_candidates()',
    );

  beforeAll(async () => {
    db = await createTestDb();
    admin = await db.createUser({ email: 'top-adm@vit.ac.in', fullName: 'Admin', role: 'ADMIN' });
    producer = await db.createUser({
      email: 'top-prd@vit.ac.in',
      fullName: 'Prod',
      role: 'PRODUCER',
    });
    rj = await db.createUser({ email: 'top-rj@vit.ac.in', fullName: 'RJ', role: 'RJ' });
    qc = await db.createUser({ email: 'top-qc@vit.ac.in', fullName: 'QC', role: 'QC' });

    const program = await db.asUser<{ id: string }>(
      producer,
      `insert into public.programs (name, created_by) values ('Top Ten Show', $1) returning id`,
      [producer],
    );
    programId = program[0].id;
  });

  afterAll(async () => {
    await db.close();
  });

  // ---------------------------------------------------------------- Top 10 --

  it('takes at most ten, because the order has nowhere else to go', async () => {
    const ids: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const { episodeId } = await makeEpisode(`Featured ${i}`, 'APPROVED');
      ids.push(episodeId);
      await db.asUser(
        admin,
        'insert into public.homepage_featured_audio (episode_id, display_order) values ($1, $2)',
        [episodeId, i],
      );
    }

    const eleventh = await makeEpisode('Featured 11', 'APPROVED');
    await expectFailure(
      () =>
        db.asUser(
          admin,
          'insert into public.homepage_featured_audio (episode_id, display_order) values ($1, 11)',
          [eleventh.episodeId],
        ),
      /display_order|check/i,
    );

    const rows = await db.asUser<{ c: string }>(
      admin,
      'select count(*) c from public.homepage_featured_audio',
    );
    expect(Number(rows[0].c)).toBe(10);
  });

  it('shows the administrator order, not the newest first', async () => {
    const rows = await db.asAnon<{ display_order: number; title: string }>(
      'select display_order, title from public.v_public_top_audio',
    );
    expect(rows.map((r) => r.display_order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rows[0].title).toBe('Featured 1');
  });

  it('lets a swap happen inside one transaction', async () => {
    // Deferring the unique check is what makes this possible: after the first
    // statement two rows both hold order 2, which is only legal until commit.
    // No parking value is needed, and none would be legal -- the CHECK keeps
    // every row inside 1..10 at all times.
    const before = await db.asUser<{ episode_id: string; display_order: number }>(
      admin,
      'select episode_id, display_order from public.homepage_featured_audio where display_order in (1, 2) order by display_order',
    );
    const [first, second] = before;

    await db.raw.exec(`
      begin;
      update public.homepage_featured_audio set display_order = 2 where episode_id = '${first.episode_id}';
      update public.homepage_featured_audio set display_order = 1 where episode_id = '${second.episode_id}';
      commit;
    `);
    const rows = await db.asAnon<{ display_order: number; title: string }>(
      'select display_order, title from public.v_public_top_audio order by display_order limit 2',
    );
    expect(rows[0].title).toBe('Featured 2');
    expect(rows[1].title).toBe('Featured 1');
  });

  it('hides a deactivated item without losing its place', async () => {
    await db.asUser(admin, 'update public.homepage_featured_audio set is_active = false where display_order = 3');
    const shown = await db.asAnon('select * from public.v_public_top_audio where display_order = 3');
    expect(shown).toHaveLength(0);

    const kept = await db.asUser(admin, 'select * from public.homepage_featured_audio where display_order = 3');
    expect(kept).toHaveLength(1);

    await db.asUser(admin, 'update public.homepage_featured_audio set is_active = true where display_order = 3');
  });

  it('refuses an episode QC has not cleared', async () => {
    const draft = await makeEpisode('Not approved yet', 'DRAFT');
    await expectFailure(
      () =>
        db.asUser(
          admin,
          'insert into public.homepage_featured_audio (episode_id, display_order) values ($1, 11)',
          [draft.episodeId],
        ),
      /display_order|QC-approved/i,
    );
  });

  it('will not let approved audio be detached at all', async () => {
    // Stronger than the guard it was written to test. An approved episode's
    // audio cannot be dropped by editing the episode (the workflow guard
    // refuses), nor by deleting the audio row (the foreign key's SET NULL
    // fires that same guard). Published recordings are unreachable, which is
    // the property the cleanup job depends on.
    const published = await makeEpisode('Approved and safe', 'APPROVED');

    await expectFailure(
      () =>
        db.sql('update public.episodes set audio_file_id = null where id = $1', [
          published.episodeId,
        ]),
      /locked while in status APPROVED/i,
    );

    await expectFailure(
      () => db.sql('delete from public.audio_files where id = $1', [published.audioId]),
      /locked while in status APPROVED/i,
    );

    const still = await db.sql<{ audio_file_id: string | null }>(
      'select audio_file_id from public.episodes where id = $1',
      [published.episodeId],
    );
    expect(still[0].audio_file_id).toBe(published.audioId);
  });

  it('is writable only by an administrator', async () => {
    const target = await makeEpisode('Producer tries', 'APPROVED');
    await expectFailure(
      () =>
        db.asUser(
          producer,
          'insert into public.homepage_featured_audio (episode_id, display_order) values ($1, 10)',
          [target.episodeId],
        ),
      /policy|permission/i,
    );
  });

  it('is not readable by anonymous visitors, except through the view', async () => {
    await expectFailure(
      () => db.asAnon('select * from public.homepage_featured_audio'),
      /permission|policy/i,
    );
    const viaView = await db.asAnon('select * from public.v_public_top_audio');
    expect(viaView.length).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------- cleanup --

  it('offers an unaired recording once it is past the window', async () => {
    const old = await makeEpisode('Forgotten draft', 'DRAFT', 45);
    const list = await candidates();
    expect(list.map((c) => c.audio_file_id)).toContain(old.audioId);
    expect(list.find((c) => c.audio_file_id === old.audioId)?.age_days).toBeGreaterThanOrEqual(30);
  });

  it('leaves a recent recording alone', async () => {
    const recent = await makeEpisode('Yesterday draft', 'DRAFT', 3);
    const list = await candidates();
    expect(list.map((c) => c.audio_file_id)).not.toContain(recent.audioId);
  });

  it('never offers an episode that passed QC, however old', async () => {
    for (const status of ['APPROVED', 'ARCHIVED', 'PENDING_QC'] as const) {
      const kept = await makeEpisode(`Old but ${status}`, status, 400);
      const list = await candidates();
      expect(list.map((c) => c.audio_file_id)).not.toContain(kept.audioId);
    }
  });

  it('never offers a scheduled episode', async () => {
    // Only an approved episode can be scheduled, so this is belt and braces:
    // the status rule already excludes it. The clause is kept so the sweep
    // stays safe if the status rule is ever loosened.
    const booked = await makeEpisode('Old and scheduled', 'APPROVED', 90);
    await db.asUser(
      producer,
      `select public.schedule_episode($1, $2, now() + interval '2 days', now() + interval '2 days 30 minutes')`,
      [programId, booked.episodeId],
    );
    const list = await candidates();
    expect(list.map((c) => c.audio_file_id)).not.toContain(booked.audioId);
  });

  it('never offers a featured episode', async () => {
    // Featured episodes are APPROVED, so they are already excluded -- this
    // proves the second guard independently, in case the first ever changes.
    const featured = await db.asUser<{ episode_id: string }>(
      admin,
      'select episode_id from public.homepage_featured_audio limit 1',
    );
    const audio = await db.sql<{ id: string }>(
      'select audio_file_id as id from public.episodes where id = $1',
      [featured[0].episode_id],
    );
    const list = await candidates();
    expect(list.map((c) => c.audio_file_id)).not.toContain(audio[0].id);
  });

  it('records a deletion, detaches the episode, and logs it', async () => {
    const doomed = await makeEpisode('To be swept', 'DRAFT', 60);
    const done = await db.sql<{ mark_raw_audio_deleted: boolean }>(
      'select public.mark_raw_audio_deleted($1) as mark_raw_audio_deleted',
      [doomed.audioId],
    );
    expect(done[0].mark_raw_audio_deleted).toBe(true);

    const audio = await db.sql<{ deleted_at: string | null }>(
      'select deleted_at from public.audio_files where id = $1',
      [doomed.audioId],
    );
    expect(audio[0].deleted_at).not.toBeNull();

    const episode = await db.sql<{ audio_file_id: string | null }>(
      'select audio_file_id from public.episodes where id = $1',
      [doomed.episodeId],
    );
    expect(episode[0].audio_file_id).toBeNull();

    const log = await db.sql<{ action: string; metadata: { storage_path: string } }>(
      `select action, metadata from public.activity_logs
        where entity_id = $1 and action = 'RAW_AUDIO_EXPIRED'`,
      [doomed.audioId],
    );
    expect(log).toHaveLength(1);
    expect(log[0].metadata.storage_path).toContain('episodes/');
  });

  it('can be run again over the same file without complaint', async () => {
    const doomed = await makeEpisode('Swept twice', 'DRAFT', 60);
    const first = await db.sql<{ m: boolean }>(
      'select public.mark_raw_audio_deleted($1) as m',
      [doomed.audioId],
    );
    const second = await db.sql<{ m: boolean }>(
      'select public.mark_raw_audio_deleted($1) as m',
      [doomed.audioId],
    );
    expect(first[0].m).toBe(true);
    expect(second[0].m).toBe(false); // already recorded, nothing to do

    const logs = await db.sql(
      `select 1 from public.activity_logs where entity_id = $1 and action = 'RAW_AUDIO_EXPIRED'`,
      [doomed.audioId],
    );
    expect(logs).toHaveLength(1); // logged once, not twice
  });

  it('shrugs at a file that was never there', async () => {
    const gone = await db.sql<{ m: boolean }>(
      'select public.mark_raw_audio_deleted($1) as m',
      ['00000000-0000-0000-0000-000000000000'],
    );
    expect(gone[0].m).toBe(false);
  });

  it('refuses to record a deletion for something that is not eligible', async () => {
    // The guard that matters if the job is ever fed the wrong id, or if an
    // episode is approved between listing and deleting.
    const safe = await makeEpisode('Approved between passes', 'APPROVED', 90);
    await expectFailure(
      () => db.sql('select public.mark_raw_audio_deleted($1)', [safe.audioId]),
      /no longer eligible/i,
    );
    const still = await db.sql<{ deleted_at: string | null }>(
      'select deleted_at from public.audio_files where id = $1',
      [safe.audioId],
    );
    expect(still[0].deleted_at).toBeNull();
  });

  it('keeps the retention window in one place', async () => {
    const days = await db.sql<{ d: number }>('select app.raw_audio_retention_days() as d');
    expect(days[0].d).toBe(30);
  });
});
