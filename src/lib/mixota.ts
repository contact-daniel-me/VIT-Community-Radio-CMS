/**
 * Configuration and utilities for launching Mixota Audio Editor from the CMS.
 *
 * Mixota is an online browser-based DAW/audio editor by GrowIOTA.
 * This integration passes non-sensitive recording references (recordingId, episodeId)
 * and exchanges short-lived authenticated access tokens via secure window postMessage
 * between verified origins.
 */

export const DEFAULT_DEV_MIXOTA_URL = 'http://localhost:5055';
export const DEFAULT_PROD_MIXOTA_URL = 'https://mixota.growiota.in';

export const ALLOWED_MIXOTA_ORIGINS: readonly string[] = [
  'https://mixota.growiota.in',
  'http://localhost:5055',
  'http://localhost:3000',
  'http://127.0.0.1:5055',
];

export function isAllowedMixotaOrigin(origin: string): boolean {
  if (ALLOWED_MIXOTA_ORIGINS.includes(origin)) return true;
  try {
    const configuredOrigin = new URL(getMixotaBaseUrl()).origin;
    return origin === configuredOrigin;
  } catch {
    return false;
  }
}

interface SafeImportMeta {
  env?: {
    VITE_MIXOTA_URL?: string;
    DEV?: boolean;
    [key: string]: unknown;
  };
}

export function getMixotaBaseUrl(): string {
  const meta = import.meta as unknown as SafeImportMeta;
  const envUrl = meta.env?.VITE_MIXOTA_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  return meta.env?.DEV ? DEFAULT_DEV_MIXOTA_URL : DEFAULT_PROD_MIXOTA_URL;
}

export interface MixotaLaunchOptions {
  /** The unique ID of the audio file in the CMS (audio_files.id) */
  recordingId: string;
  /** The associated episode ID (episodes.id) */
  episodeId?: string;
  /** Name of the audio file */
  fileName?: string;
  /** Title of the episode/show */
  title?: string;
  /** Target field in episodes table ('final_audio_file_id' or 'audio_file_id') */
  targetField?: 'final_audio_file_id' | 'audio_file_id';
  /** Editor route to launch (defaults to '/editor') */
  route?: string;
}

/**
 * Builds a secure launch URL for Mixota.
 *
 * Notice that NO database secrets, permanent credentials, or unrestricted private URLs
 * are included in the query string. Only non-sensitive resource identifiers and
 * metadata are passed.
 */
export function buildMixotaLaunchUrl(options: MixotaLaunchOptions): string {
  const baseUrl = getMixotaBaseUrl();
  const route = options.route || '/editor';
  const cleanRoute = route.startsWith('/') ? route : `/${route}`;

  const params = new URLSearchParams();
  params.set('recordingId', options.recordingId);

  if (options.episodeId) {
    params.set('episodeId', options.episodeId);
  }
  if (options.title) {
    params.set('title', options.title);
  }
  if (options.fileName) {
    params.set('fileName', options.fileName);
  }
  if (options.targetField) {
    params.set('target', options.targetField);
  }

  const origin = typeof window !== 'undefined' ? window.location?.origin : undefined;
  if (origin) {
    params.set('cmsOrigin', origin);
  }

  return `${baseUrl}${cleanRoute}?${params.toString()}`;
}
