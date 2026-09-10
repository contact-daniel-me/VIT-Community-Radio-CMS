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
