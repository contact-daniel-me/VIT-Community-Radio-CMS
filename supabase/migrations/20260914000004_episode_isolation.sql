-- 20260914000004_episode_isolation.sql

-- Drop the old overly permissive policy
DROP POLICY IF EXISTS "episodes_select_station_members" ON public.episodes;

-- Create the new, strict policy
CREATE POLICY "episodes_select_isolated"
  ON public.episodes FOR SELECT TO authenticated
  USING (
    app.has_role('ADMIN', 'PRODUCER', 'QC')
    OR created_by = auth.uid()
    OR assigned_rj = auth.uid()
  );
