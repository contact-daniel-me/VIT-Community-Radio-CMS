-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- ALLOW QC ROLE TO UPLOAD AUDIO & CREATE EPISODES
--
-- Enables users with the QC role to create episodes for their studio bookings,
-- upload audio recordings, edit their own draft/rejected episodes, and submit
-- them for QC review, just like RJs.
-- =============================================================================

-- 1. Update RLS policy on public.episodes to allow QC role to create DRAFT episodes
drop policy if exists "episodes_insert_content_roles" on public.episodes;

create policy "episodes_insert_content_roles"
  on public.episodes for insert to authenticated
  with check (
    app.has_role('ADMIN', 'PRODUCER', 'RJ', 'QC')
    and created_by = auth.uid()
    and status = 'DRAFT'
  );

comment on policy "episodes_insert_content_roles" on public.episodes is
  'Allows administrators, producers, radio jockeys, and quality control (QC) users to create draft episodes.';

-- 2. Update app.can_edit_episode helper to allow QC users to edit episodes they authored or are assigned to
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
           when app.current_role() in ('RJ', 'QC')
             then (e.created_by = auth.uid() or e.assigned_rj = auth.uid())
           else false
         end
  from public.episodes e
  where e.id = p_episode_id;
$$;

comment on function app.can_edit_episode(uuid) is
  'True when the caller may modify the episode and its audio right now. Includes QC users for episodes they authored or are assigned to.';

-- 3. Update submit_episode_for_qc to allow QC creators to submit their own episodes
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

  if not (
    v_role in ('ADMIN', 'PRODUCER')
    or (v_role in ('RJ', 'QC') and (v_episode.created_by = auth.uid()
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
         submitted_at = now()
   where id = p_episode_id
  returning * into v_episode;
  perform app.end_workflow();

  perform app.log('EPISODE_SUBMITTED_FOR_QC', 'EPISODE', v_episode.id,
    jsonb_build_object('title', v_episode.title, 'from_status', 'DRAFT_OR_REJECTED'));

  return v_episode;
end;
$$;

comment on function public.submit_episode_for_qc(uuid) is
  'Transitions a DRAFT or REJECTED episode to PENDING_QC. Callable by administrators, producers, and the episode author/assignee (RJ or QC).';

-- 4. Update reopen_episode to allow QC creators to reopen rejected episodes
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
    or (v_role in ('RJ', 'QC') and v_episode.status = 'REJECTED'
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
    raise exception 'Cannot reopen an episode that is scheduled or on air'
      using errcode = '23514';
  end if;

  perform app.begin_workflow();
  update public.episodes
     set status = 'DRAFT'
   where id = p_episode_id
  returning * into v_episode;
  perform app.end_workflow();

  perform app.log('EPISODE_REOPENED', 'EPISODE', v_episode.id,
    jsonb_build_object('title', v_episode.title));

  return v_episode;
end;
$$;

comment on function public.reopen_episode(uuid) is
  'Pulls an episode back to DRAFT for editing. Callable by administrators, producers, and the episode author (RJ or QC) if rejected.';
