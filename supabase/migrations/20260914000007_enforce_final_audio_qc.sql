-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- ENFORCE FINAL AUDIO FOR QC
--
-- This migration updates the submit_episode_for_qc function to ensure that
-- QC is performed on the final_audio_file_id rather than the raw audio_file_id.
-- =============================================================================

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

  -- Business rule 4: QC requires the final edited audio version.
  if v_program.requires_audio and v_episode.final_audio_file_id is null then
    raise exception 'Upload the final edited audio before submitting "%" for QC', v_episode.title
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
