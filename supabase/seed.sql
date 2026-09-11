-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- DEVELOPMENT SEED
--
-- !! DEVELOPMENT DATA ONLY !!
-- Every account below uses the same well-known password and every record is
-- marked as sample data. Never run this file against a production project.
--
-- Dev password for all accounts: radio-dev-2025
--
--   admin@vitradio.dev      ADMIN      Ananya Krishnan
--   producer@vitradio.dev   PRODUCER   Rohit Menon
--   rj.sneha@vitradio.dev   RJ         Sneha Iyer
--   rj.karthik@vitradio.dev RJ         Karthik Rao
--   qc@vitradio.dev         QC         Meera Nair
--
-- Extra Admin:
--   vitcr@vit.ac.in         ADMIN      (password: growiota@vitcr)
--
-- The audio rows point at storage paths that are NOT uploaded by this script.
-- Playback of seeded episodes will 404 until a real file is uploaded through
-- the app -- that is expected, and keeps the seed free of binary blobs.
-- =============================================================================

begin;

-- Seeding legitimately writes states that the workflow normally owns, so the
-- guard triggers are told this transaction is a workflow transaction.
select set_config('app.workflow', 'on', true);

-- -----------------------------------------------------------------------------
-- Auth users. The on_auth_user_created trigger creates the matching profiles;
-- roles come from raw_app_meta_data, which is the service-role-only field.
-- -----------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@vitradio.dev',
   extensions.crypt('radio-dev-2025', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"ADMIN"}'::jsonb,
   '{"full_name":"Ananya Krishnan"}'::jsonb, now(), now()),

  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'producer@vitradio.dev',
   extensions.crypt('radio-dev-2025', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"PRODUCER"}'::jsonb,
   '{"full_name":"Rohit Menon"}'::jsonb, now(), now()),

  ('33333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rj.sneha@vitradio.dev',
   extensions.crypt('radio-dev-2025', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"RJ"}'::jsonb,
   '{"full_name":"Sneha Iyer"}'::jsonb, now(), now()),

  ('44444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rj.karthik@vitradio.dev',
   extensions.crypt('radio-dev-2025', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"RJ"}'::jsonb,
   '{"full_name":"Karthik Rao"}'::jsonb, now(), now()),

   ('55555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'qc@vitradio.dev',
   extensions.crypt('radio-dev-2025', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"QC"}'::jsonb,
   '{"full_name":"Meera Nair"}'::jsonb, now(), now()),

  ('66666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'vitcr@vit.ac.in',
   extensions.crypt('growiota@vitcr', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"],"role":"ADMIN"}'::jsonb,
   '{"full_name":"VIT Community Radio"}'::jsonb, now(), now())
on conflict (id) do nothing;

-- GoTrue scans the token columns of auth.users into non-nullable Go strings, so
-- a NULL left by a hand-written INSERT makes every login fail with
-- "Database error querying schema" (HTTP 500). They must be empty strings, not
-- NULL. The column list differs between GoTrue versions, so each one is
-- normalised only if it exists rather than being named in the INSERT above.
do $$
declare
  v_col text;
begin
  foreach v_col in array array[
    'confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
    'email_change_token_current', 'phone_change', 'phone_change_token',
    'reauthentication_token'
  ]
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = v_col
    ) then
      execute format(
        'update auth.users set %I = coalesce(%I, %L) where email like %L or email = %L',
        v_col, v_col, '', '%@vitradio.dev', 'vitcr@vit.ac.in'
      );
    end if;
  end loop;
end;
$$;

-- Email/password identity rows, required by GoTrue for password sign-in.
insert into auth.identities (user_id, provider_id, provider, identity_data, created_at, updated_at)
select u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now()
from auth.users u
where u.email like '%@vitradio.dev' or u.email = 'vitcr@vit.ac.in'
on conflict (provider, provider_id) do nothing;

-- -----------------------------------------------------------------------------
-- Programs
-- -----------------------------------------------------------------------------
insert into public.programs
  (id, name, description, host_name, category, default_duration_minutes,
   requires_audio, active, created_by)
