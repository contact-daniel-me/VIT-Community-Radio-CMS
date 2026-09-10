/**
 * Builds the two copy-paste SQL bundles in supabase/deploy/.
 *
 *   full_setup.sql           migrations 08-14 only. The UPGRADE for a project
 *                            that already has 01-07 applied -- which is the
 *                            state of the live VIT Community Radio project.
 *
 *   fresh_project_setup.sql  every migration plus the development seed, for a
 *                            brand-new project with nothing in it.
 *
 * They exist separately because they are not interchangeable: running the fresh
 * bundle against a project that already has 01-07 fails on the first
 * `create type`, and running the upgrade against an empty project fails because
 * migration 08 references tables that migration 01 creates.
 *
 * Two transformations are applied to seed.sql (fresh bundle only), and both
 * matter:
 *
 *  1. `begin;` / `commit;` are removed. The SQL Editor runs the batch inside
 *     its own transaction, and a nested BEGIN errors.
 *
 *  2. `set_config('app.workflow', ..., true)` becomes `..., false)`. The `true`
 *     means "transaction-local", which is right for seed.sql run through psql
 *     inside its own BEGIN/COMMIT. Here the surrounding transaction is not ours
 *     to rely on: if the editor runs each statement separately, a
 *     transaction-local setting evaporates immediately and every seed UPDATE
 *     fails on the status guard. Session scope survives either way, and the
 *     final `off` still resets it.
 *
 * Migration SQL itself is copied byte for byte. Nothing here rewrites logic.
 *
 * Regenerate with: npm run build:bundle
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(repoRoot, 'supabase', 'migrations');
const outDir = join(repoRoot, 'supabase', 'deploy');

/** Migrations that make up the upgrade bundle, in dependency order. */
const UPGRADE_RANGE = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18'];

const banner = (source) =>
  [
    '',
    '-- ###########################################################################',
    `-- SOURCE: ${source}`,
    '-- ###########################################################################',
    '',
    '',
  ].join('\n');

const allMigrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/** '20250101000009_station_slots.sql' -> '09' */
const sequenceOf = (file) => file.slice(12, 14);

function read(file) {
  return readFileSync(join(migrationsDir, file), 'utf8');
}

// ---------------------------------------------------------------------------
// 1. The upgrade bundle: 08 -> 14
// ---------------------------------------------------------------------------
const upgradeFiles = allMigrations.filter((f) => UPGRADE_RANGE.includes(sequenceOf(f)));

if (upgradeFiles.length !== UPGRADE_RANGE.length) {
  throw new Error(
    `Expected migrations ${UPGRADE_RANGE.join(', ')} but found ${upgradeFiles.length}: ` +
      upgradeFiles.join(', '),
  );
}

// The concatenation order is the filename order, which is the dependency order:
// 10 needs station_slots from 09, and 12 needs studio_bookings from 11.
const upgradeSequences = upgradeFiles.map(sequenceOf);
if (upgradeSequences.join(',') !== UPGRADE_RANGE.join(',')) {
  throw new Error(`Migrations are out of order: ${upgradeSequences.join(', ')}`);
}

