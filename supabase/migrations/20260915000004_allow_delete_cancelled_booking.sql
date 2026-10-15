-- Allow admins and owners of cancelled/rejected bookings and requests to permanently delete them

drop policy if exists "studio_bookings_delete_admin" on public.studio_bookings;
create policy "studio_bookings_delete_admin_or_own_cancelled"
  on public.studio_bookings for delete to authenticated
  using (app.is_admin() or (rj_id = auth.uid() and status = 'CANCELLED'));

drop policy if exists "studio_booking_requests_delete" on public.studio_booking_requests;
create policy "studio_booking_requests_delete"
  on public.studio_booking_requests for delete to authenticated
  using (app.is_admin() or (user_id = auth.uid() and status in ('CANCELLED', 'REJECTED')));
