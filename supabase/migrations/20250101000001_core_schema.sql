-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 01 CORE SCHEMA
-- Tables, enums, constraints and indexes.
--
-- Design notes (deviations from the naive spec are deliberate):
--   * episode_status covers the CONTENT lifecycle only. SCHEDULED / ON_AIR /
--     COMPLETED are properties of a BROADCAST (schedules), not of the content:
--     one approved episode may be scheduled many times (reruns).
--   * qc_reviews is an append-only ledger, so QC history stays traceable.
--   * episodes.audio_file_id is a "current version" pointer; audio_files.episode_id
--     is the ownership link. A trigger keeps the pointer honest.
--   * broadcast_state is a single enforced row: "is the station actually live",
--     which the schedule alone cannot answer.
-- =============================================================================

create schema if not exists app;
comment on schema app is 'Internal helper functions for the radio CMS (not exposed via the API).';

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('ADMIN', 'PRODUCER', 'RJ', 'QC');

create type public.episode_status as enum (
  'DRAFT',       -- being written / audio being attached
  'PENDING_QC',  -- submitted, waiting for a QC decision (content frozen)
  'APPROVED',    -- cleared by QC, eligible for scheduling (content frozen)
  'REJECTED',    -- sent back with a mandatory comment, editable again
  'ARCHIVED'     -- retired; never deleted, so history and logs stay intact
);

create type public.qc_decision as enum ('APPROVED', 'REJECTED');

create type public.schedule_status as enum ('SCHEDULED', 'ON_AIR', 'COMPLETED', 'CANCELLED');

create type public.broadcast_status as enum ('OFFLINE', 'ON_AIR');

-- -----------------------------------------------------------------------------
-- profiles : one row per Supabase Auth user
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(btrim(full_name)) between 1 and 120),
  email       text not null unique check (position('@' in email) > 1),
  role        public.user_role not null default 'RJ',
  avatar_url  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role) where active;

comment on table public.profiles is 'Application profile for each auth user. Role drives every RLS policy.';
comment on column public.profiles.active is 'Soft lock. Inactive users keep their history but lose all access.';

