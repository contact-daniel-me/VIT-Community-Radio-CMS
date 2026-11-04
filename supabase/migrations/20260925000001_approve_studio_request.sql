-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- APPROVE STUDIO BOOKING REQUESTS
--
-- Enables Station Staff (Administrators and Producers) to approve pending studio
-- booking requests atomically.
-- Implements public.approve_booking_request(p_request_id uuid) RPC.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RPC function to approve a studio booking request atomically
-- -----------------------------------------------------------------------------
create or replace function public.approve_booking_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req record;
  v_caller_role public.user_role := app.current_role();
  v_booking_id uuid;
  v_reference text;
begin
  -- 1. Check permissions: must be ADMIN or PRODUCER
  if not app.is_trusted_session() and v_caller_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only administrators and producers can approve booking requests'
      using errcode = '42501';
  end if;

  -- 2. Fetch the request
  select * into v_req
  from public.studio_booking_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Booking request not found.' using errcode = 'P0002';
  end if;

  if v_req.status <> 'PENDING' then
    raise exception 'Request is no longer pending (current status: %)', v_req.status
      using errcode = '23514';
  end if;

  -- 3. Check if slot is already occupied by a confirmed booking
  if exists (
    select 1 from public.studio_bookings
    where booking_date = v_req.booking_date
      and start_time = v_req.start_time
      and status <> 'CANCELLED'
  ) then
    raise exception 'This studio slot was just taken by someone else. Please pick another time.'
      using errcode = '23505';
  end if;

  -- 4. Enable trusted workflow context for audit and triggers
  perform set_config('app.workflow', 'on', true);

  -- 5. Create confirmed booking
  insert into public.studio_bookings (
    rj_id,
    booking_date,
    start_time,
    end_time,
    program_id,
    language,
    script_status,
    script_approver,
    self_edit,
    editor_id,
    notes,
    origin,
    override_reason,
    created_by
  ) values (
    v_req.user_id,
    v_req.booking_date,
    v_req.start_time,
    v_req.end_time,
    v_req.program_id,
    v_req.language,
    v_req.script_status,
    v_req.script_approver,
    v_req.self_edit,
    case when v_req.self_edit then null else v_req.editor_id end,
    v_req.notes,
    'ADMIN_OVERRIDE',
    'Approved booking request',
    auth.uid()
  )
  returning id, reference into v_booking_id, v_reference;

  -- 6. Mark request as APPROVED
  update public.studio_booking_requests
  set status = 'APPROVED',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'reference', v_reference,
    'request_id', p_request_id,
    'status', 'APPROVED'
  );
end;
$$;

comment on function public.approve_booking_request(uuid) is
  'Approves a pending studio booking request atomically and creates the confirmed booking.';

grant execute on function public.approve_booking_request(uuid) to authenticated;
