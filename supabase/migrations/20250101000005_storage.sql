-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 05 STORAGE BUCKET AND POLICIES
--
-- Bucket layout:  radio-audio/episodes/{episode_id}/{filename}
--
-- The bucket is PRIVATE. Files are reached through short-lived signed URLs
-- created by the service layer, never through a public URL.
--
-- Storage authorisation reuses exactly the same rule as the table layer:
-- app.can_edit_episode(). A user who cannot edit the episode cannot write,
-- replace or delete its audio, whatever path they type.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'radio-audio',
  'radio-audio',
  false,
  209715200, -- 200 MB
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
        'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/ogg']
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Extracts {episode_id} from "episodes/{episode_id}/{filename}".
-- Returns NULL for any other shape, which makes every policy below fail closed.
create or replace function app.storage_episode_id(p_name text)
returns uuid
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
           when (string_to_array(p_name, '/'))[1] = 'episodes'
            and (string_to_array(p_name, '/'))[2] ~*
                '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then ((string_to_array(p_name, '/'))[2])::uuid
         end;
$$;

grant execute on function app.storage_episode_id(text) to authenticated, service_role;

-- storage.objects belongs to supabase_storage_admin and already has RLS enabled
-- on a hosted project, where `postgres` is not its owner. Enable it only if it
-- is actually off, and treat a refusal as "Supabase already manages this".
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    execute 'alter table storage.objects enable row level security';
  end if;
exception
  when insufficient_privilege then
    raise notice 'storage.objects RLS is managed by Supabase; leaving it as is';
end;
$$;

-- Dropped first so this file can be re-applied without colliding with policies
-- left behind by an earlier run.
drop policy if exists "radio_audio_read_station_members"    on storage.objects;
drop policy if exists "radio_audio_insert_episode_editors"  on storage.objects;
drop policy if exists "radio_audio_update_episode_editors"  on storage.objects;
drop policy if exists "radio_audio_delete_episode_editors"  on storage.objects;

-- Anyone signed in to the station may listen: QC has to hear the audio it is
-- reviewing, and the schedule view previews what is going out.
create policy "radio_audio_read_station_members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'radio-audio'
    and app.current_role() is not null
  );

create policy "radio_audio_insert_episode_editors"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'radio-audio'
    and app.can_edit_episode(app.storage_episode_id(name))
  );

create policy "radio_audio_update_episode_editors"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'radio-audio'
    and app.can_edit_episode(app.storage_episode_id(name))
  )
  with check (
    bucket_id = 'radio-audio'
    and app.can_edit_episode(app.storage_episode_id(name))
  );

create policy "radio_audio_delete_episode_editors"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'radio-audio'
    and app.can_edit_episode(app.storage_episode_id(name))
  );
