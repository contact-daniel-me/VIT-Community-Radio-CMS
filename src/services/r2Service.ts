/**
 * Cloudflare R2 Client Service Abstraction
 *
 * Coordinates secure uploads and playback with the Supabase `r2-storage` Edge Function.
 * Never stores or exposes Cloudflare credentials in frontend code.
 * All operations use short-lived presigned URLs authorized through Supabase Auth JWT.
 */

import { supabase } from '@/lib/supabase';
import { AppError } from '@/lib/errors';
import { storageObservabilityService } from '@/services/storageObservabilityService';

export interface R2UploadProgressEvent {
  loaded: number;
  total: number;
  percent: number;
}

export interface R2UploadUrlResult {
  uploadUrl: string;
  storagePath: string;
  storageProvider: 'r2';
  expiresIn: number;
  targetField: 'audio_file_id' | 'final_audio_file_id';
}

export interface R2DownloadUrlResult {
  downloadUrl: string;
  storagePath: string;
  expiresIn: number;
}

export const r2Service = {
  /**
   * Request a short-lived presigned PUT URL from the server-side Edge Function.
   */
  async requestUploadUrl(options: {
    episodeId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    targetField?: 'audio_file_id' | 'final_audio_file_id';
  }): Promise<R2UploadUrlResult> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      throw new AppError('AUTH', 'You must be signed in to upload audio.');
    }

    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const { data, error } = await supabase.functions.invoke<R2UploadUrlResult>('r2-storage', {
      body: {
        action: 'create-upload-url',
        episodeId: options.episodeId,
        fileName: options.fileName,
        mimeType: options.mimeType,
        fileSize: options.fileSize,
        targetField: options.targetField || 'audio_file_id',
      },
    });
    const latency = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
    storageObservabilityService.recordGatewayInvocation({
      action: 'create-upload-url',
      status: error ? 500 : 200,
      latencyMs: latency,
      error: error?.message,
    });

    if (error || !data?.uploadUrl) {
      const msg = error?.message || 'Could not obtain R2 upload authorization.';
      if (/locked|permission|forbidden/i.test(msg)) {
        throw new AppError('PERMISSION', 'You cannot upload audio for this episode. It may be locked for QC review.');
      }
      throw new AppError('NETWORK', msg);
    }

    return data;
  },

  /**
   * Directly upload file binary to Cloudflare R2 using the presigned URL.
   * Uses XMLHttpRequest to accurately stream progress events.
   */
  async uploadBinary(
    uploadUrl: string,
    file: File | Blob,
    mimeType: string,
    onProgress?: (progress: R2UploadProgressEvent) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', mimeType);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress({ loaded: event.loaded, total: event.total, percent });
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new AppError('NETWORK', `Upload to Cloudflare R2 failed with status ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => {
        reject(new AppError('NETWORK', 'Network error while uploading audio to Cloudflare R2. Please check your connection.'));
      };

      xhr.ontimeout = () => {
        reject(new AppError('NETWORK', 'Upload timed out. Please try again.'));
      };

      xhr.send(file);
    });
  },

  /**
   * Request a short-lived presigned GET playback URL for an R2 object.
   */
  async requestDownloadUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const { data, error } = await supabase.functions.invoke<R2DownloadUrlResult>('r2-storage', {
      body: {
        action: 'create-download-url',
        storagePath,
        expiresInSeconds,
      },
    });
    const latency = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
    storageObservabilityService.recordGatewayInvocation({
      action: 'create-download-url',
      status: error ? 500 : 200,
      latencyMs: latency,
      error: error?.message,
    });

    if (error || !data?.downloadUrl) {
      throw new AppError('NOT_FOUND', 'Audio file could not be retrieved from Cloudflare R2.', error);
    }

    return data.downloadUrl;
  },

  /**
   * Request deletion of an R2 object through the authenticated Edge Function.
   */
  async deleteObject(storagePath: string, episodeId?: string): Promise<void> {
    const { error } = await supabase.functions.invoke('r2-storage', {
      body: {
        action: 'delete-object',
        storagePath,
        episodeId,
      },
    });

    if (error && import.meta.env.DEV) {
      console.warn('[r2Service] could not delete R2 object', storagePath, error.message);
    }
  },
};
