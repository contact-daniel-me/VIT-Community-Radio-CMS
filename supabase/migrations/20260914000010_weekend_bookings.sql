-- Drop the constraint that restricts studio bookings to weekdays
alter table public.studio_bookings drop constraint if exists bookings_weekday_only;
