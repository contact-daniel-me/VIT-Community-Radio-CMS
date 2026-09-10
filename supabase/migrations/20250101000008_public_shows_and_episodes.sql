-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 08 PUBLIC SHOWS AND AIRED EPISODES
--
-- The public homepage gained a "Featured Shows" and a "Latest Uploads" section.
-- Anonymous visitors could previously read only what is on air and today's
-- grid, so those sections had no data source at all.
--
-- Same approach as migration 07: the tables stay closed to `anon`, and two more
-- SECURITY DEFINER views expose a fixed, curated set of columns.
--
-- The rule for episodes is deliberately strict: an episode is public ONLY once
-- it has actually been broadcast (a COMPLETED schedule row exists for it).
-- Being approved, or merely scheduled, is not enough. Unaired content never
-- leaks to the public site, no matter what the frontend asks for.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Active programmes, for the Featured Shows section.
-- No created_by, no timestamps, no inactive shows.
-- -----------------------------------------------------------------------------
create or replace view public.v_public_programs
with (security_invoker = off) as
select
  p.id,
  p.name,
  p.description,
  p.category,
  p.host_name,
  p.artwork_url,
  -- How many of its episodes have actually aired: lets the UI rank shows by
  -- real activity instead of by insertion order.
  (
    select count(distinct s.episode_id)
    from public.schedules s
    where s.program_id = p.id
      and s.status = 'COMPLETED'
      and s.episode_id is not null
  ) as aired_episode_count,
  (
    select max(s.end_time)
    from public.schedules s
    where s.program_id = p.id and s.status = 'COMPLETED'
  ) as last_aired_at
from public.programs p
where p.active;

comment on view public.v_public_programs is
  'Anonymous-safe list of active programmes for the public site.';

-- -----------------------------------------------------------------------------
-- Episodes that have been on air, for the Latest Uploads section.
-- -----------------------------------------------------------------------------
create or replace view public.v_public_recent_episodes
with (security_invoker = off) as
select
  e.id,
  e.title,
  e.description,
  e.episode_number,
  coalesce(e.host_name, p.host_name) as host_name,
  p.id                               as program_id,
  p.name                             as program_name,
  p.category                         as program_category,
  coalesce(a.duration_seconds, e.duration_seconds) as duration_seconds,
  max(s.end_time)                    as aired_at
from public.episodes e
join public.schedules s on s.episode_id = e.id and s.status = 'COMPLETED'
join public.programs  p on p.id = e.program_id
left join public.audio_files a on a.id = e.audio_file_id
where e.status <> 'ARCHIVED'
  and p.active
group by e.id, e.title, e.description, e.episode_number, e.host_name,
         p.id, p.name, p.category, p.host_name, a.duration_seconds, e.duration_seconds;

comment on view public.v_public_recent_episodes is
  'Anonymous-safe archive: only episodes with a COMPLETED broadcast. No storage paths.';

grant select on public.v_public_programs         to anon, authenticated;
grant select on public.v_public_recent_episodes  to anon, authenticated;
