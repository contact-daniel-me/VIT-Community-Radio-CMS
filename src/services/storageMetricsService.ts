/**
 * Storage Metrics & Cost Visibility Service
 *
 * Provides real-time metrics, provider distribution analytics,
 * and cost forecasting for the Supabase + Cloudflare R2 hybrid architecture.
 *
 * All operations are read-only and never expose private URLs or secrets.
 */

import { supabase } from '@/lib/supabase';

export interface StorageProviderMetrics {
  count: number;
  totalBytes: number;
  totalMb: number;
  totalGb: number;
  averageSizeMb: number;
}

export interface HybridStorageOverview {
  supabase: StorageProviderMetrics;
  r2: StorageProviderMetrics;
  total: {
    count: number;
    totalBytes: number;
    totalGb: number;
    r2Percentage: number;
  };
  monthlyCostEstimates: {
    r2EstimatedCostUsd: number;
    r2ClassACostUsd?: number;
    r2ClassBCostUsd?: number;
    edgeFunctionCostUsd?: number;
    supabaseStorageCostUsd?: number;
    supabaseAvoidedEgressCostUsd: number;
    netMonthlySavingsUsd: number;
  };
  timestamp: string;
}

/**
 * Cloudflare R2 Standard Pricing (as of 2026):
 * - Storage: $0.015 / GB-month (10 GB free tier)
 * - Class A (Writes/PUT): $4.50 / 1M requests (1M free tier)
 * - Class B (Reads/GET): $0.36 / 1M requests (10M free tier)
 * - Data Egress: $0.00 / GB (Unlimited free egress)
 *
 * Standard Cloud/Supabase Egress Comparison:
 * - Supabase Egress: ~$0.09 / GB beyond 2 GB
 * - Supabase Storage: ~$0.021 / GB-month beyond 1 GB
 */
const R2_STORAGE_PER_GB = 0.015;
const R2_FREE_TIER_GB = 10;
const SUPABASE_EGRESS_PER_GB = 0.09;
const ESTIMATED_MONTHLY_LISTEN_MULTIPLIER = 5; // On average, broadcast audio is streamed 5x its size/month

export const storageMetricsService = {
  /**
   * Fetches real-time catalog distribution and calculates hybrid cost analytics.
   */
  async getStorageOverview(): Promise<HybridStorageOverview> {
    const { data: records, error } = await supabase
      .from('audio_files')
      .select('id, storage_provider, file_size')
      .is('deleted_at', null);

    if (error || !records) {
      return this.getFallbackMetrics();
    }

    let supabaseCount = 0;
    let supabaseBytes = 0;
    let r2Count = 0;
    let r2Bytes = 0;

    for (const file of records) {
      const size = file.file_size || 0;
      if (file.storage_provider === 'r2') {
        r2Count++;
        r2Bytes += size;
      } else {
        supabaseCount++;
        supabaseBytes += size;
      }
    }

    const sbGb = supabaseBytes / (1024 * 1024 * 1024);
    const r2Gb = r2Bytes / (1024 * 1024 * 1024);
    const totalBytes = supabaseBytes + r2Bytes;
    const totalCount = supabaseCount + r2Count;
    const totalGb = totalBytes / (1024 * 1024 * 1024);

    // Compute billable R2 storage after 10 GB free tier
    const billableR2Gb = Math.max(0, r2Gb - R2_FREE_TIER_GB);
    const r2EstimatedCostUsd = billableR2Gb * R2_STORAGE_PER_GB;

    // Estimated egress savings: If this R2 audio had been streamed from standard cloud storage
    const estimatedR2StreamingGb = r2Gb * ESTIMATED_MONTHLY_LISTEN_MULTIPLIER;
    const supabaseAvoidedEgressCostUsd = estimatedR2StreamingGb * SUPABASE_EGRESS_PER_GB;
    const netMonthlySavingsUsd = Math.max(0, supabaseAvoidedEgressCostUsd - r2EstimatedCostUsd);

    // Compute Class A and B operations (R2)
    // Class A (PUT/POST/upload): $4.50 / 1M after 1M free
    const r2ClassACostUsd = 0; // Well within 1M free operations for CMS station uploads
    // Class B (GET/HEAD/play): $0.36 / 1M after 10M free
    const r2ClassBCostUsd = 0; // Well within 10M free operations for station streaming
    // Edge function calls: $2.00 / 1M after 500k free
    const edgeFunctionCostUsd = 0; // Within 500k free tier
    // Supabase storage charges beyond Pro 100GB
    const sbBillableGb = Math.max(0, sbGb - 100);
    const supabaseStorageCostUsd = sbBillableGb * 0.021;

    return {
      supabase: {
        count: supabaseCount,
        totalBytes: supabaseBytes,
        totalMb: Number((supabaseBytes / (1024 * 1024)).toFixed(2)),
        totalGb: Number(sbGb.toFixed(3)),
        averageSizeMb: supabaseCount > 0 ? Number((supabaseBytes / supabaseCount / 1024 / 1024).toFixed(2)) : 0,
      },
      r2: {
        count: r2Count,
        totalBytes: r2Bytes,
        totalMb: Number((r2Bytes / (1024 * 1024)).toFixed(2)),
        totalGb: Number(r2Gb.toFixed(3)),
        averageSizeMb: r2Count > 0 ? Number((r2Bytes / r2Count / 1024 / 1024).toFixed(2)) : 0,
      },
      total: {
        count: totalCount,
        totalBytes,
        totalGb: Number(totalGb.toFixed(3)),
        r2Percentage: totalCount > 0 ? Number(((r2Count / totalCount) * 100).toFixed(1)) : 0,
      },
      monthlyCostEstimates: {
        r2EstimatedCostUsd: Number(r2EstimatedCostUsd.toFixed(2)),
        r2ClassACostUsd: Number(r2ClassACostUsd.toFixed(2)),
        r2ClassBCostUsd: Number(r2ClassBCostUsd.toFixed(2)),
        edgeFunctionCostUsd: Number(edgeFunctionCostUsd.toFixed(2)),
        supabaseStorageCostUsd: Number(supabaseStorageCostUsd.toFixed(2)),
        supabaseAvoidedEgressCostUsd: Number(supabaseAvoidedEgressCostUsd.toFixed(2)),
        netMonthlySavingsUsd: Number(netMonthlySavingsUsd.toFixed(2)),
      },
      timestamp: new Date().toISOString(),
    };
  },

  getFallbackMetrics(): HybridStorageOverview {
    return {
      supabase: { count: 0, totalBytes: 0, totalMb: 0, totalGb: 0, averageSizeMb: 0 },
      r2: { count: 0, totalBytes: 0, totalMb: 0, totalGb: 0, averageSizeMb: 0 },
      total: { count: 0, totalBytes: 0, totalGb: 0, r2Percentage: 0 },
      monthlyCostEstimates: {
        r2EstimatedCostUsd: 0,
        r2ClassACostUsd: 0,
        r2ClassBCostUsd: 0,
        edgeFunctionCostUsd: 0,
        supabaseStorageCostUsd: 0,
        supabaseAvoidedEgressCostUsd: 0,
        netMonthlySavingsUsd: 0,
      },
      timestamp: new Date().toISOString(),
    };
  },
};

