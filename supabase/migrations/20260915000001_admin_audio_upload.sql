-- Drop existing policies that restrict audio file operations to editable episodes
drop policy if exists "audio_insert_episode_editors" on public.audio_files;
drop policy if exists "audio_update_episode_editors" on public.audio_files;
drop policy if exists "audio_delete_episode_editors" on public.audio_files;

-- Recreate policies allowing Admins to manage audio files anytime, while restricting others
create policy "audio_insert_episode_editors"
  on public.audio_files for insert to authenticated
  with check ((app.is_admin() or app.can_edit_episode(episode_id)) and uploaded_by = auth.uid());

create policy "audio_update_episode_editors"
  on public.audio_files for update to authenticated
  using (app.is_admin() or app.can_edit_episode(episode_id))
  with check (app.is_admin() or app.can_edit_episode(episode_id));

create policy "audio_delete_episode_editors"
  on public.audio_files for delete to authenticated
  using (app.is_admin() or app.can_edit_episode(episode_id));

-- Function for Admins to explicitly attach an audio file to a locked episode
create or replace function public.admin_attach_audio(
  p_episode_id uuid,
  p_audio_file_id uuid,
  p_target_column text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_episode_exists boolean;
begin
  if not app.is_admin() then
    raise exception 'Only administrators can force-attach audio to locked episodes'
      using errcode = '42501';
  end if;

  if p_target_column not in ('audio_file_id', 'final_audio_file_id') then
    raise exception 'Invalid target column: %', p_target_column
      using errcode = '22023';
  end if;

  select exists (select 1 from public.episodes where id = p_episode_id) into v_episode_exists;
  if not v_episode_exists then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  -- Bypass the content freeze trigger
  perform set_config('app.workflow', 'on', true);

  if p_target_column = 'audio_file_id' then
    update public.episodes set audio_file_id = p_audio_file_id where id = p_episode_id;
  else
    update public.episodes set final_audio_file_id = p_audio_file_id where id = p_episode_id;
  end if;

  -- Log the explicit action
  perform app.log(
    'ADMIN_ATTACHED_AUDIO',
    'episodes',
    p_episode_id,
    jsonb_build_object(
      'audio_file_id', p_audio_file_id,
      'target_column', p_target_column,
      'admin_id', auth.uid()
    )
  );
  
  -- We don't strictly need to reset app.workflow because it is scoped to the transaction (true parameter above).
end;
$$;