values
  ('a0000000-0000-4000-8000-000000000001', 'VIT Campus Connect',
   'SAMPLE DATA. Weekly round-up of campus news, notices and student initiatives.',
   'Sneha Iyer', 'CAMPUS NEWS', 60, true, true, '22222222-2222-4222-8222-222222222222'),

  ('a0000000-0000-4000-8000-000000000002', 'Campus Pulse',
   'SAMPLE DATA. Music, requests and dedications from across the VIT hostels.',
   'Karthik Rao', 'MUSIC', 60, true, true, '22222222-2222-4222-8222-222222222222'),

  ('a0000000-0000-4000-8000-000000000003', 'VIT Voices',
   'SAMPLE DATA. Long-form interviews with faculty, alumni and student leaders.',
   'Rohit Menon', 'TALK', 45, true, true, '22222222-2222-4222-8222-222222222222'),

  ('a0000000-0000-4000-8000-000000000004', 'Student Spotlight',
   'SAMPLE DATA. One student, one story, every week.',
   'Sneha Iyer', 'FEATURE', 30, true, true, '11111111-1111-4111-8111-111111111111'),

  -- Kept inactive so business rule 9 (no new schedules for inactive programs)
  -- is visible in the dev data.
  ('a0000000-0000-4000-8000-000000000005', 'Exam Week Special',
   'SAMPLE DATA. Runs only during end-semester exams. Currently off the air.',
   'Rohit Menon', 'SEASONAL', 30, false, false, '11111111-1111-4111-8111-111111111111')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Episodes, covering every content state
-- -----------------------------------------------------------------------------
insert into public.episodes
  (id, program_id, title, description, episode_number, host_name, assigned_rj,
   status, submitted_at, reviewed_at, duration_seconds, created_by)
values
  -- APPROVED, already broadcast
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Orientation Week Round-Up', 'SAMPLE DATA. Everything first-years need to know.',
   12, 'Sneha Iyer', '33333333-3333-4333-8333-333333333333',
   'APPROVED', now() - interval '5 days', now() - interval '4 days', 3480,
   '33333333-3333-4333-8333-333333333333'),

  -- APPROVED, aired earlier today
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
   'Hostel Request Hour', 'SAMPLE DATA. Top ten requests from Q block.',
   34, 'Karthik Rao', '44444444-4444-4444-8444-444444444444',
   'APPROVED', now() - interval '3 days', now() - interval '2 days', 3550,
   '44444444-4444-4444-8444-444444444444'),

  -- APPROVED, in the current slot
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003',
   'In Conversation: Robotics Club', 'SAMPLE DATA. Building a Mars rover in Vellore.',
   7, 'Rohit Menon', '33333333-3333-4333-8333-333333333333',
   'APPROVED', now() - interval '2 days', now() - interval '1 day', 2650,
   '22222222-2222-4222-8222-222222222222'),

  -- APPROVED, scheduled next
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004',
   'The Girl Who Codes at 3 AM', 'SAMPLE DATA. A final-year student on her open-source work.',
   19, 'Sneha Iyer', '33333333-3333-4333-8333-333333333333',
   'APPROVED', now() - interval '2 days', now() - interval '1 day', 1760,
   '33333333-3333-4333-8333-333333333333'),

  -- PENDING_QC, waiting on the QC desk
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001',
   'Placement Season Explained', 'SAMPLE DATA. What the placement calendar means for you.',
   13, 'Sneha Iyer', '33333333-3333-4333-8333-333333333333',
   'PENDING_QC', now() - interval '6 hours', null, 3300,
   '33333333-3333-4333-8333-333333333333'),

  -- PENDING_QC, second item in the queue
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000002',
   'Retro Bollywood Hour', 'SAMPLE DATA. Playlist from the 90s.',
   35, 'Karthik Rao', '44444444-4444-4444-8444-444444444444',
   'PENDING_QC', now() - interval '2 hours', null, 3600,
   '44444444-4444-4444-8444-444444444444'),

  -- REJECTED, needs a re-record
  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000003',
   'Alumni Special (draft cut)', 'SAMPLE DATA. Interview with a 2018 alumnus.',
   8, 'Rohit Menon', '44444444-4444-4444-8444-444444444444',
   'REJECTED', now() - interval '2 days', now() - interval '1 day', 2400,
   '44444444-4444-4444-8444-444444444444'),

  -- DRAFT, still being written
  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000004',
   'Spotlight: Athletics Meet', 'SAMPLE DATA. Script in progress, no audio yet.',
   20, 'Sneha Iyer', '33333333-3333-4333-8333-333333333333',
   'DRAFT', null, null, null,
   '33333333-3333-4333-8333-333333333333'),

  -- ARCHIVED, retired from rotation
  ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001',
   'Freshers Special 2023', 'SAMPLE DATA. Retired, kept for the archive.',
   1, 'Sneha Iyer', null,
   'ARCHIVED', now() - interval '400 days', now() - interval '399 days', 3000,
   '22222222-2222-4222-8222-222222222222')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Audio metadata. Paths follow episodes/{episode_id}/{filename}.
-- -----------------------------------------------------------------------------
insert into public.audio_files
  (id, episode_id, file_name, storage_path, mime_type, file_size, duration_seconds, uploaded_by)
