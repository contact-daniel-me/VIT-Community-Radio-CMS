create policy "studio_bookings_delete_admin"
  on public.studio_bookings for delete to authenticated
  using (app.is_admin());
