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
