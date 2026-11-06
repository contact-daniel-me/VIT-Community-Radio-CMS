-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- STORAGE PROVIDER METADATA
--
-- Adds hybrid storage tracking fields to `audio_files`.
-- Defaults to 'supabase' to guarantee 100% backward compatibility for all
-- existing files. New R2 files will explicitly set storage_provider = 'r2'.
--
-- The existing constraint `check (storage_path like 'episodes/%')` and unique
-- constraint are strictly preserved.
-- =============================================================================

alter table public.audio_files
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'r2')),
  add column if not exists storage_checksum text,
  add column if not exists storage_migrated_at timestamptz;

comment on column public.audio_files.storage_provider is
  'Underlying storage backend: "supabase" (original Supabase Storage) or "r2" (Cloudflare R2).';
comment on column public.audio_files.storage_checksum is
  'SHA-256 hash of the audio file binary for integrity verification and deduplication.';
comment on column public.audio_files.storage_migrated_at is
  'Timestamp when this object was synchronized/migrated to Cloudflare R2.';

-- Create index on storage_provider for fast filtering of R2 vs Supabase objects
create index if not exists audio_files_storage_provider_idx
  on public.audio_files (storage_provider);

