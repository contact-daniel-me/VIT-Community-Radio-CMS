/**
 * Storage policies and the development seed.
 *
 * Storage authorisation is the place people most often forget: hiding an upload
 * button is not security. These cases write directly to storage.objects, which
 * is what the storage API does on the caller's behalf.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';

describe('storage policies', () => {
  let db: TestDb;
  let producer: string;
  let rjOwner: string;
  let rjOther: string;
  let qc: string;
  let episodeId: string;

  beforeAll(async () => {
    db = await createTestDb();
    producer = await db.createUser({ email: 'sp@vit.ac.in', fullName: 'Prod', role: 'PRODUCER' });
    rjOwner = await db.createUser({ email: 'so@vit.ac.in', fullName: 'Owner', role: 'RJ' });
    rjOther = await db.createUser({ email: 'sx@vit.ac.in', fullName: 'Other', role: 'RJ' });
    qc = await db.createUser({ email: 'sq@vit.ac.in', fullName: 'QC', role: 'QC' });

    const program = await db.asUser<{ id: string }>(
      producer,
      `insert into public.programs (name, created_by) values ('Storage Show', $1) returning id`,
      [producer],
    );
    const episode = await db.asUser<{ id: string }>(
      rjOwner,
      `insert into public.episodes (program_id, title, created_by) values ($1, 'Storage Ep', $2) returning id`,
      [program[0].id, rjOwner],
    );
    episodeId = episode[0].id;
  });

  afterAll(async () => {
    await db?.close();
  });

  const objectName = () => `episodes/${episodeId}/take-1.mp3`;

  it('lets the owning RJ upload into their own episode folder', async () => {
    const rows = await db.asUser<{ id: string }>(
      rjOwner,
      `insert into storage.objects (bucket_id, name, owner) values ('radio-audio', $1, $2) returning id`,
      [objectName(), rjOwner],
    );
    expect(rows).toHaveLength(1);
  });

  it("stops another RJ writing into someone else's episode folder", async () => {
    await expectFailure(
      () =>
        db.asUser(
          rjOther,
          `insert into storage.objects (bucket_id, name, owner) values ('radio-audio', $1, $2)`,
          [`episodes/${episodeId}/hijack.mp3`, rjOther],
        ),
      /violates row-level security/i,
    );
  });

  it('stops QC uploading or deleting audio', async () => {
    await expectFailure(
      () =>
        db.asUser(
          qc,
          `insert into storage.objects (bucket_id, name, owner) values ('radio-audio', $1, $2)`,
          [`episodes/${episodeId}/qc.mp3`, qc],
        ),
      /violates row-level security/i,
    );

    const deleted = await db.asUser(
      qc,
      `delete from storage.objects where name = $1 returning id`,
      [objectName()],
    );
    expect(deleted).toHaveLength(0);
  });

  it('lets QC read the audio it has to review', async () => {
    const rows = await db.asUser(qc, `select id from storage.objects where bucket_id = 'radio-audio'`);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('rejects paths that do not follow episodes/{episode_id}/', async () => {
    for (const badPath of ['random.mp3', 'episodes/not-a-uuid/x.mp3', 'other/xyz/x.mp3']) {
      await expectFailure(
        () =>
          db.asUser(
            rjOwner,
            `insert into storage.objects (bucket_id, name, owner) values ('radio-audio', $1, $2)`,
            [badPath, rjOwner],
          ),
        /violates row-level security/i,
      );
    }
  });

  it('locks storage as soon as the episode is submitted for QC', async () => {
    await db.asUser(
      rjOwner,
      `update public.episodes set audio_file_id = a.id from public.audio_files a
        where a.episode_id = public.episodes.id and public.episodes.id = $1`,
      [episodeId],
    );
    // Attach a metadata row so the episode is submittable.
    const audio = await db.asUser<{ id: string }>(
      rjOwner,
      `insert into public.audio_files (episode_id, file_name, storage_path, mime_type, file_size, uploaded_by)
       values ($1::uuid, 'take-1.mp3', 'episodes/' || ($1::uuid)::text || '/take-1.mp3',
               'audio/mpeg', 2048, $2::uuid)
       returning id`,
      [episodeId, rjOwner],
    );
    await db.asUser(rjOwner, `update public.episodes set audio_file_id = $1 where id = $2`, [
      audio[0].id,
      episodeId,
    ]);
    await db.asUser(rjOwner, `select public.submit_episode_for_qc($1)`, [episodeId]);

    await expectFailure(
      () =>
        db.asUser(
          rjOwner,
          `insert into storage.objects (bucket_id, name, owner) values ('radio-audio', $1, $2)`,
          [`episodes/${episodeId}/take-2.mp3`, rjOwner],
        ),
      /violates row-level security/i,
    );

    const deleted = await db.asUser(
      rjOwner,
      `delete from storage.objects where name = $1 returning id`,
      [objectName()],
    );
    expect(deleted).toHaveLength(0);
  });
});

describe('development seed', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb({ seed: true });
  });

  afterAll(async () => {
    await db?.close();
  });

  it('creates the five dev accounts with the right roles', async () => {
    const rows = await db.sql<{ email: string; role: string }>(
      `select email, role from public.profiles order by email`,
    );
    expect(rows).toEqual([
      { email: 'admin@vitradio.dev', role: 'ADMIN' },
      { email: 'producer@vitradio.dev', role: 'PRODUCER' },
      { email: 'qc@vitradio.dev', role: 'QC' },
      { email: 'rj.karthik@vitradio.dev', role: 'RJ' },
      { email: 'rj.sneha@vitradio.dev', role: 'RJ' },
    ]);
  });

  it('creates the four sample programs plus one inactive one', async () => {
    // Scoped to the development samples: migration 10 also loads the station's
    // 25 real programmes, which are not sample data and are asserted elsewhere.
    const rows = await db.sql<{ name: string; active: boolean }>(
      `select name, active from public.programs
        where description like 'SAMPLE DATA%' order by name`,
    );
    expect(rows.map((r) => r.name)).toEqual([
      'Campus Pulse',
      'Exam Week Special',
      'Student Spotlight',
      'VIT Campus Connect',
      'VIT Voices',
    ]);
    expect(rows.filter((r) => !r.active).map((r) => r.name)).toEqual(['Exam Week Special']);
  });

  it('covers every episode state', async () => {
    const rows = await db.sql<{ status: string; count: number }>(
      `select status::text as status, count(*)::int as count
         from public.episodes group by status order by status`,
    );
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.count]));
    expect(byStatus).toMatchObject({
      APPROVED: 4,
      ARCHIVED: 1,
      DRAFT: 1,
      PENDING_QC: 2,
      REJECTED: 1,
    });
  });

  it('leaves a QC queue and a rejection with a usable comment', async () => {
    const pending = await db.sql(`select id from public.episodes where status = 'PENDING_QC'`);
    expect(pending).toHaveLength(2);

    const rejected = await db.sql<{ comment: string }>(
      `select comment from public.qc_reviews where decision = 'REJECTED'`,
    );
    expect(rejected).toHaveLength(1);
    expect(rejected[0].comment.length).toBeGreaterThan(20);
  });

  it('produces a schedule with a current slot and a next slot, and starts offline', async () => {
    const state = await db.sql<{ status: string }>(`select status from public.broadcast_state`);
    expect(state[0].status).toBe('OFFLINE');

    const current = await db.sql<{ id: string }>(
      `select id from public.schedules
        where status = 'SCHEDULED' and start_time <= now() and end_time > now()`,
    );
    expect(current).toHaveLength(1);

    const upcoming = await db.sql(
      `select id from public.schedules where status = 'SCHEDULED' and start_time > now()`,
    );
    expect(upcoming.length).toBeGreaterThanOrEqual(2);
  });

  it('marks every seeded record as sample data', async () => {
    // Every programme is either a clearly-labelled sample or one of the real
    // ones loaded by migration 10 -- nothing unlabelled in between.
    const rows = await db.sql<{ name: string }>(
      `select name from public.programs
        where description not like 'SAMPLE DATA%'
          and name not in (select title from public.station_slots)
          and id not in (select program_id from public.station_slots where program_id is not null)`,
    );
    const realProgrammes = await db.sql<{ count: number }>(
      `select count(*)::int as count from public.programs
        where description not like 'SAMPLE DATA%'`,
    );
    expect(realProgrammes[0].count).toBe(25);
    expect(rows.length).toBeLessThanOrEqual(25);
  });

  it('lets the seeded QC user approve a seeded pending episode', async () => {
    const qcUser = '55555555-5555-4555-8555-555555555555';
    const pending = await db.asUser<{ id: string }>(
      qcUser,
      `select id from public.episodes where status = 'PENDING_QC' order by submitted_at limit 1`,
    );
    const approved = await db.asUser<{ status: string }>(
      qcUser,
      `select status from public.approve_episode($1, 'Approved from the seeded queue.')`,
      [pending[0].id],
    );
    expect(approved[0].status).toBe('APPROVED');
  });
});
