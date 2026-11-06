#!/usr/bin/env node
/**
 * VIT Community Radio CMS -- Hybrid Storage & Cost Visibility Monitor
 *
 * Safe, read-only analytics utility.
 * Reports catalog distribution, storage usage, and cost estimates
 * across Supabase Storage and Cloudflare R2.
 *
 * Usage:
 *   node scripts/storage-cost-monitor.mjs
 */

import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const envFiles = [
  '.env.local',
  '.env',
  path.join(scriptDir, '..', '.env.local'),
  path.join(scriptDir, '..', '.env'),
  path.join(process.cwd(), 'VIT-Community-Radio-CMS-main', '.env.local'),
];
for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;
const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'vit-radio-media';
const R2_ENDPOINT = process.env.CLOUDFLARE_R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

async function main() {
  console.log('='.repeat(76));
  console.log('VIT COMMUNITY RADIO CMS -- HYBRID STORAGE & COST MONITOR');
  console.log('='.repeat(76));
  console.log(`Cloudflare R2 Bucket : ${R2_BUCKET} (Private)`);
  console.log(`Cloudflare Endpoint  : ${R2_ENDPOINT || 'Not configured'}`);
  console.log(`Supabase URL         : ${SUPABASE_URL || 'Not configured'}`);
  console.log('='.repeat(76));

  let r2Status = 'UNVERIFIED';
  if (R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ENDPOINT) {
    try {
      const s3 = new S3Client({
        region: 'auto',
        endpoint: R2_ENDPOINT,
        credentials: {
          accessKeyId: R2_ACCESS_KEY_ID,
          secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
      });
      await s3.send(new HeadBucketCommand({ Bucket: R2_BUCKET }));
      r2Status = 'CONNECTED (HEALTHY)';
    } catch (e) {
      r2Status = `ERROR: ${e.message}`;
    }
  }

  console.log(`Cloudflare R2 Status : ${r2Status}\n`);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[INFO] Supabase credentials not found. Showing architectural pricing baseline:');
    printCostModel(0, 0);
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  let records = [];
  try {
    const { data, error } = await supabase
      .from('audio_files')
      .select('id, storage_provider, file_size, duration_seconds')
      .is('deleted_at', null);

    if (error && error.message.includes('storage_provider')) {
      // Fallback before migration execution
      const fallback = await supabase
        .from('audio_files')
        .select('id, file_size, duration_seconds')
        .is('deleted_at', null);
      records = (fallback.data || []).map((r) => ({ ...r, storage_provider: 'supabase' }));
    } else if (data && data.length > 0) {
      records = data;
    } else {
      // Under RLS anon key, query via Supabase CLI
      const tempSql = path.join(process.cwd(), `temp_cost_${Date.now()}.sql`);
      try {
        fs.writeFileSync(tempSql, `SELECT id, storage_provider, file_size, duration_seconds FROM public.audio_files WHERE deleted_at IS NULL;`, 'utf8');
        const raw = execSync(`npx supabase db query --remote --read-only --file "${tempSql}" --output-format json`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const jsonStart = raw.indexOf('{');
        if (jsonStart !== -1) {
          records = JSON.parse(raw.slice(jsonStart)).rows || [];
        }
      } catch (cliErr) {
        // Fallback
      } finally {
        if (fs.existsSync(tempSql)) {
          try { fs.unlinkSync(tempSql); } catch {}
        }
      }
    }
  } catch (err) {
    console.warn('[NOTICE] Could not query remote audio_files directly (RLS active):', err.message);
  }

  let sbCount = 0;
  let sbBytes = 0;
  let r2Count = 0;
  let r2Bytes = 0;

  for (const r of records) {
    const sz = r.file_size || 0;
    if (r.storage_provider === 'r2') {
      r2Count++;
      r2Bytes += sz;
    } else {
      sbCount++;
      sbBytes += sz;
    }
  }

  const totalCount = sbCount + r2Count;
  const totalBytes = sbBytes + r2Bytes;

  console.log('--- STORAGE CATALOG DISTRIBUTION ---');
  console.table([
    {
      Provider: 'Supabase Storage (Historical)',
      'Audio Files': sbCount,
      'Total Size': formatBytes(sbBytes),
      'Catalog %': totalCount > 0 ? `${((sbCount / totalCount) * 100).toFixed(1)}%` : '100%',
      'Avg File Size': sbCount > 0 ? formatBytes(sbBytes / sbCount) : '0 B',
    },
    {
      Provider: 'Cloudflare R2 (New / Active)',
      'Audio Files': r2Count,
      'Total Size': formatBytes(r2Bytes),
      'Catalog %': totalCount > 0 ? `${((r2Count / totalCount) * 100).toFixed(1)}%` : '0%',
      'Avg File Size': r2Count > 0 ? formatBytes(r2Bytes / r2Count) : '0 B',
    },
    {
      Provider: 'Total Hybrid Catalog',
      'Audio Files': totalCount,
      'Total Size': formatBytes(totalBytes),
      'Catalog %': '100%',
      'Avg File Size': totalCount > 0 ? formatBytes(totalBytes / totalCount) : '0 B',
    },
  ]);

  printCostModel(r2Bytes, sbBytes);
}

function printCostModel(r2Bytes, sbBytes) {
  const r2Gb = r2Bytes / (1024 * 1024 * 1024);
  const sbGb = sbBytes / (1024 * 1024 * 1024);

  // Cloudflare R2 standard pricing (2026)
  // Storage: $0.015 / GB-mo (10 GB free)
  const r2BillableGb = Math.max(0, r2Gb - 10);
  const r2StorageCost = r2BillableGb * 0.015;

  // Class A operations (PUT, POST, LIST): $4.50 / 1M requests (1M free/mo)
  // Class B operations (GET, HEAD): $0.36 / 1M requests (10M free/mo)
  const estimatedMonthlyUploads = 500; // Average radio station monthly episodes/takes
  const estimatedClassACost = Math.max(0, (estimatedMonthlyUploads - 1_000_000) / 1_000_000) * 4.50;

  const estimatedMonthlyListens = 50_000; // Estimated monthly streaming requests
  const estimatedClassBCost = Math.max(0, (estimatedMonthlyListens - 10_000_000) / 1_000_000) * 0.36;

  // Supabase Edge Function invocations: 500k free/mo, then $2.00 / 1M
  const estimatedEdgeFunctionCalls = estimatedMonthlyUploads + estimatedMonthlyListens;
  const estimatedEdgeFunctionCost = Math.max(0, (estimatedEdgeFunctionCalls - 500_000) / 1_000_000) * 2.00;

  // Supabase Storage: Pro plan includes 100 GB, extra @ $0.021 / GB-mo
  const sbBillableGb = Math.max(0, sbGb - 100);
  const sbStorageCost = sbBillableGb * 0.021;

  // Supabase Egress avoided: If streamed from Supabase Storage without cache ($0.09/GB beyond quota)
  const estimatedStreamingEgressGb = r2Gb * 5; // Assuming 5x monthly stream factor
  const avoidedSupabaseEgressCost = estimatedStreamingEgressGb * 0.09;
  const netSavings = avoidedSupabaseEgressCost - (r2StorageCost + estimatedClassACost + estimatedClassBCost + estimatedEdgeFunctionCost);

  console.log('\n--- DETAILED MONTHLY COST & EFFICIENCY MODEL (USD) ---');
  console.table([
    {
      Component: 'Cloudflare R2 Storage',
      Metric: `${r2Gb.toFixed(2)} GB (${r2BillableGb.toFixed(2)} billable)`,
      Rate: '$0.015 / GB-mo (10 GB Free)',
      'Estimated Cost': `$${r2StorageCost.toFixed(2)}`,
    },
    {
      Component: 'Cloudflare R2 Class A (Writes/PUT)',
      Metric: `~${estimatedMonthlyUploads} ops/mo`,
      Rate: '$4.50 / 1M (1M Free)',
      'Estimated Cost': `$${estimatedClassACost.toFixed(2)}`,
    },
    {
      Component: 'Cloudflare R2 Class B (Reads/GET)',
      Metric: `~${estimatedMonthlyListens} ops/mo`,
      Rate: '$0.36 / 1M (10M Free)',
      'Estimated Cost': `$${estimatedClassBCost.toFixed(2)}`,
    },
    {
      Component: 'Cloudflare R2 Data Egress',
      Metric: `${estimatedStreamingEgressGb.toFixed(2)} GB streamed`,
      Rate: '$0.00 / GB (Free/Zero-egress)',
      'Estimated Cost': '$0.00',
    },
    {
      Component: 'Supabase Edge Function Invocations',
      Metric: `~${estimatedEdgeFunctionCalls} calls/mo`,
      Rate: '$2.00 / 1M (500k Free)',
      'Estimated Cost': `$${estimatedEdgeFunctionCost.toFixed(2)}`,
    },
    {
      Component: 'Supabase Storage (Historical audio)',
      Metric: `${sbGb.toFixed(2)} GB (${sbBillableGb.toFixed(2)} billable)`,
      Rate: '$0.021 / GB-mo (100 GB Pro included)',
      'Estimated Cost': `$${sbStorageCost.toFixed(2)}`,
    },
    {
      Component: 'Avoided Supabase Audio Egress',
      Metric: `${estimatedStreamingEgressGb.toFixed(2)} GB @ $0.09/GB`,
      Rate: '$0.090 / GB standard egress',
      'Estimated Cost': `-$${avoidedSupabaseEgressCost.toFixed(2)} (Avoided)`,
    },
    {
      Component: 'Net Monthly Operational Impact',
      Metric: 'R2 Hybrid Optimization',
      Rate: 'Net Cost / Savings',
      'Estimated Cost': `$${Math.min(0, -netSavings).toFixed(2)} / mo`,
    },
  ]);
  console.log('='.repeat(76));
}

main().catch(console.error);