const upgradeParts = [
  [
    '-- =============================================================================',
    '-- VIT COMMUNITY RADIO CMS -- UPGRADE 08 to 18',
    '--',
    '-- GENERATED FILE. Do not edit by hand -- run `npm run build:bundle`.',
    '-- Migration SQL is copied verbatim; nothing here changes their logic.',
    '--',
    '-- FOR AN EXISTING PROJECT that already has migrations 01-07 applied.',
    '-- For an empty project use fresh_project_setup.sql instead.',
    '--',
    '-- Applies, in dependency order:',
    '--   08  public shows + aired-episode views      (needs 01)',
    '--   09  station_slots, the Fixed Point Chart    (needs 01, 02)',
    '--   10  the real programmes and chart rows      (needs 09)',
    '--   11  EDITOR/SECTION_HEAD roles, profiles.phone, studio_bookings',
    '--   12  booking cancellation window guard       (needs 11)',
    '--   13  revoke anon grants on 09/11 tables       (needs 09, 11)',
    '--   14  a user can always read their own profile  (needs 01, 04)',
    '--   15  delete_user, for accounts with no station records (needs 01, 02, 11)',
    '--   16  clear the transcription notes from the chart      (needs 09, 10)',
    '--   17  homepage Top 10 + raw audio expiry               (needs 01, 02)',
    '--   18  delete_episode, drafts and rejects only          (needs 01, 17)',
    '--',
    '-- Run once. Migration 10 is idempotent, but 09 and 11 create types and',
    '-- tables, so a second run reports duplicates.',
    '--',
    '-- IF THE EDITOR REFUSES `ALTER TYPE ... ADD VALUE`:',
    '-- PostgreSQL will not let a new enum value be added and then USED inside',
    '-- one transaction. Nothing here uses EDITOR or SECTION_HEAD at apply time',
    '-- (only inside function bodies, which run later), so this should apply as',
    '-- one batch. If your editor still objects, run the two ALTER TYPE lines in',
    '-- migration 11 on their own first, then run the rest.',
    '-- =============================================================================',
    '',
  ].join('\n'),
];

for (const file of upgradeFiles) {
  upgradeParts.push(banner(`supabase/migrations/${file}`));
  upgradeParts.push(read(file));
}

upgradeParts.push(
  [
    '',
    '-- ###########################################################################',
    '-- Done. Verify with:',
    '--   select table_name from information_schema.tables',
    '--    where table_schema = \'public\' and table_type = \'BASE TABLE\' order by 1;',
    '-- Expect 10 tables, including station_slots and studio_bookings.',
    '-- ###########################################################################',
    '',
  ].join('\n'),
);

// ---------------------------------------------------------------------------
// 2. The fresh-project bundle: everything plus the seed
// ---------------------------------------------------------------------------
const freshParts = [
  [
    '-- =============================================================================',
    '-- VIT COMMUNITY RADIO CMS -- ONE-SHOT SETUP FOR A NEW PROJECT',
    '--',
    '-- GENERATED FILE. Do not edit by hand -- run `npm run build:bundle`.',
    '-- Built from supabase/migrations/*.sql plus supabase/seed.sql.',
    '--',
    '-- Paste into the Supabase SQL Editor and press Run. EMPTY projects only:',
    '-- it creates types and tables, so a second run errors on duplicates. For a',
    '-- project that already has 01-07, use full_setup.sql instead.',
    '--',
    '-- Includes DEVELOPMENT SEED DATA, with accounts on a well-known password.',
    '-- Do not run this against a production station database.',
    '-- =============================================================================',
    '',
  ].join('\n'),
];

for (const file of allMigrations) {
  freshParts.push(banner(`supabase/migrations/${file}`));
  freshParts.push(read(file));
}

const seed = readFileSync(join(repoRoot, 'supabase', 'seed.sql'), 'utf8')
  .replace(/^\s*begin;\s*$/gim, '')
  .replace(/^\s*commit;\s*$/gim, '')
  .replace(/set_config\('app\.workflow',\s*'(on|off)',\s*true\)/g, "set_config('app.workflow', '$1', false)");

freshParts.push(banner('supabase/seed.sql'));
freshParts.push(seed);

// ---------------------------------------------------------------------------
mkdirSync(outDir, { recursive: true });

const upgradeFile = join(outDir, 'full_setup.sql');
const freshFile = join(outDir, 'fresh_project_setup.sql');

writeFileSync(upgradeFile, upgradeParts.join('\n'), 'utf8');
writeFileSync(freshFile, freshParts.join('\n'), 'utf8');

const lines = (s) => s.split('\n').length;
console.log(`Wrote ${upgradeFile} (${lines(upgradeParts.join('\n'))} lines) — migrations ${UPGRADE_RANGE.join(', ')}`);
console.log(`Wrote ${freshFile} (${lines(freshParts.join('\n'))} lines) — all ${allMigrations.length} migrations + seed`);
