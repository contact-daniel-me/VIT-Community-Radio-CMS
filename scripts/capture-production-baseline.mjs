#!/usr/bin/env node
/**
 * VIT Community Radio CMS -- Production Baseline Capture Tool
 *
 * Captures comprehensive pre-migration baseline data, schemas, counts,
 * constraints, indexes, triggers, and RLS policies from the production database.
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

    // Find JSON boundary in output
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
  console.log('VIT COMMUNITY RADIO CMS -- PRODUCTION BASELINE CAPTURE');
  console.log('Target Project: qqoybhevvnkycepujosm (Production)');
  console.log('='.repeat(76));

  const baseline = {
    timestamp: new Date().toISOString(),
    projectRef: 'qqoybhevvnkycepujosm',
    environment: 'production',
  };

  // 1. Database Info
  console.log('[1/9] Capturing database metadata...');
  const dbInfo = runQuery('SELECT current_database(), current_user, version();');
  baseline.database = dbInfo[0] || {};
  console.log(`Database: ${baseline.database.current_database}, User: ${baseline.database.current_user}`);

  // 2. audio_files columns
  console.log('[2/9] Capturing audio_files schema...');
  baseline.audioFilesColumns = runQuery(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audio_files'
    ORDER BY ordinal_position;
  `);

  // 3. episodes columns
  console.log('[3/9] Capturing episodes schema...');
  baseline.episodesColumns = runQuery(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'episodes'
    ORDER BY ordinal_position;
  `);

  // 4. Record counts
  console.log('[4/9] Capturing baseline record counts...');
  const audioCounts = runQuery(`
    SELECT 
      count(*) AS total_audio_files,
      count(storage_path) AS valid_storage_paths,
      count(*) FILTER (WHERE storage_path IS NULL OR trim(storage_path) = '') AS null_or_empty_storage_paths
    FROM public.audio_files;
  `);
  baseline.audioCounts = audioCounts[0] || {};

  const epCounts = runQuery(`
    SELECT 
      count(*) AS total_episodes,
      count(audio_file_id) AS episodes_with_audio,
      count(final_audio_file_id) AS episodes_with_final_audio
    FROM public.episodes;
  `);
  baseline.episodeCounts = epCounts[0] || {};

  // Check if storage_provider column exists
  const hasProviderCol = baseline.audioFilesColumns.some((c) => c.column_name === 'storage_provider');
  baseline.hasProviderColumnPreMigration = hasProviderCol;

  if (hasProviderCol) {
    const providerDist = runQuery(`
      SELECT storage_provider, count(*) as count
      FROM public.audio_files
      GROUP BY storage_provider;
    `);
    baseline.providerDistribution = providerDist;
  } else {
    baseline.providerDistribution = 'COLUMN_NOT_PRESENT_PRE_MIGRATION';
  }

  // 5. Existing constraints on audio_files
  console.log('[5/9] Capturing constraints...');
  baseline.audioConstraints = runQuery(`
    SELECT conname, contype, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.conrelid = 'public.audio_files'::regclass
    ORDER BY conname;
  `);

  // 6. Existing indexes on audio_files
  console.log('[6/9] Capturing indexes...');
  baseline.audioIndexes = runQuery(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'audio_files'
    ORDER BY indexname;
  `);

  // 7. Existing triggers
  console.log('[7/9] Capturing triggers...');
  baseline.triggers = runQuery(`
    SELECT trigger_name, event_manipulation, event_object_table, action_statement, action_timing
    FROM information_schema.triggers
    WHERE event_object_schema = 'public' AND event_object_table IN ('audio_files', 'episodes')
    ORDER BY event_object_table, trigger_name;
  `);

  // 8. Existing RLS policies
  console.log('[8/9] Capturing RLS policies...');
  baseline.audioPolicies = runQuery(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audio_files'
    ORDER BY policyname;
  `);

  baseline.episodesPolicies = runQuery(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'episodes'
    ORDER BY policyname;
  `);

  // 9. Full raw data snapshot of audio_files (Data Backup)
  console.log('[9/9] Capturing full data snapshot of all audio_files records...');
  baseline.audioFilesSnapshot = runQuery(`
    SELECT id, episode_id, file_name, storage_path, mime_type, file_size, duration_seconds, uploaded_by, created_at, deleted_at
    FROM public.audio_files
    ORDER BY created_at ASC;
  `);

  // Save baseline to JSON
  const outPath = path.join(process.cwd(), 'supabase', 'pre_migration_baseline.json');
  fs.writeFileSync(outPath, JSON.stringify(baseline, null, 2), 'utf8');

  console.log('\n' + '='.repeat(76));
  console.log('BASELINE CAPTURE SUMMARY');
  console.log('='.repeat(76));
  console.log(`Total Audio Files           : ${baseline.audioCounts.total_audio_files}`);
  console.log(`Valid Storage Paths         : ${baseline.audioCounts.valid_storage_paths}`);
  console.log(`Null/Empty Storage Paths    : ${baseline.audioCounts.null_or_empty_storage_paths}`);
  console.log(`Total Episodes              : ${baseline.episodeCounts.total_episodes}`);
  console.log(`Episodes with Audio         : ${baseline.episodeCounts.episodes_with_audio}`);
  console.log(`Episodes with Final Audio   : ${baseline.episodeCounts.episodes_with_final_audio}`);
  console.log(`Has storage_provider Column : ${baseline.hasProviderColumnPreMigration ? 'YES' : 'NO'}`);
  console.log(`Constraints on audio_files  : ${baseline.audioConstraints.length}`);
  console.log(`Indexes on audio_files      : ${baseline.audioIndexes.length}`);
  console.log(`Triggers on audio/episodes  : ${baseline.triggers.length}`);
  console.log(`RLS Policies on audio_files : ${baseline.audioPolicies.length}`);
  console.log(`Data Snapshot Saved to      : ${outPath}`);
  console.log('='.repeat(76));
}

main().catch((err) => {
  console.error('[FATAL]:', err.message);
  process.exit(1);
});

