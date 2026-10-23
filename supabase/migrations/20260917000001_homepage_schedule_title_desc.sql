-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- EPISODE HOMEPAGE SCHEDULE TITLE & DESCRIPTION
--
-- Extends schedule_episode_homepage to accept customizable title and description
-- for the homepage carousel release.
-- =============================================================================

drop function if exists public.schedule_episode_homepage(uuid, boolean, timestamptz, timestamptz);

create or replace function public.schedule_episode_homepage(
  p_episode_id          uuid,
  p_show_on_homepage    boolean,
  p_homepage_publish_at timestamptz default null,
  p_homepage_expires_at timestamptz default null,
  p_title               text default null,
  p_description         text default null
)
returns public.episodes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role      public.user_role := app.current_role();
  v_episode   public.episodes%rowtype;
  v_new_title text;
  v_new_desc  text;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only administrators and producers can schedule homepage episodes'
      using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  if p_show_on_homepage and v_episode.status <> 'APPROVED' then
    raise exception 'Only QC-approved episodes can be scheduled on the homepage'
      using errcode = '42501';
  end if;

  if p_show_on_homepage and p_homepage_publish_at is not null and p_homepage_expires_at is not null then
    if p_homepage_expires_at <= p_homepage_publish_at then
      raise exception 'Expiration time must be after publish time' using errcode = '23514';
    end if;
  end if;

  if p_show_on_homepage and p_title is not null and trim(p_title) = '' then
    raise exception 'Episode title cannot be empty' using errcode = '23514';
  end if;

  v_new_title := coalesce(nullif(trim(p_title), ''), v_episode.title);
  v_new_desc  := case
    when p_title is not null or p_description is not null then nullif(trim(p_description), '')
    else v_episode.description
  end;

  perform app.begin_workflow();
  update public.episodes
     set show_on_homepage = p_show_on_homepage,
         homepage_publish_at = case when p_show_on_homepage then p_homepage_publish_at else null end,
         homepage_expires_at = case when p_show_on_homepage then p_homepage_expires_at else null end,
         title = v_new_title,
         description = v_new_desc
   where id = p_episode_id
  returning * into v_episode;
  perform app.end_workflow();

  perform app.log('EPISODE_HOMEPAGE_SCHEDULED', 'EPISODE', v_episode.id,
    jsonb_build_object(
      'title', v_episode.title,
      'description', v_episode.description,
      'show_on_homepage', p_show_on_homepage,
      'homepage_publish_at', p_homepage_publish_at,
      'homepage_expires_at', p_homepage_expires_at
    )
  );

  return v_episode;
end;
$$;

grant execute on function public.schedule_episode_homepage(uuid, boolean, timestamptz, timestamptz, text, text) to authenticated;
