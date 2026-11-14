-- =============================================================================
-- Migration: 20261114000001_audio_upload_limit_100mb.sql
-- Description: Update audio file upload limit from 50 MB to 100 MB (104,857,600 bytes)
-- =============================================================================

-- 1. Update audio_files check constraint to 100 MB
alter table public.audio_files
  drop constraint if exists audio_files_file_size_check;

alter table public.audio_files
  add constraint audio_files_file_size_check
  check (file_size > 0 and file_size <= 104857600);

-- 2. Update radio-audio bucket file size limit to 100 MB (104,857,600 bytes)
update storage.buckets
set file_size_limit = 104857600
where id = 'radio-audio';
