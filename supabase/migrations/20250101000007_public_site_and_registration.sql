-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 07 PUBLIC HOMEPAGE AND SELF-REGISTRATION
--
-- Two changes, both of which touch the security model, so read the reasoning:
--
-- 1. A public homepage needs anonymous visitors to see what is on air. The
--    tables stay closed to `anon`; instead two narrow views expose a curated
--    handful of columns. They are SECURITY DEFINER views (the PostgreSQL
--    default) so they read past RLS as their owner -- which is exactly why the
--    column and row filters are written into the view body and not left to a
--    policy. Nothing that is not listed below is reachable anonymously.
--
-- 2. Registration is "request access", not "sign up and you are in". A person
--    who registers gets an INACTIVE profile with the lowest role. Because
--    app.current_role() returns NULL for an inactive profile, every existing
--    policy already denies them everything -- no new checks were needed. An
--    administrator activates them from the Users page.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tell "waiting for approval" apart from "removed from the station".
-- Both are active = false, and an administrator needs to know which is which.
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists approved_at timestamptz;

comment on column public.profiles.approved_at is
  'When an administrator first activated this account. NULL = still awaiting approval.';

-- Everyone who exists before this migration is already an approved member.
update public.profiles
   set approved_at = coalesce(approved_at, created_at)
 where active;

-- -----------------------------------------------------------------------------
-- New accounts start pending unless they were provisioned with an explicit role
-- -----------------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role     public.user_role := 'RJ';
  v_claim    text;
  v_approved boolean := false;
begin
  -- SECURITY: raw_user_meta_data is supplied by the signing-up user and must
  -- never decide a role. raw_app_meta_data can only be written with the
  -- service-role key, so it is the one trustworthy source -- and its presence
  -- is also what marks an account as deliberately provisioned rather than
  -- self-registered.
  v_claim := new.raw_app_meta_data ->> 'role';
  if v_claim in ('ADMIN', 'PRODUCER', 'RJ', 'QC') then
    v_role := v_claim::public.user_role;
    v_approved := true;
  end if;

  insert into public.profiles (id, full_name, email, role, active, approved_at)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
             split_part(new.email, '@', 1)),
    new.email,
    v_role,
    v_approved,
    case when v_approved then now() end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Stamp approved_at the first time an administrator switches someone on.
create or replace function app.record_profile_approval()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.active and not old.active and new.approved_at is null then
    new.approved_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_record_approval on public.profiles;
create trigger profiles_record_approval
  before update on public.profiles
  for each row execute function app.record_profile_approval();

-- -----------------------------------------------------------------------------
-- Public read views.
--
-- SECURITY DEFINER on purpose: `anon` has no table grants at all, so these are
-- the only things it can read, and it can only read the columns written here.
-- No ids beyond the schedule row key, no descriptions, no profile data, no
-- audio paths, nothing about content that has not been broadcast.
-- -----------------------------------------------------------------------------
create or replace view public.v_public_now_playing
with (security_invoker = off) as
select
  bs.status                          as broadcast_status,
  bs.started_at,
  p.name                             as program_name,
  e.title                            as episode_title,
  coalesce(e.host_name, p.host_name) as host_name,
  s.start_time,
  s.end_time
from public.broadcast_state bs
left join public.schedules s on s.id = bs.current_schedule_id
left join public.programs  p on p.id = s.program_id
left join public.episodes  e on e.id = s.episode_id
where bs.id;

comment on view public.v_public_now_playing is
  'Anonymous-safe "what is on air" for the public homepage.';

create or replace view public.v_public_schedule_today
with (security_invoker = off) as
select
  s.id,
  p.name                             as program_name,
  e.title                            as episode_title,
  coalesce(e.host_name, p.host_name) as host_name,
  s.start_time,
  s.end_time,
  s.status
from public.schedules s
join public.programs p on p.id = s.program_id
left join public.episodes e on e.id = s.episode_id
where s.status <> 'CANCELLED'
  -- Station-local day, so "today" means today in Vellore.
  and (s.start_time at time zone 'Asia/Kolkata')::date
      = (now() at time zone 'Asia/Kolkata')::date;

comment on view public.v_public_schedule_today is
  'Anonymous-safe schedule for the current station day. Cancelled slots hidden.';

grant select on public.v_public_now_playing      to anon, authenticated;
grant select on public.v_public_schedule_today   to anon, authenticated;
