-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 14 A USER CAN ALWAYS READ THEIR OWN PROFILE
--
-- WHAT THIS FIXES
-- `profiles_select_station_members` (migration 04) gates reads on
-- app.current_role(), which returns NULL for an inactive profile. That is
-- correct for everyone else's data, but it also hid the reader's OWN row -- so
-- a pending registrant could read nothing at all, not even the record that says
-- they are pending.
--
-- The consequence only appears once email confirmation is switched off. With
-- confirmation on, a self-registered account could never obtain a session, so
-- the case was unreachable. Without it the account signs in immediately, and
-- authService.getProfile() -- which is written to say "your access request is
-- still waiting for approval" -- instead received NULL and reported
-- "We could not find that item."
--
-- This adds a second SELECT policy. PostgreSQL ORs permissive policies
-- together, so the existing one is untouched and nothing else widens: the new
-- clause is `id = auth.uid()`, which is the caller's own row and nobody else's.
--
-- Deactivated staff are equally covered, and get the accurate message
-- ("this account has been deactivated") rather than a confusing not-found.
-- =============================================================================

create policy "profiles_select_own_always"
  on public.profiles for select to authenticated
  using (id = auth.uid());

comment on policy "profiles_select_own_always" on public.profiles is
  'A signed-in user can always read their own row, including while pending approval or deactivated.';
