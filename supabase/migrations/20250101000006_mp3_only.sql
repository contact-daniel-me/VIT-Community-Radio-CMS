-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 06 RESTRICT AUDIO TO MP3
--
-- Station policy: episode audio must be MP3. Migrations 01 and 05 accepted WAV,
-- M4A, AAC and OGG as well; this narrows both the table constraint and the
-- storage bucket to MP3 only.
--
-- Written as a new migration rather than an edit to 01/05 because those have
-- already been applied to live projects. Applying this to a fresh database on
-- top of them lands in the same place.
--
-- 'audio/mp3' is kept alongside the correct 'audio/mpeg' because some browsers
-- report that non-standard type for a .mp3 file. Both mean MP3.
-- =============================================================================

-- Removing audio from an episode that is past DRAFT is exactly what the status
-- guard exists to prevent, so this maintenance transaction announces itself.
-- Session-scoped (false) rather than transaction-scoped so the file also works
-- when pasted into the Supabase SQL Editor, which may not wrap it in one
-- transaction.
select set_config('app.workflow', 'on', false);

-- -----------------------------------------------------------------------------
-- Clear out any audio that is no longer allowed.
--
-- Existing rows would make the new CHECK constraint fail to apply, so they are
-- removed first. On a station database this only ever affects files uploaded
-- before the MP3 rule; the episodes themselves are untouched and simply end up
-- with no audio, which puts them back in the "upload before QC" state.
-- -----------------------------------------------------------------------------
do $$
declare
  v_paths text[];
  v_count integer;
begin
  select coalesce(array_agg(storage_path), '{}'), count(*)
    into v_paths, v_count
  from public.audio_files
  where mime_type not in ('audio/mpeg', 'audio/mp3');

  if v_count = 0 then
    raise notice 'No non-MP3 audio found.';
    return;
  end if;

  raise notice 'Removing % non-MP3 audio file(s).', v_count;

  -- Detach first: the FK is ON DELETE SET NULL, and that implicit update would
  -- otherwise hit the episode status guard.
  update public.episodes
     set audio_file_id = null
   where audio_file_id in (
     select id from public.audio_files
     where mime_type not in ('audio/mpeg', 'audio/mp3')
   );

  delete from public.audio_files
   where mime_type not in ('audio/mpeg', 'audio/mp3');

  -- Best effort: drop the matching storage rows so no metadata is left pointing
  -- at a file the CMS no longer knows about. storage.objects belongs to
  -- supabase_storage_admin, so a refusal here is not fatal.
  begin
    delete from storage.objects
     where bucket_id = 'radio-audio' and name = any (v_paths);
  exception
    when insufficient_privilege then
      raise notice 'Could not remove storage objects; delete them from the dashboard: %', v_paths;
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Narrow the table constraint
-- -----------------------------------------------------------------------------
alter table public.audio_files
  drop constraint if exists audio_files_mime_type_check;

alter table public.audio_files
  drop constraint if exists audio_files_mp3_only;

alter table public.audio_files
  add constraint audio_files_mp3_only
  check (mime_type in ('audio/mpeg', 'audio/mp3'));

comment on column public.audio_files.mime_type is
  'MP3 only. audio/mpeg is correct; audio/mp3 is the alias some browsers send.';

-- -----------------------------------------------------------------------------
-- Narrow the storage bucket. This is enforced by the storage API on upload, so
-- a non-MP3 is rejected before any row is written.
-- -----------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['audio/mpeg', 'audio/mp3']
 where id = 'radio-audio';

select set_config('app.workflow', 'off', false);
