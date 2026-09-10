-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- ONE-SHOT SETUP FOR A NEW PROJECT
--
-- GENERATED FILE. Do not edit by hand -- run `npm run build:bundle`.
-- Built from supabase/migrations/*.sql plus supabase/seed.sql.
--
-- Paste into the Supabase SQL Editor and press Run. EMPTY projects only:
-- it creates types and tables, so a second run errors on duplicates. For a
-- project that already has 01-07, use full_setup.sql instead.
--
-- Includes DEVELOPMENT SEED DATA, with accounts on a well-known password.
-- Do not run this against a production station database.
-- =============================================================================


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000001_core_schema.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 01 CORE SCHEMA
-- Tables, enums, constraints and indexes.
--
-- Design notes (deviations from the naive spec are deliberate):
--   * episode_status covers the CONTENT lifecycle only. SCHEDULED / ON_AIR /
--     COMPLETED are properties of a BROADCAST (schedules), not of the content:
--     one approved episode may be scheduled many times (reruns).
--   * qc_reviews is an append-only ledger, so QC history stays traceable.
--   * episodes.audio_file_id is a "current version" pointer; audio_files.episode_id
--     is the ownership link. A trigger keeps the pointer honest.
--   * broadcast_state is a single enforced row: "is the station actually live",
--     which the schedule alone cannot answer.
-- =============================================================================

create schema if not exists app;
comment on schema app is 'Internal helper functions for the radio CMS (not exposed via the API).';

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('ADMIN', 'PRODUCER', 'RJ', 'QC');

create type public.episode_status as enum (
  'DRAFT',       -- being written / audio being attached
  'PENDING_QC',  -- submitted, waiting for a QC decision (content frozen)
  'APPROVED',    -- cleared by QC, eligible for scheduling (content frozen)
  'REJECTED',    -- sent back with a mandatory comment, editable again
  'ARCHIVED'     -- retired; never deleted, so history and logs stay intact
);

create type public.qc_decision as enum ('APPROVED', 'REJECTED');

create type public.schedule_status as enum ('SCHEDULED', 'ON_AIR', 'COMPLETED', 'CANCELLED');

create type public.broadcast_status as enum ('OFFLINE', 'ON_AIR');

-- -----------------------------------------------------------------------------
-- profiles : one row per Supabase Auth user
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(btrim(full_name)) between 1 and 120),
  email       text not null unique check (position('@' in email) > 1),
  role        public.user_role not null default 'RJ',
  avatar_url  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role) where active;

comment on table public.profiles is 'Application profile for each auth user. Role drives every RLS policy.';
comment on column public.profiles.active is 'Soft lock. Inactive users keep their history but lose all access.';

-- -----------------------------------------------------------------------------
-- programs : a recurring radio show
-- -----------------------------------------------------------------------------
create table public.programs (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (char_length(btrim(name)) between 2 and 120),
  description              text check (char_length(description) <= 2000),
  host_name                text check (char_length(host_name) <= 120),
  category                 text not null default 'GENERAL'
                             check (char_length(btrim(category)) between 2 and 40),
  artwork_url              text,
  -- Renamed from `default_duration` so the unit is unambiguous in every caller.
  default_duration_minutes integer not null default 30
                             check (default_duration_minutes between 5 and 360),
  -- Business rule 4: some slots are live and legitimately carry no audio file.
  requires_audio           boolean not null default true,
  active                   boolean not null default true,
  created_by               uuid references public.profiles (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create unique index programs_name_key on public.programs (lower(btrim(name)));
create index programs_active_idx on public.programs (active);

comment on table public.programs is 'A radio show. Deactivated rather than deleted (business rule 13).';

-- -----------------------------------------------------------------------------
-- episodes : one instalment of a program
-- -----------------------------------------------------------------------------
create table public.episodes (
  id               uuid primary key default gen_random_uuid(),
  program_id       uuid not null references public.programs (id) on delete restrict,
  title            text not null check (char_length(btrim(title)) between 2 and 200),
  description      text check (char_length(description) <= 4000),
  episode_number   integer check (episode_number > 0),
  host_name        text check (char_length(host_name) <= 120),
  -- The RJ responsible for this episode. Drives the "assigned content" RLS rule.
  assigned_rj      uuid references public.profiles (id) on delete set null,
  audio_file_id    uuid,  -- FK added below (audio_files does not exist yet)
  duration_seconds integer check (duration_seconds > 0 and duration_seconds <= 21600),
  status           public.episode_status not null default 'DRAFT',
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index episodes_program_number_key
  on public.episodes (program_id, episode_number)
  where episode_number is not null;
create index episodes_program_idx    on public.episodes (program_id);
create index episodes_status_idx     on public.episodes (status);
create index episodes_created_by_idx on public.episodes (created_by);
create index episodes_assigned_idx   on public.episodes (assigned_rj);
create index episodes_pending_idx    on public.episodes (submitted_at) where status = 'PENDING_QC';

comment on column public.episodes.status is
  'Content lifecycle only. Broadcast lifecycle lives in schedules.status.';
comment on column public.episodes.audio_file_id is
  'Pointer to the current audio_files row for this episode. Validated by a trigger.';

-- -----------------------------------------------------------------------------
-- audio_files : metadata only. The bytes live in Supabase Storage.
-- -----------------------------------------------------------------------------
create table public.audio_files (
  id               uuid primary key default gen_random_uuid(),
  episode_id       uuid not null references public.episodes (id) on delete cascade,
  file_name        text not null check (char_length(btrim(file_name)) between 1 and 255),
  -- Path inside the `radio-audio` bucket: episodes/{episode_id}/{filename}
  storage_path     text not null unique check (storage_path like 'episodes/%'),
  mime_type        text not null check (mime_type in (
                     'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
                     'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/ogg')),
  file_size        bigint not null check (file_size > 0 and file_size <= 209715200), -- 200 MB
  duration_seconds integer check (duration_seconds > 0 and duration_seconds <= 21600),
  uploaded_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index audio_files_episode_idx on public.audio_files (episode_id);

alter table public.episodes
  add constraint episodes_audio_file_id_fkey
  foreign key (audio_file_id) references public.audio_files (id) on delete set null;

comment on table public.audio_files is
  'Audio metadata. Binary data is never stored in PostgreSQL -- see the radio-audio bucket.';

-- -----------------------------------------------------------------------------
-- qc_reviews : append-only decision ledger
-- -----------------------------------------------------------------------------
create table public.qc_reviews (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null references public.episodes (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  decision    public.qc_decision not null,
  comment     text check (char_length(comment) <= 2000),
  created_at  timestamptz not null default now(),
  -- A rejection without an explanation is useless to the person who must fix it.
  constraint qc_reviews_rejection_needs_comment
    check (decision <> 'REJECTED' or char_length(btrim(coalesce(comment, ''))) >= 5)
);

create index qc_reviews_episode_idx on public.qc_reviews (episode_id, created_at desc);

comment on table public.qc_reviews is
  'Immutable QC history. No UPDATE/DELETE policy exists for any role.';

-- -----------------------------------------------------------------------------
-- schedules : a broadcast slot on the single station channel
-- -----------------------------------------------------------------------------
create table public.schedules (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs (id) on delete restrict,
  -- NULL = live slot with no pre-recorded episode.
  episode_id  uuid references public.episodes (id) on delete restrict,
  start_time  timestamptz not null,
  end_time    timestamptz not null,
  status      public.schedule_status not null default 'SCHEDULED',
  notes       text check (char_length(notes) <= 1000),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint schedules_time_order check (end_time > start_time),
  constraint schedules_sane_duration check (end_time - start_time <= interval '6 hours'),
  -- One station, one channel: two live slots can never overlap. Enforced by the
  -- database so that two admins saving at the same moment cannot double-book.
  constraint schedules_no_overlap exclude using gist (
    tstzrange(start_time, end_time, '[)') with &&
  ) where (status <> 'CANCELLED')
);

create index schedules_start_idx   on public.schedules (start_time);
create index schedules_status_idx  on public.schedules (status);
create index schedules_program_idx on public.schedules (program_id);
create index schedules_episode_idx on public.schedules (episode_id);

-- -----------------------------------------------------------------------------
-- broadcast_state : enforced singleton -- "is the station actually on air now?"
-- -----------------------------------------------------------------------------
create table public.broadcast_state (
  id                  boolean primary key default true check (id),
  status              public.broadcast_status not null default 'OFFLINE',
  current_schedule_id uuid references public.schedules (id) on delete set null,
  started_at          timestamptz,
  updated_by          uuid references public.profiles (id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint broadcast_state_consistent check (
    (status = 'OFFLINE' and current_schedule_id is null and started_at is null)
    or
    (status = 'ON_AIR' and current_schedule_id is not null and started_at is not null)
  )
);

insert into public.broadcast_state (id) values (true);

comment on table public.broadcast_state is
  'Exactly one row (id is boolean and CHECKed true). Station live state.';

-- -----------------------------------------------------------------------------
-- activity_logs : meaningful business actions only
-- -----------------------------------------------------------------------------
create table public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete set null,
  action      text not null check (char_length(btrim(action)) between 3 and 60),
  entity_type text not null check (entity_type in
                ('PROGRAM', 'EPISODE', 'AUDIO_FILE', 'SCHEDULE', 'BROADCAST', 'PROFILE')),
  -- Intentionally NOT a foreign key: audit rows must outlive what they describe.
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index activity_logs_created_idx on public.activity_logs (created_at desc);
create index activity_logs_entity_idx  on public.activity_logs (entity_type, entity_id);
create index activity_logs_user_idx    on public.activity_logs (user_id, created_at desc);

comment on table public.activity_logs is
  'Business-level audit trail. Written only by SECURITY DEFINER code, never by clients.';


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000002_helpers_and_triggers.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 02 HELPERS, GUARD TRIGGERS AND AUDIT TRIGGERS
--
-- Everything here is server-side truth. The React app cannot reach around it.
--
-- Why the helpers are SECURITY DEFINER: RLS policies on `profiles` need to read
-- `profiles` to learn the caller's role. Doing that inline causes infinite
-- policy recursion. A definer function reads the table with RLS bypassed, which
-- is the standard fix.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Role helpers
-- -----------------------------------------------------------------------------
create or replace function app.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.active;
$$;

comment on function app.current_role() is
  'Role of the calling user, or NULL when unauthenticated or deactivated.';

create or replace function app.has_role(variadic p_roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app.current_role() = any (p_roles), false);
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(app.current_role() = 'ADMIN', false);
$$;

-- A session with no JWT is a trusted server-side session (psql, migrations,
-- seed, service-role maintenance). End users always carry a JWT.
create or replace function app.is_trusted_session()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is null
      or coalesce(current_setting('app.workflow', true), 'off') = 'on';
$$;

-- Business rule 2/3/6/8: who may change an episode, and when.
-- Content is frozen once submitted, for EVERY role including ADMIN -- QC must
-- review exactly what was submitted. Reopening is an explicit, logged action.
create or replace function app.can_edit_episode(p_episode_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when app.current_role() is null then false
           when e.status not in ('DRAFT', 'REJECTED') then false
           when app.current_role() in ('ADMIN', 'PRODUCER') then true
           when app.current_role() = 'RJ'
             then (e.created_by = auth.uid() or e.assigned_rj = auth.uid())
           else false
         end
  from public.episodes e
  where e.id = p_episode_id;
$$;

comment on function app.can_edit_episode(uuid) is
  'True when the caller may modify the episode and its audio right now.';

-- -----------------------------------------------------------------------------
-- Audit logging (business rule 12)
-- -----------------------------------------------------------------------------
create or replace function app.log(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_metadata    jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
begin
  -- Keep the FK satisfied even if the JWT belongs to a user with no profile yet.
  select p.id into v_user from public.profiles p where p.id = auth.uid();

  insert into public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  values (v_user, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger programs_set_updated_at    before update on public.programs
  for each row execute function app.set_updated_at();
create trigger episodes_set_updated_at    before update on public.episodes
  for each row execute function app.set_updated_at();
create trigger audio_files_set_updated_at before update on public.audio_files
  for each row execute function app.set_updated_at();
create trigger schedules_set_updated_at   before update on public.schedules
  for each row execute function app.set_updated_at();
create trigger profiles_set_updated_at    before update on public.profiles
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Auth integration: create a profile for every new auth user
-- -----------------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := 'RJ';
  v_claim text;
begin
  -- SECURITY: raw_user_meta_data is supplied by the signing-up user and must
  -- never decide a role. raw_app_meta_data can only be written with the
  -- service-role key, so it is the one trustworthy source.
  v_claim := new.raw_app_meta_data ->> 'role';
  if v_claim in ('ADMIN', 'PRODUCER', 'RJ', 'QC') then
    v_role := v_claim::public.user_role;
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
             split_part(new.email, '@', 1)),
    new.email,
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- -----------------------------------------------------------------------------
-- Guard: privilege escalation through profiles
-- -----------------------------------------------------------------------------
create or replace function app.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Identity columns are owned by auth, not by the app.
  new.id    := old.id;
  new.email := old.email;

  if new.role is distinct from old.role or new.active is distinct from old.active then
    if not app.is_trusted_session() and not app.is_admin() then
      raise exception 'Only an administrator can change a role or activation state'
        using errcode = '42501';
    end if;
    -- An admin must not be able to lock themselves out or self-demote by accident.
    if old.id = auth.uid() then
      raise exception 'You cannot change your own role or activation state'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function app.guard_profile_update();

create or replace function app.log_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role then
    perform app.log('PROFILE_ROLE_CHANGED', 'PROFILE', new.id,
      jsonb_build_object('from', old.role, 'to', new.role, 'email', new.email));
  end if;
  if new.active is distinct from old.active then
    perform app.log(
      case when new.active then 'PROFILE_ACTIVATED' else 'PROFILE_DEACTIVATED' end,
      'PROFILE', new.id, jsonb_build_object('email', new.email));
  end if;
  return null;
end;
$$;

create trigger profiles_log_change
  after update on public.profiles
  for each row execute function app.log_profile_change();

-- -----------------------------------------------------------------------------
-- Guard: episode status may only move through the workflow functions
-- -----------------------------------------------------------------------------
create or replace function app.guard_episode_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_workflow boolean := coalesce(current_setting('app.workflow', true), 'off') = 'on';
begin
  if not v_workflow then
    if new.status is distinct from old.status then
      raise exception
        'Episode status cannot be set directly. Use submit_episode_for_qc / approve_episode / reject_episode / reopen_episode / archive_episode.'
        using errcode = '42501';
    end if;

    -- Content freeze: PENDING_QC, APPROVED and ARCHIVED episodes are immutable.
    if old.status not in ('DRAFT', 'REJECTED') then
      raise exception 'Episode is locked while in status % and cannot be edited', old.status
        using errcode = '42501';
    end if;

    -- Workflow timestamps are not client-writable.
    new.submitted_at := old.submitted_at;
    new.reviewed_at  := old.reviewed_at;
  end if;

  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger episodes_guard_update
  before update on public.episodes
  for each row execute function app.guard_episode_update();

-- -----------------------------------------------------------------------------
-- Guard: episodes.audio_file_id must point at audio owned by that episode
-- -----------------------------------------------------------------------------
create or replace function app.validate_episode_audio_pointer()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.audio_file_id is not null
     and not exists (
       select 1 from public.audio_files a
       where a.id = new.audio_file_id and a.episode_id = new.id
     )
  then
    raise exception 'Audio file % does not belong to episode %', new.audio_file_id, new.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger episodes_validate_audio_pointer
  before insert or update of audio_file_id on public.episodes
  for each row execute function app.validate_episode_audio_pointer();

-- -----------------------------------------------------------------------------
-- Guard: schedule integrity (business rules 1, 4, 5, 9, 10)
-- -----------------------------------------------------------------------------
create or replace function app.validate_schedule()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_program public.programs%rowtype;
  v_episode public.episodes%rowtype;
  v_relinked boolean;
begin
  select * into v_program from public.programs where id = new.program_id;
  if not found then
    raise exception 'Program % does not exist', new.program_id using errcode = '23503';
  end if;

  v_relinked := tg_op = 'INSERT'
                or new.program_id is distinct from old.program_id
                or new.episode_id is distinct from old.episode_id;

  if v_relinked then
    -- Business rule 9: inactive programs receive no new slots.
    if not v_program.active then
      raise exception 'Program "%" is inactive and cannot be scheduled', v_program.name
        using errcode = '23514';
    end if;

    if new.episode_id is not null then
      select * into v_episode from public.episodes where id = new.episode_id;
      if not found then
        raise exception 'Episode % does not exist', new.episode_id using errcode = '23503';
      end if;

      -- Business rule 1.
      if v_episode.program_id <> new.program_id then
        raise exception 'Episode "%" belongs to a different program', v_episode.title
          using errcode = '23514';
      end if;

      -- Business rule 5. This is the backend enforcement, not a UI check.
      if v_episode.status <> 'APPROVED' then
        raise exception 'Only QC-approved episodes can be scheduled (episode is %)',
          v_episode.status using errcode = '23514';
      end if;

      -- Business rule 4.
      if v_program.requires_audio and v_episode.audio_file_id is null then
        raise exception 'Episode "%" has no audio file and program "%" requires audio',
          v_episode.title, v_program.name using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger schedules_validate
  before insert or update on public.schedules
  for each row execute function app.validate_schedule();

-- -----------------------------------------------------------------------------
-- Guard: schedule state machine (business rule 11)
-- -----------------------------------------------------------------------------
create or replace function app.guard_schedule_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_workflow boolean := coalesce(current_setting('app.workflow', true), 'off') = 'on';
begin
  if new.status is distinct from old.status then
    if not v_workflow then
      raise exception
        'Schedule status cannot be set directly. Use start_broadcast / end_broadcast / cancel_schedule.'
        using errcode = '42501';
    end if;

    -- A finished or cancelled broadcast never goes back on air.
    if old.status in ('COMPLETED', 'CANCELLED') then
      raise exception 'Schedule is already % and cannot change state', old.status
        using errcode = '42501';
    end if;

    if not (
      (old.status = 'SCHEDULED' and new.status in ('ON_AIR', 'COMPLETED', 'CANCELLED')) or
      (old.status = 'ON_AIR'    and new.status in ('COMPLETED', 'CANCELLED'))
    ) then
      raise exception 'Invalid schedule transition % -> %', old.status, new.status
        using errcode = '42501';
    end if;
  end if;

  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger schedules_guard_status
  before update on public.schedules
  for each row execute function app.guard_schedule_status();

-- -----------------------------------------------------------------------------
-- Audit triggers for plain CRUD. Workflow events are logged by their RPCs.
-- Logging lives in the database so it cannot be skipped by a client.
-- -----------------------------------------------------------------------------
create or replace function app.log_program_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log('PROGRAM_CREATED', 'PROGRAM', new.id,
      jsonb_build_object('name', new.name, 'category', new.category));
  elsif new.active is distinct from old.active then
    perform app.log(
      case when new.active then 'PROGRAM_ACTIVATED' else 'PROGRAM_DEACTIVATED' end,
      'PROGRAM', new.id, jsonb_build_object('name', new.name));
  else
    perform app.log('PROGRAM_UPDATED', 'PROGRAM', new.id,
      jsonb_build_object('name', new.name));
  end if;
  return null;
end;
$$;

create trigger programs_log
  after insert or update on public.programs
  for each row execute function app.log_program_change();

create or replace function app.log_episode_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log('EPISODE_CREATED', 'EPISODE', new.id,
      jsonb_build_object('title', new.title, 'program_id', new.program_id));
  elsif new.status is not distinct from old.status then
    -- Status transitions are logged by the workflow functions with richer detail.
    perform app.log('EPISODE_UPDATED', 'EPISODE', new.id,
      jsonb_build_object('title', new.title));
  end if;
  return null;
end;
$$;

create trigger episodes_log
  after insert or update on public.episodes
  for each row execute function app.log_episode_change();

create or replace function app.log_audio_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log('AUDIO_UPLOADED', 'AUDIO_FILE', new.id,
      jsonb_build_object('episode_id', new.episode_id, 'file_name', new.file_name,
                         'file_size', new.file_size));
    return null;
  end if;

  perform app.log('AUDIO_DELETED', 'AUDIO_FILE', old.id,
    jsonb_build_object('episode_id', old.episode_id, 'file_name', old.file_name));
  return null;
end;
$$;

create trigger audio_files_log
  after insert or delete on public.audio_files
  for each row execute function app.log_audio_change();

create or replace function app.log_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log('SCHEDULE_CREATED', 'SCHEDULE', new.id,
      jsonb_build_object('program_id', new.program_id, 'episode_id', new.episode_id,
                         'start_time', new.start_time, 'end_time', new.end_time));
  elsif new.status is not distinct from old.status then
    perform app.log('SCHEDULE_UPDATED', 'SCHEDULE', new.id,
      jsonb_build_object('start_time', new.start_time, 'end_time', new.end_time));
  end if;
  return null;
end;
$$;

create trigger schedules_log
  after insert or update on public.schedules
  for each row execute function app.log_schedule_change();

-- -----------------------------------------------------------------------------
-- Function privileges: SECURITY DEFINER code must not be callable by anon.
-- -----------------------------------------------------------------------------
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000003_workflow_functions.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 03 WORKFLOW FUNCTIONS (RPC) AND READ VIEWS
--
-- These functions exist because each one must be ATOMIC: validate, transition,
-- record a QC decision and write the audit entry, all or nothing. Plain CRUD
-- (create/edit a program, an episode, upload audio) is deliberately NOT wrapped
-- in RPCs -- RLS plus constraints already cover it.
--
-- They are SECURITY DEFINER, so they bypass RLS. That means every one of them
-- re-checks authorisation explicitly. Read the guard block at the top of each.
-- =============================================================================

-- Marks the transaction as "inside the workflow", which is what the guard
-- triggers in migration 02 look for before allowing a status change.
create or replace function app.begin_workflow()
returns void
language sql
set search_path = public, pg_temp
as $$
  select set_config('app.workflow', 'on', true);
$$;

create or replace function app.end_workflow()
returns void
language sql
set search_path = public, pg_temp
as $$
  select set_config('app.workflow', 'off', true);
$$;

-- -----------------------------------------------------------------------------
-- submit_episode_for_qc : DRAFT | REJECTED -> PENDING_QC
-- -----------------------------------------------------------------------------
create or replace function public.submit_episode_for_qc(p_episode_id uuid)
returns public.episodes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    public.user_role := app.current_role();
  v_episode public.episodes%rowtype;
  v_program public.programs%rowtype;
begin
  if v_role is null then
    raise exception 'You must be signed in to submit an episode' using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  -- QC reviews content, it does not author it.
  if not (
    v_role in ('ADMIN', 'PRODUCER')
    or (v_role = 'RJ' and (v_episode.created_by = auth.uid()
                           or v_episode.assigned_rj = auth.uid()))
  ) then
    raise exception 'You are not allowed to submit this episode' using errcode = '42501';
  end if;

  if v_episode.status not in ('DRAFT', 'REJECTED') then
    raise exception 'Only draft or rejected episodes can be submitted (episode is %)',
      v_episode.status using errcode = '42501';
  end if;

  select * into v_program from public.programs where id = v_episode.program_id;

  if not v_program.active then
    raise exception 'Program "%" is inactive', v_program.name using errcode = '42501';
  end if;

  -- Business rule 4: no point sending an empty episode to QC.
  if v_program.requires_audio and v_episode.audio_file_id is null then
    raise exception 'Upload the audio file before submitting "%" for QC', v_episode.title
      using errcode = '23514';
  end if;

  perform app.begin_workflow();
  update public.episodes
     set status = 'PENDING_QC',
         submitted_at = now(),
         reviewed_at = null
   where id = p_episode_id
  returning * into v_episode;
  perform app.end_workflow();

  perform app.log('EPISODE_SUBMITTED_FOR_QC', 'EPISODE', v_episode.id,
    jsonb_build_object('title', v_episode.title, 'from_status', 'DRAFT_OR_REJECTED'));

  return v_episode;
end;
$$;

-- -----------------------------------------------------------------------------
-- approve_episode : PENDING_QC -> APPROVED
-- -----------------------------------------------------------------------------
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
  -- Business rule 7.
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
         reviewed_at = now()
   where id = p_episode_id
  returning * into v_episode;
  perform app.end_workflow();

  perform app.log('EPISODE_APPROVED', 'EPISODE', v_episode.id,
    jsonb_build_object('title', v_episode.title, 'comment', p_comment));

  return v_episode;
end;
$$;

-- -----------------------------------------------------------------------------
-- reject_episode : PENDING_QC -> REJECTED (comment is mandatory)
-- -----------------------------------------------------------------------------
create or replace function public.reject_episode(
  p_episode_id uuid,
  p_comment    text
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
    raise exception 'Only QC reviewers can reject episodes' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_comment, ''))) < 5 then
    raise exception 'A rejection must explain what needs fixing (at least 5 characters)'
      using errcode = '23514';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  if v_episode.status <> 'PENDING_QC' then
    raise exception 'Only episodes pending QC can be rejected (episode is %)', v_episode.status
      using errcode = '42501';
  end if;

  insert into public.qc_reviews (episode_id, reviewer_id, decision, comment)
  values (p_episode_id, auth.uid(), 'REJECTED', btrim(p_comment));

  perform app.begin_workflow();
  update public.episodes
     set status = 'REJECTED',
         reviewed_at = now()
   where id = p_episode_id
  returning * into v_episode;
  perform app.end_workflow();

  perform app.log('EPISODE_REJECTED', 'EPISODE', v_episode.id,
    jsonb_build_object('title', v_episode.title, 'comment', btrim(p_comment)));

  return v_episode;
end;
$$;

-- -----------------------------------------------------------------------------
-- reopen_episode : REJECTED | APPROVED -> DRAFT  (business rule 6)
-- -----------------------------------------------------------------------------
create or replace function public.reopen_episode(p_episode_id uuid)
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
  if v_role is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  if v_episode.status not in ('REJECTED', 'APPROVED') then
    raise exception 'Only rejected or approved episodes can be reopened for editing (episode is %)',
      v_episode.status using errcode = '42501';
  end if;

  if not (
    v_role in ('ADMIN', 'PRODUCER')
    or (v_role = 'RJ' and v_episode.status = 'REJECTED'
        and (v_episode.created_by = auth.uid() or v_episode.assigned_rj = auth.uid()))
  ) then
    raise exception 'You are not allowed to reopen this episode' using errcode = '42501';
  end if;

  -- An approved episode already booked into the schedule cannot be pulled back
  -- without cancelling the slot first, otherwise the schedule would point at
  -- unreviewed content.
  select count(*) into v_blocking
  from public.schedules s
  where s.episode_id = p_episode_id
    and s.status in ('SCHEDULED', 'ON_AIR');

  if v_blocking > 0 then
    raise exception 'Cancel the % scheduled slot(s) for this episode before reopening it', v_blocking
      using errcode = '42501';
  end if;

  perform app.begin_workflow();
  update public.episodes
     set status = 'DRAFT',
         submitted_at = null
   where id = p_episode_id
  returning * into v_episode;
  perform app.end_workflow();

  perform app.log('EPISODE_REOPENED', 'EPISODE', v_episode.id,
    jsonb_build_object('title', v_episode.title));

  return v_episode;
end;
$$;

-- -----------------------------------------------------------------------------
-- archive_episode : anything -> ARCHIVED  (business rule 13: never DELETE)
-- -----------------------------------------------------------------------------
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
  update public.episodes set status = 'ARCHIVED' where id = p_episode_id
  returning * into v_episode;
  perform app.end_workflow();

  perform app.log('EPISODE_ARCHIVED', 'EPISODE', v_episode.id,
    jsonb_build_object('title', v_episode.title));

  return v_episode;
end;
$$;

-- -----------------------------------------------------------------------------
-- schedule_episode : book an approved episode (or a live slot) into the grid
-- -----------------------------------------------------------------------------
create or replace function public.schedule_episode(
  p_program_id uuid,
  p_episode_id uuid,
  p_start_time timestamptz,
  p_end_time   timestamptz,
  p_notes      text default null
)
returns public.schedules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role     public.user_role := app.current_role();
  v_schedule public.schedules%rowtype;
  v_clash    public.schedules%rowtype;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only producers and administrators can create schedules'
      using errcode = '42501';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'The end time must be after the start time' using errcode = '23514';
  end if;

  -- Report the clash by name before relying on the exclusion constraint, so the
  -- user gets a useful message instead of a constraint code.
  select * into v_clash
  from public.schedules s
  where s.status <> 'CANCELLED'
    and tstzrange(s.start_time, s.end_time, '[)') && tstzrange(p_start_time, p_end_time, '[)')
  limit 1;

  if found then
    raise exception 'This slot overlaps an existing broadcast from % to %',
      to_char(v_clash.start_time at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'),
      to_char(v_clash.end_time   at time zone 'Asia/Kolkata', 'HH24:MI')
      using errcode = '23P01';
  end if;

  insert into public.schedules (program_id, episode_id, start_time, end_time, notes, created_by)
  values (p_program_id, p_episode_id, p_start_time, p_end_time,
          nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
  returning * into v_schedule;

  return v_schedule;
end;
$$;

-- -----------------------------------------------------------------------------
-- cancel_schedule
-- -----------------------------------------------------------------------------
create or replace function public.cancel_schedule(
  p_schedule_id uuid,
  p_reason      text default null
)
returns public.schedules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role     public.user_role := app.current_role();
  v_schedule public.schedules%rowtype;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only producers and administrators can cancel schedules'
      using errcode = '42501';
  end if;

  select * into v_schedule from public.schedules where id = p_schedule_id for update;
  if not found then
    raise exception 'Schedule not found' using errcode = 'P0002';
  end if;

  if v_schedule.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'This slot is already % and cannot be cancelled', v_schedule.status
      using errcode = '42501';
  end if;

  perform app.begin_workflow();

  update public.schedules
     set status = 'CANCELLED',
         notes = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), notes)
   where id = p_schedule_id
  returning * into v_schedule;

  -- If we just cancelled what was on air, the station is no longer on air.
  update public.broadcast_state
     set status = 'OFFLINE', current_schedule_id = null, started_at = null,
         updated_by = auth.uid(), updated_at = now()
   where id and current_schedule_id = p_schedule_id;

  perform app.end_workflow();

  perform app.log('SCHEDULE_CANCELLED', 'SCHEDULE', v_schedule.id,
    jsonb_build_object('reason', p_reason, 'start_time', v_schedule.start_time));

  return v_schedule;
end;
$$;

-- -----------------------------------------------------------------------------
-- start_broadcast / end_broadcast : the station's live switch
-- -----------------------------------------------------------------------------
create or replace function public.start_broadcast(p_schedule_id uuid)
returns public.broadcast_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role     public.user_role := app.current_role();
  v_schedule public.schedules%rowtype;
  v_state    public.broadcast_state%rowtype;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER', 'RJ') then
    raise exception 'You are not allowed to put the station on air' using errcode = '42501';
  end if;

  select * into v_state from public.broadcast_state where id for update;

  if v_state.status = 'ON_AIR' and v_state.current_schedule_id is distinct from p_schedule_id then
    raise exception 'The station is already on air. End the current broadcast first.'
      using errcode = '42501';
  end if;

  select * into v_schedule from public.schedules where id = p_schedule_id for update;
  if not found then
    raise exception 'Schedule not found' using errcode = 'P0002';
  end if;

  if v_schedule.status = 'ON_AIR' then
    return v_state;
  end if;

  if v_schedule.status <> 'SCHEDULED' then
    raise exception 'Only a scheduled slot can go on air (slot is %)', v_schedule.status
      using errcode = '42501';
  end if;

  perform app.begin_workflow();

  update public.schedules set status = 'ON_AIR' where id = p_schedule_id;

  update public.broadcast_state
     set status = 'ON_AIR',
         current_schedule_id = p_schedule_id,
         started_at = now(),
         updated_by = auth.uid(),
         updated_at = now()
   where id
  returning * into v_state;

  perform app.end_workflow();

  perform app.log('BROADCAST_STARTED', 'BROADCAST', p_schedule_id,
    jsonb_build_object('program_id', v_schedule.program_id,
                       'episode_id', v_schedule.episode_id));

  return v_state;
end;
$$;

create or replace function public.end_broadcast()
returns public.broadcast_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role  public.user_role := app.current_role();
  v_state public.broadcast_state%rowtype;
  v_schedule_id uuid;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER', 'RJ') then
    raise exception 'You are not allowed to take the station off air' using errcode = '42501';
  end if;

  select * into v_state from public.broadcast_state where id for update;

  if v_state.status = 'OFFLINE' then
    raise exception 'The station is not on air' using errcode = '42501';
  end if;

  v_schedule_id := v_state.current_schedule_id;

  perform app.begin_workflow();

  update public.schedules set status = 'COMPLETED'
   where id = v_schedule_id and status = 'ON_AIR';

  update public.broadcast_state
     set status = 'OFFLINE', current_schedule_id = null, started_at = null,
         updated_by = auth.uid(), updated_at = now()
   where id
  returning * into v_state;

  perform app.end_workflow();

  perform app.log('BROADCAST_ENDED', 'BROADCAST', v_schedule_id, '{}'::jsonb);

  return v_state;
end;
$$;

-- -----------------------------------------------------------------------------
-- sync_broadcast_state : housekeeping, called when a dashboard loads.
-- Closes slots whose end time has passed. This is NOT a playout automation
-- engine -- it only keeps the CMS view of reality honest.
-- -----------------------------------------------------------------------------
create or replace function public.sync_broadcast_state()
returns public.broadcast_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state   public.broadcast_state%rowtype;
  v_closed  uuid[];
begin
  if app.current_role() is null then
    raise exception 'You must be signed in' using errcode = '42501';
  end if;

  perform app.begin_workflow();

  with closed as (
    update public.schedules
       set status = 'COMPLETED'
     where status in ('SCHEDULED', 'ON_AIR')
       and end_time <= now()
    returning id
  )
  select array_agg(id) into v_closed from closed;

  update public.broadcast_state bs
     set status = 'OFFLINE', current_schedule_id = null, started_at = null, updated_at = now()
   where bs.id
     and bs.status = 'ON_AIR'
     and not exists (
       select 1 from public.schedules s
       where s.id = bs.current_schedule_id and s.status = 'ON_AIR'
     );

  perform app.end_workflow();

  if v_closed is not null and array_length(v_closed, 1) > 0 then
    perform app.log('BROADCAST_AUTO_COMPLETED', 'BROADCAST', v_closed[1],
      jsonb_build_object('count', array_length(v_closed, 1)));
  end if;

  select * into v_state from public.broadcast_state where id;
  return v_state;
end;
$$;

-- -----------------------------------------------------------------------------
-- Read views. security_invoker keeps the caller's RLS in force.
-- -----------------------------------------------------------------------------
create or replace view public.v_schedule_details
with (security_invoker = on) as
select
  s.id,
  s.program_id,
  s.episode_id,
  s.start_time,
  s.end_time,
  s.status,
  s.notes,
  s.created_by,
  s.created_at,
  p.name             as program_name,
  p.category         as program_category,
  e.title            as episode_title,
  e.episode_number,
  coalesce(e.host_name, p.host_name) as host_name,
  a.storage_path     as audio_storage_path,
  a.duration_seconds as audio_duration_seconds
from public.schedules s
join public.programs p on p.id = s.program_id
left join public.episodes e on e.id = s.episode_id
left join public.audio_files a on a.id = e.audio_file_id;

create or replace view public.v_current_broadcast
with (security_invoker = on) as
select
  bs.status                as broadcast_status,
  bs.started_at,
  d.id                     as schedule_id,
  d.program_id,
  d.episode_id,
  d.program_name,
  d.episode_title,
  d.host_name,
  d.start_time,
  d.end_time,
  d.status                 as schedule_status,
  d.audio_storage_path
from public.broadcast_state bs
left join public.v_schedule_details d on d.id = bs.current_schedule_id
where bs.id;

create or replace view public.v_next_broadcast
with (security_invoker = on) as
select d.*
from public.v_schedule_details d
where d.status = 'SCHEDULED'
  and d.end_time > now()
order by d.start_time
limit 1;

-- -----------------------------------------------------------------------------
-- Execution privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  public.submit_episode_for_qc(uuid),
  public.approve_episode(uuid, text),
  public.reject_episode(uuid, text),
  public.reopen_episode(uuid),
  public.archive_episode(uuid),
  public.schedule_episode(uuid, uuid, timestamptz, timestamptz, text),
  public.cancel_schedule(uuid, text),
  public.start_broadcast(uuid),
  public.end_broadcast(),
  public.sync_broadcast_state()
from public;

grant execute on function
  public.submit_episode_for_qc(uuid),
  public.approve_episode(uuid, text),
  public.reject_episode(uuid, text),
  public.reopen_episode(uuid),
  public.archive_episode(uuid),
  public.schedule_episode(uuid, uuid, timestamptz, timestamptz, text),
  public.cancel_schedule(uuid, text),
  public.start_broadcast(uuid),
  public.end_broadcast(),
  public.sync_broadcast_state()
to authenticated;

grant select on public.v_schedule_details, public.v_current_broadcast, public.v_next_broadcast
to authenticated;


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000004_rls_policies.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 04 ROW LEVEL SECURITY
--
-- This file is the real security boundary. The React app only decides what to
-- draw; the database decides what is allowed. Every policy below was written
-- against the assumption that an attacker holds a valid JWT and is calling
-- PostgREST directly with curl.
--
-- Note on FORCE ROW LEVEL SECURITY: it is deliberately NOT used. Tables are
-- owned by `postgres`, and the SECURITY DEFINER workflow functions run as that
-- owner. FORCE would apply policies to the owner too and break them. Clients
-- never connect as the owner -- they connect as `anon` or `authenticated`.
--
-- `anon` gets nothing at all. This is an internal station tool.
-- A deactivated profile makes app.current_role() return NULL, which fails every
-- USING clause below: deactivation is an immediate, database-level cut-off.
-- =============================================================================

alter table public.profiles       enable row level security;
alter table public.programs       enable row level security;
alter table public.episodes       enable row level security;
alter table public.audio_files    enable row level security;
alter table public.qc_reviews     enable row level security;
alter table public.schedules      enable row level security;
alter table public.broadcast_state enable row level security;
alter table public.activity_logs  enable row level security;

-- -----------------------------------------------------------------------------
-- Base grants. Without these, RLS policies never even get evaluated.
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

revoke all on all tables in schema public from anon;

grant select on all tables in schema public to authenticated;
grant insert, update on public.programs    to authenticated;
grant insert, update on public.episodes    to authenticated;
grant insert, update, delete on public.audio_files to authenticated;
grant insert, update on public.schedules   to authenticated;
grant update on public.profiles            to authenticated;
grant all on all tables in schema public to service_role;

-- =============================================================================
-- profiles
-- =============================================================================
create policy "profiles_select_station_members"
  on public.profiles for select to authenticated
  using (app.current_role() is not null);

-- A user may edit their own name and avatar. The guard trigger in migration 02
-- rejects any attempt to change `role` or `active` without being an admin, and
-- rejects even an admin changing their own -- so self-escalation is impossible
-- through this policy.
create policy "profiles_update_self_or_admin"
  on public.profiles for update to authenticated
  using (id = auth.uid() or app.is_admin())
  with check (id = auth.uid() or app.is_admin());

-- No INSERT policy: profiles are created by the on_auth_user_created trigger.
-- No DELETE policy: users are deactivated, never deleted (business rule 13).

-- =============================================================================
-- programs
-- =============================================================================
create policy "programs_select_station_members"
  on public.programs for select to authenticated
  using (app.current_role() is not null);

create policy "programs_insert_producers"
  on public.programs for insert to authenticated
  with check (app.has_role('ADMIN', 'PRODUCER') and created_by = auth.uid());

create policy "programs_update_producers"
  on public.programs for update to authenticated
  using (app.has_role('ADMIN', 'PRODUCER'))
  with check (app.has_role('ADMIN', 'PRODUCER'));

-- No DELETE policy: deactivate instead.

-- =============================================================================
-- episodes
-- =============================================================================
create policy "episodes_select_station_members"
  on public.episodes for select to authenticated
  using (app.current_role() is not null);

create policy "episodes_insert_content_roles"
  on public.episodes for insert to authenticated
  with check (
    app.has_role('ADMIN', 'PRODUCER', 'RJ')
    and created_by = auth.uid()
    and status = 'DRAFT'
  );

-- app.can_edit_episode() encodes ownership AND the content freeze:
-- only DRAFT/REJECTED episodes are writable, and an RJ only reaches their own
-- or assigned episodes. QC can never write content.
create policy "episodes_update_owner_or_producer"
  on public.episodes for update to authenticated
  using (app.can_edit_episode(id))
  with check (app.can_edit_episode(id));

-- No DELETE policy: archive instead.

-- =============================================================================
-- audio_files
-- =============================================================================
create policy "audio_select_station_members"
  on public.audio_files for select to authenticated
  using (app.current_role() is not null);

create policy "audio_insert_episode_editors"
  on public.audio_files for insert to authenticated
  with check (app.can_edit_episode(episode_id) and uploaded_by = auth.uid());

create policy "audio_update_episode_editors"
  on public.audio_files for update to authenticated
  using (app.can_edit_episode(episode_id))
  with check (app.can_edit_episode(episode_id));

create policy "audio_delete_episode_editors"
  on public.audio_files for delete to authenticated
  using (app.can_edit_episode(episode_id));

-- =============================================================================
-- qc_reviews -- readable by all, written only by approve_episode/reject_episode
-- =============================================================================
create policy "qc_reviews_select_station_members"
  on public.qc_reviews for select to authenticated
  using (app.current_role() is not null);

-- Intentionally no INSERT / UPDATE / DELETE policy. The QC ledger is immutable
-- and can only grow through the SECURITY DEFINER workflow functions.

-- =============================================================================
-- schedules
-- =============================================================================
create policy "schedules_select_station_members"
  on public.schedules for select to authenticated
  using (app.current_role() is not null);

create policy "schedules_insert_producers"
  on public.schedules for insert to authenticated
  with check (app.has_role('ADMIN', 'PRODUCER') and created_by = auth.uid());

-- Times and notes may be edited directly; `status` changes are blocked by the
-- guard trigger and must go through start_broadcast/end_broadcast/cancel_schedule.
create policy "schedules_update_producers"
  on public.schedules for update to authenticated
  using (app.has_role('ADMIN', 'PRODUCER'))
  with check (app.has_role('ADMIN', 'PRODUCER'));

-- No DELETE policy: cancel instead.

-- =============================================================================
-- broadcast_state -- read by everyone, written only by the broadcast functions
-- =============================================================================
create policy "broadcast_state_select_station_members"
  on public.broadcast_state for select to authenticated
  using (app.current_role() is not null);

-- =============================================================================
-- activity_logs -- append-only audit trail
-- =============================================================================
create policy "activity_logs_select_scoped"
  on public.activity_logs for select to authenticated
  using (
    app.has_role('ADMIN', 'PRODUCER')
    or (app.current_role() is not null and user_id = auth.uid())
  );

-- Intentionally no write policy of any kind: only app.log() (SECURITY DEFINER)
-- inserts here, so the audit trail cannot be forged or erased by a client.


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000005_storage.sql
-- ###########################################################################


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


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000006_mp3_only.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 06 RESTRICT AUDIO TO MP3
--
-- Station policy: episode audio must be MP3. Migrations 01 and 05 accepted WAV,
-- M4A, AAC and OGG as well; this narrows both the table constraint and the
-- storage bucket to MP3 only.
--
-- Written as a new migration rather than an edit to 01/05 because those have
-- already been applied to live projects. Applying this to a fresh database on
-- top of them lands in the same place.
--
-- 'audio/mp3' is kept alongside the correct 'audio/mpeg' because some browsers
-- report that non-standard type for a .mp3 file. Both mean MP3.
-- =============================================================================

-- Removing audio from an episode that is past DRAFT is exactly what the status
-- guard exists to prevent, so this maintenance transaction announces itself.
-- Session-scoped (false) rather than transaction-scoped so the file also works
-- when pasted into the Supabase SQL Editor, which may not wrap it in one
-- transaction.
select set_config('app.workflow', 'on', false);

-- -----------------------------------------------------------------------------
-- Clear out any audio that is no longer allowed.
--
-- Existing rows would make the new CHECK constraint fail to apply, so they are
-- removed first. On a station database this only ever affects files uploaded
-- before the MP3 rule; the episodes themselves are untouched and simply end up
-- with no audio, which puts them back in the "upload before QC" state.
-- -----------------------------------------------------------------------------
do $$
declare
  v_paths text[];
  v_count integer;
begin
  select coalesce(array_agg(storage_path), '{}'), count(*)
    into v_paths, v_count
  from public.audio_files
  where mime_type not in ('audio/mpeg', 'audio/mp3');

  if v_count = 0 then
    raise notice 'No non-MP3 audio found.';
    return;
  end if;

  raise notice 'Removing % non-MP3 audio file(s).', v_count;

  -- Detach first: the FK is ON DELETE SET NULL, and that implicit update would
  -- otherwise hit the episode status guard.
  update public.episodes
     set audio_file_id = null
   where audio_file_id in (
     select id from public.audio_files
     where mime_type not in ('audio/mpeg', 'audio/mp3')
   );

  delete from public.audio_files
   where mime_type not in ('audio/mpeg', 'audio/mp3');

  -- Best effort: drop the matching storage rows so no metadata is left pointing
  -- at a file the CMS no longer knows about. storage.objects belongs to
  -- supabase_storage_admin, so a refusal here is not fatal.
  begin
    delete from storage.objects
     where bucket_id = 'radio-audio' and name = any (v_paths);
  exception
    when insufficient_privilege then
      raise notice 'Could not remove storage objects; delete them from the dashboard: %', v_paths;
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- Narrow the table constraint
-- -----------------------------------------------------------------------------
alter table public.audio_files
  drop constraint if exists audio_files_mime_type_check;

alter table public.audio_files
  drop constraint if exists audio_files_mp3_only;

alter table public.audio_files
  add constraint audio_files_mp3_only
  check (mime_type in ('audio/mpeg', 'audio/mp3'));

comment on column public.audio_files.mime_type is
  'MP3 only. audio/mpeg is correct; audio/mp3 is the alias some browsers send.';

-- -----------------------------------------------------------------------------
-- Narrow the storage bucket. This is enforced by the storage API on upload, so
-- a non-MP3 is rejected before any row is written.
-- -----------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['audio/mpeg', 'audio/mp3']
 where id = 'radio-audio';

select set_config('app.workflow', 'off', false);


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000007_public_site_and_registration.sql
-- ###########################################################################


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


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000008_public_shows_and_episodes.sql
-- ###########################################################################


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


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000009_station_slots.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 09 THE FIXED POINT CHART
--
-- A radio station runs to a Fixed Point Chart: a recurring weekly template that
-- says what occupies each part of the broadcast day. That is NOT the same thing
-- as `schedules`, which records concrete, dated broadcasts of specific episodes.
--
--   station_slots  =  "09:30-11:59 Mon-Fri is the rotating talk block"   (template)
--   schedules      =  "Anubava Medai episode 7 aired 09:30 on 9 Sep"     (fact)
--
-- Keeping them apart matters:
--   * schedules carries an EXCLUDE constraint so two broadcasts can never
--     overlap. The FPC legitimately overlaps -- The Campus Quiz at 17:00 sits
--     inside the 15:00-18:00 rebroadcast. Forcing the chart into `schedules`
--     would make the real chart unstorable.
--   * the chart changes a few times a year; broadcasts change daily.
--
-- Times are `time without time zone` and are ALWAYS station-local (Asia/Kolkata).
-- There is no date here, so there is nothing for a timezone to apply to.
-- =============================================================================

create type public.slot_kind as enum (
  'ANNOUNCEMENT',    -- station idents, opening and closing announcements
  'SEGMENT',         -- a short fixed strand in the morning band
  'ROTATING_BLOCK',  -- a window filled from a pool of programmes
  'REBROADCAST',     -- a repeat of an earlier band
  'FEATURE'          -- a named item sitting inside another slot
);

create table public.station_slots (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(btrim(title)) between 2 and 160),
  kind           public.slot_kind not null default 'SEGMENT',
  start_time     time not null,
  end_time       time not null,
  -- ISO day numbers: 1 = Monday ... 7 = Sunday. The chart is Mon-Fri.
  days           smallint[] not null default '{1,2,3,4,5}',
  -- Optional link to the programme that fills this slot. NULL for announcements,
  -- for the rotating block (many programmes share it), and for slots whose chart
  -- text names two alternating strands.
  program_id     uuid references public.programs (id) on delete set null,
  notes          text check (char_length(notes) <= 500),
  effective_from date not null default current_date,
  active         boolean not null default true,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint station_slots_time_order check (end_time > start_time),
  constraint station_slots_days_present check (array_length(days, 1) between 1 and 7),
  constraint station_slots_days_valid check (
    days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  )
  -- Deliberately NO overlap constraint: see the header. Nested features are
  -- part of how a Fixed Point Chart is written.
);

create index station_slots_start_idx   on public.station_slots (start_time);
create index station_slots_active_idx  on public.station_slots (active, start_time);
create index station_slots_program_idx on public.station_slots (program_id);

comment on table public.station_slots is
  'The Fixed Point Chart: the recurring weekly broadcast template. Station-local times.';
comment on column public.station_slots.days is
  'ISO day numbers, 1 = Monday. The published chart runs Monday to Friday.';

create trigger station_slots_set_updated_at
  before update on public.station_slots
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Audit
-- -----------------------------------------------------------------------------
create or replace function app.log_station_slot_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log('SLOT_CREATED', 'SCHEDULE', new.id,
      jsonb_build_object('title', new.title, 'start_time', new.start_time));
  elsif new.active is distinct from old.active then
    perform app.log(
      case when new.active then 'SLOT_ACTIVATED' else 'SLOT_DEACTIVATED' end,
      'SCHEDULE', new.id, jsonb_build_object('title', new.title));
  else
    perform app.log('SLOT_UPDATED', 'SCHEDULE', new.id,
      jsonb_build_object('title', new.title));
  end if;
  return null;
end;
$$;

create trigger station_slots_log
  after insert or update on public.station_slots
  for each row execute function app.log_station_slot_change();

-- -----------------------------------------------------------------------------
-- RLS: everyone in the station reads it, producers and admins maintain it.
-- -----------------------------------------------------------------------------
alter table public.station_slots enable row level security;

grant select on public.station_slots to authenticated;
grant insert, update on public.station_slots to authenticated;
grant all on public.station_slots to service_role;

create policy "slots_select_station_members"
  on public.station_slots for select to authenticated
  using (app.current_role() is not null);

create policy "slots_insert_producers"
  on public.station_slots for insert to authenticated
  with check (app.has_role('ADMIN', 'PRODUCER') and created_by = auth.uid());

create policy "slots_update_producers"
  on public.station_slots for update to authenticated
  using (app.has_role('ADMIN', 'PRODUCER'))
  with check (app.has_role('ADMIN', 'PRODUCER'));

-- No DELETE policy: a retired slot is deactivated so the chart's history stays.

-- -----------------------------------------------------------------------------
-- Public view -- the chart is published information, so this is the one part of
-- the station that anonymous visitors are meant to see in full.
-- -----------------------------------------------------------------------------
create or replace view public.v_public_fixed_point_chart
with (security_invoker = off) as
select
  s.id,
  s.title,
  s.kind,
  s.start_time,
  s.end_time,
  s.days,
  s.notes,
  s.effective_from,
  p.name     as program_name,
  p.category as program_category
from public.station_slots s
left join public.programs p on p.id = s.program_id and p.active
where s.active
order by s.start_time, s.end_time;

comment on view public.v_public_fixed_point_chart is
  'The published Fixed Point Chart. Readable by anonymous visitors.';

grant select on public.v_public_fixed_point_chart to anon, authenticated;


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000010_real_station_lineup.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 10 THE REAL STATION LINE-UP
--
-- The actual programmes and Fixed Point Chart for VIT Community Radio 90.8,
-- transcribed from the published chart "W.E.F 25th August 2026".
--
-- This is a DATA migration, not a schema one, and it carries real operational
-- data rather than the development samples in seed.sql. It is idempotent:
--   * programmes conflict on the existing unique lower(btrim(name)) index
--   * the chart inserts only if no chart for that effective date is present
-- so running it twice changes nothing.
--
-- Programme names are transcribed exactly as printed on the chart, including
-- "Vallunar Paarvai" -- if the intended spelling is "Valluvar Paarvai", rename
-- it in the CMS rather than editing this file.
-- =============================================================================

-- Attribute the rows to an administrator if one exists; NULL is acceptable and
-- simply means "created during setup".
create temporary table if not exists _setup_actor as
select id from public.profiles where role = 'ADMIN' order by created_at limit 1;

-- -----------------------------------------------------------------------------
-- Programmes. Durations reflect the chart: the morning strands are five-minute
-- segments, the rotating talk programmes share the 09:30-11:59 window.
-- -----------------------------------------------------------------------------
insert into public.programs (name, description, category, default_duration_minutes, requires_audio, active, created_by)
select v.name, v.description, v.category, v.minutes, true, true, (select id from _setup_actor)
from (values
  -- Morning band, 09:05 - 09:30
  ('Vanakkam Vellore',        'Morning welcome for Vellore and the VIT campus.',                    'CAMPUS',       5),
  ('Andru Indru',             'Then and now: a look back at the day in history.',                   'HISTORY',      5),
  ('Dhinam Oru Thiravukool',  'A key idea a day.',                                                  'KNOWLEDGE',    5),
  ('Manvaasanai',             'The scent of the soil: folk and rural life.',                        'CULTURE',      5),
  ('Dhinam Oru Velan Seithi', 'A daily bulletin for the farming community.',                        'AGRICULTURE',  5),
  ('Sevichelvam',             'The wealth of listening.',                                           'CULTURE',      5),
  ('Data Chunks',             'Short data and technology briefings.',                               'TECHNOLOGY',   5),

  -- Rotating block, 09:30 - 11:59
  ('Anubava Medai',           'The experience stage: people on what they have lived through.',      'TALK',        30),
  ('Arivom Aayiram',          'A thousand things worth knowing.',                                   'KNOWLEDGE',   30),
  ('Exchange of Ideas',       'Conversation across disciplines and departments.',                   'TALK',        30),
  ('Experts Talk',            'Specialists in conversation on their field.',                        'TALK',        30),
  ('Kaarasaram',              'Sharp, opinionated discussion.',                                     'TALK',        30),
  ('Karuthukalam',            'An open forum for opinion and debate.',                              'TALK',        30),
  ('Maruthuva Neram',         'The medical hour: health advice and discussion.',                    'HEALTH',      30),
  ('Noble Lectures',          'Lectures worth hearing, from campus and beyond.',                    'EDUCATION',   30),
  ('Pallikoodam',             'School: learning, teaching and the classroom.',                      'EDUCATION',   30),
  ('Second Look',             'A closer second look at what deserves it.',                          'REVIEW',      30),
  ('Thiraikadaloodi',         'Across the seas: literature, cinema and journeys.',                  'LITERATURE',  30),
  ('Travel Bonanza',          'Places, journeys and the people met along the way.',                 'TRAVEL',      30),
  ('VIT Achievers',           'The students and staff of VIT, and what they have achieved.',        'CAMPUS',      30),
  ('Vallunar Paarvai',        'A Valluvar-eyed view of everyday life.',                             'LITERATURE',  30),
  ('Special Talks',           'One-off talks that do not fit a regular strand.',                    'TALK',        30),
  ('Special Shows',           'Festival, occasion and outside-broadcast specials.',                 'SPECIAL',     30),
  ('Chatty Chatty',           'Light, unhurried campus conversation.',                              'TALK',        30),

  -- Afternoon feature
  ('The Campus Quiz',         'Can you answer this? The daily campus quiz.',                        'QUIZ',        30)
) as v(name, description, category, minutes)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- The Fixed Point Chart itself, effective 25 August 2026, Monday to Friday.
--
-- Two slots carry no programme link on purpose: the chart prints them as a pair
-- of alternating strands ("Vanakkam Vellore / Andru Indru"), and the chart text
-- is the authority on what actually goes out.
-- -----------------------------------------------------------------------------
insert into public.station_slots
  (title, kind, start_time, end_time, days, program_id, notes, effective_from, created_by)
select
  v.title,
  v.kind::public.slot_kind,
  v.start_time::time,
  v.end_time::time,
  '{1,2,3,4,5}'::smallint[],
  (select p.id from public.programs p where lower(btrim(p.name)) = lower(v.program_name)),
  v.notes,
  date '2026-08-25',
  (select id from _setup_actor)
from (values
  ('Signature Tune & Radio Anthem',           'ANNOUNCEMENT',   '09:00', '09:05', '',                         null),
  ('Vanakkam Vellore / Andru Indru',          'SEGMENT',        '09:05', '09:10', '',                         'Alternating strands, as printed on the chart.'),
  ('Dhinam Oru Thiravukool',                  'SEGMENT',        '09:10', '09:15', 'Dhinam Oru Thiravukool',   null),
  ('Manvaasanai / Dhinam Oru Velan Seithi',   'SEGMENT',        '09:15', '09:20', '',                         'Alternating strands, as printed on the chart.'),
  ('Sevichelvam',                             'SEGMENT',        '09:20', '09:25', 'Sevichelvam',              null),
  ('Data Chunks',                             'SEGMENT',        '09:25', '09:30', 'Data Chunks',              null),
  ('Rotating programmes',                     'ROTATING_BLOCK', '09:30', '11:59', '',                         'Filled from the rotating pool: Anubava Medai, Arivom Aayiram, Exchange of Ideas, Experts Talk, Kaarasaram, Karuthukalam, Maruthuva Neram, Noble Lectures, Pallikoodam, Second Look, Thiraikadaloodi, Travel Bonanza, VIT Achievers, Vallunar Paarvai, Special Talks, Special Shows, Chatty Chatty.'),
  ('Closing Announcement (Morning)',           'ANNOUNCEMENT',   '11:59', '12:00', '',                        null),
  ('Rebroadcast - I',                          'REBROADCAST',    '12:00', '14:59', '',                        'Repeat of the morning band.'),
  ('Closing Announcement (Afternoon)',         'ANNOUNCEMENT',   '14:59', '15:00', '',                        null),
  ('Rebroadcast - II',                         'REBROADCAST',    '15:00', '18:00', '',                        'Second repeat of the morning band.'),
  ('The Campus Quiz',                          'FEATURE',        '17:00', '17:30', 'The Campus Quiz',         'Sits inside Rebroadcast - II. Printed on the chart as "1700 Hrs - The Campus Quiz, Can you answer this?"'),
  ('Closing Announcement (Evening)',           'ANNOUNCEMENT',   '18:00', '18:05', '',                        'Close of the broadcast day.')
) as v(title, kind, start_time, end_time, program_name, notes)
where not exists (
  select 1 from public.station_slots where effective_from = date '2026-08-25'
);

drop table if exists _setup_actor;


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000011_roles_and_studio_bookings.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 11 EDITOR / SECTION HEAD ROLES, AND STUDIO BOOKING
--
-- Stage A of the production workflow: the two missing roles, the contact details
-- registration now collects, and the studio booking system with every booking
-- rule enforced in SQL.
--
-- WHY THERE IS NO `studio_slots` TABLE
-- The bookable grid (Mon-Fri, 09:00-18:00, 30 minutes, no 13:00-14:00) is a
-- RULE, not data. Materialising ~180 rows a week would create a second source of
-- truth that can drift from the rule, and would need a job to keep extending it.
-- Instead the rule lives in CHECK constraints here, and the calendar is computed
-- from (rule - bookings). A slot exists because the rule says so.
--
-- Double booking is prevented by a UNIQUE constraint on (booking_date,
-- start_time) filtered to live bookings, so two RJs pressing Confirm at the same
-- instant cannot both succeed -- the loser gets a constraint violation, not a
-- corrupted calendar. Application-level checking cannot promise that.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Roles
-- -----------------------------------------------------------------------------
alter type public.user_role add value if not exists 'EDITOR';
alter type public.user_role add value if not exists 'SECTION_HEAD';

comment on type public.user_role is
  'ADMIN, PRODUCER, RJ, QC, EDITOR (cuts audio), SECTION_HEAD (approves scripts).';

-- -----------------------------------------------------------------------------
-- Contact details collected at registration.
-- Phone is optional at the database level because the five seeded accounts and
-- any admin-provisioned user predate the field; the registration form requires
-- it. Format is checked, not merely length.
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists phone text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_phone_format'
  ) then
    alter table public.profiles
      add constraint profiles_phone_format check (
        phone is null
        or phone ~ '^[+]?[0-9][0-9 ()-]{6,19}$'
      );
  end if;
end;
$$;

comment on column public.profiles.phone is
  'Contact number collected at registration. Never shown on the public calendar.';

-- =============================================================================
-- Studio bookings
-- =============================================================================
create type public.booking_status as enum (
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW'
);

create type public.booking_origin as enum (
  'RJ',             -- booked by the RJ, subject to the 24-hour rule
  'ADMIN_OVERRIDE'  -- booked by an administrator, rule waived, reason required
);

create type public.show_language as enum (
  'TAMIL',
  'ENGLISH',
  'HINDI',
  'TELUGU',
  'MALAYALAM'
);

create type public.script_approval as enum ('YES', 'NO', 'PENDING');

create table public.studio_bookings (
  id            uuid primary key default gen_random_uuid(),

  -- Human-facing reference, e.g. VCR-2026-000123. Filled by a trigger.
  reference     text unique,

  -- Who the studio is booked for. An admin override books on someone's behalf,
  -- so this is not necessarily the person who created the row.
  rj_id         uuid not null references public.profiles (id) on delete restrict,

  booking_date  date not null,
  start_time    time not null,
  end_time      time not null,

  -- Show details captured at booking time.
  show_name     text not null check (char_length(btrim(show_name)) between 2 and 160),
  language      public.show_language not null,
  script_status public.script_approval not null default 'PENDING',
  script_approver text check (char_length(script_approver) <= 120),

  -- Editing: either the RJ edits it themselves, or an editor is requested.
  self_edit     boolean not null default false,
  editor_id     uuid references public.profiles (id) on delete set null,

  status        public.booking_status not null default 'CONFIRMED',
  origin        public.booking_origin not null default 'RJ',
  override_reason text check (char_length(override_reason) <= 500),

  -- Private to the station; never exposed on the public calendar.
  notes         text check (char_length(notes) <= 1000),

  -- Set once the recording exists, tying booking -> show -> audio together.
  episode_id    uuid references public.episodes (id) on delete set null,

  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- ---- the studio grid, enforced ----
  constraint bookings_time_order check (end_time > start_time),

  -- Exactly 30 minutes.
  constraint bookings_half_hour check (end_time - start_time = interval '30 minutes'),

  -- Starts on a half hour.
  constraint bookings_on_grid check (
    extract(minute from start_time) in (0, 30)
    and extract(second from start_time) = 0
  ),

  -- Operating hours 09:00-18:00.
  constraint bookings_operating_hours check (
    start_time >= time '09:00' and end_time <= time '18:00'
  ),

  -- Lunch 13:00-14:00 is not bookable.
  constraint bookings_not_lunch check (
    start_time < time '13:00' or start_time >= time '14:00'
  ),

  -- Monday to Friday only. ISO dow: 1 = Monday ... 7 = Sunday.
  constraint bookings_weekday_only check (
    extract(isodow from booking_date) between 1 and 5
  ),

  -- An override must say why.
  constraint bookings_override_needs_reason check (
    origin <> 'ADMIN_OVERRIDE'
    or char_length(btrim(coalesce(override_reason, ''))) >= 5
  ),

  -- Either you edit it yourself, or you name an editor -- not both, not neither.
  constraint bookings_editor_choice check (
    (self_edit and editor_id is null) or (not self_edit)
  )
);

-- One live booking per slot. CANCELLED rows are excluded so a cancelled slot is
-- immediately bookable again, while the cancelled row is kept for the audit.
create unique index studio_bookings_slot_key
  on public.studio_bookings (booking_date, start_time)
  where status <> 'CANCELLED';

create index studio_bookings_rj_idx     on public.studio_bookings (rj_id, booking_date desc);
create index studio_bookings_date_idx   on public.studio_bookings (booking_date, start_time);
create index studio_bookings_editor_idx on public.studio_bookings (editor_id)
  where editor_id is not null;
create index studio_bookings_episode_idx on public.studio_bookings (episode_id)
  where episode_id is not null;

comment on table public.studio_bookings is
  'Studio reservations. The bookable grid is a rule (see constraints), not a table.';

create trigger studio_bookings_set_updated_at
  before update on public.studio_bookings
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Booking reference: VCR-<year>-<six digits>, allocated per calendar year.
-- -----------------------------------------------------------------------------
create sequence if not exists public.booking_reference_seq;

-- SECURITY DEFINER so the sequence stays owner-only: a client that could call
-- nextval() directly could burn reference numbers and leave gaps in the series.
create or replace function app.assign_booking_reference()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reference is null then
    new.reference := 'VCR-' || to_char(new.booking_date, 'YYYY') || '-' ||
                     lpad(nextval('public.booking_reference_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger studio_bookings_reference
  before insert on public.studio_bookings
  for each row execute function app.assign_booking_reference();

-- -----------------------------------------------------------------------------
-- The 24-hour rule, and who may waive it.
--
-- This is the check that must NOT live only in the browser: an RJ calling
-- PostgREST directly would otherwise book a slot for twenty minutes' time.
-- -----------------------------------------------------------------------------
create or replace function app.enforce_booking_window()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role  public.user_role := app.current_role();
  v_start timestamptz;
begin
  -- The slot's start as a real instant, in station time.
  v_start := (new.booking_date + new.start_time) at time zone 'Asia/Kolkata';

  if new.origin = 'ADMIN_OVERRIDE' then
    -- Only an administrator may waive the rule, and only deliberately.
    if not app.is_trusted_session() and v_role is distinct from 'ADMIN' then
      raise exception 'Only an administrator can create an override booking'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Normal bookings: at least 24 hours ahead.
  if v_start < now() + interval '24 hours' then
    raise exception
      'Studio bookings must be made at least 24 hours in advance. For a slot sooner than that, contact the VIT Community Radio administrator.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger studio_bookings_window
  before insert on public.studio_bookings
  for each row execute function app.enforce_booking_window();

-- -----------------------------------------------------------------------------
-- An editor must actually be an editor, and an RJ must actually be an RJ.
-- -----------------------------------------------------------------------------
create or replace function app.validate_booking_people()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_editor_role public.user_role;
begin
  if new.editor_id is not null then
    -- Business rule: an RJ cannot nominate themselves as their own editor;
    -- that is what self_edit is for, and it keeps the editor queue honest.
    if new.editor_id = new.rj_id then
      raise exception 'Choose "I will edit it myself" rather than assigning yourself as editor'
        using errcode = '23514';
    end if;

    select role into v_editor_role
    from public.profiles where id = new.editor_id and active;

    if v_editor_role is null then
      raise exception 'That editor account is not active' using errcode = '23503';
    end if;

    if v_editor_role not in ('EDITOR', 'PRODUCER', 'ADMIN') then
      raise exception 'That person is not an editor' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger studio_bookings_validate_people
  before insert or update on public.studio_bookings
  for each row execute function app.validate_booking_people();

-- -----------------------------------------------------------------------------
-- Audit
-- -----------------------------------------------------------------------------
create or replace function app.log_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log(
      case when new.origin = 'ADMIN_OVERRIDE' then 'BOOKING_OVERRIDE_CREATED'
           else 'BOOKING_CREATED' end,
      'SCHEDULE', new.id,
      jsonb_build_object('reference', new.reference, 'show_name', new.show_name,
                         'date', new.booking_date, 'start_time', new.start_time,
                         'rj_id', new.rj_id, 'reason', new.override_reason));
  elsif new.status is distinct from old.status then
    perform app.log('BOOKING_' || new.status::text, 'SCHEDULE', new.id,
      jsonb_build_object('reference', new.reference, 'show_name', new.show_name));
  elsif new.editor_id is distinct from old.editor_id then
    perform app.log('BOOKING_EDITOR_CHANGED', 'SCHEDULE', new.id,
      jsonb_build_object('reference', new.reference, 'editor_id', new.editor_id));
  else
    perform app.log('BOOKING_UPDATED', 'SCHEDULE', new.id,
      jsonb_build_object('reference', new.reference));
  end if;
  return null;
end;
$$;

create trigger studio_bookings_log
  after insert or update on public.studio_bookings
  for each row execute function app.log_booking_change();

-- -----------------------------------------------------------------------------
-- RLS
--
-- Everyone signed in can see that a slot is taken (they need to, to book around
-- it), but the private columns are filtered by the public view below for
-- anonymous visitors.
-- -----------------------------------------------------------------------------
alter table public.studio_bookings enable row level security;

grant select on public.studio_bookings to authenticated;
grant insert, update on public.studio_bookings to authenticated;
grant all on public.studio_bookings to service_role;

create policy "bookings_select_station_members"
  on public.studio_bookings for select to authenticated
  using (app.current_role() is not null);

-- An RJ books for themselves only, as a normal booking. Admins may book for
-- anyone; the override path is additionally gated by the window trigger.
create policy "bookings_insert"
  on public.studio_bookings for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      app.has_role('ADMIN')
      or (
        app.has_role('RJ', 'PRODUCER')
        and rj_id = auth.uid()
        and origin = 'RJ'
      )
    )
  );

-- An RJ may amend their own upcoming booking; admins and producers may amend
-- any. Status transitions are further constrained by the guard below.
create policy "bookings_update"
  on public.studio_bookings for update to authenticated
  using (
    app.has_role('ADMIN', 'PRODUCER')
    or (rj_id = auth.uid() and status = 'CONFIRMED')
  )
  with check (
    app.has_role('ADMIN', 'PRODUCER')
    or (rj_id = auth.uid() and status in ('CONFIRMED', 'CANCELLED'))
  );

-- No DELETE policy anywhere: bookings are cancelled, never erased.

-- -----------------------------------------------------------------------------
-- Public calendar view.
--
-- This is what an anonymous visitor sees. It deliberately carries NO rj name,
-- email, phone, show name, notes or approval information -- only that a slot is
-- taken. Adding a column here is the only way to widen it, which makes widening
-- a deliberate act rather than an accident.
-- -----------------------------------------------------------------------------
create or replace view public.v_public_studio_calendar
with (security_invoker = off) as
select
  b.booking_date,
  b.start_time,
  b.end_time
from public.studio_bookings b
where b.status <> 'CANCELLED'
  and b.booking_date >= current_date - 7;

comment on view public.v_public_studio_calendar is
  'Anonymous-safe studio occupancy: date and time only. No identity, no show details.';

grant select on public.v_public_studio_calendar to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Fix: handle_new_user() had the four original roles hard-coded, so an account
-- provisioned as EDITOR or SECTION_HEAD fell through to an INACTIVE RJ -- the
-- role was silently downgraded and the account never activated.
--
-- Rewritten to validate the claim against the enum itself, so adding a role in
-- future needs no change here.
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

  if v_claim is not null and exists (
    select 1
    from pg_catalog.pg_enum e
    join pg_catalog.pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = v_claim
  ) then
    v_role := v_claim::public.user_role;
    v_approved := true;
  end if;

  insert into public.profiles (id, full_name, email, phone, role, active, approved_at)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
             split_part(new.email, '@', 1)),
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    v_role,
    v_approved,
    case when v_approved then now() end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000012_booking_cancellation_window.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 12 CANCELLATION WINDOW
--
-- WHAT THIS PROTECTS AGAINST
-- Migration 11 lets an RJ update their own CONFIRMED booking, and the RLS
-- WITH CHECK allows the new status to be CANCELLED. Nothing looked at the
-- clock. So an RJ who failed to turn up could cancel the slot afterwards and
-- erase the evidence: the studio sat empty, someone else was refused that time,
-- and the record would end up saying the booking never stood.
--
-- After this migration a booking can only be cancelled by its RJ while the slot
-- is still in the future. Once the slot has started it is the station's record
-- of what happened, and only an administrator or producer can change it (to
-- COMPLETED or NO_SHOW, or to cancel on the RJ's behalf).
--
-- WHY A TRIGGER, NOT AN RPC
-- Cancellation already flows through a plain UPDATE governed by RLS -- there is
-- no cancellation function to extend. A BEFORE UPDATE guard is the same pattern
-- already used by app.guard_schedule_status() and app.guard_episode_update(),
-- so this adds a rule to the existing path instead of a competing one.
--
-- Deliberately additive. Migration 11 is untouched: no policy, constraint,
-- trigger or grant is altered or dropped, and admin behaviour is unchanged.
-- =============================================================================

create or replace function app.guard_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    public.user_role := app.current_role();
  v_starts  timestamptz;
begin
  -- Only status transitions are governed here. Editing notes, the show name or
  -- the editor stays subject to the existing RLS policy alone.
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Seeds, migrations and service-role maintenance are trusted, and station
  -- staff keep the behaviour they had before this migration.
  if app.is_trusted_session() or v_role in ('ADMIN', 'PRODUCER') then
    return new;
  end if;

  -- The slot's start as a real instant. Booking dates and times are
  -- station-local, and IST has no daylight saving, so this is exact.
  v_starts := (old.booking_date + old.start_time) at time zone 'Asia/Kolkata';

  if v_starts <= now() then
    raise exception
      'This booking has already started, so it can no longer be cancelled here. Contact the VIT Community Radio administrator.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function app.guard_booking_status_change() is
  'Stops an RJ cancelling a booking after its slot has started. Admins and producers are unaffected.';

create trigger studio_bookings_guard_status
  before update on public.studio_bookings
  for each row execute function app.guard_booking_status_change();


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000013_revoke_anon_on_new_tables.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 13 CLOSE THE anon GRANTS ON LATER TABLES
--
-- WHAT THIS FIXES
-- Migration 04 ran `revoke all on all tables in schema public from anon`, which
-- only affects tables that existed AT THAT MOMENT. Supabase ships a default
-- privilege rule --
--     alter default privileges in schema public grant all on tables
--       to anon, authenticated, service_role;
-- -- so every table created afterwards is born with ALL privileges granted to
-- anon again. `station_slots` (09) and `studio_bookings` (11) were created
-- later and therefore carried SELECT, INSERT, UPDATE, DELETE and TRUNCATE for
-- anonymous visitors.
--
-- Nothing leaked: RLS is enabled on both tables and neither has a policy for
-- anon, so every anonymous read returned zero rows and every write was refused.
-- This is defence in depth, not an incident. But the grant is one accidental
-- permissive policy -- or one `disable row level security` -- away from being a
-- real hole, and the intent of migration 04 was that anon holds nothing.
--
-- Found by inspecting the live database after deploying 08-12. It does not
-- reproduce in the test harness, because PGlite has no Supabase default
-- privileges: there is nothing there to re-grant. That is exactly why this
-- check belongs against a real project.
--
-- NOTE FOR FUTURE MIGRATIONS: any new table in `public` needs its own
-- `revoke all ... from anon`, or it inherits the same grants.
-- =============================================================================

revoke all on public.station_slots from anon;
revoke all on public.studio_bookings from anon;

-- The public views are meant to be readable by anonymous visitors -- that is the
-- whole point of them -- but only readable. They were granted ALL for the same
-- reason, so reset them to SELECT alone.
revoke all on public.v_public_now_playing        from anon;
revoke all on public.v_public_schedule_today     from anon;
revoke all on public.v_public_programs           from anon;
revoke all on public.v_public_recent_episodes    from anon;
revoke all on public.v_public_fixed_point_chart  from anon;
revoke all on public.v_public_studio_calendar    from anon;

grant select on public.v_public_now_playing        to anon;
grant select on public.v_public_schedule_today     to anon;
grant select on public.v_public_programs           to anon;
grant select on public.v_public_recent_episodes    to anon;
grant select on public.v_public_fixed_point_chart  to anon;
grant select on public.v_public_studio_calendar    to anon;


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000014_own_profile_always_readable.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 14 A USER CAN ALWAYS READ THEIR OWN PROFILE
--
-- WHAT THIS FIXES
-- `profiles_select_station_members` (migration 04) gates reads on
-- app.current_role(), which returns NULL for an inactive profile. That is
-- correct for everyone else's data, but it also hid the reader's OWN row -- so
-- a pending registrant could read nothing at all, not even the record that says
-- they are pending.
--
-- The consequence only appears once email confirmation is switched off. With
-- confirmation on, a self-registered account could never obtain a session, so
-- the case was unreachable. Without it the account signs in immediately, and
-- authService.getProfile() -- which is written to say "your access request is
-- still waiting for approval" -- instead received NULL and reported
-- "We could not find that item."
--
-- This adds a second SELECT policy. PostgreSQL ORs permissive policies
-- together, so the existing one is untouched and nothing else widens: the new
-- clause is `id = auth.uid()`, which is the caller's own row and nobody else's.
--
-- Deactivated staff are equally covered, and get the accurate message
-- ("this account has been deactivated") rather than a confusing not-found.
-- =============================================================================

create policy "profiles_select_own_always"
  on public.profiles for select to authenticated
  using (id = auth.uid());

comment on policy "profiles_select_own_always" on public.profiles is
  'A signed-in user can always read their own row, including while pending approval or deactivated.';


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000015_delete_user.sql
-- ###########################################################################


-- =============================================================================
-- 15. Permanently delete an account
--
-- Deactivating an account stops access but leaves the person listed forever,
-- which is wrong for the accounts an open registration form actually collects:
-- typos, duplicates, and people who never came back. Those should be removable.
--
-- Removing an account means deleting the auth.users row, and only the service
-- role can do that over the API. The service-role key must never be in frontend
-- code, so the capability is exposed instead as a SECURITY DEFINER function the
-- browser can call with an ordinary signed-in session. The function is owned by
-- the migration role, so it -- and only it -- reaches into auth.
--
-- The profile disappears by cascade (profiles.id references auth.users on
-- delete cascade), and every other reference is `on delete set null`.
--
-- Which is exactly the danger. Station records outlive people: an episode still
-- happened after the RJ graduates. Silently detaching a year of episodes from
-- their creator is not a delete anyone asked for, so this refuses when anything
-- is attached and says what, leaving Deactivate as the answer for people who
-- did work here. Delete is for accounts that produced nothing.
--
-- Activity logs are deliberately NOT counted. Every account has them from the
-- moment it registers, so counting them would mean nothing is ever deletable.
-- Those rows null their actor and survive as audit history, and the deletion
-- itself is logged with the email so the trail still names who went.
-- =============================================================================

create or replace function public.delete_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_admins  bigint;
  v_blocks  text[] := '{}';
  v_count   bigint;
begin
  if not app.is_admin() then
    raise exception 'Only an administrator can delete an account'
      using errcode = '42501';
  end if;

  -- The same rule the profile guard trigger enforces for role and activation:
  -- an administrator must not be able to remove themselves.
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account'
      using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  -- Never leave the station with no way in.
  if v_profile.role = 'ADMIN' then
    select count(*) into v_admins
      from public.profiles
     where role = 'ADMIN' and active and id <> p_user_id;

    if v_admins = 0 then
      raise exception 'This is the last administrator account and cannot be deleted'
        using errcode = '42501';
    end if;
  end if;

  -- What would be detached or refused. Counted in the order an administrator
  -- would think of them, and reported all at once rather than one per attempt.
  select count(*) into v_count from public.episodes
   where created_by = p_user_id or assigned_rj = p_user_id;
  if v_count > 0 then v_blocks := v_blocks || format('%s episode(s)', v_count); end if;

  select count(*) into v_count from public.studio_bookings
   where rj_id = p_user_id or editor_id = p_user_id or created_by = p_user_id;
  if v_count > 0 then v_blocks := v_blocks || format('%s studio booking(s)', v_count); end if;

  select count(*) into v_count from public.audio_files where uploaded_by = p_user_id;
  if v_count > 0 then v_blocks := v_blocks || format('%s audio file(s)', v_count); end if;

  select count(*) into v_count from public.qc_reviews where reviewer_id = p_user_id;
  if v_count > 0 then v_blocks := v_blocks || format('%s QC review(s)', v_count); end if;

  select count(*) into v_count from public.schedules where created_by = p_user_id;
  if v_count > 0 then v_blocks := v_blocks || format('%s schedule(s)', v_count); end if;

  select count(*) into v_count from public.programs where created_by = p_user_id;
  if v_count > 0 then v_blocks := v_blocks || format('%s programme(s)', v_count); end if;

  select count(*) into v_count from public.station_slots where created_by = p_user_id;
  if v_count > 0 then v_blocks := v_blocks || format('%s chart slot(s)', v_count); end if;

  select count(*) into v_count from public.broadcast_state where updated_by = p_user_id;
  if v_count > 0 then v_blocks := v_blocks || 'the current broadcast state'; end if;

  if array_length(v_blocks, 1) is not null then
    raise exception
      '% has % on the station record. Deactivate the account instead so the station keeps its history.',
      v_profile.full_name, array_to_string(v_blocks, ', ')
      using errcode = '23503';
  end if;

  -- Logged before the row goes, so the email is still available to record.
  perform app.log('PROFILE_DELETED', 'PROFILE', p_user_id, jsonb_build_object(
    'email', v_profile.email,
    'full_name', v_profile.full_name,
    'role', v_profile.role,
    'was_approved', v_profile.approved_at is not null
  ));

  -- Cascades to public.profiles, and to the auth session and identity rows.
  delete from auth.users where id = p_user_id;

  return jsonb_build_object(
    'id', p_user_id,
    'email', v_profile.email,
    'full_name', v_profile.full_name
  );
end;
$$;

comment on function public.delete_user(uuid) is
  'Permanently remove an account that has no station records. Administrators only.';

-- Hosted Supabase grants EXECUTE on new public functions to anon and
-- authenticated by default, and `revoke ... from public` does not undo a grant
-- made to a role by name -- the same trap migration 13 covers for tables. An
-- anon caller has no auth.uid() so app.is_admin() would refuse anyway, but a
-- function that deletes accounts should not be reachable unauthenticated at
-- all, so the grant is removed explicitly rather than left to the guard.
revoke execute on function public.delete_user(uuid) from public;
revoke execute on function public.delete_user(uuid) from anon;
grant  execute on function public.delete_user(uuid) to authenticated;


-- ###########################################################################
-- SOURCE: supabase/seed.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- DEVELOPMENT SEED
--
-- !! DEVELOPMENT DATA ONLY !!
-- Every account below uses the same well-known password and every record is
-- marked as sample data. Never run this file against a production project.
--
-- Dev password for all accounts: radio-dev-2025
--
--   admin@vitradio.dev      ADMIN      Ananya Krishnan
--   producer@vitradio.dev   PRODUCER   Rohit Menon
--   rj.sneha@vitradio.dev   RJ         Sneha Iyer
--   rj.karthik@vitradio.dev RJ         Karthik Rao
--   qc@vitradio.dev         QC         Meera Nair
--
-- The audio rows point at storage paths that are NOT uploaded by this script.
-- Playback of seeded episodes will 404 until a real file is uploaded through
-- the app -- that is expected, and keeps the seed free of binary blobs.
-- =============================================================================

-- Seeding legitimately writes states that the workflow normally owns, so the
-- guard triggers are told this transaction is a workflow transaction.
select set_config('app.workflow', 'on', false);

-- -----------------------------------------------------------------------------
-- Auth users. The on_auth_user_created trigger creates the matching profiles;
-- roles come from raw_app_meta_data, which is the service-role-only field.
-- -----------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@vitradio.dev',
   extensions.crypt('radio-dev-2025', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"ADMIN"}'::jsonb,
   '{"full_name":"Ananya Krishnan"}'::jsonb, now(), now()),

  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'producer@vitradio.dev',
   extensions.crypt('radio-dev-2025', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"PRODUCER"}'::jsonb,
   '{"full_name":"Rohit Menon"}'::jsonb, now(), now()),

  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rj.sneha@vitradio.dev',
   extensions.crypt('radio-dev-2025', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"RJ"}'::jsonb,
   '{"full_name":"Sneha Iyer"}'::jsonb, now(), now()),

  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rj.karthik@vitradio.dev',
   extensions.crypt('radio-dev-2025', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"RJ"}'::jsonb,
   '{"full_name":"Karthik Rao"}'::jsonb, now(), now()),

  ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'qc@vitradio.dev',
   extensions.crypt('radio-dev-2025', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"QC"}'::jsonb,
   '{"full_name":"Meera Nair"}'::jsonb, now(), now())
on conflict (id) do nothing;

-- GoTrue scans the token columns of auth.users into non-nullable Go strings, so
-- a NULL left by a hand-written INSERT makes every login fail with
-- "Database error querying schema" (HTTP 500). They must be empty strings, not
-- NULL. The column list differs between GoTrue versions, so each one is
-- normalised only if it exists rather than being named in the INSERT above.
do $$
declare
  v_col text;
begin
  foreach v_col in array array[
    'confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
    'email_change_token_current', 'phone_change', 'phone_change_token',
    'reauthentication_token'
  ]
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = v_col
    ) then
      execute format(
        'update auth.users set %I = coalesce(%I, %L) where email like %L',
        v_col, v_col, '', '%@vitradio.dev'
      );
    end if;
  end loop;
end;
$$;

-- Email/password identity rows, required by GoTrue for password sign-in.
insert into auth.identities (user_id, provider_id, provider, identity_data, created_at, updated_at)
select u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u
where u.email like '%@vitradio.dev'
on conflict (provider, provider_id) do nothing;

-- -----------------------------------------------------------------------------
-- Programs
-- -----------------------------------------------------------------------------
insert into public.programs
  (id, name, description, host_name, category, default_duration_minutes,
   requires_audio, active, created_by)
values
  ('a0000000-0000-4000-8000-000000000001', 'VIT Campus Connect',
   'SAMPLE DATA. Weekly round-up of campus news, notices and student initiatives.',
   'Sneha Iyer', 'CAMPUS NEWS', 60, true, true, '22222222-2222-4222-8222-222222222222'),

  ('a0000000-0000-4000-8000-000000000002', 'Campus Pulse',
   'SAMPLE DATA. Music, requests and dedications from across the VIT hostels.',
   'Karthik Rao', 'MUSIC', 60, true, true, '22222222-2222-4222-8222-222222222222'),

  ('a0000000-0000-4000-8000-000000000003', 'VIT Voices',
   'SAMPLE DATA. Long-form interviews with faculty, alumni and student leaders.',
   'Rohit Menon', 'TALK', 45, true, true, '22222222-2222-4222-8222-222222222222'),

  ('a0000000-0000-4000-8000-000000000004', 'Student Spotlight',
   'SAMPLE DATA. One student, one story, every week.',
   'Sneha Iyer', 'FEATURE', 30, true, true, '11111111-1111-4111-8111-111111111111'),

  -- Kept inactive so business rule 9 (no new schedules for inactive programs)
  -- is visible in the dev data.
  ('a0000000-0000-4000-8000-000000000005', 'Exam Week Special',
   'SAMPLE DATA. Runs only during end-semester exams. Currently off the air.',
   'Rohit Menon', 'SEASONAL', 30, false, false, '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Episodes, covering every content state
-- -----------------------------------------------------------------------------
insert into public.episodes
  (id, program_id, title, description, episode_number, host_name, assigned_rj,
   status, submitted_at, reviewed_at, duration_seconds, created_by)
values
  -- APPROVED, already broadcast
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Orientation Week Round-Up', 'SAMPLE DATA. Everything first-years need to know.',
   12, 'Sneha Iyer', '33333333-3333-4333-8333-333333333333',
   'APPROVED', now() - interval '5 days', now() - interval '4 days', 3480,
   '33333333-3333-4333-8333-333333333333'),

  -- APPROVED, aired earlier today
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
   'Hostel Request Hour', 'SAMPLE DATA. Top ten requests from Q block.',
   34, 'Karthik Rao', '44444444-4444-4444-8444-444444444444',
   'APPROVED', now() - interval '3 days', now() - interval '2 days', 3550,
   '44444444-4444-4444-8444-444444444444'),

  -- APPROVED, in the current slot
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003',
   'In Conversation: Robotics Club', 'SAMPLE DATA. Building a Mars rover in Vellore.',
   7, 'Rohit Menon', '33333333-3333-4333-8333-333333333333',
   'APPROVED', now() - interval '2 days', now() - interval '1 day', 2650,
   '22222222-2222-4222-8222-222222222222'),

  -- APPROVED, scheduled next
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004',
   'The Girl Who Codes at 3 AM', 'SAMPLE DATA. A final-year student on her open-source work.',
   19, 'Sneha Iyer', '33333333-3333-4333-8333-333333333333',
   'APPROVED', now() - interval '2 days', now() - interval '1 day', 1760,
   '33333333-3333-4333-8333-333333333333'),

  -- PENDING_QC, waiting on the QC desk
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001',
   'Placement Season Explained', 'SAMPLE DATA. What the placement calendar means for you.',
   13, 'Sneha Iyer', '33333333-3333-4333-8333-333333333333',
   'PENDING_QC', now() - interval '6 hours', null, 3300,
   '33333333-3333-4333-8333-333333333333'),

  -- PENDING_QC, second item in the queue
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000002',
   'Retro Bollywood Hour', 'SAMPLE DATA. Playlist from the 90s.',
   35, 'Karthik Rao', '44444444-4444-4444-8444-444444444444',
   'PENDING_QC', now() - interval '2 hours', null, 3600,
   '44444444-4444-4444-8444-444444444444'),

  -- REJECTED, needs a re-record
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000003',
   'Alumni Special (draft cut)', 'SAMPLE DATA. Interview with a 2018 alumnus.',
   8, 'Rohit Menon', '44444444-4444-4444-8444-444444444444',
   'REJECTED', now() - interval '2 days', now() - interval '1 day', 2400,
   '44444444-4444-4444-8444-444444444444'),

  -- DRAFT, still being written
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000004',
   'Spotlight: Athletics Meet', 'SAMPLE DATA. Script in progress, no audio yet.',
   20, 'Sneha Iyer', '33333333-3333-4333-8333-333333333333',
   'DRAFT', null, null, null,
   '33333333-3333-4333-8333-333333333333'),

  -- ARCHIVED, retired from rotation
  ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001',
   'Freshers Special 2023', 'SAMPLE DATA. Retired, kept for the archive.',
   1, 'Sneha Iyer', null,
   'ARCHIVED', now() - interval '400 days', now() - interval '399 days', 3000,
   '22222222-2222-4222-8222-222222222222')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Audio metadata. Paths follow episodes/{episode_id}/{filename}.
-- -----------------------------------------------------------------------------
insert into public.audio_files
  (id, episode_id, file_name, storage_path, mime_type, file_size, duration_seconds, uploaded_by)
values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'campus-connect-12.mp3',
   'episodes/b0000000-0000-4000-8000-000000000001/campus-connect-12.mp3',
   'audio/mpeg', 55680000, 3480, '33333333-3333-4333-8333-333333333333'),

  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   'campus-pulse-34.mp3',
   'episodes/b0000000-0000-4000-8000-000000000002/campus-pulse-34.mp3',
   'audio/mpeg', 56800000, 3550, '44444444-4444-4444-8444-444444444444'),

  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
   'vit-voices-07.mp3',
   'episodes/b0000000-0000-4000-8000-000000000003/vit-voices-07.mp3',
   'audio/mpeg', 42400000, 2650, '22222222-2222-4222-8222-222222222222'),

  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004',
   'spotlight-19.mp3',
   'episodes/b0000000-0000-4000-8000-000000000004/spotlight-19.mp3',
   'audio/mpeg', 28160000, 1760, '33333333-3333-4333-8333-333333333333'),

  ('c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000005',
   'campus-connect-13.mp3',
   'episodes/b0000000-0000-4000-8000-000000000005/campus-connect-13.mp3',
   'audio/mpeg', 52800000, 3300, '33333333-3333-4333-8333-333333333333'),

  ('c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000006',
   'campus-pulse-35.mp3',
   'episodes/b0000000-0000-4000-8000-000000000006/campus-pulse-35.mp3',
   'audio/mpeg', 57600000, 3600, '44444444-4444-4444-8444-444444444444'),

  ('c0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000007',
   'vit-voices-08-cut1.mp3',
   'episodes/b0000000-0000-4000-8000-000000000007/vit-voices-08-cut1.mp3',
   'audio/mpeg', 38400000, 2400, '44444444-4444-4444-8444-444444444444'),

  ('c0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000009',
   'freshers-2023.mp3',
   'episodes/b0000000-0000-4000-8000-000000000009/freshers-2023.mp3',
   'audio/mpeg', 48000000, 3000, '22222222-2222-4222-8222-222222222222')
on conflict (id) do nothing;

-- Point each episode at its current audio file.
update public.episodes e
   set audio_file_id = a.id
  from public.audio_files a
 where a.episode_id = e.id
   and e.audio_file_id is null;

-- -----------------------------------------------------------------------------
-- QC history
-- -----------------------------------------------------------------------------
insert into public.qc_reviews (episode_id, reviewer_id, decision, comment, created_at)
values
  ('b0000000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555',
   'APPROVED', 'Levels are clean, content approved for air.', now() - interval '4 days'),
  ('b0000000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555',
   'APPROVED', 'Good to go.', now() - interval '2 days'),
  ('b0000000-0000-4000-8000-000000000003', '55555555-5555-4555-8555-555555555555',
   'APPROVED', 'Approved. Trim the intro next time.', now() - interval '1 day'),
  ('b0000000-0000-4000-8000-000000000004', '55555555-5555-4555-8555-555555555555',
   'APPROVED', 'Lovely piece, approved.', now() - interval '1 day'),
  ('b0000000-0000-4000-8000-000000000007', '55555555-5555-4555-8555-555555555555',
   'REJECTED', 'Background hum through the middle section and the guest name is mispronounced at 04:12. Please re-record and resubmit.',
   now() - interval '1 day')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Schedule grid. Times are relative to now() so the dev data always looks live.
-- -----------------------------------------------------------------------------
insert into public.schedules
  (id, program_id, episode_id, start_time, end_time, status, notes, created_by)
values
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001',
   now() - interval '1 day 6 hours', now() - interval '1 day 5 hours',
   'COMPLETED', 'SAMPLE DATA. Aired yesterday evening.',
   '22222222-2222-4222-8222-222222222222'),

  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
   'b0000000-0000-4000-8000-000000000002',
   now() - interval '3 hours', now() - interval '2 hours',
   'COMPLETED', 'SAMPLE DATA. Aired earlier today.',
   '22222222-2222-4222-8222-222222222222'),

  -- The slot covering "now": ready for an operator to press Go Live.
  ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003',
   'b0000000-0000-4000-8000-000000000003',
   now() - interval '15 minutes', now() + interval '30 minutes',
   'SCHEDULED', 'SAMPLE DATA. Current slot.',
   '22222222-2222-4222-8222-222222222222'),

  ('d0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004',
   'b0000000-0000-4000-8000-000000000004',
   now() + interval '1 hour', now() + interval '1 hour 30 minutes',
   'SCHEDULED', 'SAMPLE DATA. Next up.',
   '11111111-1111-4111-8111-111111111111'),

  -- A live slot with no pre-recorded episode.
  ('d0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002',
   null,
   now() + interval '1 day', now() + interval '1 day 1 hour',
   'SCHEDULED', 'SAMPLE DATA. Live request show, no pre-recorded audio.',
   '22222222-2222-4222-8222-222222222222')
on conflict (id) do nothing;

-- The station starts offline. Going on air is an explicit operator action.
update public.broadcast_state
   set status = 'OFFLINE', current_schedule_id = null, started_at = null, updated_at = now()
 where id;

select set_config('app.workflow', 'off', false);
