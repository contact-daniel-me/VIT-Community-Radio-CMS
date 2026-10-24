import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';

describe('Feedback & Ideas Hub (Migration 20260921000001)', () => {
  let db: TestDb;
  let adminId: string;
  let rjId1: string;
  let rjId2: string;

  beforeAll(async () => {
    db = await createTestDb();
    adminId = await db.createUser({
      email: 'station_admin_feedback@vit.ac.in',
      fullName: 'Station Director',
      role: 'ADMIN',
    });
    rjId1 = await db.createUser({
      email: 'rj_user1_feedback@vit.ac.in',
      fullName: 'RJ Ananya',
      role: 'RJ',
    });
    rjId2 = await db.createUser({
      email: 'rj_user2_feedback@vit.ac.in',
      fullName: 'RJ Karthik',
      role: 'RJ',
    });
  });

  afterAll(async () => {
    await db?.close();
  });

  describe('Database Schema & Constraints', () => {
    it('generates a human-friendly reference ID with the current year', async () => {
      const rows = await db.asUser(
        rjId1,
        `insert into public.feedback_submissions
           (feedback_type, user_id, category, subject, message, rating)
         values
           ('IDENTIFIED', $1::uuid, 'IDEA', 'Weekend Indie Special', 'We should host a student music hour.', 5)
         returning id, reference, status, feedback_type`,
        [rjId1],
      );

      expect(rows).toHaveLength(1);
      const currentYear = new Date().getFullYear();
      expect(rows[0].reference).toMatch(new RegExp(`^FB-${currentYear}-\\d{4}$`));
      expect(rows[0].status).toBe('NEW');
      expect(rows[0].feedback_type).toBe('IDENTIFIED');
    });

    it('enforces anonymous identity guard: rejects anonymous feedback with a non-null user_id', async () => {
      await expectFailure(
        () =>
          db.sql(
            `insert into public.feedback_submissions
               (feedback_type, user_id, category, subject, message)
             values
               ('ANONYMOUS', $1::uuid, 'BUG', 'Mic hum', 'Strange audio buzz during evening slot')`,
            [rjId1],
          ),
        /feedback_anonymous_identity_guard/i,
      );
    });

    it('enforces anonymous identity guard: rejects identified feedback with a null user_id', async () => {
      await expectFailure(
        () =>
          db.sql(
            `insert into public.feedback_submissions
               (feedback_type, user_id, category, subject, message)
             values
               ('IDENTIFIED', null, 'APPRECIATION', 'Great shows', 'Love the station programming')`,
          ),
        /feedback_anonymous_identity_guard/i,
      );
    });

    it('accepts valid anonymous submissions with null user_id', async () => {
      const rows = await db.sql<{ id: string; reference: string; user_id: string | null; feedback_type: string }>(
        `insert into public.feedback_submissions
           (feedback_type, user_id, category, subject, message, rating)
         values
           ('ANONYMOUS', null, 'TECHNICAL', 'Studio B Headphones', 'Left headphone driver is crackling', 3)
         returning id, reference, user_id, feedback_type`,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBeNull();
      expect(rows[0].feedback_type).toBe('ANONYMOUS');
      expect(rows[0].reference).toMatch(/^FB-\d{4}-\d{4}$/);
    });
  });

  describe('Row Level Security & Identity Privacy', () => {
    let rj1IdentifiedId: string;
    let rj2IdentifiedId: string;
    let anonSubmissionId: string;

    beforeAll(async () => {
      // Submissions:
      // 1. RJ1 identified
      const r1 = await db.asUser<{ id: string }>(
        rjId1,
        `insert into public.feedback_submissions
           (feedback_type, user_id, category, subject, message, rating)
         values
           ('IDENTIFIED', $1::uuid, 'STUDIO', 'Acoustic Panels', 'Studio A could use acoustic diffusers.', 4)
         returning id`,
        [rjId1],
      );
      rj1IdentifiedId = r1[0].id;

      // 2. RJ2 identified
      const r2 = await db.asUser<{ id: string }>(
        rjId2,
        `insert into public.feedback_submissions
           (feedback_type, user_id, category, subject, message, rating)
         values
           ('IDENTIFIED', $1::uuid, 'BOOKING', 'Slot Duration', 'Would prefer 45 minute options.', 4)
         returning id`,
        [rjId2],
      );
      rj2IdentifiedId = r2[0].id;

      // 3. Anonymous submission
      const r3 = await db.sql<{ id: string }>(
        `insert into public.feedback_submissions
           (feedback_type, user_id, category, subject, message)
         values
           ('ANONYMOUS', null, 'OTHER', 'Campus Suggestion', 'Can we broadcast during cultural fest?')
         returning id`,
      );
      anonSubmissionId = r3[0].id;
    });

    it('prevents regular users from reading another user identified feedback from the base table', async () => {
      const rows = await db.asUser<{ id: string }>(
        rjId1,
        `select id from public.feedback_submissions where id = $1::uuid`,
        [rj2IdentifiedId],
      );
      expect(rows).toHaveLength(0);
    });

    it('prevents regular users from reading anonymous feedback directly', async () => {
      const rows = await db.asUser<{ id: string }>(
        rjId1,
        `select id from public.feedback_submissions where id = $1::uuid`,
        [anonSubmissionId],
      );
      expect(rows).toHaveLength(0);
    });

    it('allows regular users to view only their own identified feedback in v_my_feedback', async () => {
      const rows = await db.asUser<{ id: string; subject: string; feedback_type: string; user_id: string }>(
        rjId1,
        `select id, subject, feedback_type, user_id from public.v_my_feedback order by created_at desc`,
      );
      // RJ1 must see their own identified feedback
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(rj1IdentifiedId);
      // Must NOT contain RJ2 or anonymous
      expect(ids).not.toContain(rj2IdentifiedId);
      expect(ids).not.toContain(anonSubmissionId);
    });

    it('allows administrators to view all feedback (both identified and anonymous)', async () => {
      const rows = await db.asUser<{ id: string; feedback_type: string }>(
        adminId,
        `select id, feedback_type from public.feedback_submissions`,
      );
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(rj1IdentifiedId);
      expect(ids).toContain(rj2IdentifiedId);
      expect(ids).toContain(anonSubmissionId);
    });

    it('prevents regular users from modifying feedback status', async () => {
      const res = await db.asUser(
        rjId1,
        `update public.feedback_submissions set status = 'RESOLVED' where id = $1::uuid returning id`,
        [rj1IdentifiedId],
      );
      expect(res).toHaveLength(0);

      // Verify status is still NEW
      const check = await db.asUser<{ status: string }>(
        adminId,
        `select status from public.feedback_submissions where id = $1::uuid`,
        [rj1IdentifiedId],
      );
      expect(check[0].status).toBe('NEW');
    });

    it('allows administrators to update status and add station response', async () => {
      const updated = await db.asUser(
        adminId,
        `update public.feedback_submissions
           set status = 'IN_REVIEW', admin_response = 'We have queued acoustic treatment for next month.'
         where id = $1::uuid
         returning id, status, admin_response`,
        [rj1IdentifiedId],
      );

      expect(updated).toHaveLength(1);
      expect(updated[0].status).toBe('IN_REVIEW');
      expect(updated[0].admin_response).toBe('We have queued acoustic treatment for next month.');
    });

    it('protects internal admin notes from regular users', async () => {
      // Admin writes an internal note
      await db.asUser(
        adminId,
        `insert into public.feedback_admin_notes (feedback_id, author_id, note)
         values ($1::uuid, $2::uuid, 'Checked vendor quotes: estimated Rs 12,000.')`,
        [rj1IdentifiedId, adminId],
      );

      // Admin can read notes
      const adminView = await db.asUser(
        adminId,
        `select note from public.feedback_admin_notes where feedback_id = $1::uuid`,
        [rj1IdentifiedId],
      );
      expect(adminView).toHaveLength(1);
      expect(adminView[0].note).toContain('vendor quotes');

      // Regular user gets zero rows (RLS blocked)
      const userView = await db.asUser(
        rjId1,
        `select note from public.feedback_admin_notes where feedback_id = $1::uuid`,
        [rj1IdentifiedId],
      );
      expect(userView).toHaveLength(0);
    });
  });
});
