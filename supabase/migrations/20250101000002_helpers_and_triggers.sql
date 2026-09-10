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
