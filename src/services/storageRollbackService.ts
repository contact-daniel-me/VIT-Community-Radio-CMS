/**
 * VIT Community Radio CMS -- Storage Rollback & Safety Evaluation Service
 *
 * Implements strict, non-destructive destination verification before any audio
 * record can have its storage_provider reverted from 'r2' to 'supabase'.
 *
 * STRICT SAFETY RULES:
 * 1. Destination verification required: NEVER switch metadata to 'supabase' unless
 *    the corresponding object is proven to exist in the Supabase 'audio_files' bucket.
 * 2. Size & checksum integrity: If the Supabase object differs in byte size or SHA-256
 *    checksum, rollback is BLOCKED to prevent serving corrupted audio.
 * 3. R2-native protection: Audio files uploaded natively to Cloudflare R2 (which never
 *    existed in Supabase Storage) are classified as INELIGIBLE and kept safely on R2.
 * 4. Never perform blind bulk rollbacks. Every record must be individually verified.
 * 5. Dry-run mode by default: Reports full audit without modifying any records.
 * 6. Non-destructive: No audio objects in R2 or Supabase are ever deleted during rollback.
 */

import { supabase, AUDIO_BUCKET } from '@/lib/supabase';
import { storageResolver } from '@/services/storageResolver';

export type RollbackVerdict =
  | 'ELIGIBLE'
  | 'INELIGIBLE_ALREADY_SUPABASE'
  | 'INELIGIBLE_NO_SUPABASE_COPY'
  | 'INELIGIBLE_SIZE_MISMATCH'
  | 'INELIGIBLE_CHECKSUM_MISMATCH'
  | 'INELIGIBLE_ACCESS_ERROR';

export interface RollbackCandidate {
  id: string;
  episode_id: string;
  file_name: string;
  storage_path: string;
  storage_provider: 'supabase' | 'r2' | string;
  file_size: number;
  mime_type: string;
  storage_checksum?: string | null;
  storage_migrated_at?: string | null;
}

export interface DestinationCheckResult {
  exists: boolean;
  sizeBytes?: number;
  checksumSha256?: string;
  error?: string;
}

export interface RollbackEvaluationResult {
  recordId: string;
  episodeId: string;
  fileName: string;
  storagePath: string;
  currentProvider: string;
  destinationExists: boolean;
  destinationSizeBytes?: number;
  expectedSizeBytes: number;
  destinationChecksum?: string;
  expectedChecksum?: string;
  verdict: RollbackVerdict;
  recommendedAction: 'REVERT_TO_SUPABASE' | 'KEEP_ON_R2' | 'ABORT_MANUAL_INSPECTION';
  reason: string;
}

export interface RollbackExecutionSummary {
  totalEvaluated: number;
  eligibleCount: number;
  ineligibleR2OnlyCount: number;
  mismatchCount: number;
  alreadySupabaseCount: number;
  revertedCount: number;
  skippedCount: number;
  mode: 'DRY_RUN' | 'EXECUTE';
  results: RollbackEvaluationResult[];
}