values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'campus-connect-12.mp3',
   'episodes/b0000000-0000-4000-8000-000000000001/campus-connect-12.mp3',
   'audio/mpeg', 55680000, 3480, '33333333-3333-4333-8333-333333333333'),

  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   'campus-pulse-34.mp3',
   'episodes/b0000000-0000-4000-8000-000000000002/campus-pulse-34.mp3',
   'audio/mpeg', 56800000, 3550, '44444444-4444-4444-8444-444444444444'),

  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
   'vit-voices-07.mp3',
   'episodes/b0000000-0000-4000-8000-000000000003/vit-voices-07.mp3',
   'audio/mpeg', 42400000, 2650, '22222222-2222-4222-8222-222222222222'),

  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004',
   'spotlight-19.mp3',
   'episodes/b0000000-0000-4000-8000-000000000004/spotlight-19.mp3',
   'audio/mpeg', 28160000, 1760, '33333333-3333-4333-8333-333333333333'),

  ('c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000005',
   'campus-connect-13.mp3',
   'episodes/b0000000-0000-4000-8000-000000000005/campus-connect-13.mp3',
   'audio/mpeg', 52800000, 3300, '33333333-3333-4333-8333-333333333333'),

  ('c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000006',
   'campus-pulse-35.mp3',
   'episodes/b0000000-0000-4000-8000-000000000006/campus-pulse-35.mp3',
   'audio/mpeg', 57600000, 3600, '44444444-4444-4444-8444-444444444444'),

  ('c0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000007',
   'vit-voices-08-cut1.mp3',
   'episodes/b0000000-0000-4000-8000-000000000007/vit-voices-08-cut1.mp3',
   'audio/mpeg', 38400000, 2400, '44444444-4444-4444-8444-444444444444'),

  ('c0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000009',
   'freshers-2023.mp3',
   'episodes/b0000000-0000-4000-8000-000000000009/freshers-2023.mp3',
   'audio/mpeg', 48000000, 3000, '22222222-2222-4222-8222-222222222222')
on conflict (id) do nothing;

-- Point each episode at its current audio file.
update public.episodes e
   set audio_file_id = a.id
  from public.audio_files a
 where a.episode_id = e.id
   and e.audio_file_id is null;

-- -----------------------------------------------------------------------------
-- QC history
-- -----------------------------------------------------------------------------
insert into public.qc_reviews (episode_id, reviewer_id, decision, comment, created_at)
values
  ('b0000000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555',
   'APPROVED', 'Levels are clean, content approved for air.', now() - interval '4 days'),
  ('b0000000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555',
   'APPROVED', 'Good to go.', now() - interval '2 days'),
  ('b0000000-0000-4000-8000-000000000003', '55555555-5555-4555-8555-555555555555',
   'APPROVED', 'Approved. Trim the intro next time.', now() - interval '1 day'),
  ('b0000000-0000-4000-8000-000000000004', '55555555-5555-4555-8555-555555555555',
   'APPROVED', 'Lovely piece, approved.', now() - interval '1 day'),
  ('b0000000-0000-4000-8000-000000000007', '55555555-5555-4555-8555-555555555555',
   'REJECTED', 'Background hum through the middle section and the guest name is mispronounced at 04:12. Please re-record and resubmit.',
   now() - interval '1 day')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Schedule grid. Times are relative to now() so the dev data always looks live.
-- -----------------------------------------------------------------------------
insert into public.schedules
  (id, program_id, episode_id, start_time, end_time, status, notes, created_by)
values
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000001',
   now() - interval '1 day 6 hours', now() - interval '1 day 5 hours',
   'COMPLETED', 'SAMPLE DATA. Aired yesterday evening.',
   '22222222-2222-4222-8222-222222222222'),

  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
   'b0000000-0000-4000-8000-000000000002',
   now() - interval '3 hours', now() - interval '2 hours',
   'COMPLETED', 'SAMPLE DATA. Aired earlier today.',
   '22222222-2222-4222-8222-222222222222'),

  -- The slot covering "now": ready for an operator to press Go Live.
  ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003',
   'b0000000-0000-4000-8000-000000000003',
   now() - interval '15 minutes', now() + interval '30 minutes',
   'SCHEDULED', 'SAMPLE DATA. Current slot.',
   '22222222-2222-4222-8222-222222222222'),

  ('d0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004',
   'b0000000-0000-4000-8000-000000000004',
   now() + interval '1 hour', now() + interval '1 hour 30 minutes',
   'SCHEDULED', 'SAMPLE DATA. Next up.',
   '11111111-1111-4111-8111-111111111111'),

  -- A live slot with no pre-recorded episode.
  ('d0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002',
   null,
   now() + interval '1 day', now() + interval '1 day 1 hour',
   'SCHEDULED', 'SAMPLE DATA. Live request show, no pre-recorded audio.',
   '22222222-2222-4222-8222-222222222222')
on conflict (id) do nothing;

-- The station starts offline. Going on air is an explicit operator action.
update public.broadcast_state
   set status = 'OFFLINE', current_schedule_id = null, started_at = null, updated_at = now()
 where id;

select set_config('app.workflow', 'off', true);

commit;
