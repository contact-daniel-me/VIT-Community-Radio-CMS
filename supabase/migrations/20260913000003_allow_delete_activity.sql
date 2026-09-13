-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- ALLOW ADMINS TO DELETE ACTIVITY LOGS
-- =============================================================================

-- Allow Administrators to delete rows from activity_logs
create policy "activity_logs_delete_admin"
  on public.activity_logs for delete to authenticated
  using (app.has_role('ADMIN'));
