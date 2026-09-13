-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- ALLOW ADMINS TO DELETE ANY EPISODE
-- =============================================================================

create or replace function public.delete_episode(p_episode_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_episode public.episodes%rowtype;
  v_audio   jsonb;
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can delete an episode'
      using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  -- 1. Detach from schedules to avoid foreign key restrict errors
  update public.schedules set episode_id = null where episode_id = p_episode_id;

  -- 2. Delete from homepage featured audio if it exists
  delete from public.homepage_featured_audio where episode_id = p_episode_id;

  -- 3. Audio files, qc_reviews and other tables will cascade delete.
  
  -- 4. Get audio files for storage deletion by caller
  select coalesce(
           jsonb_agg(jsonb_build_object('id', a.id, 'storage_path', a.storage_path)),
           '[]'::jsonb
         )
    into v_audio
    from public.audio_files a
   where a.episode_id = p_episode_id;

  -- Logged before the row goes
  perform app.log('EPISODE_DELETED', 'EPISODE', p_episode_id, jsonb_build_object(
    'title', v_episode.title,
    'status', v_episode.status,
    'program_id', v_episode.program_id,
    'audio', v_audio
  ));

  -- cascade from episodes
  delete from public.episodes where id = p_episode_id;

  return jsonb_build_object(
    'id', p_episode_id,
    'title', v_episode.title,
    'audio', v_audio
  );
end;
$$;
