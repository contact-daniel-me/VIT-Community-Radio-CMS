-- Add lifecycle tracking to episodes
ALTER TABLE public.episodes
ADD COLUMN raw_file_delete_at TIMESTAMPTZ,
ADD COLUMN archived_at TIMESTAMPTZ;

-- Re-create approve_episode to set raw_file_delete_at
create or replace function public.approve_episode(
  p_episode_id uuid,
  p_comment    text default null
)
returns public.episodes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    public.user_role := app.current_role();
  v_episode public.episodes%rowtype;
begin
  if v_role is null or v_role not in ('QC', 'ADMIN') then
    raise exception 'Only QC reviewers can approve episodes' using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  if v_episode.status <> 'PENDING_QC' then
    raise exception 'Only episodes pending QC can be approved (episode is %)', v_episode.status
      using errcode = '42501';
  end if;

  insert into public.qc_reviews (episode_id, reviewer_id, decision, comment)
  values (p_episode_id, auth.uid(), 'APPROVED', nullif(btrim(coalesce(p_comment, '')), ''));

  perform app.begin_workflow();
  update public.episodes
     set status = 'APPROVED',
         reviewed_at = now(),
         raw_file_delete_at = now() + interval '30 days'
   where id = p_episode_id
  returning * into v_episode;
  perform app.end_workflow();

  perform app.log('EPISODE_APPROVED', 'EPISODE', v_episode.id,
    jsonb_build_object('title', v_episode.title, 'comment', p_comment));

  return v_episode;
end;
$$;

-- Modify archive_episode to set archived_at
create or replace function public.archive_episode(p_episode_id uuid)
returns public.episodes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    public.user_role := app.current_role();
  v_episode public.episodes%rowtype;
  v_blocking integer;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only producers and administrators can archive episodes'
      using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  if v_episode.status = 'ARCHIVED' then
    return v_episode;
  end if;

  select count(*) into v_blocking
  from public.schedules s
  where s.episode_id = p_episode_id
    and s.status in ('SCHEDULED', 'ON_AIR');

  if v_blocking > 0 then
    raise exception 'This episode has % upcoming or live slot(s). Cancel them first.', v_blocking
      using errcode = '42501';
  end if;

  perform app.begin_workflow();
  update public.episodes 
     set status = 'ARCHIVED',
         archived_at = coalesce(archived_at, now())
   where id = p_episode_id
  returning * into v_episode;
  perform app.end_workflow();

  perform app.log('EPISODE_ARCHIVED', 'EPISODE', v_episode.id,
    jsonb_build_object('title', v_episode.title));

  return v_episode;
end;
$$;

-- Add activate_episode
create or replace function public.activate_episode(p_episode_id uuid)
returns public.episodes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    public.user_role := app.current_role();
  v_episode public.episodes%rowtype;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only producers and administrators can activate archived episodes'
      using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  if v_episode.status <> 'ARCHIVED' then
    raise exception 'Only archived episodes can be activated (episode is %)', v_episode.status
      using errcode = '42501';
  end if;

  perform app.begin_workflow();
  update public.episodes 
     set status = 'APPROVED',
         archived_at = null
   where id = p_episode_id
  returning * into v_episode;
  perform app.end_workflow();

  perform app.log('EPISODE_ACTIVATED', 'EPISODE', v_episode.id,
    jsonb_build_object('title', v_episode.title));

  return v_episode;
end;
$$;

revoke execute on function public.activate_episode(uuid) from public;
grant execute on function public.activate_episode(uuid) to authenticated;
