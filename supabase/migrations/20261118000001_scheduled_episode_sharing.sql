-- ---------------------------------------------------------------------------
-- Migration: Published Episode Sharing
-- Allows anonymous visitors to view and stream final QC-approved audio
-- for episodes that are currently PUBLISHED and available on the Radio Home Page.
-- ---------------------------------------------------------------------------

create or replace function public.get_shared_scheduled_episode(p_episode_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_is_published_and_available boolean;
begin
  -- 1. Check if the episode exists, is QC approved, has audio, is PUBLISHED,
  -- and is currently available on the Radio Home Page (show_on_homepage = true, not expired).
  select
    case
      when (
        e.status = 'APPROVED'
        and p.active = true
        and e.show_on_homepage = true
        and (
          e.publish_status = 'PUBLISHED'
          or (
            coalesce(e.scheduled_at, e.homepage_publish_at) is not null
            and coalesce(e.scheduled_at, e.homepage_publish_at) <= now()
          )
        )
        and (coalesce(e.expires_at, e.homepage_expires_at) is null or coalesce(e.expires_at, e.homepage_expires_at) > now())
      ) then true
      else false
    end
  into v_is_published_and_available
  from public.episodes e
  join public.programs p on p.id = e.program_id
  where e.id = p_episode_id;

  if v_is_published_and_available is not true then
    return jsonb_build_object(
      'is_eligible', false,
      'error', 'Episode is not published on the Radio Home Page or is no longer available.'
    );
  end if;

  -- 2. Build safe public projection (never expose raw audio or internal details)
  select jsonb_build_object(
    'is_eligible', true,
    'episode_id', e.id,
    'title', e.title,
    'description', e.description,
    'host_name', coalesce(e.host_name, p.host_name),
    'program_id', p.id,
    'program_name', p.name,
    'program_category', p.category,
    'artwork_url', p.artwork_url,
    'duration_seconds', coalesce(a.duration_seconds, e.duration_seconds),
    'scheduled_at', coalesce(e.published_at, e.homepage_publish_at, e.scheduled_at),
    'storage_path', a.storage_path,
    'storage_provider', coalesce(a.storage_provider, 'supabase'),
    'file_name', a.file_name
  )
  into v_result
  from public.episodes e
  join public.programs p on p.id = e.program_id
  join public.audio_files a on a.id = coalesce(e.final_audio_file_id, e.audio_file_id)
  where e.id = p_episode_id
    and a.deleted_at is null;

  return coalesce(v_result, jsonb_build_object(
    'is_eligible', false,
    'error', 'Audio file not found or has been deleted.'
  ));
end;
$$;

-- Alias get_shared_published_episode to get_shared_scheduled_episode
create or replace function public.get_shared_published_episode(p_episode_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.get_shared_scheduled_episode(p_episode_id);
end;
$$;

comment on function public.get_shared_scheduled_episode(uuid) is
  'Returns public metadata and audio storage path for currently published episodes available on the Radio Home Page.';

grant execute on function public.get_shared_scheduled_episode(uuid) to anon, authenticated;
grant execute on function public.get_shared_published_episode(uuid) to anon, authenticated;
