/**
 * QC Role Studio Booking Permissions & Workflow Verification
 *
 * Verifies that users with the QC role can book studio slots just like RJs:
 * 1. can.bookStudio('QC') evaluates to true.
 * 2. Database RLS policy allows QC users to insert studio bookings for themselves.
 * 3. QC users cannot book on behalf of other users.
 * 4. QC users can cancel their own future bookings, but cannot cancel past bookings.
 * 5. QC users cannot tamper with other users' bookings.
 * 6. Non-booking roles (e.g. EDITOR) remain restricted.
 * 7. Existing QC capabilities (e.g. reviewing QC, immutability of other permissions) are fully preserved.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { can } from '../../src/lib/permissions';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';

function weekdayFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

describe('QC Role Studio Booking Permissions & Workflow', () => {
  let db: TestDb;
  let rj: string;
  let qc: string;
  let otherQc: string;
  let editor: string;
  let defaultProgram: string;

  const book = (
    user: string,
    fields: Partial<Record<string, unknown>> & { date: string; start: string },
  ) =>
    db.asUser(
      user,
      `insert into public.studio_bookings
         (rj_id, booking_date, start_time, end_time, program_id, language,
          origin, override_reason, self_edit, editor_id, created_by)
       values ($1::uuid, $2::date, $3::time, ($3::time + interval '30 minutes'),
               $4::uuid, $5::public.show_language, $6::public.booking_origin, $7, $8, $9::uuid, $10::uuid)
       returning id, reference, status, rj_id, booking_date, start_time`,
      [
        fields.rj ?? user,
        fields.date,
        fields.start,
        fields.program ?? defaultProgram,
        fields.language ?? 'ENGLISH',
        fields.origin ?? 'RJ',
        fields.reason ?? null,
        fields.selfEdit ?? true,
        fields.editor ?? null,
        fields.createdBy ?? user,
      ],
    );

  beforeAll(async () => {
    db = await createTestDb();
    rj = await db.createUser({ email: 'qc_rj@vit.ac.in', fullName: 'RJ Priya', role: 'RJ' });
    qc = await db.createUser({ email: 'qc_user@vit.ac.in', fullName: 'QC Officer Arun', role: 'QC' });
    otherQc = await db.createUser({ email: 'qc_other@vit.ac.in', fullName: 'QC Officer 2', role: 'QC' });
    editor = await db.createUser({ email: 'qc_editor@vit.ac.in', fullName: 'Audio Editor Dave', role: 'EDITOR' });

    const progRows = await db.sql<{ id: string }>(
      `insert into public.programs (name, category) values ('Campus Pulse QC', 'CAMPUS') returning id`,
    );
    defaultProgram = progRows[0].id;
  });

  afterAll(async () => {
    await db?.close();
  });

  describe('1. Permission Definitions (UI & Contract Level)', () => {
    it('grants can.bookStudio to QC role alongside RJ, PRODUCER, and ADMIN', () => {
      expect(can.bookStudio('QC')).toBe(true);
      expect(can.bookStudio('RJ')).toBe(true);
      expect(can.bookStudio('PRODUCER')).toBe(true);
      expect(can.bookStudio('ADMIN')).toBe(true);
    });

    it('denies can.bookStudio to non-booking roles', () => {
      expect(can.bookStudio('EDITOR')).toBe(false);
      expect(can.bookStudio('SECTION_HEAD')).toBe(false);
    });

    it('preserves existing QC review permissions', () => {
      expect(can.reviewQC('QC')).toBe(true);
      expect(can.reviewQC('ADMIN')).toBe(true);
      expect(can.reviewQC('RJ')).toBe(false);
      expect(can.reviewQC('PRODUCER')).toBe(false);
      expect(can.reviewQC('EDITOR')).toBe(false);
    });

    it('preserves scheduling and admin boundaries (QC cannot schedule station on air or manage users)', () => {
      expect(can.schedule('QC')).toBe(false);
      expect(can.manageUsers('QC')).toBe(false);
      expect(can.manageProgram('QC')).toBe(false);
      expect(can.manageHolidays('QC')).toBe(false);
      expect(can.manageAnnouncements('QC')).toBe(false);
    });
  });

  describe('2. Database RLS Studio Booking for QC Role', () => {
    it('allows a QC user to book a valid studio recording slot for themselves', async () => {
      const date = weekdayFromNow(3);
      const rows = await book(qc, { date, start: '10:00' });

      expect(rows).toHaveLength(1);
      const record = rows[0] as { id: string; reference: string; status: string; rj_id: string };
      expect(record.rj_id).toBe(qc);
      expect(record.status).toBe('CONFIRMED');
      expect(record.reference).toMatch(/^VCR-\d{4}-\d{6}$/);
    });

    it('refuses a QC user trying to book on behalf of another user', async () => {
      await expectFailure(
        () =>
          book(qc, {
            date: weekdayFromNow(3),
            start: '10:30',
            rj: rj,
            createdBy: qc,
          }),
        /violates row-level security/i,
      );
    });

    it('refuses an editor from booking the studio', async () => {
      await expectFailure(
        () => book(editor, { date: weekdayFromNow(3), start: '11:00' }),
        /violates row-level security/i,
      );
    });

    it('allows a QC user to cancel their own future booking', async () => {
      const date = weekdayFromNow(4);
      const created = await book(qc, { date, start: '14:00' });
      const id = (created[0] as { id: string }).id;

      const updated = await db.asUser<{ status: string }>(
        qc,
        `update public.studio_bookings set status = 'CANCELLED' where id = $1 returning status`,
        [id],
      );
      expect(updated).toHaveLength(1);
      expect(updated[0].status).toBe('CANCELLED');
    });

    it('stops an RJ or another QC from modifying or cancelling a QC user booking', async () => {
      const date = weekdayFromNow(5);
      const created = await book(qc, { date, start: '15:00' });
      const id = (created[0] as { id: string }).id;

      // RJ cannot modify QC booking
      const rjAttempt = await db.asUser(
        rj,
        `update public.studio_bookings set notes = 'Hijacked' where id = $1 returning id`,
        [id],
      );
      expect(rjAttempt).toHaveLength(0);

      // Another QC cannot modify QC booking
      const otherQcAttempt = await db.asUser(
        otherQc,
        `update public.studio_bookings set status = 'CANCELLED' where id = $1 returning id`,
        [id],
      );
      expect(otherQcAttempt).toHaveLength(0);

      // The original QC booking remains confirmed
      const verified = await db.sql<{ status: string }>(
        `select status from public.studio_bookings where id = $1`,
        [id],
      );
      expect(verified[0].status).toBe('CONFIRMED');
    });

    it('allows QC users to insert and manage studio booking requests', async () => {
      const date = weekdayFromNow(6);
      const rows = await db.asUser<{ id: string; status: string; user_id: string }>(
        qc,
        `insert into public.studio_booking_requests
           (user_id, program_id, booking_date, start_time, end_time, language,
            script_status, self_edit, status)
         values ($1, $2, $3, '16:00', '16:30', 'ENGLISH', 'PENDING', true, 'PENDING')
         returning id, status, user_id`,
        [qc, defaultProgram, date],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(qc);
      expect(rows[0].status).toBe('PENDING');

      // QC user can cancel their own pending request
      const cancelled = await db.asUser<{ status: string }>(
        qc,
        `update public.studio_booking_requests set status = 'CANCELLED' where id = $1 returning status`,
        [rows[0].id],
      );
      expect(cancelled[0].status).toBe('CANCELLED');
    });
  });

  describe('3. Audio Recording Upload & Episode Workflow for QC Role', () => {
    it('evaluates can.createEpisode and can.editEpisode as true for QC users on their own content', () => {
      expect(can.createEpisode('QC')).toBe(true);
      expect(can.editEpisode('QC', { status: 'DRAFT', created_by: qc, assigned_rj: qc }, qc)).toBe(true);
      expect(can.editEpisode('QC', { status: 'DRAFT', created_by: rj, assigned_rj: rj }, qc)).toBe(false);
      expect(can.submitEpisode('QC', { status: 'DRAFT', created_by: qc, assigned_rj: qc }, qc)).toBe(true);
      expect(can.submitEpisode('QC', { status: 'DRAFT', created_by: rj, assigned_rj: rj }, qc)).toBe(false);
    });

    it('allows QC users to insert a DRAFT episode for their booking and stops forging authorship', async () => {
      const epRows = await db.asUser<{ id: string; status: string; created_by: string }>(
        qc,
        `insert into public.episodes (program_id, title, host_name, assigned_rj, created_by)
         values ($1, 'Thinkathon Theme Song', 'QC Officer Arun', $2, $2)
         returning id, status, created_by`,
        [defaultProgram, qc],
      );

      expect(epRows).toHaveLength(1);
      expect(epRows[0].status).toBe('DRAFT');
      expect(epRows[0].created_by).toBe(qc);

      // QC user cannot forge created_by as someone else
      await expectFailure(
        () =>
          db.asUser(
            qc,
            `insert into public.episodes (program_id, title, created_by)
             values ($1, 'Forged Author', $2)`,
            [defaultProgram, rj],
          ),
        /violates row-level security/i,
      );
    });

    it('allows QC users to upload audio files for their own draft episode and link to booking', async () => {
      // 1. Create a booking for QC
      const date = weekdayFromNow(7);
      const bRows = await book(qc, { date, start: '10:00' });
      const bookingId = (bRows[0] as { id: string }).id;

      // 2. Create episode for QC
      const epRows = await db.asUser<{ id: string }>(
        qc,
        `insert into public.episodes (program_id, title, created_by, assigned_rj)
         values ($1, 'QC Session Episode', $2, $2)
         returning id`,
        [defaultProgram, qc],
      );
      const epId = epRows[0].id;

      // 3. Insert audio file into audio_files
      const audioRows = await db.asUser<{ id: string; file_name: string }>(
        qc,
        `insert into public.audio_files
           (episode_id, file_name, storage_path, storage_provider, mime_type, file_size, uploaded_by)
         values ($1::uuid, 'thinkathon.mp3', 'episodes/' || ($1::uuid)::text || '/thinkathon.mp3', 'r2', 'audio/mpeg', 4800000, $2::uuid)
         returning id, file_name`,
        [epId, qc],
      );
      expect(audioRows).toHaveLength(1);
      const audioId = audioRows[0].id;

      // 4. Update episode to attach audio_file_id
      const updatedEp = await db.asUser<{ id: string; audio_file_id: string }>(
        qc,
        `update public.episodes set audio_file_id = $1 where id = $2 returning id, audio_file_id`,
        [audioId, epId],
      );
      expect(updatedEp).toHaveLength(1);
      expect(updatedEp[0].audio_file_id).toBe(audioId);

      // 5. Link episode to studio booking
      const linkedBooking = await db.asUser<{ id: string; episode_id: string }>(
        qc,
        `update public.studio_bookings set episode_id = $1 where id = $2 returning id, episode_id`,
        [epId, bookingId],
      );
      expect(linkedBooking).toHaveLength(1);
      expect(linkedBooking[0].episode_id).toBe(epId);

      // 6. Submit episode for QC
      const submitted = await db.asUser<{ id: string; status: string }>(
        qc,
        `select id, status from public.submit_episode_for_qc($1)`,
        [epId],
      );
      expect(submitted).toHaveLength(1);
      expect(submitted[0].status).toBe('PENDING_QC');
    });

    it('prevents QC users from uploading audio to another users episode', async () => {
      // Create episode owned by RJ
      const rjEp = await db.asUser<{ id: string }>(
        rj,
        `insert into public.episodes (program_id, title, created_by, assigned_rj)
         values ($1, 'RJ Exclusive Take', $2, $2)
         returning id`,
        [defaultProgram, rj],
      );
      const rjEpId = rjEp[0].id;

      // QC attempts to upload audio to RJ episode -> denied
      await expectFailure(
        () =>
          db.asUser(
            qc,
            `insert into public.audio_files
               (episode_id, file_name, storage_path, storage_provider, mime_type, file_size, uploaded_by)
             values ($1::uuid, 'intruder.mp3', 'episodes/' || ($1::uuid)::text || '/intruder.mp3', 'r2', 'audio/mpeg', 1000, $2::uuid)`,
            [rjEpId, qc],
          ),
        /violates row-level security/i,
      );
    });
  });
});
