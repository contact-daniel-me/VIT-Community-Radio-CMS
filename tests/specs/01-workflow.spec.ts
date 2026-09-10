/**
 * The success criteria from the brief, executed end to end against real SQL:
 *
 *   login -> create program -> create episode -> upload audio -> submit for QC
 *   -> QC approves -> schedule -> current broadcast -> next broadcast
 *   -> broadcast completes -> activity logged
 *
 * plus the rejection loop: reject -> edit -> resubmit -> approve.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, minutesFromNow, type TestDb } from '../harness/db';

describe('content and broadcast workflow', () => {
  let db: TestDb;
  let admin: string;
  let producer: string;
  let rj: string;
  let qc: string;

  let programId: string;
  let episodeId: string;
  let scheduleId: string;

  beforeAll(async () => {
    db = await createTestDb();
    admin = await db.createUser({ email: 'a@vit.ac.in', fullName: 'Admin', role: 'ADMIN' });
    producer = await db.createUser({ email: 'p@vit.ac.in', fullName: 'Producer', role: 'PRODUCER' });
    rj = await db.createUser({ email: 'r@vit.ac.in', fullName: 'RJ Sneha', role: 'RJ' });
    qc = await db.createUser({ email: 'q@vit.ac.in', fullName: 'QC Meera', role: 'QC' });
  });

  afterAll(async () => {
    await db?.close();
  });

  it('a producer creates a program', async () => {
    const rows = await db.asUser<{ id: string; name: string }>(
      producer,
      `insert into public.programs (name, description, host_name, category, created_by)
       values ('VIT Campus Connect', 'Weekly campus round-up', 'Sneha Iyer', 'CAMPUS NEWS', $1)
       returning id, name`,
      [producer],
    );
    programId = rows[0].id;
    expect(rows[0].name).toBe('VIT Campus Connect');
  });

  it('an RJ creates a draft episode on that program', async () => {
    const rows = await db.asUser<{ id: string; status: string }>(
      rj,
      `insert into public.episodes (program_id, title, description, episode_number, host_name, assigned_rj, created_by)
       values ($1, 'Orientation Week Round-Up', 'Everything first-years need', 12, 'Sneha Iyer', $2, $2)
       returning id, status`,
      [programId, rj],
    );
    episodeId = rows[0].id;
    expect(rows[0].status).toBe('DRAFT');
  });

  it('refuses to submit an episode that has no audio', async () => {
    await expectFailure(
      () => db.asUser(rj, `select * from public.submit_episode_for_qc($1)`, [episodeId]),
      /Upload the audio file before submitting/i,
    );
  });

  it('the RJ uploads audio and points the episode at it', async () => {
    const audio = await db.asUser<{ id: string }>(
      rj,
      `insert into public.audio_files
         (episode_id, file_name, storage_path, mime_type, file_size, duration_seconds, uploaded_by)
       values ($1::uuid, 'ep12.mp3', 'episodes/' || ($1::uuid)::text || '/ep12.mp3',
               'audio/mpeg', 55680000, 3480, $2::uuid)
       returning id`,
      [episodeId, rj],
    );
    await db.asUser(
      rj,
      `update public.episodes set audio_file_id = $1, duration_seconds = 3480 where id = $2`,
      [audio[0].id, episodeId],
    );

    const rows = await db.sql<{ audio_file_id: string }>(
      `select audio_file_id from public.episodes where id = $1`,
      [episodeId],
    );
    expect(rows[0].audio_file_id).toBe(audio[0].id);
  });

  it('submits the episode for QC', async () => {
    const rows = await db.asUser<{ status: string; submitted_at: string }>(
      rj,
      `select status, submitted_at from public.submit_episode_for_qc($1)`,
      [episodeId],
    );
    expect(rows[0].status).toBe('PENDING_QC');
    expect(rows[0].submitted_at).toBeTruthy();
  });

  it('freezes the content while it is pending QC', async () => {
    // RLS filters the row out of the UPDATE rather than raising, so the write
    // silently touches nothing. RETURNING makes that visible -- which is exactly
    // how the service layer detects "not permitted" (see episodeService).
    const changed = await db.asUser<{ id: string }>(
      rj,
      `update public.episodes set title = 'Sneaky retitle' where id = $1 returning id`,
      [episodeId],
    );
    expect(changed).toHaveLength(0);

    const rows = await db.sql<{ title: string }>(
      `select title from public.episodes where id = $1`,
      [episodeId],
    );
    expect(rows[0].title).toBe('Orientation Week Round-Up');
  });

  it('blocks a direct status write even on an episode the user may edit', async () => {
    const draft = await db.asUser<{ id: string }>(
      rj,
      `insert into public.episodes (program_id, title, created_by)
       values ($1, 'Direct status attempt', $2) returning id`,
      [programId, rj],
    );
    await expectFailure(
      () =>
        db.asUser(rj, `update public.episodes set status = 'APPROVED' where id = $1`, [
          draft[0].id,
        ]),
      /Episode status cannot be set directly/i,
    );
  });

  it('refuses to schedule an episode that QC has not approved', async () => {
    await expectFailure(
      () =>
        db.asUser(
          producer,
          `select * from public.schedule_episode($1, $2, $3::timestamptz, $4::timestamptz, null)`,
          [programId, episodeId, minutesFromNow(120), minutesFromNow(180)],
        ),
      /Only QC-approved episodes can be scheduled/i,
    );
  });

  it('rejects the episode with a mandatory comment', async () => {
    await expectFailure(
      () => db.asUser(qc, `select * from public.reject_episode($1, 'bad')`, [episodeId]),
      /at least 5 characters/i,
    );

    const rows = await db.asUser<{ status: string }>(
      qc,
      `select status from public.reject_episode($1, 'Background hum from 04:12, please re-record.')`,
      [episodeId],
    );
    expect(rows[0].status).toBe('REJECTED');

    const reviews = await db.asUser<{ decision: string; comment: string }>(
      qc,
      `select decision, comment from public.qc_reviews where episode_id = $1`,
      [episodeId],
    );
    expect(reviews).toHaveLength(1);
    expect(reviews[0].decision).toBe('REJECTED');
  });

  it('lets the RJ edit a rejected episode and resubmit it', async () => {
    await db.asUser(
      rj,
      `update public.episodes set description = 'Re-recorded without the hum' where id = $1`,
      [episodeId],
    );
    const rows = await db.asUser<{ status: string }>(
      rj,
      `select status from public.submit_episode_for_qc($1)`,
      [episodeId],
    );
    expect(rows[0].status).toBe('PENDING_QC');
  });

  it('QC approves the episode', async () => {
    const rows = await db.asUser<{ status: string; reviewed_at: string }>(
      qc,
      `select status, reviewed_at from public.approve_episode($1, 'Clean now, approved.')`,
      [episodeId],
    );
    expect(rows[0].status).toBe('APPROVED');
    expect(rows[0].reviewed_at).toBeTruthy();

    const reviews = await db.asUser<{ decision: string }>(
      qc,
      `select decision from public.qc_reviews where episode_id = $1 order by created_at`,
      [episodeId],
    );
    expect(reviews.map((r) => r.decision)).toEqual(['REJECTED', 'APPROVED']);
  });

  it('schedules the approved episode', async () => {
    const rows = await db.asUser<{ id: string; status: string }>(
      producer,
      `select id, status from public.schedule_episode($1, $2, $3::timestamptz, $4::timestamptz, 'Evening slot')`,
      [programId, episodeId, minutesFromNow(-10), minutesFromNow(50)],
    );
    scheduleId = rows[0].id;
    expect(rows[0].status).toBe('SCHEDULED');
  });

  it('reports a readable error for an overlapping slot', async () => {
    await expectFailure(
      () =>
        db.asUser(
          producer,
          `select * from public.schedule_episode($1, $2, $3::timestamptz, $4::timestamptz, null)`,
          [programId, episodeId, minutesFromNow(10), minutesFromNow(70)],
        ),
      /overlaps an existing broadcast/i,
    );
  });

  it('refuses to reopen an episode that is still booked into the schedule', async () => {
    await expectFailure(
      () => db.asUser(producer, `select * from public.reopen_episode($1)`, [episodeId]),
      /Cancel the 1 scheduled slot/i,
    );
  });

  it('identifies the next broadcast before going live', async () => {
    const rows = await db.asUser<{ id: string; program_name: string }>(
      admin,
      `select id, program_name from public.v_next_broadcast`,
    );
    expect(rows[0].id).toBe(scheduleId);
    expect(rows[0].program_name).toBe('VIT Campus Connect');
  });

  it('puts the station on air', async () => {
    const rows = await db.asUser<{ status: string; current_schedule_id: string }>(
      rj,
      `select status, current_schedule_id from public.start_broadcast($1)`,
      [scheduleId],
    );
    expect(rows[0].status).toBe('ON_AIR');
    expect(rows[0].current_schedule_id).toBe(scheduleId);
  });

  it('identifies what is currently on air, with host and times', async () => {
    const rows = await db.asUser<{
      broadcast_status: string;
      program_name: string;
      episode_title: string;
      host_name: string;
      start_time: string;
      end_time: string;
      started_at: string;
    }>(admin, `select * from public.v_current_broadcast`);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      broadcast_status: 'ON_AIR',
      program_name: 'VIT Campus Connect',
      episode_title: 'Orientation Week Round-Up',
      host_name: 'Sneha Iyer',
    });
    expect(rows[0].started_at).toBeTruthy();
    expect(rows[0].end_time).toBeTruthy();
  });

  it('refuses a second simultaneous broadcast', async () => {
    const other = await db.asUser<{ id: string }>(
      producer,
      `select id from public.schedule_episode($1, null, $2::timestamptz, $3::timestamptz, 'Live')`,
      [programId, minutesFromNow(120), minutesFromNow(180)],
    );
    await expectFailure(
      () => db.asUser(producer, `select * from public.start_broadcast($1)`, [other[0].id]),
      /already on air/i,
    );
  });

  it('completes the broadcast', async () => {
    const state = await db.asUser<{ status: string }>(rj, `select status from public.end_broadcast()`);
    expect(state[0].status).toBe('OFFLINE');

    const slot = await db.asUser<{ status: string }>(
      admin,
      `select status from public.schedules where id = $1`,
      [scheduleId],
    );
    expect(slot[0].status).toBe('COMPLETED');
  });

  it('never lets a completed broadcast go back on air (business rule 11)', async () => {
    await expectFailure(
      () => db.asUser(admin, `select * from public.start_broadcast($1)`, [scheduleId]),
      /Only a scheduled slot can go on air/i,
    );
  });

  it('recorded every meaningful action in the activity log', async () => {
    const rows = await db.asUser<{ action: string }>(
      admin,
      `select action from public.activity_logs order by created_at, action`,
    );
    const actions = new Set(rows.map((r) => r.action));

    for (const expected of [
      'PROGRAM_CREATED',
      'EPISODE_CREATED',
      'AUDIO_UPLOADED',
      'EPISODE_SUBMITTED_FOR_QC',
      'EPISODE_REJECTED',
      'EPISODE_APPROVED',
      'SCHEDULE_CREATED',
      'BROADCAST_STARTED',
      'BROADCAST_ENDED',
    ]) {
      expect(actions).toContain(expected);
    }
  });

  it('attributes each log entry to the user who caused it', async () => {
    const rows = await db.asUser<{ user_id: string }>(
      admin,
      `select user_id from public.activity_logs where action = 'EPISODE_APPROVED'`,
    );
    expect(rows[0].user_id).toBe(qc);
  });
});
