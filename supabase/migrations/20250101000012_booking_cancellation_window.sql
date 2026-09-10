-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 12 CANCELLATION WINDOW
--
-- WHAT THIS PROTECTS AGAINST
-- Migration 11 lets an RJ update their own CONFIRMED booking, and the RLS
-- WITH CHECK allows the new status to be CANCELLED. Nothing looked at the
-- clock. So an RJ who failed to turn up could cancel the slot afterwards and
-- erase the evidence: the studio sat empty, someone else was refused that time,
-- and the record would end up saying the booking never stood.
--
-- After this migration a booking can only be cancelled by its RJ while the slot
-- is still in the future. Once the slot has started it is the station's record
-- of what happened, and only an administrator or producer can change it (to
-- COMPLETED or NO_SHOW, or to cancel on the RJ's behalf).
--
-- WHY A TRIGGER, NOT AN RPC
-- Cancellation already flows through a plain UPDATE governed by RLS -- there is
-- no cancellation function to extend. A BEFORE UPDATE guard is the same pattern
-- already used by app.guard_schedule_status() and app.guard_episode_update(),
-- so this adds a rule to the existing path instead of a competing one.
--
-- Deliberately additive. Migration 11 is untouched: no policy, constraint,
-- trigger or grant is altered or dropped, and admin behaviour is unchanged.
-- =============================================================================

create or replace function app.guard_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    public.user_role := app.current_role();
  v_starts  timestamptz;
begin
  -- Only status transitions are governed here. Editing notes, the show name or
  -- the editor stays subject to the existing RLS policy alone.
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Seeds, migrations and service-role maintenance are trusted, and station
  -- staff keep the behaviour they had before this migration.
  if app.is_trusted_session() or v_role in ('ADMIN', 'PRODUCER') then
    return new;
  end if;

  -- The slot's start as a real instant. Booking dates and times are
  -- station-local, and IST has no daylight saving, so this is exact.
  v_starts := (old.booking_date + old.start_time) at time zone 'Asia/Kolkata';

  if v_starts <= now() then
    raise exception
      'This booking has already started, so it can no longer be cancelled here. Contact the VIT Community Radio administrator.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function app.guard_booking_status_change() is
  'Stops an RJ cancelling a booking after its slot has started. Admins and producers are unaffected.';

create trigger studio_bookings_guard_status
  before update on public.studio_bookings
  for each row execute function app.guard_booking_status_change();
