#!/usr/bin/env node
/**
 * VIT Community Radio CMS -- Supabase Storage to Cloudflare R2 Migration Tool
 *
 * Safe, idempotent, non-destructive migration utility.
 *
 * STRICT SAFETY RULES:
 * 1. Default mode is DRY-RUN. Does not modify database or storage unless `--execute` is passed.
 * 2. Non-destructive: Original Supabase Storage objects are NEVER deleted.
 * 3. Atomic integrity: DB metadata (`storage_provider = 'r2'`) is updated ONLY after
 *    SHA-256 checksum verification between source and R2 matches 100%.
 * 4. Zero-downtime rollback: Any migrated record can be instantly reverted back to
 *    `storage_provider = 'supabase'` via `--rollback`.
 *
 * Usage:
 *   node scripts/migrate-supabase-to-r2.mjs --dry-run
 *   node scripts/migrate-supabase-to-r2.mjs --inventory
 *   node scripts/migrate-supabase-to-r2.mjs --verify-only
 *   node scripts/migrate-supabase-to-r2.mjs --execute --limit 5
 *   node scripts/migrate-supabase-to-r2.mjs --rollback <episodeId>
 */

import {
  S3Client,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// -----------------------------------------------------------------------------
// 1. ENVIRONMENT CONFIGURATION
// -----------------------------------------------------------------------------
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
const R2_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'vit-radio-media';
const R2_ENDPOINT =
  process.env.CLOUDFLARE_R2_ENDPOINT ||
  (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
const SUPABASE_AUDIO_BUCKET = 'audio_files';

// -----------------------------------------------------------------------------
// 2. CLI ARGUMENT PARSER
// -----------------------------------------------------------------------------
const args = process.argv.slice(2);
const isExecute = args.includes('--execute');
const isDryRun = !isExecute || args.includes('--dry-run');
const isVerifyOnly = args.includes('--verify-only');
const isInventory = args.includes('--inventory');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : null;
const episodeIdx = args.indexOf('--episode');
const targetEpisode = episodeIdx !== -1 ? args[episodeIdx + 1] : null;
const rollbackIdx = args.indexOf('--rollback');
const rollbackTarget = rollbackIdx !== -1 ? args[rollbackIdx + 1] : null;

// -----------------------------------------------------------------------------
// 3. HELPERS
// -----------------------------------------------------------------------------
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// -----------------------------------------------------------------------------
// 4. MAIN WORKFLOW
// -----------------------------------------------------------------------------
async function main() {
  console.log('='.repeat(72));
  console.log('VIT COMMUNITY RADIO CMS -- CLOUDFLARE R2 MIGRATION UTILITY');
  console.log('='.repeat(72));
  console.log(`Execution Mode : ${isExecute ? 'LIVE EXECUTION' : 'DRY-RUN (Non-destructive)'}`);
  console.log(`Supabase URL   : ${SUPABASE_URL || 'NOT CONFIGURED'}`);
  console.log(`R2 Bucket      : ${R2_BUCKET}`);
  console.log(`R2 Endpoint    : ${R2_ENDPOINT || 'NOT CONFIGURED'}`);
  if (limit) console.log(`Batch Limit    : ${limit} records`);
  if (targetEpisode) console.log(`Target Episode : ${targetEpisode}`);
  if (rollbackTarget) console.log(`Rollback Target: ${rollbackTarget}`);
  console.log('='.repeat(72));

  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
    console.error('[ERROR] Cloudflare R2 credentials or endpoint missing from environment.');
    process.exit(1);
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  // Verify R2 Bucket Connectivity
  try {
    await s3.send(new HeadBucketCommand({ Bucket: R2_BUCKET }));
    console.log(`[PASS] Connected to Cloudflare R2 bucket: "${R2_BUCKET}" (Private)`);
  } catch (err) {
    console.error(`[FAIL] Could not access Cloudflare R2 bucket "${R2_BUCKET}":`, err.message);
    process.exit(1);
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[ERROR] Supabase URL or Key missing from environment.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // ---------------------------------------------------------------------------
  // A. SAFE ROLLBACK MODE (WITH STRICT DESTINATION VERIFICATION)
  // ---------------------------------------------------------------------------
  if (rollbackTarget) {
    console.log('\n' + '='.repeat(72));
    console.log('SAFE STORAGE ROLLBACK: DESTINATION OBJECT VERIFICATION');
    console.log('='.repeat(72));
    console.log(`Target Episode : ${rollbackTarget}`);
    console.log(`Mode           : ${isDryRun ? 'DRY-RUN (Audit only - No DB changes)' : 'LIVE EXECUTION'}`);
    console.log('='.repeat(72));

    let rollbackQuery = supabase
      .from('audio_files')
      .select('id, episode_id, file_name, storage_path, storage_provider, file_size, mime_type, storage_checksum, storage_migrated_at')
      .is('deleted_at', null);

    if (rollbackTarget !== 'all') {
      rollbackQuery = rollbackQuery.eq('episode_id', rollbackTarget);
    }

    let { data: candidates, error: candidateError } = await rollbackQuery;
    if (candidateError && candidateError.message && candidateError.message.includes('storage_provider')) {
      console.warn('\n[NOTICE] Remote DB does not yet have storage_provider column (pending migration execution).');
      console.warn('[NOTICE] Falling back to standard schema: all remote records are historical "supabase" records.');
      let fallbackQuery = supabase
        .from('audio_files')
        .select('id, episode_id, file_name, storage_path, file_size, mime_type')
        .is('deleted_at', null);
      if (rollbackTarget !== 'all') {
        fallbackQuery = fallbackQuery.eq('episode_id', rollbackTarget);
      }
      const fallbackRes = await fallbackQuery;
      if (fallbackRes.error) {
        if (fallbackRes.error.message.includes('permission denied')) {
          console.warn('[NOTICE] RLS is active on audio_files. For CLI management, set SUPABASE_SERVICE_ROLE_KEY in .env.local.');
          console.log('[INFO] Safe rollback audit terminated safely without changes.');
          return;
        }
        console.error('[FAIL] Failed to fetch fallback candidate records:', fallbackRes.error.message);
        process.exit(1);
      }
      candidates = (fallbackRes.data || []).map((r) => ({
        ...r,
        storage_provider: 'supabase',
        storage_checksum: null,
        storage_migrated_at: null,
      }));
      candidateError = null;
    } else if (candidateError) {
      if (candidateError.message.includes('permission denied')) {
        console.warn('[NOTICE] RLS is active on audio_files. For CLI management, set SUPABASE_SERVICE_ROLE_KEY in .env.local.');
        console.log('[INFO] Safe rollback audit terminated safely without changes.');
        return;
      }
      console.error('[FAIL] Failed to fetch candidate records for rollback:', candidateError.message);
      process.exit(1);
    }

    const candidateList = candidates || [];
    console.log(`\nFound ${candidateList.length} record(s) matching rollback target.`);

    if (candidateList.length === 0) {
      console.log('[INFO] No matching audio records found. Exiting rollback.');
      return;
    }

    const reportRows = [];
    let eligibleCount = 0;
    let r2NativeCount = 0;
    let mismatchCount = 0;
    let revertedCount = 0;
    let alreadySupabaseCount = 0;

    for (let idx = 0; idx < candidateList.length; idx++) {
      const rec = candidateList[idx];
      const prefix = `[${idx + 1}/${candidateList.length}] Episode ${rec.episode_id.slice(0, 8)} (${rec.file_name})`;

      if (rec.storage_provider === 'supabase') {
        console.log(`${prefix} -> Already Supabase. Skipping rollback.`);
        alreadySupabaseCount++;
        reportRows.push({
          Episode: rec.episode_id.slice(0, 8),
          File: rec.file_name.slice(0, 20),
          Provider: 'supabase',
          'SB Exists': 'N/A',
          'Size/Hash Match': 'N/A',
          Verdict: 'ALREADY_SUPABASE',
          Action: 'SKIPPED',
        });
        continue;
      }

      // Check destination Supabase Storage object existence
      console.log(`${prefix} -> Checking Supabase Storage destination ("${rec.storage_path}")...`);
      const { data: sbBlob, error: sbErr } = await supabase.storage
        .from(SUPABASE_AUDIO_BUCKET)
        .download(rec.storage_path);

      if (sbErr || !sbBlob) {
        console.warn(`${prefix} -> [BLOCKED: R2-NATIVE] Supabase copy does NOT exist. Keeping safely on R2.`);
        r2NativeCount++;
        reportRows.push({
          Episode: rec.episode_id.slice(0, 8),
          File: rec.file_name.slice(0, 20),
          Provider: 'r2',
          'SB Exists': 'NO (404)',
          'Size/Hash Match': 'N/A',
          Verdict: 'R2_NATIVE_ONLY',
          Action: 'KEEP_ON_R2',
        });
        continue;
      }

      const sbBuffer = Buffer.from(await sbBlob.arrayBuffer());
      const sbSize = sbBuffer.length;
      const sbChecksum = sha256(sbBuffer);

      // Verify size
      if (sbSize !== rec.file_size) {
        console.error(`${prefix} -> [BLOCKED: SIZE MISMATCH] SB=${sbSize} bytes, Expected=${rec.file_size} bytes.`);
        mismatchCount++;
        reportRows.push({
          Episode: rec.episode_id.slice(0, 8),
          File: rec.file_name.slice(0, 20),
          Provider: 'r2',
          'SB Exists': 'YES',
          'Size/Hash Match': `SIZE MISMATCH (${sbSize} vs ${rec.file_size})`,
          Verdict: 'CORRUPT_OR_MODIFIED',
          Action: 'ABORT_KEEP_ON_R2',
        });
        continue;
      }

      // Verify checksum
      if (rec.storage_checksum && rec.storage_checksum.toLowerCase() !== sbChecksum.toLowerCase()) {
        console.error(`${prefix} -> [BLOCKED: CHECKSUM MISMATCH] SB=${sbChecksum.slice(0, 8)}, Expected=${rec.storage_checksum.slice(0, 8)}.`);
        mismatchCount++;
        reportRows.push({
          Episode: rec.episode_id.slice(0, 8),
          File: rec.file_name.slice(0, 20),
          Provider: 'r2',
          'SB Exists': 'YES',
          'Size/Hash Match': 'HASH MISMATCH',
          Verdict: 'CHECKSUM_MISMATCH',
          Action: 'ABORT_KEEP_ON_R2',
        });
        continue;
      }

      // All destination checks passed
      eligibleCount++;
      if (isDryRun) {
        console.log(`${prefix} -> [DRY-RUN PASS] Verified Supabase copy exists, size & hash match. Would revert.`);
        reportRows.push({
          Episode: rec.episode_id.slice(0, 8),
          File: rec.file_name.slice(0, 20),
          Provider: 'r2',
          'SB Exists': 'YES',
          'Size/Hash Match': 'PASS',
          Verdict: 'ELIGIBLE_FOR_ROLLBACK',
          Action: 'WOULD_REVERT (DRY-RUN)',
        });
      } else {
        console.log(`${prefix} -> Destination verified. Updating metadata to storage_provider = 'supabase'...`);
        const { error: updErr } = await supabase
          .from('audio_files')
          .update({
            storage_provider: 'supabase',
            storage_migrated_at: null,
          })
          .eq('id', rec.id);

        if (updErr) {
          console.error(`${prefix} -> [UPDATE ERROR]:`, updErr.message);
          reportRows.push({
            Episode: rec.episode_id.slice(0, 8),
            File: rec.file_name.slice(0, 20),
            Provider: 'r2',
            'SB Exists': 'YES',
            'Size/Hash Match': 'PASS',
            Verdict: 'ELIGIBLE',
            Action: `FAILED: ${updErr.message}`,
          });
        } else {
          console.log(`${prefix} -> [ROLLBACK SUCCESS] Safely reverted to Supabase Storage.`);
          revertedCount++;
          reportRows.push({
            Episode: rec.episode_id.slice(0, 8),
            File: rec.file_name.slice(0, 20),
            Provider: 'r2',
            'SB Exists': 'YES',
            'Size/Hash Match': 'PASS',
            Verdict: 'ELIGIBLE',
            Action: 'REVERTED_TO_SUPABASE',
          });
        }
      }
    }

    console.log('\n--- ROLLBACK ELIGIBILITY & EXECUTION REPORT ---');
    console.table(reportRows);

    console.log('\n' + '='.repeat(72));
    console.log('ROLLBACK SUMMARY');
    console.log('='.repeat(72));
    console.log(`Total Candidates Evaluated : ${candidateList.length}`);
    console.log(`Already Supabase Records   : ${alreadySupabaseCount}`);
    console.log(`Eligible (Verified Copy)   : ${eligibleCount}`);
    console.log(`Ineligible (R2-Native)     : ${r2NativeCount} (Preserved on R2)`);
    console.log(`Ineligible (Mismatches)    : ${mismatchCount} (Preserved on R2)`);
    console.log(`Reverted to Supabase       : ${revertedCount}`);
    console.log(`Mode                       : ${isDryRun ? 'DRY-RUN (Zero DB mutations)' : 'LIVE EXECUTION'}`);
    console.log('='.repeat(72));
    return;
  }

  // ---------------------------------------------------------------------------
  // B. INVENTORY / FETCH CANDIDATES
  // ---------------------------------------------------------------------------
  console.log('\n[1/4] Inventorying audio files from database...');
  let query = supabase
    .from('audio_files')
    .select(
      'id, episode_id, file_name, storage_path, storage_provider, file_size, mime_type, storage_checksum, storage_migrated_at, created_at',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (targetEpisode) {
    query = query.eq('episode_id', targetEpisode);
  }

  let { data: records, error } = await query;
  if (error && error.message && error.message.includes('storage_provider')) {
    console.warn('\n[NOTICE] Remote DB does not yet have storage_provider column (pending migration execution).');
    console.warn('[NOTICE] Falling back to standard schema: treating all remote records as storage_provider="supabase".');
    let fallbackQuery = supabase
      .from('audio_files')
      .select('id, episode_id, file_name, storage_path, file_size, mime_type, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (targetEpisode) {
      fallbackQuery = fallbackQuery.eq('episode_id', targetEpisode);
    }
    const fallbackRes = await fallbackQuery;
    if (fallbackRes.error) {
      console.error('[FAIL] Failed to query audio_files:', fallbackRes.error.message);
      process.exit(1);
    }
    records = (fallbackRes.data || []).map((r) => ({
      ...r,
      storage_provider: 'supabase',
      storage_checksum: null,
      storage_migrated_at: null,
    }));
    error = null;
  } else if (error) {
    if (error.message.includes('permission denied')) {
      console.warn('\n[NOTICE] RLS is active on audio_files table.');
      console.warn('[NOTICE] For direct CLI inventory management, set SUPABASE_SERVICE_ROLE_KEY in .env.local.');
      console.log('[INFO] Script finished without database modifications.');
      return;
    }
    console.error('[FAIL] Failed to query audio_files:', error.message);
    process.exit(1);
  }

  const totalRecords = records?.length || 0;
  const supabaseRecords = records?.filter((r) => !r.storage_provider || r.storage_provider === 'supabase') || [];
  const r2Records = records?.filter((r) => r.storage_provider === 'r2') || [];
  const totalBytes = records?.reduce((sum, r) => sum + (r.file_size || 0), 0) || 0;
  const pendingBytes = supabaseRecords.reduce((sum, r) => sum + (r.file_size || 0), 0);

  console.log(`Total active audio records : ${totalRecords}`);
  console.log(`Already in Cloudflare R2   : ${r2Records.length}`);
  console.log(`Remaining in Supabase      : ${supabaseRecords.length}`);
  console.log(`Total audio storage size   : ${formatBytes(totalBytes)}`);
  console.log(`Pending migration size     : ${formatBytes(pendingBytes)}`);

  if (isInventory) {
    console.log('\n--- Audio Files Inventory ---');
    console.table(
      records.map((r) => ({
        id: r.id.slice(0, 8),
        episode_id: r.episode_id.slice(0, 8),
        provider: r.storage_provider || 'supabase',
        size: formatBytes(r.file_size),
        path: r.storage_path.slice(0, 45) + '...',
        migrated: r.storage_migrated_at ? 'YES' : 'NO',
      })),
    );
    return;
  }

  // ---------------------------------------------------------------------------
  // C. VERIFY-ONLY MODE
  // ---------------------------------------------------------------------------
  if (isVerifyOnly) {
    console.log('\n[VERIFY-ONLY] Verifying all migrated R2 objects against database records...');
    let verifiedCount = 0;
    let failureCount = 0;

    for (const r of r2Records) {
      try {
        const head = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: r.storage_path }));
        if (head.ContentLength !== r.file_size) {
          console.warn(`[MISMATCH] Size mismatch for ${r.storage_path}: R2=${head.ContentLength}, DB=${r.file_size}`);
          failureCount++;
          continue;
        }
        verifiedCount++;
      } catch (err) {
        console.error(`[MISSING] R2 object missing for ${r.storage_path}:`, err.message);
        failureCount++;
      }
    }

    console.log(`\nVerification Summary: ${verifiedCount} verified, ${failureCount} failures.`);
    return;
  }

  // ---------------------------------------------------------------------------
  // D. MIGRATION PROCESSING (DRY-RUN OR EXECUTE)
  // ---------------------------------------------------------------------------
  const candidates = limit ? supabaseRecords.slice(0, limit) : supabaseRecords;
  console.log(`\n[2/4] Selected ${candidates.length} record(s) for migration processing.`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const record = candidates[i];
    const prefix = `[${i + 1}/${candidates.length}] Episode ${record.episode_id.slice(0, 8)} (${record.file_name})`;

    // Check canonical key format
    if (!record.storage_path.startsWith('episodes/')) {
      console.warn(`${prefix} -> SKIPPED: Invalid storage_path format "${record.storage_path}"`);
      skipCount++;
      continue;
    }

    // Check MIME type
    if (!['audio/mpeg', 'audio/mp3'].includes(record.mime_type)) {
      console.warn(`${prefix} -> SKIPPED: Disallowed MIME type "${record.mime_type}"`);
      skipCount++;
      continue;
    }

    // Check size limit (50 MB)
    if (record.file_size > 50 * 1024 * 1024) {
      console.warn(`${prefix} -> SKIPPED: File size exceeds 50MB limit (${formatBytes(record.file_size)})`);
      skipCount++;
      continue;
    }

    if (isDryRun) {
      console.log(
        `${prefix} -> [DRY-RUN PASS] Validated path, size (${formatBytes(record.file_size)}), MIME (${record.mime_type}). Ready for migration.`,
      );
      successCount++;
      continue;
    }

    // Live Execution Path
    try {
      console.log(`${prefix} -> Downloading from Supabase Storage...`);
      const { data: downloadBlob, error: downloadError } = await supabase.storage
        .from(SUPABASE_AUDIO_BUCKET)
        .download(record.storage_path);

      if (downloadError || !downloadBlob) {
        throw new Error(`Supabase download failed: ${downloadError?.message || 'Empty file'}`);
      }

      const buffer = Buffer.from(await downloadBlob.arrayBuffer());
      const sourceChecksum = sha256(buffer);

      console.log(`${prefix} -> Source SHA-256: ${sourceChecksum.slice(0, 16)}... Uploading to R2...`);
      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: record.storage_path,
          Body: buffer,
          ContentType: record.mime_type,
          Metadata: {
            episode_id: record.episode_id,
            original_checksum: sourceChecksum,
            original_name: record.file_name,
          },
        }),
      );

      console.log(`${prefix} -> Verifying upload in R2...`);
      const r2Object = await s3.send(
        new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: record.storage_path,
        }),
      );

      const r2Buffer = await streamToBuffer(r2Object.Body);
      const r2Checksum = sha256(r2Buffer);

      if (sourceChecksum !== r2Checksum) {
        console.error(`${prefix} -> [INTEGRITY FAILURE] Checksum mismatch! Deleting corrupt R2 copy...`);
        await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: record.storage_path }));
        errorCount++;
        continue;
      }

      console.log(`${prefix} -> Verified SHA-256 match. Updating database record...`);
      const { error: updateError } = await supabase
        .from('audio_files')
        .update({
          storage_provider: 'r2',
          storage_checksum: sourceChecksum,
          storage_migrated_at: new Date().toISOString(),
        })
        .eq('id', record.id);

      if (updateError) {
        throw new Error(`Database metadata update failed: ${updateError.message}`);
      }

      console.log(`${prefix} -> [MIGRATED PASS] Successfully migrated to R2.`);
      successCount++;
    } catch (itemErr) {
      console.error(`${prefix} -> [ERROR]:`, itemErr.message);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(72));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(72));
  console.log(`Total Candidates Evaluated : ${candidates.length}`);
  console.log(`Success (Valid / Migrated) : ${successCount}`);
  console.log(`Skipped / Format Issues    : ${skipCount}`);
  console.log(`Errors                     : ${errorCount}`);
  console.log(`Mode                       : ${isDryRun ? 'DRY-RUN (Zero DB/Storage changes made)' : 'LIVE'}`);
  console.log('='.repeat(72));
}

main().catch((err) => {
  console.error('[FATAL EXCEPTION]:', err);
  process.exit(1);
});
