-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 13 CLOSE THE anon GRANTS ON LATER TABLES
--
-- WHAT THIS FIXES
-- Migration 04 ran `revoke all on all tables in schema public from anon`, which
-- only affects tables that existed AT THAT MOMENT. Supabase ships a default
-- privilege rule --
--     alter default privileges in schema public grant all on tables
--       to anon, authenticated, service_role;
-- -- so every table created afterwards is born with ALL privileges granted to
-- anon again. `station_slots` (09) and `studio_bookings` (11) were created
-- later and therefore carried SELECT, INSERT, UPDATE, DELETE and TRUNCATE for
-- anonymous visitors.
--
-- Nothing leaked: RLS is enabled on both tables and neither has a policy for
-- anon, so every anonymous read returned zero rows and every write was refused.
-- This is defence in depth, not an incident. But the grant is one accidental
-- permissive policy -- or one `disable row level security` -- away from being a
-- real hole, and the intent of migration 04 was that anon holds nothing.
--
-- Found by inspecting the live database after deploying 08-12. It does not
-- reproduce in the test harness, because PGlite has no Supabase default
-- privileges: there is nothing there to re-grant. That is exactly why this
-- check belongs against a real project.
--
-- NOTE FOR FUTURE MIGRATIONS: any new table in `public` needs its own
-- `revoke all ... from anon`, or it inherits the same grants.
-- =============================================================================

revoke all on public.station_slots from anon;
revoke all on public.studio_bookings from anon;

-- The public views are meant to be readable by anonymous visitors -- that is the
-- whole point of them -- but only readable. They were granted ALL for the same
-- reason, so reset them to SELECT alone.
revoke all on public.v_public_now_playing        from anon;
revoke all on public.v_public_schedule_today     from anon;
revoke all on public.v_public_programs           from anon;
revoke all on public.v_public_recent_episodes    from anon;
revoke all on public.v_public_fixed_point_chart  from anon;
revoke all on public.v_public_studio_calendar    from anon;

grant select on public.v_public_now_playing        to anon;
grant select on public.v_public_schedule_today     to anon;
grant select on public.v_public_programs           to anon;
grant select on public.v_public_recent_episodes    to anon;
grant select on public.v_public_fixed_point_chart  to anon;
grant select on public.v_public_studio_calendar    to anon;
