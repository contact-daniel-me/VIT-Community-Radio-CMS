/**
 * Storage Provider Resolver
 *
 * Provides a unified, provider-aware abstraction for resolving audio storage
 * across Supabase Storage and Cloudflare R2.
 *
 * Routing Rules:
 * - Records with storage_provider = 'r2' resolve via Cloudflare R2 presigned gateway.
 * - Records with storage_provider = 'supabase' (or null/unspecified) resolve via Supabase Storage.
 * - Raw HTTP/HTTPS URLs pass through directly.
 * - All server credentials remain server-side; client only requests short-lived signed URLs.
 */

import { supabase, AUDIO_BUCKET } from '@/lib/supabase';
import { AppError } from '@/lib/errors';
import { r2Service } from '@/services/r2Service';
import { storageObservabilityService } from '@/services/storageObservabilityService';
import type { AudioFileRow } from '@/types/database';

export type StorageProvider = 'supabase' | 'r2';

export type StorageTarget =
  | string
  | Pick<AudioFileRow, 'storage_path'> & { storage_provider?: StorageProvider | string | null };

/** In-memory cache to avoid redundant database lookups when resolving by storage_path string */
const providerCache = new Map<string, StorageProvider>();

export const storageResolver = {
  /**
   * Determine whether a storage path resides in Cloudflare R2 or Supabase Storage.
   * Resolves in the following priority order:
   * 1. Explicit override passed by caller.
   * 2. Metadata property on the passed audio record object.
   * 3. In-memory lookup cache.
   * 4. Query to the `audio_files` table by `storage_path`.
   * 5. Safe fallback: 'supabase' (guarantees backward compatibility).
   */
  async resolveProvider(
    target: StorageTarget,
    explicitProvider?: StorageProvider,
  ): Promise<StorageProvider> {
    if (explicitProvider) {
      return explicitProvider;
    }

    if (typeof target !== 'string' && target.storage_provider) {
      const provider = target.storage_provider === 'r2' ? 'r2' : 'supabase';
      providerCache.set(target.storage_path, provider);
      return provider;
    }

    const path = typeof target === 'string' ? target : target.storage_path;

    if (providerCache.has(path)) {
      return providerCache.get(path)!;
    }

    try {
      const { data, error } = await supabase
        .from('audio_files')
        .select('storage_provider')
        .eq('storage_path', path)
        .maybeSingle();

      if (!error && data?.storage_provider) {
        const provider = data.storage_provider === 'r2' ? 'r2' : 'supabase';
        providerCache.set(path, provider);
        return provider;
      }
    } catch {
      // Fallback to default on any network or query error
    }

    // Default to Supabase for backward compatibility
    providerCache.set(path, 'supabase');
    return 'supabase';
  },

  /**
   * Generates a short-lived signed playback URL from the appropriate storage provider.
   *
   * @param target Storage path string or object containing storage_path and optional storage_provider
   * @param expiresInSeconds Signed URL TTL in seconds (default: 3600 / 1 hour)
   * @param explicitProvider Optional explicit provider override ('supabase' | 'r2')
   */
  async getPlaybackUrl(
    target: StorageTarget,
    expiresInSeconds = 3600,
    explicitProvider?: StorageProvider,
  ): Promise<string> {
    const storagePath = typeof target === 'string' ? target : target.storage_path;

    // Passthrough for already-resolved or external HTTP(S) URLs
    if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
      return storagePath;
    }

    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // 1. Try public playback API gateway (allows anonymous visitors to stream without signing in)
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch(
          `/api/playback-url?path=${encodeURIComponent(storagePath)}&expires=${expiresInSeconds}`,
        );
        if (res.ok) {
          const json = await res.json();
          if (json.downloadUrl) {
            const latency = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
            storageObservabilityService.recordPlayback({
              success: true,
              provider: 'r2',
              latencyMs: latency,
              details: storagePath,
            });
            return json.downloadUrl;
          }
        }
      } catch {
        // Fall through to direct provider resolution
      }
    }

    try {
      const provider = await this.resolveProvider(target, explicitProvider);

      if (provider === 'r2') {
        try {
          const url = await r2Service.requestDownloadUrl(storagePath, expiresInSeconds);
          const latency = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
          storageObservabilityService.recordPlayback({
            success: true,
            provider: 'r2',
            latencyMs: latency,
            details: storagePath,
          });
          return url;
        } catch (r2Err) {
          if (explicitProvider === 'r2') throw r2Err;
          // Fall through to try Supabase Storage
        }
      }

      // Supabase Storage resolution
      const { data, error } = await supabase.storage
        .from(AUDIO_BUCKET)
        .createSignedUrl(storagePath, expiresInSeconds);

      if (!error && data?.signedUrl) {
        const latency = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
        storageObservabilityService.recordPlayback({
          success: true,
          provider: 'supabase',
          latencyMs: latency,
          details: storagePath,
        });
        return data.signedUrl;
      }

      // If Supabase Storage failed and provider was not explicitly forced to 'supabase', try R2
      if (provider !== 'r2' && explicitProvider !== 'supabase') {
        try {
          const url = await r2Service.requestDownloadUrl(storagePath, expiresInSeconds);
          const latency = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
          storageObservabilityService.recordPlayback({
            success: true,
            provider: 'r2',
            latencyMs: latency,
            details: storagePath,
          });
          return url;
        } catch {
          // Fall through to NOT_FOUND
        }
      }

      const latency = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
      storageObservabilityService.recordPlayback({
        success: false,
        provider: 'supabase',
        latencyMs: latency,
        details: storagePath,
        errorCode: error?.message || 'NOT_FOUND',
      });
      throw new AppError(
        'NOT_FOUND',
        'This audio file is not available. It may not have been uploaded yet.',
        error,
      );
    } catch (err: unknown) {
      const latency = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);
      storageObservabilityService.recordPlayback({
        success: false,
        provider: 'r2',
        latencyMs: latency,
        details: storagePath,
        errorCode: errorMsg,
      });
      throw err;
    }
  },

  /**
   * Set cached provider for a path (used by upload/migration flows)
   */
  setCachedProvider(storagePath: string, provider: StorageProvider): void {
    providerCache.set(storagePath, provider);
  },

  /**
   * Clear cache (useful for tests and after batch migrations)
   */
  clearCache(): void {
    providerCache.clear();
  },
};

