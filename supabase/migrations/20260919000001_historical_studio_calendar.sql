-- -----------------------------------------------------------------------------
-- Enable historical studio calendar occupancy.
--
-- Previously, v_public_studio_calendar had:
--   and b.booking_date >= current_date - 7;
-- which truncated occupied slots older than 7 days from the calendar view.
--
-- This migration updates the view without the 7-day cutoff so administrators
-- and station members can view past occupancy across previous weeks, months, and years.
-- -----------------------------------------------------------------------------
create or replace view public.v_public_studio_calendar
with (security_invoker = off) as
select
  b.booking_date,
  b.start_time,
  b.end_time
from public.studio_bookings b
where b.status <> 'CANCELLED';

comment on view public.v_public_studio_calendar is
  'Anonymous-safe studio occupancy: date and time only. No identity, no show details.';

grant select on public.v_public_studio_calendar to anon, authenticated;
