import { supabase } from '@/lib/supabase';
import { AppError, toAppError } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type { AudioFileRow } from '@/types/database';
import { storageResolver, type StorageProvider } from '@/services/storageResolver';
import { r2Service } from '@/services/r2Service';
import { storageObservabilityService } from '@/services/storageObservabilityService';

export const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB, matches the DB CHECK

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
    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
    throw new AppError(
      'VALIDATION',
      `That file is ${sizeMb} MB. The limit is 50 MB.`,
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

async function computeSha256(file: File | Blob): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return '';
    }
  }
  return '';
}

export const audioService = {
  /**
   * Upload order matters.
   * Phase 4 Hybrid Storage: All newly created audio files route to Cloudflare R2 via authenticated gateway.
   * Binary is uploaded directly to R2 first, then the metadata row with storage_provider = 'r2' and SHA-256 checksum,
   * then the episode pointer. Failed uploads never leave orphaned or invalid database references.
   */
  async uploadAudio(
    episodeId: string,
    file: File,
    uploadedBy: string,
    targetField: 'audio_file_id' | 'final_audio_file_id' = 'audio_file_id',
    onProgress?: (progress: import('./r2Service').R2UploadProgressEvent) => void,
  ): Promise<AudioFileRow> {
    const uploadStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const { mimeType } = validateAudioFile(file);
      const durationSeconds = await readDurationSeconds(file);
      const checksum = await computeSha256(file);

      // 1. Obtain presigned PUT authorization from the authenticated R2 Edge Function gateway
      const uploadAuth = await r2Service.requestUploadUrl({
        episodeId,
        fileName: file.name,
        mimeType,
        fileSize: file.size,
        targetField,
      });

      // 2. Upload binary directly to Cloudflare R2
      // If the upload fails, it aborts immediately before any database records are created.
      await r2Service.uploadBinary(uploadAuth.uploadUrl, file, mimeType, onProgress);

      // 3. Insert metadata record into audio_files with storage_provider = 'r2'
      let audioRow: AudioFileRow;
      try {
        audioRow = await unwrap(
          supabase
            .from('audio_files')
            .insert({
              episode_id: episodeId,
              file_name: file.name.slice(0, 255),
              storage_path: uploadAuth.storagePath,
              storage_provider: 'r2',
              storage_checksum: checksum || null,
              storage_migrated_at: new Date().toISOString(),
              mime_type: mimeType,
              file_size: file.size,
              duration_seconds: durationSeconds,
              uploaded_by: uploadedBy,
            })
            .select('*')
            .single(),
        );
      } catch (error) {
        // Clean up orphaned R2 object if database insert fails
        await r2Service.deleteObject(uploadAuth.storagePath, episodeId);
        throw error;
      }

      const showName = file.name.replace(/\.[^/.]+$/, '').trim();

      // 4. Attach audio to episode
      try {
        await unwrap(
          supabase
            .from('episodes')
            .update({
              [targetField]: audioRow.id,
              duration_seconds: durationSeconds,
              ...(showName ? { title: showName } : {}),
            } as Partial<import('@/types/database').EpisodeRow>)
            .eq('id', episodeId)
            .select('id'),
        );
      } catch (error) {
        try {
          await unwrap(
            supabase.rpc('admin_attach_audio', {
              p_episode_id: episodeId,
              p_audio_file_id: audioRow.id,
              p_target_column: targetField,
            }),
          );
          if (showName) {
            await supabase.from('episodes').update({ title: showName }).eq('id', episodeId);
          }
        } catch {
          await supabase.from('audio_files').delete().eq('id', audioRow.id);
          await r2Service.deleteObject(uploadAuth.storagePath, episodeId);
          throw error;
        }
      }

      // Keep any linked studio booking's show tag in notes updated with the new show name
      if (showName) {
        try {
          const { data: bookings } = await supabase
            .from('studio_bookings')
            .select('id, notes')
            .eq('episode_id', episodeId);

          if (bookings && bookings.length > 0) {
            for (const b of bookings) {
              const currentNotes = b.notes || '';
              const hasTag = /^\[(?:Show|Other Show|Special Link|Studio Tour):\s*([^\]]+)\]/i.test(currentNotes);
              let newNotes = '';
              if (hasTag) {
                newNotes = currentNotes.replace(
                  /^\[(?:Show|Other Show|Special Link|Studio Tour):\s*[^\]]+\]/i,
                  `[Show: ${showName}]`,
                );
              } else {
                newNotes = currentNotes.trim()
                  ? `[Show: ${showName}]\n${currentNotes.trim()}`
                  : `[Show: ${showName}]`;
              }
              await supabase.from('studio_bookings').update({ notes: newNotes }).eq('id', b.id);
            }
          }
        } catch (bookingErr) {
          if (import.meta.env.DEV) {
            console.warn('[audioService] could not update linked booking notes', bookingErr);
          }
        }
      }

      // Cache the resolved provider for immediate playback without database query overhead
      storageResolver.setCachedProvider(uploadAuth.storagePath, 'r2');

      const uploadDuration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - uploadStartTime;
      storageObservabilityService.recordUpload({
        success: true,
        provider: 'r2',
        latencyMs: uploadDuration,
        details: file.name,
      });

      return audioRow;
    } catch (err: unknown) {
      const uploadDuration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - uploadStartTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      storageObservabilityService.recordUpload({
        success: false,
        provider: 'r2',
        latencyMs: uploadDuration,
        details: file.name,
        errorCode: errorMsg,
      });
      throw err;
    }
  },

  /** Upload the new take first to R2; only remove the old R2 take once succeeded, while preserving any Supabase object. */
  async replaceAudio(
    episodeId: string,
    file: File,
    uploadedBy: string,
    previousAudioId?: string | null,
    targetField: 'audio_file_id' | 'final_audio_file_id' = 'audio_file_id',
    onProgress?: (progress: import('./r2Service').R2UploadProgressEvent) => void,
  ): Promise<AudioFileRow> {
    const created = await this.uploadAudio(episodeId, file, uploadedBy, targetField, onProgress);

    if (previousAudioId && previousAudioId !== created.id) {
      const previous = await unwrap(
        supabase.from('audio_files').select('*').eq('id', previousAudioId).maybeSingle(),
      ).catch(() => null);

      if (previous) {
        await supabase.from('audio_files').delete().eq('id', previous.id);

        // Strict Requirement 1 & 5: Never delete existing Supabase Storage objects!
        // Only clean up superseded takes if they were in R2.
        if (previous.storage_provider === 'r2') {
          await r2Service.deleteObject(previous.storage_path, episodeId);
        } else {
          if (import.meta.env.DEV) {
            console.log('[audioService] Preserved original Supabase storage object:', previous.storage_path);
          }
        }
      }
    }

    return created;
  },

  async deleteAudio(audioId: string, targetField: 'audio_file_id' | 'final_audio_file_id' = 'audio_file_id'): Promise<void> {
    const audio = await unwrap(
      supabase.from('audio_files').select('*').eq('id', audioId).single(),
    );

    // Clear the episode pointer first, otherwise ON DELETE SET NULL would do it
    // silently and we would lose the chance to report a permission failure.
    await supabase
      .from('episodes')
      .update({ [targetField]: null } as Partial<import('@/types/database').EpisodeRow>)
      .eq(targetField, audioId);

    const { error } = await supabase.from('audio_files').delete().eq('id', audioId);
    if (error) throw toAppError(error);

    // Strict Requirement 1 & 5: Never delete existing Supabase Storage objects during hybrid rollout.
    if (audio.storage_provider === 'r2') {
      await r2Service.deleteObject(audio.storage_path, audio.episode_id);
    } else {
      if (import.meta.env.DEV) {
        console.log('[audioService] Preserved Supabase Storage object on deletion:', audio.storage_path);
      }
    }
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

  /**
   * Generates a short-lived signed playback URL.
   * Provider-aware: automatically routes between Supabase Storage and Cloudflare R2
   * based on audio_files metadata.
   */
  async getPlaybackUrl(
    storagePathOrFile: string | { storage_path: string; storage_provider?: string | null },
    expiresInSeconds = 3600,
    provider?: StorageProvider,
  ): Promise<string> {
    return storageResolver.getPlaybackUrl(storagePathOrFile, expiresInSeconds, provider);
  },
};
