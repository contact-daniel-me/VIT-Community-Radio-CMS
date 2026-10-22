-- =============================================================================
-- VIT COMMUNITY RADIO CMS - RUN IN SUPABASE SQL EDITOR
--
-- This script installs:
-- 1. Episode homepage scheduling (Spotify-style release scheduling)
-- 2. Extended studio booking operating hours up to 8:00 PM (20:00)
-- 3. Fixes studio booking schedule timezone propagation (+05:30 IST)
--    and corrects any existing schedules with shifted timings.
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

-- 5. Fix studio booking to schedule propagation timezone and correct existing slots
create or replace function public.app_propagate_booking_to_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_episode_id uuid;
  v_start_time timestamptz;
  v_end_time   timestamptz;
begin
  -- Convert date + time in station-local timezone (Asia/Kolkata) to timestamptz
  v_start_time := (new.booking_date + new.start_time) at time zone 'Asia/Kolkata';
  v_end_time   := (new.booking_date + new.end_time)   at time zone 'Asia/Kolkata';

  if tg_op = 'UPDATE' and new.status = 'CANCELLED' and old.status <> 'CANCELLED' then
    delete from public.schedules
     where (notes like '%' || new.reference or (program_id = new.program_id and start_time = v_start_time));
    return new;
  end if;

  if (tg_op = 'INSERT' and new.status = 'CONFIRMED') or
     (tg_op = 'UPDATE' and new.status = 'CONFIRMED' and old.status <> 'CONFIRMED') then
    
    select id into v_episode_id
      from public.episodes
     where program_id = new.program_id
       and status = 'APPROVED'
     order by created_at desc
     limit 1;

    if not exists (
      select 1 from public.schedules
       where program_id = new.program_id
         and start_time = v_start_time
         and end_time = v_end_time
         and status <> 'CANCELLED'
    ) then
      insert into public.schedules (program_id, episode_id, start_time, end_time, status, notes, created_by)
      values (
        new.program_id,
        v_episode_id,
        v_start_time,
        v_end_time,
        'SCHEDULED',
        'Auto-scheduled from booking ' || new.reference,
        new.created_by
      )
      on conflict on constraint schedules_no_overlap do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists studio_bookings_to_schedule on public.studio_bookings;
create trigger studio_bookings_to_schedule
  after insert or update on public.studio_bookings
  for each row execute function public.app_propagate_booking_to_schedule();

-- Clean up any leftover test schedules from prior helper scripts
delete from public.schedules
where notes in ('Live Test Schedule', 'Next Up Test Schedule');

-- Safely re-sync all confirmed bookings into schedules without exclusion constraint conflicts:
-- Delete previous auto-scheduled rows that had wrong UTC timestamps
delete from public.schedules
where notes like 'Auto-scheduled from booking%'
   or notes like 'Auto-scheduled from Studio Booking%';

-- Re-populate schedules with correct Asia/Kolkata timestamps
insert into public.schedules (program_id, episode_id, start_time, end_time, status, notes, created_by)
select
  b.program_id,
  (
    select id from public.episodes e 
    where e.program_id = b.program_id and e.status = 'APPROVED'
    order by e.created_at desc limit 1
  ),
  (b.booking_date + b.start_time) at time zone 'Asia/Kolkata',
  (b.booking_date + b.end_time)   at time zone 'Asia/Kolkata',
  'SCHEDULED',
  'Auto-scheduled from booking ' || b.reference,
  b.created_by
from public.studio_bookings b
where b.status = 'CONFIRMED'
on conflict on constraint schedules_no_overlap do nothing;

