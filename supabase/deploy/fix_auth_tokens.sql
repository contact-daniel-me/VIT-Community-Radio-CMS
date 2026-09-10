-- =============================================================================
-- PATCH: make hand-seeded auth.users rows loginable
--
-- Symptom this fixes:
--   POST /auth/v1/token?grant_type=password
--   -> 500 {"error_code":"unexpected_failure","msg":"Database error querying schema"}
--
-- Cause: GoTrue reads the token columns of auth.users into non-nullable Go
-- strings. A row inserted by hand leaves them NULL, the scan fails, and every
-- login 500s -- for the seeded accounts only; accounts created through the
-- dashboard or the admin API are unaffected.
--
-- Safe to run more than once. Only touches @vitradio.dev development accounts.
-- Already folded into supabase/seed.sql, so a fresh seed will not need it.
--
-- Run in: Supabase Dashboard -> SQL Editor -> Run
-- =============================================================================

do $$
declare
  v_col text; 
  v_fixed integer := 0;
begin
  foreach v_col in array array[
    'confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
    'email_change_token_current', 'phone_change', 'phone_change_token',
    'reauthentication_token'
  ]
  loop
    -- The column list varies between GoTrue versions, so each is patched only
    -- if this project actually has it.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = v_col
    ) then
      execute format(
        'update auth.users set %I = coalesce(%I, %L) where email like %L',
        v_col, v_col, '', '%@vitradio.dev'
      );
      v_fixed := v_fixed + 1;
    end if;
  end loop;

  raise notice 'Normalised % token column(s) on the seeded accounts.', v_fixed;
end;
$$;

-- Confirm the seeded accounts are now well formed.
select
  email,
  raw_app_meta_data ->> 'role' as role,
  email_confirmed_at is not null as confirmed,
  (select count(*) from auth.identities i where i.user_id = u.id) as identities
from auth.users u
where email like '%@vitradio.dev'
order by email;
