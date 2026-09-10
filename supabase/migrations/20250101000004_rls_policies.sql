-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 04 ROW LEVEL SECURITY
--
-- This file is the real security boundary. The React app only decides what to
-- draw; the database decides what is allowed. Every policy below was written
-- against the assumption that an attacker holds a valid JWT and is calling
-- PostgREST directly with curl.
--
-- Note on FORCE ROW LEVEL SECURITY: it is deliberately NOT used. Tables are
-- owned by `postgres`, and the SECURITY DEFINER workflow functions run as that
-- owner. FORCE would apply policies to the owner too and break them. Clients
-- never connect as the owner -- they connect as `anon` or `authenticated`.
--
-- `anon` gets nothing at all. This is an internal station tool.
-- A deactivated profile makes app.current_role() return NULL, which fails every
-- USING clause below: deactivation is an immediate, database-level cut-off.
-- =============================================================================

alter table public.profiles       enable row level security;
alter table public.programs       enable row level security;
alter table public.episodes       enable row level security;
alter table public.audio_files    enable row level security;
alter table public.qc_reviews     enable row level security;
alter table public.schedules      enable row level security;
alter table public.broadcast_state enable row level security;
alter table public.activity_logs  enable row level security;

-- -----------------------------------------------------------------------------
-- Base grants. Without these, RLS policies never even get evaluated.
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

revoke all on all tables in schema public from anon;

grant select on all tables in schema public to authenticated;
grant insert, update on public.programs    to authenticated;
grant insert, update on public.episodes    to authenticated;
grant insert, update, delete on public.audio_files to authenticated;
grant insert, update on public.schedules   to authenticated;
grant update on public.profiles            to authenticated;
grant all on all tables in schema public to service_role;

-- =============================================================================
-- profiles
-- =============================================================================
create policy "profiles_select_station_members"
  on public.profiles for select to authenticated
  using (app.current_role() is not null);

-- A user may edit their own name and avatar. The guard trigger in migration 02
-- rejects any attempt to change `role` or `active` without being an admin, and
-- rejects even an admin changing their own -- so self-escalation is impossible
-- through this policy.
create policy "profiles_update_self_or_admin"
  on public.profiles for update to authenticated
  using (id = auth.uid() or app.is_admin())
  with check (id = auth.uid() or app.is_admin());

-- No INSERT policy: profiles are created by the on_auth_user_created trigger.
-- No DELETE policy: users are deactivated, never deleted (business rule 13).

-- =============================================================================
-- programs
-- =============================================================================
create policy "programs_select_station_members"
  on public.programs for select to authenticated
  using (app.current_role() is not null);

create policy "programs_insert_producers"
  on public.programs for insert to authenticated
  with check (app.has_role('ADMIN', 'PRODUCER') and created_by = auth.uid());

create policy "programs_update_producers"
  on public.programs for update to authenticated
  using (app.has_role('ADMIN', 'PRODUCER'))
  with check (app.has_role('ADMIN', 'PRODUCER'));

-- No DELETE policy: deactivate instead.

-- =============================================================================
-- episodes
-- =============================================================================
create policy "episodes_select_station_members"
  on public.episodes for select to authenticated
  using (app.current_role() is not null);

create policy "episodes_insert_content_roles"
  on public.episodes for insert to authenticated
  with check (
    app.has_role('ADMIN', 'PRODUCER', 'RJ')
    and created_by = auth.uid()
    and status = 'DRAFT'
  );

-- app.can_edit_episode() encodes ownership AND the content freeze:
-- only DRAFT/REJECTED episodes are writable, and an RJ only reaches their own
-- or assigned episodes. QC can never write content.
create policy "episodes_update_owner_or_producer"
  on public.episodes for update to authenticated
  using (app.can_edit_episode(id))
  with check (app.can_edit_episode(id));

-- No DELETE policy: archive instead.

-- =============================================================================
-- audio_files
-- =============================================================================
create policy "audio_select_station_members"
  on public.audio_files for select to authenticated
  using (app.current_role() is not null);

create policy "audio_insert_episode_editors"
  on public.audio_files for insert to authenticated
  with check (app.can_edit_episode(episode_id) and uploaded_by = auth.uid());

create policy "audio_update_episode_editors"
  on public.audio_files for update to authenticated
  using (app.can_edit_episode(episode_id))
  with check (app.can_edit_episode(episode_id));

create policy "audio_delete_episode_editors"
  on public.audio_files for delete to authenticated
  using (app.can_edit_episode(episode_id));

-- =============================================================================
-- qc_reviews -- readable by all, written only by approve_episode/reject_episode
-- =============================================================================
create policy "qc_reviews_select_station_members"
  on public.qc_reviews for select to authenticated
  using (app.current_role() is not null);

-- Intentionally no INSERT / UPDATE / DELETE policy. The QC ledger is immutable
-- and can only grow through the SECURITY DEFINER workflow functions.

-- =============================================================================
-- schedules
-- =============================================================================
create policy "schedules_select_station_members"
  on public.schedules for select to authenticated
  using (app.current_role() is not null);

create policy "schedules_insert_producers"
  on public.schedules for insert to authenticated
  with check (app.has_role('ADMIN', 'PRODUCER') and created_by = auth.uid());

-- Times and notes may be edited directly; `status` changes are blocked by the
-- guard trigger and must go through start_broadcast/end_broadcast/cancel_schedule.
create policy "schedules_update_producers"
  on public.schedules for update to authenticated
  using (app.has_role('ADMIN', 'PRODUCER'))
  with check (app.has_role('ADMIN', 'PRODUCER'));

-- No DELETE policy: cancel instead.

-- =============================================================================
-- broadcast_state -- read by everyone, written only by the broadcast functions
-- =============================================================================
create policy "broadcast_state_select_station_members"
  on public.broadcast_state for select to authenticated
  using (app.current_role() is not null);

-- =============================================================================
-- activity_logs -- append-only audit trail
-- =============================================================================
create policy "activity_logs_select_scoped"
  on public.activity_logs for select to authenticated
  using (
    app.has_role('ADMIN', 'PRODUCER')
    or (app.current_role() is not null and user_id = auth.uid())
  );

-- Intentionally no write policy of any kind: only app.log() (SECURITY DEFINER)
-- inserts here, so the audit trail cannot be forged or erased by a client.