-- -----------------------------------------------------------------------------
-- programs : a recurring radio show
-- -----------------------------------------------------------------------------
create table public.programs (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (char_length(btrim(name)) between 2 and 120),
  description              text check (char_length(description) <= 2000),
  host_name                text check (char_length(host_name) <= 120),
  category                 text not null default 'GENERAL'
                             check (char_length(btrim(category)) between 2 and 40),
  artwork_url              text,
  -- Renamed from `default_duration` so the unit is unambiguous in every caller.
  default_duration_minutes integer not null default 30
                             check (default_duration_minutes between 5 and 360),
  -- Business rule 4: some slots are live and legitimately carry no audio file.
  requires_audio           boolean not null default true,
  active                   boolean not null default true,
  created_by               uuid references public.profiles (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create unique index programs_name_key on public.programs (lower(btrim(name)));
create index programs_active_idx on public.programs (active);

comment on table public.programs is 'A radio show. Deactivated rather than deleted (business rule 13).';

-- -----------------------------------------------------------------------------
-- episodes : one instalment of a program
-- -----------------------------------------------------------------------------
create table public.episodes (
  id               uuid primary key default gen_random_uuid(),
  program_id       uuid not null references public.programs (id) on delete restrict,
  title            text not null check (char_length(btrim(title)) between 2 and 200),
  description      text check (char_length(description) <= 4000),
  episode_number   integer check (episode_number > 0),
  host_name        text check (char_length(host_name) <= 120),
  -- The RJ responsible for this episode. Drives the "assigned content" RLS rule.
  assigned_rj      uuid references public.profiles (id) on delete set null,
  audio_file_id    uuid,  -- FK added below (audio_files does not exist yet)
  duration_seconds integer check (duration_seconds > 0 and duration_seconds <= 21600),
  status           public.episode_status not null default 'DRAFT',
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index episodes_program_number_key
  on public.episodes (program_id, episode_number)
  where episode_number is not null;
create index episodes_program_idx    on public.episodes (program_id);
create index episodes_status_idx     on public.episodes (status);
create index episodes_created_by_idx on public.episodes (created_by);
create index episodes_assigned_idx   on public.episodes (assigned_rj);
create index episodes_pending_idx    on public.episodes (submitted_at) where status = 'PENDING_QC';

comment on column public.episodes.status is
  'Content lifecycle only. Broadcast lifecycle lives in schedules.status.';
comment on column public.episodes.audio_file_id is
  'Pointer to the current audio_files row for this episode. Validated by a trigger.';

-- -----------------------------------------------------------------------------
-- audio_files : metadata only. The bytes live in Supabase Storage.
-- -----------------------------------------------------------------------------
create table public.audio_files (
  id               uuid primary key default gen_random_uuid(),
  episode_id       uuid not null references public.episodes (id) on delete cascade,
  file_name        text not null check (char_length(btrim(file_name)) between 1 and 255),
  -- Path inside the `radio-audio` bucket: episodes/{episode_id}/{filename}
  storage_path     text not null unique check (storage_path like 'episodes/%'),
  mime_type        text not null check (mime_type in (
                     'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
                     'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/ogg')),
  file_size        bigint not null check (file_size > 0 and file_size <= 209715200), -- 200 MB
  duration_seconds integer check (duration_seconds > 0 and duration_seconds <= 21600),
  uploaded_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index audio_files_episode_idx on public.audio_files (episode_id);

alter table public.episodes
  add constraint episodes_audio_file_id_fkey
  foreign key (audio_file_id) references public.audio_files (id) on delete set null;

comment on table public.audio_files is
  'Audio metadata. Binary data is never stored in PostgreSQL -- see the radio-audio bucket.';

-- -----------------------------------------------------------------------------
-- qc_reviews : append-only decision ledger
-- -----------------------------------------------------------------------------
create table public.qc_reviews (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null references public.episodes (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  decision    public.qc_decision not null,
  comment     text check (char_length(comment) <= 2000),
  created_at  timestamptz not null default now(),
  -- A rejection without an explanation is useless to the person who must fix it.
  constraint qc_reviews_rejection_needs_comment
    check (decision <> 'REJECTED' or char_length(btrim(coalesce(comment, ''))) >= 5)
);

create index qc_reviews_episode_idx on public.qc_reviews (episode_id, created_at desc);

comment on table public.qc_reviews is
  'Immutable QC history. No UPDATE/DELETE policy exists for any role.';

-- -----------------------------------------------------------------------------
-- schedules : a broadcast slot on the single station channel
-- -----------------------------------------------------------------------------
create table public.schedules (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs (id) on delete restrict,
  -- NULL = live slot with no pre-recorded episode.
  episode_id  uuid references public.episodes (id) on delete restrict,
  start_time  timestamptz not null,
  end_time    timestamptz not null,
  status      public.schedule_status not null default 'SCHEDULED',
  notes       text check (char_length(notes) <= 1000),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint schedules_time_order check (end_time > start_time),
  constraint schedules_sane_duration check (end_time - start_time <= interval '6 hours'),
  -- One station, one channel: two live slots can never overlap. Enforced by the
  -- database so that two admins saving at the same moment cannot double-book.
  constraint schedules_no_overlap exclude using gist (
    tstzrange(start_time, end_time, '[)') with &&
  ) where (status <> 'CANCELLED')
);

create index schedules_start_idx   on public.schedules (start_time);
create index schedules_status_idx  on public.schedules (status);
create index schedules_program_idx on public.schedules (program_id);
create index schedules_episode_idx on public.schedules (episode_id);

-- -----------------------------------------------------------------------------
-- broadcast_state : enforced singleton -- "is the station actually on air now?"
-- -----------------------------------------------------------------------------
create table public.broadcast_state (
  id                  boolean primary key default true check (id),
  status              public.broadcast_status not null default 'OFFLINE',
  current_schedule_id uuid references public.schedules (id) on delete set null,
  started_at          timestamptz,
  updated_by          uuid references public.profiles (id) on delete set null,
  updated_at          timestamptz not null default now(),
  constraint broadcast_state_consistent check (
    (status = 'OFFLINE' and current_schedule_id is null and started_at is null)
    or
    (status = 'ON_AIR' and current_schedule_id is not null and started_at is not null)
  )
);

insert into public.broadcast_state (id) values (true);

comment on table public.broadcast_state is
  'Exactly one row (id is boolean and CHECKed true). Station live state.';

-- -----------------------------------------------------------------------------
-- activity_logs : meaningful business actions only
-- -----------------------------------------------------------------------------
create table public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete set null,
  action      text not null check (char_length(btrim(action)) between 3 and 60),
  entity_type text not null check (entity_type in
                ('PROGRAM', 'EPISODE', 'AUDIO_FILE', 'SCHEDULE', 'BROADCAST', 'PROFILE')),
  -- Intentionally NOT a foreign key: audit rows must outlive what they describe.
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index activity_logs_created_idx on public.activity_logs (created_at desc);
create index activity_logs_entity_idx  on public.activity_logs (entity_type, entity_id);
create index activity_logs_user_idx    on public.activity_logs (user_id, created_at desc);

comment on table public.activity_logs is
  'Business-level audit trail. Written only by SECURITY DEFINER code, never by clients.';
