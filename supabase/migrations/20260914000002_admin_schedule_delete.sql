create policy "schedules_delete_admin"
  on public.schedules for delete to authenticated
  using (app.has_role('ADMIN'));
