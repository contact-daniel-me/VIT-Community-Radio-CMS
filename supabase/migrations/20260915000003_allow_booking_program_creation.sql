-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- ALLOW ALL USERS TO CREATE PROGRAMS FOR BOOKINGS
-- =============================================================================

-- 1. Allow all authenticated users (including RJ) to create programs
-- when booking custom shows or special links.
drop policy if exists "programs_insert_producers" on public.programs;

create policy "programs_insert_authenticated"
  on public.programs for insert to authenticated
  with check (created_by = auth.uid());

-- 2. Ensure fallback programs exist for "Other Show" and "Special Link"
insert into public.programs (name, description, category, default_duration_minutes, requires_audio, active)
values
  ('Other Show', 'Custom and other studio shows', 'SPECIAL', 30, true, true),
  ('Special Link', 'Special link studio broadcasts', 'SPECIAL', 30, true, true)
on conflict (lower(btrim(name))) do nothing;
