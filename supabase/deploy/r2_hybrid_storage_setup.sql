-- =============================================================================
-- VIT COMMUNITY RADIO 90.8 FM CMS -- HYBRID STORAGE SETUP SCRIPT
-- Destination: Supabase SQL Editor (Production Database)
--
-- This script prepares the PostgreSQL schema for the Cloudflare R2
-- hybrid storage rollout.
--
-- STRICT DATA PRESERVATION GUARANTEES:
-- 1. All existing records default to storage_provider = 'supabase'
-- 2. No existing data is modified, moved, or deleted
-- 3. Fully idempotent and safe to run on production
-- =============================================================================

begin;

-- 1. Add storage tracking fields to audio_files
alter table public.audio_files
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'r2')),
  add column if not exists storage_checksum text,
  add column if not exists storage_migrated_at timestamptz;

comment on column public.audio_files.storage_provider is
  'Underlying storage backend: "supabase" (historical storage) or "r2" (Cloudflare R2 for new audio).';
comment on column public.audio_files.storage_checksum is
  'SHA-256 hash of the audio file binary for integrity verification and deduplication.';
comment on column public.audio_files.storage_migrated_at is
  'Timestamp when this object was synchronized/migrated or created in Cloudflare R2.';

-- 2. Create index for fast hybrid provider lookups
create index if not exists audio_files_storage_provider_idx
  on public.audio_files (storage_provider);

-- 3. Register migration in schema_migrations tracker
insert into supabase_migrations.schema_migrations (version)
  values ('20261106000001')
  on conflict do nothing;

commit;

-- 4. Verification query
-- Run this to confirm the table schema and provider distribution:
select
  storage_provider,
  count(*) as file_count,
  pg_size_pretty(coalesce(sum(file_size), 0)::bigint) as total_size
from public.audio_files
group by storage_provider;

