/**
 * Storage Integrity Reconciliation Service
 *
 * Read-only diagnostic tool for validating hybrid storage consistency
 * across Supabase PostgreSQL, Supabase Storage, and Cloudflare R2.
 *
 * SAFETY GUARANTEES:
 * - Read-only: Never alters database records, metadata, or storage objects.
 * - Does not perform automated migration or deletion.
 * - Reports missing objects, inaccessible endpoints, and provider drift.
 */

import { supabase } from '@/lib/supabase';
import { storageResolver } from '@/services/storageResolver';
import { storageObservabilityService } from '@/services/storageObservabilityService';

export interface StorageDiscrepancy {
  fileId: string;
  fileName: string;
  storagePath: string;
  storageProvider: string;
  issue: string;
  severity: 'CRITICAL' | 'WARNING';
}

export interface StorageReconciliationReport {
  totalRecords: number;
  supabaseRecords: number;
  r2Records: number;
  verifiedAccessible: number;
  inaccessibleCount: number;
  providerShiftCount: number;
  discrepancies: StorageDiscrepancy[];
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  reconciledAt: string;
}

export const storageReconciliationService = {
  /**
   * Run a read-only reconciliation scan on all active audio records.
   * Tests database record structure, provider assignments, and signed URL generation.
   */
  async runReconciliation(sampleSize = 25): Promise<StorageReconciliationReport> {
    const { data: records, error } = await supabase
      .from('audio_files')
      .select('id, file_name, storage_path, storage_provider, file_size, storage_checksum, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error || !records) {
      return {
        totalRecords: 0,
        supabaseRecords: 0,
        r2Records: 0,
        verifiedAccessible: 0,
        inaccessibleCount: 0,
        providerShiftCount: 0,
        discrepancies: [
          {
            fileId: 'query-error',
            fileName: 'N/A',
            storagePath: 'N/A',
            storageProvider: 'N/A',
            issue: `Failed to query audio_files table: ${error?.message || 'Unknown error'}`,
            severity: 'CRITICAL',
          },
        ],
        overallStatus: 'CRITICAL',
        reconciledAt: new Date().toISOString(),
      };
    }

    const discrepancies: StorageDiscrepancy[] = [];
    let sbCount = 0;
    let r2Count = 0;
    let accessibleCount = 0;
    let providerShiftCount = 0;

    for (const record of records) {
      const provider = record.storage_provider || 'supabase';
      if (provider === 'r2') {
        r2Count++;
      } else {
        sbCount++;
      }

      // Check path validity
      if (!record.storage_path || record.storage_path.trim() === '') {
        discrepancies.push({
          fileId: record.id,
          fileName: record.file_name || 'Unnamed',
          storagePath: 'EMPTY',
          storageProvider: provider,
          issue: 'Audio file record has empty or missing storage_path.',
          severity: 'CRITICAL',
        });
      }

      // Check provider validity
      if (provider !== 'supabase' && provider !== 'r2') {
        providerShiftCount++;
        discrepancies.push({
          fileId: record.id,
          fileName: record.file_name,
          storagePath: record.storage_path,
          storageProvider: provider,
          issue: `Invalid storage_provider value: "${provider}". Expected "supabase" or "r2".`,
          severity: 'CRITICAL',
        });
      }
    }

    // Verify accessibility on a representative sample (or all if small catalog)
    const scanItems = records.slice(0, sampleSize);
    for (const item of scanItems) {
      try {
        const url = await storageResolver.getPlaybackUrl(item, 60);
        if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
          accessibleCount++;
        } else {
          discrepancies.push({
            fileId: item.id,
            fileName: item.file_name,
            storagePath: item.storage_path,
            storageProvider: item.storage_provider || 'supabase',
            issue: 'Generated playback URL was malformed or empty.',
            severity: 'WARNING',
          });
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        discrepancies.push({
          fileId: item.id,
          fileName: item.file_name,
          storagePath: item.storage_path,
          storageProvider: item.storage_provider || 'supabase',
          issue: `Inaccessible audio: ${errMsg}`,
          severity: 'WARNING',
        });
      }
    }

    const inaccessibleCount = scanItems.length - accessibleCount;
    let overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';

    if (discrepancies.some((d) => d.severity === 'CRITICAL')) {
      overallStatus = 'CRITICAL';
      storageObservabilityService.raiseAlert({
        rule: 'STORAGE_INTEGRITY_DRIFT',
        level: 'CRITICAL',
        title: 'Critical Storage Integrity Discrepancy',
        message: `${discrepancies.length} discrepancy items detected during storage reconciliation.`,
      });
    } else if (discrepancies.length > 0) {
      overallStatus = 'WARNING';
      storageObservabilityService.raiseAlert({
        rule: 'STORAGE_INTEGRITY_DRIFT',
        level: 'WARNING',
        title: 'Storage Reconciliation Notice',
        message: `${discrepancies.length} non-critical issues observed during reconciliation scan.`,
      });
    } else {
      storageObservabilityService.dismissAlert('STORAGE_INTEGRITY_DRIFT');
    }

    return {
      totalRecords: records.length,
      supabaseRecords: sbCount,
      r2Records: r2Count,
      verifiedAccessible: accessibleCount,
      inaccessibleCount,
      providerShiftCount,
      discrepancies,
      overallStatus,
      reconciledAt: new Date().toISOString(),
    };
  },
};
