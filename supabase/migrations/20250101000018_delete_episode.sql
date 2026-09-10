-- =============================================================================
-- 18. Deleting an episode
--
-- The schema was written so episodes are never deleted -- ARCHIVED exists so a
-- retired episode keeps its history and its logs. That is still the right
-- default, and this does not change it: what follows is a deliberate exception
-- for the case archiving does not cover, a mistake that should never have been
-- a record at all.
--
-- So the rule is: an episode that has been anywhere near the air cannot be
-- deleted. Scheduled, broadcast, reviewed by QC, or on the front page -- all
-- refused, with a message saying to archive instead. What is left is drafts and
-- rejects, which is what people actually want to clear out.
--
-- Storage is not touched here. Objects in the bucket cannot be removed from
-- SQL on hosted Supabase, so the caller deletes them FIRST and then calls this.
-- That order matters and is not interchangeable: deleting the row first strands
-- the object, because the policy that authorises the delete no longer matches
-- anything. This exact mistake has been made in this project before.
-- =============================================================================

create or replace function public.delete_episode(p_episode_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_episode public.episodes%rowtype;
  v_blocks  text[] := '{}';
  v_count   bigint;
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

  -- Anything that means this episode is part of the station's record.
  if v_episode.status in ('APPROVED', 'ARCHIVED') then
    v_blocks := v_blocks || format('it is %s', lower(v_episode.status::text));
  end if;

  select count(*) into v_count from public.schedules where episode_id = p_episode_id;
  if v_count > 0 then
    v_blocks := v_blocks || format('it is on the schedule %s time(s)', v_count);
  end if;

  select count(*) into v_count from public.qc_reviews where episode_id = p_episode_id;
  if v_count > 0 then
    v_blocks := v_blocks || format('QC has reviewed it %s time(s)', v_count);
  end if;

  select count(*) into v_count
    from public.homepage_featured_audio where episode_id = p_episode_id;
  if v_count > 0 then
    v_blocks := v_blocks || 'it is on the front page';
  end if;

  if array_length(v_blocks, 1) is not null then
    raise exception
      'This episode cannot be deleted because %. Archive it instead, so the station keeps its history.',
      array_to_string(v_blocks, ', and ')
      using errcode = '42501';
  end if;

  -- Reported back so the caller can tell whether it cleared the bucket first.
  select coalesce(
           jsonb_agg(jsonb_build_object('id', a.id, 'storage_path', a.storage_path)),
           '[]'::jsonb
         )
    into v_audio
    from public.audio_files a
   where a.episode_id = p_episode_id;

  -- Logged before the row goes, so the title is still there to record. The log
  -- row outlives the episode: activity_logs.entity_id is deliberately not a
  -- foreign key.
  perform app.log('EPISODE_DELETED', 'EPISODE', p_episode_id, jsonb_build_object(
    'title', v_episode.title,
    'status', v_episode.status,
    'program_id', v_episode.program_id,
    'audio', v_audio
  ));

  -- audio_files cascades from episodes; the storage objects are the caller's.
  delete from public.episodes where id = p_episode_id;

  return jsonb_build_object(
    'id', p_episode_id,
    'title', v_episode.title,
    'audio', v_audio
  );
end;
$$;

comment on function public.delete_episode(uuid) is
  'Permanently remove a draft or rejected episode. Administrators only. Delete its storage objects first.';

-- Hosted Supabase grants EXECUTE on new public functions to anon by default,
-- and `revoke ... from public` does not undo a grant made to a role by name.
revoke execute on function public.delete_episode(uuid) from public;
revoke execute on function public.delete_episode(uuid) from anon;
grant  execute on function public.delete_episode(uuid) to authenticated;
