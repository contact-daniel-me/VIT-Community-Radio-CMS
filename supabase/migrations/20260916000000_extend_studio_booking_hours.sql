-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- EXTEND STUDIO BOOKING OPERATING HOURS UP TO 8 PM
--
-- Extends studio recording operating hours from 18:00 (6:00 PM) to 20:00 (8:00 PM).
-- Bookings can now be placed in 30-minute slots up to 20:00.
-- =============================================================================

alter table public.studio_bookings drop constraint if exists bookings_operating_hours;

alter table public.studio_bookings add constraint bookings_operating_hours check (
  start_time >= time '09:00' and end_time <= time '20:00'
);
