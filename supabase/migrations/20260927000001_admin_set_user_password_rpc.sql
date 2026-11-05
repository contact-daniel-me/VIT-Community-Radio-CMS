-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- ADMIN SET USER PASSWORD RPC
--
-- Enables administrators to reset or change any user's password securely.
-- Updates auth.users.encrypted_password using extensions.crypt and extensions.gen_salt.
-- Logs the action in public.activity_logs.
-- =============================================================================

create or replace function public.admin_set_user_password(
  p_user_id      uuid,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
begin
  -- 1. Authorization: Administrator only
  if not app.is_admin() and not app.is_trusted_session() then
    raise exception 'Only administrators can change user passwords'
      using errcode = '42501';
  end if;

  -- 2. Validation: minimum password length
  if p_new_password is null or char_length(p_new_password) < 8 then
    raise exception 'Password must be at least 8 characters long'
      using errcode = '22023';
  end if;

  -- 3. Check profile exists
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  -- 4. Update auth.users password using bcrypt hash
  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;

  if not found then
    raise exception 'User auth account not found' using errcode = 'P0002';
  end if;

  -- 5. Audit log
  perform app.log('PASSWORD_RESET', 'PROFILE', p_user_id, jsonb_build_object(
    'target_email', v_profile.email,
    'target_name', v_profile.full_name,
    'reset_by', auth.uid()
  ));

  return jsonb_build_object(
    'id', p_user_id,
    'email', v_profile.email,
    'full_name', v_profile.full_name
  );
end;
$$;

comment on function public.admin_set_user_password(uuid, text) is
  'Allows an administrator to change or reset any user account password.';

revoke execute on function public.admin_set_user_password(uuid, text) from public;
revoke execute on function public.admin_set_user_password(uuid, text) from anon;
grant  execute on function public.admin_set_user_password(uuid, text) to authenticated;

