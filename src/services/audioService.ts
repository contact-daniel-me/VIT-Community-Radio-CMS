import { AUDIO_BUCKET, supabase } from '@/lib/supabase';
import { AppError, toAppError } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type { AudioFileRow } from '@/types/database';

export const MAX_AUDIO_BYTES = 200 * 1024 * 1024; // 200 MB, matches the DB CHECK

/**
 * Station policy: MP3 only.
 *
 * 'audio/mpeg' is the correct type for an MP3; 'audio/mp3' is a non-standard
 * alias some browsers report for the same file. Both are accepted here and by
 * the `audio_files_mp3_only` constraint, and nothing else is.
 */
export const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3'] as const;

export const ALLOWED_AUDIO_EXTENSIONS = ['mp3'] as const;

function extensionOf(file: File): string {
  const parts = file.name.split('.');
  return parts.length > 1 ? (parts.pop() as string).toLowerCase() : '';
}

/**
 * Browsers are inconsistent: some report '' for an MP3, and some report
 * 'audio/mpeg' for other MPEG-family audio. So the extension and the reported
 * type must BOTH be consistent with MP3 -- neither alone is enough.
 */
function resolveMimeType(file: File): string {
  if ((ALLOWED_AUDIO_TYPES as readonly string[]).includes(file.type)) return file.type;
  if (!file.type && extensionOf(file) === 'mp3') return 'audio/mpeg';
  return file.type;
}

export function validateAudioFile(file: File): { mimeType: string } {
  if (file.size === 0) {
    throw new AppError('VALIDATION', 'That file is empty.');
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new AppError(
      'VALIDATION',
      `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB. The limit is 200 MB.`,
    );
  }

  if (extensionOf(file) !== 'mp3') {
    throw new AppError(
      'VALIDATION',
      'Only MP3 files can be uploaded. Convert the recording to MP3 and try again.',
    );
  }

  const mimeType = resolveMimeType(file);
  if (!(ALLOWED_AUDIO_TYPES as readonly string[]).includes(mimeType)) {
    throw new AppError(
      'VALIDATION',
      `That file is named .mp3 but the browser reports it as "${mimeType || 'unknown'}". ` +
        'Only genuine MP3 files can be uploaded.',
    );
  }

  return { mimeType };
}

/** Best-effort duration read. Never blocks an upload if the browser cannot decode. */
async function readDurationSeconds(file: File): Promise<number | null> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), 8000);

    audio.addEventListener('loadedmetadata', () => {
      window.clearTimeout(timer);
      const seconds = Number.isFinite(audio.duration) ? Math.round(audio.duration) : null;
      finish(seconds && seconds > 0 ? seconds : null);
    });
    audio.addEventListener('error', () => {
      window.clearTimeout(timer);
      finish(null);
    });
    audio.src = url;
  });
}

function storagePathFor(episodeId: string, fileName: string): string {
  const safe = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80);
  return `episodes/${episodeId}/${Date.now()}-${safe || 'audio.mp3'}`;
}

async function removeObjectQuietly(path: string): Promise<void> {
  const { error } = await supabase.storage.from(AUDIO_BUCKET).remove([path]);
  if (error && import.meta.env.DEV) {
    console.warn('[audioService] could not clean up orphaned object', path, error.message);
  }
}

export const audioService = {
  /**
   * Upload order matters. The object goes to Storage first, then the metadata
   * row, then the episode pointer. Every step undoes the previous one on
   * failure, so a failed upload never leaves a database row pointing at a file
   * that does not exist (or an orphaned file nobody can see).
   */
  async uploadAudio(episodeId: string, file: File, uploadedBy: string): Promise<AudioFileRow> {
    const { mimeType } = validateAudioFile(file);
    const durationSeconds = await readDurationSeconds(file);
    const storagePath = storagePathFor(episodeId, file.name);

    const upload = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(storagePath, file, { contentType: mimeType, upsert: false });

    if (upload.error) {
      if (/row-level security|Unauthorized|403/i.test(upload.error.message)) {
        throw new AppError(
          'PERMISSION',
          'You cannot upload audio for this episode. It may be locked for QC review.',
        );
      }
      throw toAppError(upload.error);
    }

    let audioRow: AudioFileRow;
    try {
      audioRow = await unwrap(
        supabase
          .from('audio_files')
          .insert({
            episode_id: episodeId,
            file_name: file.name.slice(0, 255),
            storage_path: storagePath,
            mime_type: mimeType,
            file_size: file.size,
            duration_seconds: durationSeconds,
            uploaded_by: uploadedBy,
          })
          .select('*')
          .single(),
      );
    } catch (error) {
      await removeObjectQuietly(storagePath);
      throw error;
    }

    try {
      await unwrap(
        supabase
          .from('episodes')
          .update({ audio_file_id: audioRow.id, duration_seconds: durationSeconds })
          .eq('id', episodeId)
          .select('id'),
      );
    } catch (error) {
      await supabase.from('audio_files').delete().eq('id', audioRow.id);
      await removeObjectQuietly(storagePath);
      throw error;
    }

    return audioRow;
  },

  /** Upload the new take first; only remove the old one once that has worked. */
  async replaceAudio(
    episodeId: string,
    file: File,
    uploadedBy: string,
    previousAudioId?: string | null,
  ): Promise<AudioFileRow> {
    const created = await this.uploadAudio(episodeId, file, uploadedBy);

    if (previousAudioId && previousAudioId !== created.id) {
      const previous = await unwrap(
        supabase.from('audio_files').select('*').eq('id', previousAudioId).maybeSingle(),
      ).catch(() => null);

      if (previous) {
        await supabase.from('audio_files').delete().eq('id', previous.id);
        await removeObjectQuietly(previous.storage_path);
      }
    }

    return created;
  },

  async deleteAudio(audioId: string): Promise<void> {
    const audio = await unwrap(
      supabase.from('audio_files').select('*').eq('id', audioId).single(),
    );

    // Clear the episode pointer first, otherwise ON DELETE SET NULL would do it
    // silently and we would lose the chance to report a permission failure.
    await supabase
      .from('episodes')
      .update({ audio_file_id: null })
      .eq('audio_file_id', audioId);

    const { error } = await supabase.from('audio_files').delete().eq('id', audioId);
    if (error) throw toAppError(error);

    await removeObjectQuietly(audio.storage_path);
  },

  async getAudioForEpisode(episodeId: string): Promise<AudioFileRow[]> {
    return unwrap(
      supabase
        .from('audio_files')
        .select('*')
        .eq('episode_id', episodeId)
        .order('created_at', { ascending: false }),
    );
  },

  async listAudioLibrary(limit = 100): Promise<AudioFileRow[]> {
    return unwrap(
      supabase
        .from('audio_files')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit),
    );
  },

  /** The bucket is private, so playback always goes through a short-lived URL. */
  async getPlaybackUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      return storagePath;
    }

    const { data, error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      throw new AppError(
        'NOT_FOUND',
        'This audio file is not available. It may not have been uploaded yet.',
        error,
      );
    }
    return data.signedUrl;
  },
};
