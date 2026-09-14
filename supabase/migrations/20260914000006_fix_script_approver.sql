alter table public.studio_booking_requests
drop constraint if exists studio_booking_requests_script_approver_fkey;

alter table public.studio_booking_requests
alter column script_approver type text;
