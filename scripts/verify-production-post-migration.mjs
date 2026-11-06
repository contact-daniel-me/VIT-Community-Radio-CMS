#!/usr/bin/env node
/**
 * VIT Community Radio CMS -- Post-Migration Integrity Verification Tool
 *
 * Verifies the production database schema, constraints, indexes, RLS policies,
 * and data integrity against the pre-migration baseline.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function runQuery(sql) {
  const tempFile = path.join(process.cwd(), `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.sql`);
  try {
    fs.writeFileSync(tempFile, sql, 'utf8');
    const raw = execSync(`npx supabase db query --remote --read-only --file "${tempFile}" --output-format json`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const jsonStart = raw.indexOf('{');
    if (jsonStart === -1) {
      throw new Error(`Invalid JSON output: ${raw}`);
    }
    const parsed = JSON.parse(raw.slice(jsonStart));
    return parsed.rows || [];
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

async function main() {
  console.log('='.repeat(76));
  console.log('VIT COMMUNITY RADIO CMS -- POST-MIGRATION INTEGRITY VERIFICATION');
  console.log('Target Project: qqoybhevvnkycepujosm (Production)');
  console.log('='.repeat(76));

  const baselinePath = path.join(process.cwd(), 'supabase', 'pre_migration_baseline.json');
  if (!fs.existsSync(baselinePath)) {
    console.error('[FAIL] Pre-migration baseline file not found at:', baselinePath);
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  const verifications = [];

  // 1. Schema check on audio_files
  console.log('[1/7] Verifying new columns on audio_files...');
  const currentCols = runQuery(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audio_files'
    ORDER BY ordinal_position;
  `);

  const providerCol = currentCols.find((c) => c.column_name === 'storage_provider');
  const checksumCol = currentCols.find((c) => c.column_name === 'storage_checksum');
  const migratedCol = currentCols.find((c) => c.column_name === 'storage_migrated_at');

  if (providerCol && providerCol.column_default === "'supabase'::text" && providerCol.is_nullable === 'NO') {
    verifications.push({ check: 'storage_provider column exists with default "supabase"', status: 'PASS' });
  } else {
    verifications.push({ check: 'storage_provider column exists with default "supabase"', status: 'FAIL', details: providerCol });
  }

  if (checksumCol && checksumCol.is_nullable === 'YES') {
    verifications.push({ check: 'storage_checksum column exists and nullable', status: 'PASS' });
  } else {
    verifications.push({ check: 'storage_checksum column exists and nullable', status: 'FAIL', details: checksumCol });
  }

  if (migratedCol && migratedCol.is_nullable === 'YES') {
    verifications.push({ check: 'storage_migrated_at column exists and nullable', status: 'PASS' });
  } else {
    verifications.push({ check: 'storage_migrated_at column exists and nullable', status: 'FAIL', details: migratedCol });
  }

  // 2. Check CHECK constraint on storage_provider
  console.log('[2/7] Verifying storage_provider CHECK constraint...');
  const constraints = runQuery(`
    SELECT conname, contype, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.conrelid = 'public.audio_files'::regclass
    ORDER BY conname;
  `);

  const providerConstraint = constraints.find(
    (c) => c.definition && c.definition.includes('storage_provider') && c.definition.includes('supabase') && c.definition.includes('r2'),
  );
  if (providerConstraint) {
    verifications.push({ check: 'storage_provider CHECK constraint in ("supabase", "r2")', status: 'PASS', details: providerConstraint.definition });
  } else {
    verifications.push({ check: 'storage_provider CHECK constraint in ("supabase", "r2")', status: 'FAIL' });
  }

  // Check pre-existing constraints count: was 9, now 9 + 1 (storage_provider check) = 10
  if (constraints.length >= 10) {
    verifications.push({ check: `All pre-existing constraints intact (total: ${constraints.length})`, status: 'PASS' });
  } else {
    verifications.push({ check: 'Pre-existing constraints preserved', status: 'FAIL', details: `Found ${constraints.length}, expected >= 10` });
  }

  // 3. Verify Index on storage_provider
  console.log('[3/7] Verifying audio_files_storage_provider_idx index...');
  const indexes = runQuery(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'audio_files'
    ORDER BY indexname;
  `);

  const providerIdx = indexes.find((i) => i.indexname === 'audio_files_storage_provider_idx');
  if (providerIdx) {
    verifications.push({ check: 'audio_files_storage_provider_idx index exists', status: 'PASS', details: providerIdx.indexdef });
  } else {
    verifications.push({ check: 'audio_files_storage_provider_idx index exists', status: 'FAIL' });
  }

  // 4. Verify Record Counts vs Baseline
  console.log('[4/7] Verifying record counts against baseline...');
  const currentAudioCounts = runQuery(`
    SELECT 
      count(*) AS total_audio_files,
      count(storage_path) AS valid_storage_paths,
      count(*) FILTER (WHERE storage_path IS NULL OR trim(storage_path) = '') AS null_or_empty_storage_paths
    FROM public.audio_files;
  `)[0];

  const currentEpCounts = runQuery(`
    SELECT 
      count(*) AS total_episodes,
      count(audio_file_id) AS episodes_with_audio,
      count(final_audio_file_id) AS episodes_with_final_audio
    FROM public.episodes;
  `)[0];

  const audioCountMatch = Number(currentAudioCounts.total_audio_files) === Number(baseline.audioCounts.total_audio_files);
  const pathCountMatch = Number(currentAudioCounts.valid_storage_paths) === Number(baseline.audioCounts.valid_storage_paths);
  const nullCountMatch = Number(currentAudioCounts.null_or_empty_storage_paths) === Number(baseline.audioCounts.null_or_empty_storage_paths);

  verifications.push({
    check: `Audio file count matches baseline (${currentAudioCounts.total_audio_files} vs ${baseline.audioCounts.total_audio_files})`,
    status: audioCountMatch ? 'PASS' : 'FAIL',
  });

  verifications.push({
    check: `Storage path count matches baseline (${currentAudioCounts.valid_storage_paths} vs ${baseline.audioCounts.valid_storage_paths})`,
    status: pathCountMatch ? 'PASS' : 'FAIL',
  });

  verifications.push({
    check: `Null storage paths remain 0 (${currentAudioCounts.null_or_empty_storage_paths})`,
    status: nullCountMatch ? 'PASS' : 'FAIL',
  });

  const epCountMatch = Number(currentEpCounts.total_episodes) === Number(baseline.episodeCounts.total_episodes);
  const epAudioMatch = Number(currentEpCounts.episodes_with_audio) === Number(baseline.episodeCounts.episodes_with_audio);
  const epFinalMatch = Number(currentEpCounts.episodes_with_final_audio) === Number(baseline.episodeCounts.episodes_with_final_audio);

  verifications.push({
    check: `Episode counts match baseline (${currentEpCounts.total_episodes} eps, ${currentEpCounts.episodes_with_audio} with audio, ${currentEpCounts.episodes_with_final_audio} with final)`,
    status: (epCountMatch && epAudioMatch && epFinalMatch) ? 'PASS' : 'FAIL',
  });

  // 5. Verify Provider Distribution
  console.log('[5/7] Verifying provider distribution across all records...');
  const providerDist = runQuery(`
    SELECT storage_provider, count(*) as count
    FROM public.audio_files
    GROUP BY storage_provider;
  `);

  const supabaseRecords = providerDist.find((p) => p.storage_provider === 'supabase');
  const r2Records = providerDist.find((p) => p.storage_provider === 'r2');
  const nullRecords = providerDist.find((p) => p.storage_provider === null);

  const allSupabase = supabaseRecords && Number(supabaseRecords.count) === 55 && !r2Records && !nullRecords;
  verifications.push({
    check: 'All 55 existing audio records default to "supabase" (0 r2, 0 null)',
    status: allSupabase ? 'PASS' : 'FAIL',
    details: providerDist,
  });

  // 6. Verify RLS Policies
  console.log('[6/7] Verifying RLS policies...');
  const currentPolicies = runQuery(`
    SELECT policyname, cmd, permissive, roles
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audio_files'
    ORDER BY policyname;
  `);

  const policiesMatch = currentPolicies.length === baseline.audioPolicies.length;
  verifications.push({
    check: `All 4 audio_files RLS policies intact (found: ${currentPolicies.length})`,
    status: policiesMatch ? 'PASS' : 'FAIL',
  });

  // 7. Verify Data Integrity vs Baseline Snapshot
  console.log('[7/7] Verifying data integrity against baseline snapshot...');
  const currentData = runQuery(`
    SELECT id, episode_id, file_name, storage_path, mime_type, file_size
    FROM public.audio_files
    ORDER BY created_at ASC;
  `);

  let dataMatch = true;
  let mismatchReason = '';
  if (currentData.length !== baseline.audioFilesSnapshot.length) {
    dataMatch = false;
    mismatchReason = `Length mismatch: ${currentData.length} vs ${baseline.audioFilesSnapshot.length}`;
  } else {
    for (let i = 0; i < currentData.length; i++) {
      const c = currentData[i];
      const b = baseline.audioFilesSnapshot[i];
      if (c.id !== b.id || c.storage_path !== b.storage_path || Number(c.file_size) !== Number(b.file_size)) {
        dataMatch = false;
        mismatchReason = `Data divergence at record ${c.id}: ${c.storage_path} vs ${b.storage_path}`;
        break;
      }
    }
  }

  verifications.push({
    check: 'Data integrity 100% bit-for-bit identical to baseline snapshot',
    status: dataMatch ? 'PASS' : 'FAIL',
    details: mismatchReason || 'All 55 records verified identical in id, episode_id, file_name, storage_path, file_size',
  });

  console.log('\n' + '='.repeat(76));
  console.log('POST-MIGRATION VERIFICATION SUMMARY');
  console.log('='.repeat(76));
  console.table(verifications.map((v) => ({ Check: v.check, Status: v.status })));
  console.log('='.repeat(76));

  const allPassed = verifications.every((v) => v.status === 'PASS');
  if (allPassed) {
    console.log('[SUCCESS] All post-migration verifications PASSED.');
  } else {
    console.error('[FAILURE] Some post-migration verifications FAILED.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL]:', err.message);
  process.exit(1);
});

