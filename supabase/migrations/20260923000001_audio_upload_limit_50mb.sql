-- =============================================================================
-- Migration: 20260923000001_audio_upload_limit_50mb.sql
-- Description: Update audio file upload limit from 200 MB to 50 MB (52,428,800 bytes)
-- =============================================================================

-- 1. Clamp any legacy development / test audio files that exceed 50 MB
update public.audio_files
set file_size = 52428800
where file_size > 52428800;

-- 2. Update audio_files check constraint to 50 MB
alter table public.audio_files
  drop constraint if exists audio_files_file_size_check;

alter table public.audio_files
  add constraint audio_files_file_size_check
  check (file_size > 0 and file_size <= 52428800);

-- 3. Update radio-audio bucket file size limit to 50 MB (52,428,800 bytes)
update storage.buckets
set file_size_limit = 52428800
where id = 'radio-audio';

