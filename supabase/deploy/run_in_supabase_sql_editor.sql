-- =============================================================================
-- VIT COMMUNITY RADIO CMS - RUN IN SUPABASE SQL EDITOR
--
-- This script installs:
-- 1. Episode homepage scheduling (Spotify-style release scheduling)
-- 2. Extended studio booking operating hours up to 8:00 PM (20:00)
-- =============================================================================

-- 1. Add homepage scheduling and final audio columns to episodes table
alter table public.episodes
  add column if not exists final_audio_file_id uuid references public.audio_files(id) on delete set null,
  add column if not exists show_on_homepage boolean not null default false,
  add column if not exists homepage_publish_at timestamptz,
  add column if not exists homepage_expires_at timestamptz;

create index if not exists idx_episodes_homepage_schedule
  on public.episodes (show_on_homepage, homepage_publish_at, homepage_expires_at)
  where status = 'APPROVED';

-- 2. Update v_public_approved_episodes view to return currently scheduled/live episodes
create or replace view public.v_public_approved_episodes
with (security_invoker = off) as
select
  e.id            as episode_id,
  e.title,
  e.description,
  coalesce(e.host_name, p.host_name) as host_name,
  e.duration_seconds,
  p.name          as program_name,
  p.category      as program_category,
  a.storage_path,
  a.file_name,
  a.duration_seconds as audio_duration_seconds,
  e.created_at,
  e.show_on_homepage,
  e.homepage_publish_at,
  e.homepage_expires_at
from public.episodes e
join public.programs p on p.id = e.program_id
left join public.audio_files a on a.id = coalesce(e.final_audio_file_id, e.audio_file_id)
where e.status = 'APPROVED'
  and p.active
  and e.show_on_homepage = true
  and (e.homepage_publish_at is null or e.homepage_publish_at <= now())
  and (e.homepage_expires_at is null or e.homepage_expires_at > now());

comment on view public.v_public_approved_episodes is
  'All approved episodes scheduled and currently active on the public homepage.';

grant select on public.v_public_approved_episodes to anon, authenticated;

-- 3. Stored procedure to schedule homepage episodes
create or replace function public.schedule_episode_homepage(
  p_episode_id          uuid,
  p_show_on_homepage    boolean,
  p_homepage_publish_at timestamptz default null,
  p_homepage_expires_at timestamptz default null
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

  perform app.begin_workflow();
  update public.episodes
     set show_on_homepage = p_show_on_homepage,
         homepage_publish_at = case when p_show_on_homepage then p_homepage_publish_at else null end,
         homepage_expires_at = case when p_show_on_homepage then p_homepage_expires_at else null end
   where id = p_episode_id
  returning * into v_episode;
  perform app.end_workflow();

  perform app.log('EPISODE_HOMEPAGE_SCHEDULED', 'EPISODE', v_episode.id,
    jsonb_build_object(
      'title', v_episode.title,
      'show_on_homepage', p_show_on_homepage,
      'homepage_publish_at', p_homepage_publish_at,
      'homepage_expires_at', p_homepage_expires_at
    )
  );

  return v_episode;
end;
$$;

grant execute on function public.schedule_episode_homepage(uuid, boolean, timestamptz, timestamptz) to authenticated;

-- 4. Extend studio booking operating hours up to 8:00 PM (20:00)
alter table public.studio_bookings drop constraint if exists bookings_operating_hours;
alter table public.studio_bookings add constraint bookings_operating_hours check (
  start_time >= time '09:00' and end_time <= time '20:00'
);
