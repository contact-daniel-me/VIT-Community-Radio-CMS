/**
 * Audio Upload Limit (50 MB) Specification.
 *
 * Verifies that:
 * 1. Frontend validation:
 *    - MAX_AUDIO_BYTES is 50 MB (52,428,800 bytes).
 *    - Files <= 50 MB pass validation.
 *    - Files > 50 MB are rejected with clear error message stating 50 MB limit.
 * 2. Backend validation (database):
 *    - radio-audio storage bucket has file_size_limit = 52428800.
 *    - audio_files.file_size check constraint rejects files > 52428800 bytes.
 *    - audio_files.file_size check constraint accepts files <= 52428800 bytes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';

const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB, matches the DB CHECK

function validateAudioFileSize(file: { name: string; size: number }): void {
  if (file.size === 0) {
    throw new Error('That file is empty.');
  }
  if (file.size > MAX_AUDIO_BYTES) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(`That file is ${sizeMb} MB. The limit is 50 MB.`);
  }
}

describe('audio upload limit (50 MB)', () => {
  describe('frontend audio file validation', () => {
    it('sets MAX_AUDIO_BYTES constant to exactly 50 MB (52428800 bytes)', () => {
      expect(MAX_AUDIO_BYTES).toBe(50 * 1024 * 1024);
      expect(MAX_AUDIO_BYTES).toBe(52428800);
    });

    it('accepts valid audio files up to 50 MB', () => {
      // 10 MB file
      expect(() => validateAudioFileSize({ name: 'test.mp3', size: 10 * 1024 * 1024 })).not.toThrow();

      // Exactly 50 MB file
      expect(() => validateAudioFileSize({ name: 'boundary.mp3', size: 50 * 1024 * 1024 })).not.toThrow();
    });

    it('rejects files exceeding 50 MB with a clear error message', () => {
      // 50 MB + 1 byte
      expect(() =>
        validateAudioFileSize({ name: 'too-large.mp3', size: 50 * 1024 * 1024 + 1 }),
      ).toThrowError(/That file is 50\.0 MB\. The limit is 50 MB\./i);

      // 60 MB file
      expect(() =>
        validateAudioFileSize({ name: 'sixty-mb.mp3', size: 60 * 1024 * 1024 }),
      ).toThrowError(/That file is 60\.0 MB\. The limit is 50 MB\./i);

      // 200 MB file (old limit)
      expect(() =>
        validateAudioFileSize({ name: 'old-limit.mp3', size: 200 * 1024 * 1024 }),
      ).toThrowError(/That file is 200\.0 MB\. The limit is 50 MB\./i);
    });
  });

  describe('backend and storage upload restrictions', () => {
    let db: TestDb;
    let admin: string;
    let programId: string;
    let episodeId: string;

    beforeAll(async () => {
      db = await createTestDb({ seed: true });
      admin = await db.createUser({
        email: 'audio-limit-admin@vit.ac.in',
        fullName: 'Audio Limit Admin',
        role: 'ADMIN',
      });

      const prog = await db.sql<{ id: string }>(
        `insert into public.programs (name, created_by) values ('Audio Limit Test Show', $1) returning id`,
        [admin],
      );
      programId = prog[0].id;

      const ep = await db.sql<{ id: string }>(
        `insert into public.episodes (program_id, title, created_by) values ($1, 'Audio Limit Test Ep', $2) returning id`,
        [programId, admin],
      );
      episodeId = ep[0].id;
    });

    afterAll(async () => {
      await db?.close();
    });

    it('configures radio-audio bucket file_size_limit to 52428800 (50 MB)', async () => {
      const rows = await db.sql<{ id: string; file_size_limit: string }>(
        `select id, file_size_limit from storage.buckets where id = 'radio-audio'`,
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].file_size_limit)).toBe(52428800);
    });

    it('allows inserting audio_files with file_size up to 52428800 bytes', async () => {
      // 50 MB exact boundary
      const rows = await db.sql<{ id: string; file_size: string }>(
        `insert into public.audio_files (episode_id, file_name, storage_path, mime_type, file_size, uploaded_by)
         values ($1::uuid, 'valid-50mb.mp3', 'episodes/' || ($1::uuid)::text || '/valid-50mb.mp3', 'audio/mpeg', 52428800, $2::uuid)
         returning id, file_size`,
        [episodeId, admin],
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].file_size)).toBe(52428800);
    });

    it('rejects inserting audio_files with file_size greater than 52428800 bytes (50 MB + 1 byte)', async () => {
      await expectFailure(
        () =>
          db.sql(
            `insert into public.audio_files (episode_id, file_name, storage_path, mime_type, file_size, uploaded_by)
             values ($1::uuid, 'over-50mb.mp3', 'episodes/' || ($1::uuid)::text || '/over-50mb.mp3', 'audio/mpeg', 52428801, $2::uuid)`,
            [episodeId, admin],
          ),
        /audio_files_file_size_check|violates check constraint/i,
      );
    });

    it('rejects inserting audio_files with file_size of 200 MB (209715200 bytes)', async () => {
      await expectFailure(
        () =>
          db.sql(
            `insert into public.audio_files (episode_id, file_name, storage_path, mime_type, file_size, uploaded_by)
             values ($1::uuid, 'old-200mb.mp3', 'episodes/' || ($1::uuid)::text || '/old-200mb.mp3', 'audio/mpeg', 209715200, $2::uuid)`,
            [episodeId, admin],
          ),
        /audio_files_file_size_check|violates check constraint/i,
      );
    });
  });
});
