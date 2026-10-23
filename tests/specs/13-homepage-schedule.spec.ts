import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';

describe('homepage release scheduling with custom title and description', () => {
  let db: TestDb;
  let admin: string;
  let producer: string;
  let rj: string;
  let qc: string;
  let programId: string;

  async function makeApprovedEpisode(title: string, description?: string): Promise<string> {
    const episode = await db.asUser<{ id: string }>(
      rj,
      `insert into public.episodes (program_id, title, description, created_by, assigned_rj)
       values ($1, $2, $3, $4, $4) returning id`,
      [programId, title, description ?? null, rj],
    );
    const episodeId = episode[0].id;

    const audio = await db.sql<{ id: string }>(
      `insert into public.audio_files
         (episode_id, file_name, storage_path, mime_type, file_size, duration_seconds, uploaded_by)
       values ($1, $2, $3, 'audio/mpeg', 1048576, 300, $4) returning id`,
      [episodeId, `${title}.mp3`, `episodes/${episodeId}/${title}.mp3`, rj],
    );
    await db.sql('update public.episodes set audio_file_id = $1 where id = $2', [audio[0].id, episodeId]);
    await db.asUser(rj, 'select public.submit_episode_for_qc($1)', [episodeId]);
    await db.asUser(qc, 'select public.approve_episode($1)', [episodeId]);
    return episodeId;
  }

  beforeAll(async () => {
    db = await createTestDb();
    admin = await db.createUser({ email: 'sched-admin@vit.ac.in', fullName: 'Admin Sched', role: 'ADMIN' });
    producer = await db.createUser({ email: 'sched-prod@vit.ac.in', fullName: 'Producer Sched', role: 'PRODUCER' });
    rj = await db.createUser({ email: 'sched-rj@vit.ac.in', fullName: 'RJ Sched', role: 'RJ' });
    qc = await db.createUser({ email: 'sched-qc@vit.ac.in', fullName: 'QC Sched', role: 'QC' });

    const prog = await db.asUser<{ id: string }>(
      producer,
      `insert into public.programs (name, created_by) values ('Community Spotlight', $1) returning id`,
      [producer],
    );
    programId = prog[0].id;
  });

  afterAll(async () => {
    await db.close();
  });

  it('allows admin to publish immediately with customized title and description', async () => {
    const epId = await makeApprovedEpisode('Draft Title 1', 'Initial draft description');

    // Admin customizes title and description and publishes immediately
    const res = await db.asUser<{ id: string; title: string; description: string; show_on_homepage: boolean }>(
      admin,
      `select id, title, description, show_on_homepage
       from public.schedule_episode_homepage($1, true, now(), null, $2, $3)`,
      [epId, 'Custom Homepage Title 1', 'Punchy homepage teaser description'],
    );

    expect(res[0].title).toBe('Custom Homepage Title 1');
    expect(res[0].description).toBe('Punchy homepage teaser description');
    expect(res[0].show_on_homepage).toBe(true);

    // Verify it appears in v_public_approved_episodes
    const publicView = await db.sql<{ title: string; description: string; program_name: string }>(
      `select title, description, program_name from public.v_public_approved_episodes where episode_id = $1`,
      [epId],
    );
    expect(publicView.length).toBe(1);
    expect(publicView[0].title).toBe('Custom Homepage Title 1');
    expect(publicView[0].description).toBe('Punchy homepage teaser description');
  });

  it('allows later updates to title and description without creating duplicate entries', async () => {
    const epId = await makeApprovedEpisode('Original Title 2', 'Original Description 2');

    // First publish
    await db.asUser(
      producer,
      `select public.schedule_episode_homepage($1, true, now(), null, $2, $3)`,
      [epId, 'First Homepage Title', 'First Description'],
    );

    // Edit later
    await db.asUser(
      admin,
      `select public.schedule_episode_homepage($1, true, now(), null, $2, $3)`,
      [epId, 'Updated Homepage Title', 'Updated Description'],
    );

    // Ensure only 1 entry exists for this episode in episodes table and public view
    const episodeRows = await db.sql<{ count: number }>(
      `select count(*)::int as count from public.episodes where id = $1`,
      [epId],
    );
    expect(episodeRows[0].count).toBe(1);

    const publicView = await db.sql<{ title: string; description: string }>(
      `select title, description from public.v_public_approved_episodes where episode_id = $1`,
      [epId],
    );
    expect(publicView.length).toBe(1);
    expect(publicView[0].title).toBe('Updated Homepage Title');
    expect(publicView[0].description).toBe('Updated Description');
  });

  it('hides future scheduled episodes until release time arrives', async () => {
    const epId = await makeApprovedEpisode('Future Title', 'Future Description');

    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await db.asUser(
      admin,
      `select public.schedule_episode_homepage($1, true, $2, null, $3, $4)`,
      [epId, future, 'Scheduled Release Title', 'Scheduled Release Description'],
    );

    // Should NOT appear in v_public_approved_episodes yet
    const publicView = await db.sql(
      `select * from public.v_public_approved_episodes where episode_id = $1`,
      [epId],
    );
    expect(publicView.length).toBe(0);

    // In episodes table, the title and description are safely stored
    const epRow = await db.sql<{ title: string; description: string; show_on_homepage: boolean }>(
      `select title, description, show_on_homepage from public.episodes where id = $1`,
      [epId],
    );
    expect(epRow[0].title).toBe('Scheduled Release Title');
    expect(epRow[0].description).toBe('Scheduled Release Description');
    expect(epRow[0].show_on_homepage).toBe(true);
  });

  it('preserves existing title/desc if null is passed (backward compatible)', async () => {
    const epId = await makeApprovedEpisode('Existing Title Keep', 'Existing Desc Keep');

    await db.asUser(
      admin,
      `select public.schedule_episode_homepage($1, true, now(), null)`,
      [epId],
    );

    const epRow = await db.sql<{ title: string; description: string }>(
      `select title, description from public.episodes where id = $1`,
      [epId],
    );
    expect(epRow[0].title).toBe('Existing Title Keep');
    expect(epRow[0].description).toBe('Existing Desc Keep');
  });

  it('rejects scheduling with an empty title', async () => {
    const epId = await makeApprovedEpisode('Valid Title', 'Valid Desc');

    await expectFailure(
      () =>
        db.asUser(
          admin,
          `select public.schedule_episode_homepage($1, true, now(), null, $2, $3)`,
          [epId, '   ', 'Some desc'],
        ),
      /cannot be empty/i,
    );
  });

  it('refuses unapproved episodes from being scheduled on the homepage', async () => {
    const draft = await db.asUser<{ id: string }>(
      rj,
      `insert into public.episodes (program_id, title, created_by, assigned_rj)
       values ($1, 'Draft Only', $2, $2) returning id`,
      [programId, rj],
    );

    await expectFailure(
      () =>
        db.asUser(
          admin,
          `select public.schedule_episode_homepage($1, true, now(), null, 'Custom Title', 'Desc')`,
          [draft[0].id],
        ),
      /Only QC-approved episodes/i,
    );
  });
});
