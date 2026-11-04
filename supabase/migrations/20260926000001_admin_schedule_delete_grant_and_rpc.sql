-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- ADMIN SCHEDULE DELETE GRANT & RPC
--
-- Enables administrators to delete broadcast schedules.
-- 1. Grants DELETE on public.schedules to authenticated role so RLS can take effect.
-- 2. Ensures public.schedules RLS delete policy restricts deletion to administrators.
-- 3. Provides public.delete_schedule(p_schedule_id uuid) RPC.
-- =============================================================================

-- 1. Grant delete on schedules to authenticated
grant delete on public.schedules to authenticated;

-- 2. Ensure RLS policy restricts deletion strictly to ADMIN
drop policy if exists "schedules_delete_admin" on public.schedules;
create policy "schedules_delete_admin"
  on public.schedules for delete to authenticated
  using (app.has_role('ADMIN'));

-- 3. Dedicated security definer RPC for safe schedule deletion
create or replace function public.delete_schedule(p_schedule_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.schedule_status;
begin
  -- Restrict to ADMIN
  if not app.has_role('ADMIN') and not app.is_trusted_session() then
    raise exception 'Only administrators can delete schedule slots'
      using errcode = '42501';
  end if;

  select status into v_status from public.schedules where id = p_schedule_id;
  if not found then
    raise exception 'Schedule slot not found' using errcode = 'P0002';
  end if;

  if v_status = 'ON_AIR' then
    raise exception 'Cannot delete a broadcast that is currently on air. End the broadcast first.'
      using errcode = '23514';
  end if;

  delete from public.schedules where id = p_schedule_id;
end;
$$;

comment on function public.delete_schedule(uuid) is
  'Allows administrators to delete a broadcast schedule slot.';

grant execute on function public.delete_schedule(uuid) to authenticated;

