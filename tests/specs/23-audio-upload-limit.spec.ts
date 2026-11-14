/**
 * Audio Upload Limit (100 MB) Specification.
 *
 * Verifies that:
 * 1. Frontend validation:
 *    - MAX_AUDIO_BYTES is 100 MB (104,857,600 bytes).
 *    - Files <= 100 MB pass validation (including 20 MB, 50 MB, 75 MB, 100 MB).
 *    - Files > 100 MB are rejected with clear error message stating 100 MB limit.
 * 2. Backend validation (database):
 *    - radio-audio storage bucket has file_size_limit = 104857600.
 *    - audio_files.file_size check constraint rejects files > 104857600 bytes.
 *    - audio_files.file_size check constraint accepts files <= 104857600 bytes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, expectFailure, type TestDb } from '../harness/db';
import { MAX_AUDIO_BYTES, validateAudioFile, RECOMMENDED_AUDIO_SETTINGS } from '../../src/services/audioService';

describe('audio upload limit (100 MB)', () => {
  describe('frontend audio file validation', () => {
    it('sets MAX_AUDIO_BYTES constant to exactly 100 MB (104857600 bytes)', () => {
      expect(MAX_AUDIO_BYTES).toBe(100 * 1024 * 1024);
      expect(MAX_AUDIO_BYTES).toBe(104857600);
    });

    it('exports recommended audio quality configuration', () => {
      expect(RECOMMENDED_AUDIO_SETTINGS.format).toBe('MP3');
      expect(RECOMMENDED_AUDIO_SETTINGS.bitrate).toBe('192 kbps');
      expect(RECOMMENDED_AUDIO_SETTINGS.sampleRate).toBe('44.1 kHz');
      expect(RECOMMENDED_AUDIO_SETTINGS.channels).toBe('Stereo');
      expect(RECOMMENDED_AUDIO_SETTINGS.encoding).toBe('CBR');
      expect(RECOMMENDED_AUDIO_SETTINGS.maxDurationMinutes).toBe(60);
      expect(RECOMMENDED_AUDIO_SETTINGS.maxFileSizeMb).toBe(100);
      expect(RECOMMENDED_AUDIO_SETTINGS.maxFileSizeBytes).toBe(104857600);
    });

    it('accepts valid audio files up to 100 MB (20 MB, 50 MB, 75 MB, 100 MB)', () => {
      // 20 MB file
      const file20mb = { name: 'broadcast-20mb.mp3', size: 20 * 1024 * 1024, type: 'audio/mpeg' } as unknown as File;
      expect(() => validateAudioFile(file20mb)).not.toThrow();

      // 50 MB file
      const file50mb = { name: 'broadcast-50mb.mp3', size: 50 * 1024 * 1024, type: 'audio/mpeg' } as unknown as File;
      expect(() => validateAudioFile(file50mb)).not.toThrow();

      // 75 MB file
      const file75mb = { name: 'broadcast-75mb.mp3', size: 75 * 1024 * 1024, type: 'audio/mpeg' } as unknown as File;
      expect(() => validateAudioFile(file75mb)).not.toThrow();

      // Exactly 100 MB boundary file
      const file100mb = { name: 'boundary-100mb.mp3', size: 100 * 1024 * 1024, type: 'audio/mpeg' } as unknown as File;
      expect(() => validateAudioFile(file100mb)).not.toThrow();
    });

    it('rejects files exceeding 100 MB with a clear error message', () => {
      // 100 MB + 1 byte
      const fileOverBoundary = { name: 'too-large.mp3', size: 100 * 1024 * 1024 + 1, type: 'audio/mpeg' } as unknown as File;
      expect(() => validateAudioFile(fileOverBoundary)).toThrowError(
        /File size exceeds the 100 MB upload limit\. Please upload an audio file smaller than or equal to 100 MB\./i,
      );

      // 105 MB file
      const file105mb = { name: 'one-hundred-five-mb.mp3', size: 105 * 1024 * 1024, type: 'audio/mpeg' } as unknown as File;
      expect(() => validateAudioFile(file105mb)).toThrowError(
        /File size exceeds the 100 MB upload limit\. Please upload an audio file smaller than or equal to 100 MB\./i,
      );

      // 200 MB file
      const file200mb = { name: 'two-hundred-mb.mp3', size: 200 * 1024 * 1024, type: 'audio/mpeg' } as unknown as File;
      expect(() => validateAudioFile(file200mb)).toThrowError(
        /File size exceeds the 100 MB upload limit\. Please upload an audio file smaller than or equal to 100 MB\./i,
      );
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

    it('configures radio-audio bucket file_size_limit to 104857600 (100 MB)', async () => {
      const rows = await db.sql<{ id: string; file_size_limit: string }>(
        `select id, file_size_limit from storage.buckets where id = 'radio-audio'`,
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].file_size_limit)).toBe(104857600);
    });

    it('allows inserting audio_files with file_size up to 104857600 bytes (100 MB)', async () => {
      // 100 MB exact boundary
      const rows = await db.sql<{ id: string; file_size: string }>(
        `insert into public.audio_files (episode_id, file_name, storage_path, mime_type, file_size, uploaded_by)
         values ($1::uuid, 'valid-100mb.mp3', 'episodes/' || ($1::uuid)::text || '/valid-100mb.mp3', 'audio/mpeg', 104857600, $2::uuid)
         returning id, file_size`,
        [episodeId, admin],
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].file_size)).toBe(104857600);
    });

    it('rejects inserting audio_files with file_size greater than 104857600 bytes (100 MB + 1 byte)', async () => {
      await expectFailure(
        () =>
          db.sql(
            `insert into public.audio_files (episode_id, file_name, storage_path, mime_type, file_size, uploaded_by)
             values ($1::uuid, 'over-100mb.mp3', 'episodes/' || ($1::uuid)::text || '/over-100mb.mp3', 'audio/mpeg', 104857601, $2::uuid)`,
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