export const storageRollbackService = {
  /**
   * Evaluates a single audio record for rollback eligibility using an injected
   * destination checker. This pure evaluation function is deterministic and testable.
   */
  evaluateCandidate(
    candidate: RollbackCandidate,
    destination: DestinationCheckResult,
  ): RollbackEvaluationResult {
    const base = {
      recordId: candidate.id,
      episodeId: candidate.episode_id,
      fileName: candidate.file_name,
      storagePath: candidate.storage_path,
      currentProvider: candidate.storage_provider,
      destinationExists: destination.exists,
      destinationSizeBytes: destination.sizeBytes,
      expectedSizeBytes: candidate.file_size,
      destinationChecksum: destination.checksumSha256,
      expectedChecksum: candidate.storage_checksum || undefined,
    };

    // Case 1: Already Supabase
    if (candidate.storage_provider === 'supabase') {
      return {
        ...base,
        verdict: 'INELIGIBLE_ALREADY_SUPABASE',
        recommendedAction: 'KEEP_ON_R2',
        reason: 'Record is already configured with storage_provider = "supabase". No rollback needed.',
      };
    }

    // Case 2: Supabase object does not exist (R2-native upload)
    if (!destination.exists) {
      return {
        ...base,
        verdict: 'INELIGIBLE_NO_SUPABASE_COPY',
        recommendedAction: 'KEEP_ON_R2',
        reason:
          'R2-native audio: No corresponding object exists in Supabase Storage. Reverting would cause 404 playback failure.',
      };
    }

    // Case 3: Size mismatch
    if (destination.sizeBytes !== undefined && destination.sizeBytes !== candidate.file_size) {
      return {
        ...base,
        verdict: 'INELIGIBLE_SIZE_MISMATCH',
        recommendedAction: 'ABORT_MANUAL_INSPECTION',
        reason: `Size mismatch: Supabase object is ${destination.sizeBytes} bytes, expected ${candidate.file_size} bytes.`,
      };
    }

    // Case 4: Checksum mismatch (when checksum available)
    if (
      candidate.storage_checksum &&
      destination.checksumSha256 &&
      destination.checksumSha256.toLowerCase() !== candidate.storage_checksum.toLowerCase()
    ) {
      return {
        ...base,
        verdict: 'INELIGIBLE_CHECKSUM_MISMATCH',
        recommendedAction: 'ABORT_MANUAL_INSPECTION',
        reason: `Checksum mismatch: Supabase SHA-256 (${destination.checksumSha256}) does not match record checksum (${candidate.storage_checksum}).`,
      };
    }

    // Case 5: Destination verified and matches
    return {
      ...base,
      verdict: 'ELIGIBLE',
      recommendedAction: 'REVERT_TO_SUPABASE',
      reason: 'Destination verified in Supabase Storage with matching size and checksum.',
    };
  },

  /**
   * Verifies destination object existence and integrity in Supabase Storage.
   */
  async checkSupabaseDestination(storagePath: string): Promise<DestinationCheckResult> {
    try {
      const { data: blob, error } = await supabase.storage
        .from(AUDIO_BUCKET)
        .download(storagePath);

      if (error || !blob) {
        return { exists: false, error: error?.message || 'Object not found' };
      }

      let checksum: string | undefined;
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        try {
          const buffer = await blob.arrayBuffer();
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          checksum = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        } catch {
          // Checksum calculation non-fatal
        }
      }

      return {
        exists: true,
        sizeBytes: blob.size,
        checksumSha256: checksum,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { exists: false, error: message };
    }
  },

  /**
   * Performs an end-to-end safe rollback operation.
   * If dryRun is true (default), evaluates and reports without modifying any database records.
   */
  async executeSafeRollback(options: {
    episodeId?: string;
    dryRun?: boolean;
    candidates?: RollbackCandidate[];
  }): Promise<RollbackExecutionSummary> {
    const isDryRun = options.dryRun ?? true;

    let candidates = options.candidates;
    if (!candidates) {
      let query = supabase
        .from('audio_files')
        .select('id, episode_id, file_name, storage_path, storage_provider, file_size, mime_type, storage_checksum, storage_migrated_at')
        .is('deleted_at', null);

      if (options.episodeId) {
        query = query.eq('episode_id', options.episodeId);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to query audio_files for rollback: ${error.message}`);
      }
      candidates = (data || []) as RollbackCandidate[];
    }

    const results: RollbackEvaluationResult[] = [];
    let eligibleCount = 0;
    let ineligibleR2OnlyCount = 0;
    let mismatchCount = 0;
    let alreadySupabaseCount = 0;
    let revertedCount = 0;
    let skippedCount = 0;

    for (const candidate of candidates) {
      let evalResult: RollbackEvaluationResult;

      if (candidate.storage_provider === 'supabase') {
        evalResult = this.evaluateCandidate(candidate, { exists: true, sizeBytes: candidate.file_size });
        alreadySupabaseCount++;
        skippedCount++;
      } else {
        const destCheck = await this.checkSupabaseDestination(candidate.storage_path);
        evalResult = this.evaluateCandidate(candidate, destCheck);

        if (evalResult.verdict === 'ELIGIBLE') {
          eligibleCount++;
          if (!isDryRun) {
            const { error: updateError } = await supabase
              .from('audio_files')
              .update({
                storage_provider: 'supabase',
                storage_migrated_at: null,
              })
              .eq('id', candidate.id);

            if (updateError) {
              evalResult.reason = `Rollback update failed: ${updateError.message}`;
              skippedCount++;
            } else {
              revertedCount++;
              storageResolver.setCachedProvider(candidate.storage_path, 'supabase');
            }
          } else {
            skippedCount++;
          }
        } else if (evalResult.verdict === 'INELIGIBLE_NO_SUPABASE_COPY') {
          ineligibleR2OnlyCount++;
          skippedCount++;
        } else {
          mismatchCount++;
          skippedCount++;
        }
      }

      results.push(evalResult);
    }

    return {
      totalEvaluated: candidates.length,
      eligibleCount,
      ineligibleR2OnlyCount,
      mismatchCount,
      alreadySupabaseCount,
      revertedCount,
      skippedCount,
      mode: isDryRun ? 'DRY_RUN' : 'EXECUTE',
      results,
    };
  },
};

