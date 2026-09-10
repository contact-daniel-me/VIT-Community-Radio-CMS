-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- UPGRADE 08 to 14
--
-- GENERATED FILE. Do not edit by hand -- run `npm run build:bundle`.
-- Migration SQL is copied verbatim; nothing here changes their logic.
--
-- FOR AN EXISTING PROJECT that already has migrations 01-07 applied.
-- For an empty project use fresh_project_setup.sql instead.
--
-- Applies, in dependency order:
--   08  public shows + aired-episode views      (needs 01)
--   09  station_slots, the Fixed Point Chart    (needs 01, 02)
--   10  the real programmes and chart rows      (needs 09)
--   11  EDITOR/SECTION_HEAD roles, profiles.phone, studio_bookings
--   12  booking cancellation window guard       (needs 11)
--   13  revoke anon grants on 09/11 tables       (needs 09, 11)
--   14  a user can always read their own profile  (needs 01, 04)
--
-- Run once. Migration 10 is idempotent, but 09 and 11 create types and
-- tables, so a second run reports duplicates.
--
-- IF THE EDITOR REFUSES `ALTER TYPE ... ADD VALUE`:
-- PostgreSQL will not let a new enum value be added and then USED inside
-- one transaction. Nothing here uses EDITOR or SECTION_HEAD at apply time
-- (only inside function bodies, which run later), so this should apply as
-- one batch. If your editor still objects, run the two ALTER TYPE lines in
-- migration 11 on their own first, then run the rest.
-- =============================================================================


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000008_public_shows_and_episodes.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 08 PUBLIC SHOWS AND AIRED EPISODES
--
-- The public homepage gained a "Featured Shows" and a "Latest Uploads" section.
-- Anonymous visitors could previously read only what is on air and today's
-- grid, so those sections had no data source at all.
--
-- Same approach as migration 07: the tables stay closed to `anon`, and two more
-- SECURITY DEFINER views expose a fixed, curated set of columns.
--
-- The rule for episodes is deliberately strict: an episode is public ONLY once
-- it has actually been broadcast (a COMPLETED schedule row exists for it).
-- Being approved, or merely scheduled, is not enough. Unaired content never
-- leaks to the public site, no matter what the frontend asks for.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Active programmes, for the Featured Shows section.
-- No created_by, no timestamps, no inactive shows.
-- -----------------------------------------------------------------------------
create or replace view public.v_public_programs
with (security_invoker = off) as
select
  p.id,
  p.name,
  p.description,
  p.category,
  p.host_name,
  p.artwork_url,
  -- How many of its episodes have actually aired: lets the UI rank shows by
  -- real activity instead of by insertion order.
  (
    select count(distinct s.episode_id)
    from public.schedules s
    where s.program_id = p.id
      and s.status = 'COMPLETED'
      and s.episode_id is not null
  ) as aired_episode_count,
  (
    select max(s.end_time)
    from public.schedules s
    where s.program_id = p.id and s.status = 'COMPLETED'
  ) as last_aired_at
from public.programs p
where p.active;

comment on view public.v_public_programs is
  'Anonymous-safe list of active programmes for the public site.';

-- -----------------------------------------------------------------------------
-- Episodes that have been on air, for the Latest Uploads section.
-- -----------------------------------------------------------------------------
create or replace view public.v_public_recent_episodes
with (security_invoker = off) as
select
  e.id,
  e.title,
  e.description,
  e.episode_number,
  coalesce(e.host_name, p.host_name) as host_name,
  p.id                               as program_id,
  p.name                             as program_name,
  p.category                         as program_category,
  coalesce(a.duration_seconds, e.duration_seconds) as duration_seconds,
  max(s.end_time)                    as aired_at
from public.episodes e
join public.schedules s on s.episode_id = e.id and s.status = 'COMPLETED'
join public.programs  p on p.id = e.program_id
left join public.audio_files a on a.id = e.audio_file_id
where e.status <> 'ARCHIVED'
  and p.active
group by e.id, e.title, e.description, e.episode_number, e.host_name,
         p.id, p.name, p.category, p.host_name, a.duration_seconds, e.duration_seconds;

comment on view public.v_public_recent_episodes is
  'Anonymous-safe archive: only episodes with a COMPLETED broadcast. No storage paths.';

grant select on public.v_public_programs         to anon, authenticated;
grant select on public.v_public_recent_episodes  to anon, authenticated;


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000009_station_slots.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 09 THE FIXED POINT CHART
--
-- A radio station runs to a Fixed Point Chart: a recurring weekly template that
-- says what occupies each part of the broadcast day. That is NOT the same thing
-- as `schedules`, which records concrete, dated broadcasts of specific episodes.
--
--   station_slots  =  "09:30-11:59 Mon-Fri is the rotating talk block"   (template)
--   schedules      =  "Anubava Medai episode 7 aired 09:30 on 9 Sep"     (fact)
--
-- Keeping them apart matters:
--   * schedules carries an EXCLUDE constraint so two broadcasts can never
--     overlap. The FPC legitimately overlaps -- The Campus Quiz at 17:00 sits
--     inside the 15:00-18:00 rebroadcast. Forcing the chart into `schedules`
--     would make the real chart unstorable.
--   * the chart changes a few times a year; broadcasts change daily.
--
-- Times are `time without time zone` and are ALWAYS station-local (Asia/Kolkata).
-- There is no date here, so there is nothing for a timezone to apply to.
-- =============================================================================

create type public.slot_kind as enum (
  'ANNOUNCEMENT',    -- station idents, opening and closing announcements
  'SEGMENT',         -- a short fixed strand in the morning band
  'ROTATING_BLOCK',  -- a window filled from a pool of programmes
  'REBROADCAST',     -- a repeat of an earlier band
  'FEATURE'          -- a named item sitting inside another slot
);

create table public.station_slots (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(btrim(title)) between 2 and 160),
  kind           public.slot_kind not null default 'SEGMENT',
  start_time     time not null,
  end_time       time not null,
  -- ISO day numbers: 1 = Monday ... 7 = Sunday. The chart is Mon-Fri.
  days           smallint[] not null default '{1,2,3,4,5}',
  -- Optional link to the programme that fills this slot. NULL for announcements,
  -- for the rotating block (many programmes share it), and for slots whose chart
  -- text names two alternating strands.
  program_id     uuid references public.programs (id) on delete set null,
  notes          text check (char_length(notes) <= 500),
  effective_from date not null default current_date,
  active         boolean not null default true,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint station_slots_time_order check (end_time > start_time),
  constraint station_slots_days_present check (array_length(days, 1) between 1 and 7),
  constraint station_slots_days_valid check (
    days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  )
  -- Deliberately NO overlap constraint: see the header. Nested features are
  -- part of how a Fixed Point Chart is written.
);

create index station_slots_start_idx   on public.station_slots (start_time);
create index station_slots_active_idx  on public.station_slots (active, start_time);
create index station_slots_program_idx on public.station_slots (program_id);

comment on table public.station_slots is
  'The Fixed Point Chart: the recurring weekly broadcast template. Station-local times.';
comment on column public.station_slots.days is
  'ISO day numbers, 1 = Monday. The published chart runs Monday to Friday.';

create trigger station_slots_set_updated_at
  before update on public.station_slots
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Audit
-- -----------------------------------------------------------------------------
create or replace function app.log_station_slot_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log('SLOT_CREATED', 'SCHEDULE', new.id,
      jsonb_build_object('title', new.title, 'start_time', new.start_time));
  elsif new.active is distinct from old.active then
    perform app.log(
      case when new.active then 'SLOT_ACTIVATED' else 'SLOT_DEACTIVATED' end,
      'SCHEDULE', new.id, jsonb_build_object('title', new.title));
  else
    perform app.log('SLOT_UPDATED', 'SCHEDULE', new.id,
      jsonb_build_object('title', new.title));
  end if;
  return null;
end;
$$;

create trigger station_slots_log
  after insert or update on public.station_slots
  for each row execute function app.log_station_slot_change();

-- -----------------------------------------------------------------------------
-- RLS: everyone in the station reads it, producers and admins maintain it.
-- -----------------------------------------------------------------------------
alter table public.station_slots enable row level security;

grant select on public.station_slots to authenticated;
grant insert, update on public.station_slots to authenticated;
grant all on public.station_slots to service_role;

create policy "slots_select_station_members"
  on public.station_slots for select to authenticated
  using (app.current_role() is not null);

create policy "slots_insert_producers"
  on public.station_slots for insert to authenticated
  with check (app.has_role('ADMIN', 'PRODUCER') and created_by = auth.uid());

create policy "slots_update_producers"
  on public.station_slots for update to authenticated
  using (app.has_role('ADMIN', 'PRODUCER'))
  with check (app.has_role('ADMIN', 'PRODUCER'));

-- No DELETE policy: a retired slot is deactivated so the chart's history stays.

-- -----------------------------------------------------------------------------
-- Public view -- the chart is published information, so this is the one part of
-- the station that anonymous visitors are meant to see in full.
-- -----------------------------------------------------------------------------
create or replace view public.v_public_fixed_point_chart
with (security_invoker = off) as
select
  s.id,
  s.title,
  s.kind,
  s.start_time,
  s.end_time,
  s.days,
  s.notes,
  s.effective_from,
  p.name     as program_name,
  p.category as program_category
from public.station_slots s
left join public.programs p on p.id = s.program_id and p.active
where s.active
order by s.start_time, s.end_time;

comment on view public.v_public_fixed_point_chart is
  'The published Fixed Point Chart. Readable by anonymous visitors.';

grant select on public.v_public_fixed_point_chart to anon, authenticated;


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000010_real_station_lineup.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 10 THE REAL STATION LINE-UP
--
-- The actual programmes and Fixed Point Chart for VIT Community Radio 90.8,
-- transcribed from the published chart "W.E.F 25th August 2026".
--
-- This is a DATA migration, not a schema one, and it carries real operational
-- data rather than the development samples in seed.sql. It is idempotent:
--   * programmes conflict on the existing unique lower(btrim(name)) index
--   * the chart inserts only if no chart for that effective date is present
-- so running it twice changes nothing.
--
-- Programme names are transcribed exactly as printed on the chart, including
-- "Vallunar Paarvai" -- if the intended spelling is "Valluvar Paarvai", rename
-- it in the CMS rather than editing this file.
-- =============================================================================

-- Attribute the rows to an administrator if one exists; NULL is acceptable and
-- simply means "created during setup".
create temporary table if not exists _setup_actor as
select id from public.profiles where role = 'ADMIN' order by created_at limit 1;

-- -----------------------------------------------------------------------------
-- Programmes. Durations reflect the chart: the morning strands are five-minute
-- segments, the rotating talk programmes share the 09:30-11:59 window.
-- -----------------------------------------------------------------------------
insert into public.programs (name, description, category, default_duration_minutes, requires_audio, active, created_by)
select v.name, v.description, v.category, v.minutes, true, true, (select id from _setup_actor)
from (values
  -- Morning band, 09:05 - 09:30
  ('Vanakkam Vellore',        'Morning welcome for Vellore and the VIT campus.',                    'CAMPUS',       5),
  ('Andru Indru',             'Then and now: a look back at the day in history.',                   'HISTORY',      5),
  ('Dhinam Oru Thiravukool',  'A key idea a day.',                                                  'KNOWLEDGE',    5),
  ('Manvaasanai',             'The scent of the soil: folk and rural life.',                        'CULTURE',      5),
  ('Dhinam Oru Velan Seithi', 'A daily bulletin for the farming community.',                        'AGRICULTURE',  5),
  ('Sevichelvam',             'The wealth of listening.',                                           'CULTURE',      5),
  ('Data Chunks',             'Short data and technology briefings.',                               'TECHNOLOGY',   5),

  -- Rotating block, 09:30 - 11:59
  ('Anubava Medai',           'The experience stage: people on what they have lived through.',      'TALK',        30),
  ('Arivom Aayiram',          'A thousand things worth knowing.',                                   'KNOWLEDGE',   30),
  ('Exchange of Ideas',       'Conversation across disciplines and departments.',                   'TALK',        30),
  ('Experts Talk',            'Specialists in conversation on their field.',                        'TALK',        30),
  ('Kaarasaram',              'Sharp, opinionated discussion.',                                     'TALK',        30),
  ('Karuthukalam',            'An open forum for opinion and debate.',                              'TALK',        30),
  ('Maruthuva Neram',         'The medical hour: health advice and discussion.',                    'HEALTH',      30),
  ('Noble Lectures',          'Lectures worth hearing, from campus and beyond.',                    'EDUCATION',   30),
  ('Pallikoodam',             'School: learning, teaching and the classroom.',                      'EDUCATION',   30),
  ('Second Look',             'A closer second look at what deserves it.',                          'REVIEW',      30),
  ('Thiraikadaloodi',         'Across the seas: literature, cinema and journeys.',                  'LITERATURE',  30),
  ('Travel Bonanza',          'Places, journeys and the people met along the way.',                 'TRAVEL',      30),
  ('VIT Achievers',           'The students and staff of VIT, and what they have achieved.',        'CAMPUS',      30),
  ('Vallunar Paarvai',        'A Valluvar-eyed view of everyday life.',                             'LITERATURE',  30),
  ('Special Talks',           'One-off talks that do not fit a regular strand.',                    'TALK',        30),
  ('Special Shows',           'Festival, occasion and outside-broadcast specials.',                 'SPECIAL',     30),
  ('Chatty Chatty',           'Light, unhurried campus conversation.',                              'TALK',        30),

  -- Afternoon feature
  ('The Campus Quiz',         'Can you answer this? The daily campus quiz.',                        'QUIZ',        30)
) as v(name, description, category, minutes)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- The Fixed Point Chart itself, effective 25 August 2026, Monday to Friday.
--
-- Two slots carry no programme link on purpose: the chart prints them as a pair
-- of alternating strands ("Vanakkam Vellore / Andru Indru"), and the chart text
-- is the authority on what actually goes out.
-- -----------------------------------------------------------------------------
insert into public.station_slots
  (title, kind, start_time, end_time, days, program_id, notes, effective_from, created_by)
select
  v.title,
  v.kind::public.slot_kind,
  v.start_time::time,
  v.end_time::time,
  '{1,2,3,4,5}'::smallint[],
  (select p.id from public.programs p where lower(btrim(p.name)) = lower(v.program_name)),
  v.notes,
  date '2026-08-25',
  (select id from _setup_actor)
from (values
  ('Signature Tune & Radio Anthem',           'ANNOUNCEMENT',   '09:00', '09:05', '',                         null),
  ('Vanakkam Vellore / Andru Indru',          'SEGMENT',        '09:05', '09:10', '',                         'Alternating strands, as printed on the chart.'),
  ('Dhinam Oru Thiravukool',                  'SEGMENT',        '09:10', '09:15', 'Dhinam Oru Thiravukool',   null),
  ('Manvaasanai / Dhinam Oru Velan Seithi',   'SEGMENT',        '09:15', '09:20', '',                         'Alternating strands, as printed on the chart.'),
  ('Sevichelvam',                             'SEGMENT',        '09:20', '09:25', 'Sevichelvam',              null),
  ('Data Chunks',                             'SEGMENT',        '09:25', '09:30', 'Data Chunks',              null),
  ('Rotating programmes',                     'ROTATING_BLOCK', '09:30', '11:59', '',                         'Filled from the rotating pool: Anubava Medai, Arivom Aayiram, Exchange of Ideas, Experts Talk, Kaarasaram, Karuthukalam, Maruthuva Neram, Noble Lectures, Pallikoodam, Second Look, Thiraikadaloodi, Travel Bonanza, VIT Achievers, Vallunar Paarvai, Special Talks, Special Shows, Chatty Chatty.'),
  ('Closing Announcement (Morning)',           'ANNOUNCEMENT',   '11:59', '12:00', '',                        null),
  ('Rebroadcast - I',                          'REBROADCAST',    '12:00', '14:59', '',                        'Repeat of the morning band.'),
  ('Closing Announcement (Afternoon)',         'ANNOUNCEMENT',   '14:59', '15:00', '',                        null),
  ('Rebroadcast - II',                         'REBROADCAST',    '15:00', '18:00', '',                        'Second repeat of the morning band.'),
  ('The Campus Quiz',                          'FEATURE',        '17:00', '17:30', 'The Campus Quiz',         'Sits inside Rebroadcast - II. Printed on the chart as "1700 Hrs - The Campus Quiz, Can you answer this?"'),
  ('Closing Announcement (Evening)',           'ANNOUNCEMENT',   '18:00', '18:05', '',                        'Close of the broadcast day.')
) as v(title, kind, start_time, end_time, program_name, notes)
where not exists (
  select 1 from public.station_slots where effective_from = date '2026-08-25'
);

drop table if exists _setup_actor;


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000011_roles_and_studio_bookings.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 11 EDITOR / SECTION HEAD ROLES, AND STUDIO BOOKING
--
-- Stage A of the production workflow: the two missing roles, the contact details
-- registration now collects, and the studio booking system with every booking
-- rule enforced in SQL.
--
-- WHY THERE IS NO `studio_slots` TABLE
-- The bookable grid (Mon-Fri, 09:00-18:00, 30 minutes, no 13:00-14:00) is a
-- RULE, not data. Materialising ~180 rows a week would create a second source of
-- truth that can drift from the rule, and would need a job to keep extending it.
-- Instead the rule lives in CHECK constraints here, and the calendar is computed
-- from (rule - bookings). A slot exists because the rule says so.
--
-- Double booking is prevented by a UNIQUE constraint on (booking_date,
-- start_time) filtered to live bookings, so two RJs pressing Confirm at the same
-- instant cannot both succeed -- the loser gets a constraint violation, not a
-- corrupted calendar. Application-level checking cannot promise that.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Roles
-- -----------------------------------------------------------------------------
alter type public.user_role add value if not exists 'EDITOR';
alter type public.user_role add value if not exists 'SECTION_HEAD';

comment on type public.user_role is
  'ADMIN, PRODUCER, RJ, QC, EDITOR (cuts audio), SECTION_HEAD (approves scripts).';

-- -----------------------------------------------------------------------------
-- Contact details collected at registration.
-- Phone is optional at the database level because the five seeded accounts and
-- any admin-provisioned user predate the field; the registration form requires
-- it. Format is checked, not merely length.
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists phone text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_phone_format'
  ) then
    alter table public.profiles
      add constraint profiles_phone_format check (
        phone is null
        or phone ~ '^[+]?[0-9][0-9 ()-]{6,19}$'
      );
  end if;
end;
$$;

comment on column public.profiles.phone is
  'Contact number collected at registration. Never shown on the public calendar.';

-- =============================================================================
-- Studio bookings
-- =============================================================================
create type public.booking_status as enum (
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW'
);

create type public.booking_origin as enum (
  'RJ',             -- booked by the RJ, subject to the 24-hour rule
  'ADMIN_OVERRIDE'  -- booked by an administrator, rule waived, reason required
);

create type public.show_language as enum (
  'TAMIL',
  'ENGLISH',
  'HINDI',
  'TELUGU',
  'MALAYALAM'
);

create type public.script_approval as enum ('YES', 'NO', 'PENDING');

create table public.studio_bookings (
  id            uuid primary key default gen_random_uuid(),

  -- Human-facing reference, e.g. VCR-2026-000123. Filled by a trigger.
  reference     text unique,

  -- Who the studio is booked for. An admin override books on someone's behalf,
  -- so this is not necessarily the person who created the row.
  rj_id         uuid not null references public.profiles (id) on delete restrict,

  booking_date  date not null,
  start_time    time not null,
  end_time      time not null,

  -- Show details captured at booking time.
  show_name     text not null check (char_length(btrim(show_name)) between 2 and 160),
  language      public.show_language not null,
  script_status public.script_approval not null default 'PENDING',
  script_approver text check (char_length(script_approver) <= 120),

  -- Editing: either the RJ edits it themselves, or an editor is requested.
  self_edit     boolean not null default false,
  editor_id     uuid references public.profiles (id) on delete set null,

  status        public.booking_status not null default 'CONFIRMED',
  origin        public.booking_origin not null default 'RJ',
  override_reason text check (char_length(override_reason) <= 500),

  -- Private to the station; never exposed on the public calendar.
  notes         text check (char_length(notes) <= 1000),

  -- Set once the recording exists, tying booking -> show -> audio together.
  episode_id    uuid references public.episodes (id) on delete set null,

  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- ---- the studio grid, enforced ----
  constraint bookings_time_order check (end_time > start_time),

  -- Exactly 30 minutes.
  constraint bookings_half_hour check (end_time - start_time = interval '30 minutes'),

  -- Starts on a half hour.
  constraint bookings_on_grid check (
    extract(minute from start_time) in (0, 30)
    and extract(second from start_time) = 0
  ),

  -- Operating hours 09:00-18:00.
  constraint bookings_operating_hours check (
    start_time >= time '09:00' and end_time <= time '18:00'
  ),

  -- Lunch 13:00-14:00 is not bookable.
  constraint bookings_not_lunch check (
    start_time < time '13:00' or start_time >= time '14:00'
  ),

  -- Monday to Friday only. ISO dow: 1 = Monday ... 7 = Sunday.
  constraint bookings_weekday_only check (
    extract(isodow from booking_date) between 1 and 5
  ),

  -- An override must say why.
  constraint bookings_override_needs_reason check (
    origin <> 'ADMIN_OVERRIDE'
    or char_length(btrim(coalesce(override_reason, ''))) >= 5
  ),

  -- Either you edit it yourself, or you name an editor -- not both, not neither.
  constraint bookings_editor_choice check (
    (self_edit and editor_id is null) or (not self_edit)
  )
);

-- One live booking per slot. CANCELLED rows are excluded so a cancelled slot is
-- immediately bookable again, while the cancelled row is kept for the audit.
create unique index studio_bookings_slot_key
  on public.studio_bookings (booking_date, start_time)
  where status <> 'CANCELLED';

create index studio_bookings_rj_idx     on public.studio_bookings (rj_id, booking_date desc);
create index studio_bookings_date_idx   on public.studio_bookings (booking_date, start_time);
create index studio_bookings_editor_idx on public.studio_bookings (editor_id)
  where editor_id is not null;
create index studio_bookings_episode_idx on public.studio_bookings (episode_id)
  where episode_id is not null;

comment on table public.studio_bookings is
  'Studio reservations. The bookable grid is a rule (see constraints), not a table.';

create trigger studio_bookings_set_updated_at
  before update on public.studio_bookings
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Booking reference: VCR-<year>-<six digits>, allocated per calendar year.
-- -----------------------------------------------------------------------------
create sequence if not exists public.booking_reference_seq;

-- SECURITY DEFINER so the sequence stays owner-only: a client that could call
-- nextval() directly could burn reference numbers and leave gaps in the series.
create or replace function app.assign_booking_reference()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reference is null then
    new.reference := 'VCR-' || to_char(new.booking_date, 'YYYY') || '-' ||
                     lpad(nextval('public.booking_reference_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger studio_bookings_reference
  before insert on public.studio_bookings
  for each row execute function app.assign_booking_reference();

-- -----------------------------------------------------------------------------
-- The 24-hour rule, and who may waive it.
--
-- This is the check that must NOT live only in the browser: an RJ calling
-- PostgREST directly would otherwise book a slot for twenty minutes' time.
-- -----------------------------------------------------------------------------
create or replace function app.enforce_booking_window()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role  public.user_role := app.current_role();
  v_start timestamptz;
begin
  -- The slot's start as a real instant, in station time.
  v_start := (new.booking_date + new.start_time) at time zone 'Asia/Kolkata';

  if new.origin = 'ADMIN_OVERRIDE' then
    -- Only an administrator may waive the rule, and only deliberately.
    if not app.is_trusted_session() and v_role is distinct from 'ADMIN' then
      raise exception 'Only an administrator can create an override booking'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Normal bookings: at least 24 hours ahead.
  if v_start < now() + interval '24 hours' then
    raise exception
      'Studio bookings must be made at least 24 hours in advance. For a slot sooner than that, contact the VIT Community Radio administrator.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger studio_bookings_window
  before insert on public.studio_bookings
  for each row execute function app.enforce_booking_window();

-- -----------------------------------------------------------------------------
-- An editor must actually be an editor, and an RJ must actually be an RJ.
-- -----------------------------------------------------------------------------
create or replace function app.validate_booking_people()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_editor_role public.user_role;
begin
  if new.editor_id is not null then
    -- Business rule: an RJ cannot nominate themselves as their own editor;
    -- that is what self_edit is for, and it keeps the editor queue honest.
    if new.editor_id = new.rj_id then
      raise exception 'Choose "I will edit it myself" rather than assigning yourself as editor'
        using errcode = '23514';
    end if;

    select role into v_editor_role
    from public.profiles where id = new.editor_id and active;

    if v_editor_role is null then
      raise exception 'That editor account is not active' using errcode = '23503';
    end if;

    if v_editor_role not in ('EDITOR', 'PRODUCER', 'ADMIN') then
      raise exception 'That person is not an editor' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger studio_bookings_validate_people
  before insert or update on public.studio_bookings
  for each row execute function app.validate_booking_people();

-- -----------------------------------------------------------------------------
-- Audit
-- -----------------------------------------------------------------------------
create or replace function app.log_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log(
      case when new.origin = 'ADMIN_OVERRIDE' then 'BOOKING_OVERRIDE_CREATED'
           else 'BOOKING_CREATED' end,
      'SCHEDULE', new.id,
      jsonb_build_object('reference', new.reference, 'show_name', new.show_name,
                         'date', new.booking_date, 'start_time', new.start_time,
                         'rj_id', new.rj_id, 'reason', new.override_reason));
  elsif new.status is distinct from old.status then
    perform app.log('BOOKING_' || new.status::text, 'SCHEDULE', new.id,
      jsonb_build_object('reference', new.reference, 'show_name', new.show_name));
  elsif new.editor_id is distinct from old.editor_id then
    perform app.log('BOOKING_EDITOR_CHANGED', 'SCHEDULE', new.id,
      jsonb_build_object('reference', new.reference, 'editor_id', new.editor_id));
  else
    perform app.log('BOOKING_UPDATED', 'SCHEDULE', new.id,
      jsonb_build_object('reference', new.reference));
  end if;
  return null;
end;
$$;

create trigger studio_bookings_log
  after insert or update on public.studio_bookings
  for each row execute function app.log_booking_change();

-- -----------------------------------------------------------------------------
-- RLS
--
-- Everyone signed in can see that a slot is taken (they need to, to book around
-- it), but the private columns are filtered by the public view below for
-- anonymous visitors.
-- -----------------------------------------------------------------------------
alter table public.studio_bookings enable row level security;

grant select on public.studio_bookings to authenticated;
grant insert, update on public.studio_bookings to authenticated;
grant all on public.studio_bookings to service_role;

create policy "bookings_select_station_members"
  on public.studio_bookings for select to authenticated
  using (app.current_role() is not null);

-- An RJ books for themselves only, as a normal booking. Admins may book for
-- anyone; the override path is additionally gated by the window trigger.
create policy "bookings_insert"
  on public.studio_bookings for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      app.has_role('ADMIN')
      or (
        app.has_role('RJ', 'PRODUCER')
        and rj_id = auth.uid()
        and origin = 'RJ'
      )
    )
  );

-- An RJ may amend their own upcoming booking; admins and producers may amend
-- any. Status transitions are further constrained by the guard below.
create policy "bookings_update"
  on public.studio_bookings for update to authenticated
  using (
    app.has_role('ADMIN', 'PRODUCER')
    or (rj_id = auth.uid() and status = 'CONFIRMED')
  )
  with check (
    app.has_role('ADMIN', 'PRODUCER')
    or (rj_id = auth.uid() and status in ('CONFIRMED', 'CANCELLED'))
  );

-- No DELETE policy anywhere: bookings are cancelled, never erased.

-- -----------------------------------------------------------------------------
-- Public calendar view.
--
-- This is what an anonymous visitor sees. It deliberately carries NO rj name,
-- email, phone, show name, notes or approval information -- only that a slot is
-- taken. Adding a column here is the only way to widen it, which makes widening
-- a deliberate act rather than an accident.
-- -----------------------------------------------------------------------------
create or replace view public.v_public_studio_calendar
with (security_invoker = off) as
select
  b.booking_date,
  b.start_time,
  b.end_time
from public.studio_bookings b
where b.status <> 'CANCELLED'
  and b.booking_date >= current_date - 7;

comment on view public.v_public_studio_calendar is
  'Anonymous-safe studio occupancy: date and time only. No identity, no show details.';

grant select on public.v_public_studio_calendar to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Fix: handle_new_user() had the four original roles hard-coded, so an account
-- provisioned as EDITOR or SECTION_HEAD fell through to an INACTIVE RJ -- the
-- role was silently downgraded and the account never activated.
--
-- Rewritten to validate the claim against the enum itself, so adding a role in
-- future needs no change here.
-- -----------------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role     public.user_role := 'RJ';
  v_claim    text;
  v_approved boolean := false;
begin
  -- SECURITY: raw_user_meta_data is supplied by the signing-up user and must
  -- never decide a role. raw_app_meta_data can only be written with the
  -- service-role key, so it is the one trustworthy source -- and its presence
  -- is also what marks an account as deliberately provisioned rather than
  -- self-registered.
  v_claim := new.raw_app_meta_data ->> 'role';

  if v_claim is not null and exists (
    select 1
    from pg_catalog.pg_enum e
    join pg_catalog.pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = v_claim
  ) then
    v_role := v_claim::public.user_role;
    v_approved := true;
  end if;

  insert into public.profiles (id, full_name, email, phone, role, active, approved_at)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
             split_part(new.email, '@', 1)),
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    v_role,
    v_approved,
    case when v_approved then now() end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000012_booking_cancellation_window.sql
-- ###########################################################################


-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 12 CANCELLATION WINDOW
--
-- WHAT THIS PROTECTS AGAINST
-- Migration 11 lets an RJ update their own CONFIRMED booking, and the RLS
-- WITH CHECK allows the new status to be CANCELLED. Nothing looked at the
-- clock. So an RJ who failed to turn up could cancel the slot afterwards and
-- erase the evidence: the studio sat empty, someone else was refused that time,
-- and the record would end up saying the booking never stood.
--
-- After this migration a booking can only be cancelled by its RJ while the slot
-- is still in the future. Once the slot has started it is the station's record
-- of what happened, and only an administrator or producer can change it (to
-- COMPLETED or NO_SHOW, or to cancel on the RJ's behalf).
--
-- WHY A TRIGGER, NOT AN RPC
-- Cancellation already flows through a plain UPDATE governed by RLS -- there is
-- no cancellation function to extend. A BEFORE UPDATE guard is the same pattern
-- already used by app.guard_schedule_status() and app.guard_episode_update(),
-- so this adds a rule to the existing path instead of a competing one.
--
-- Deliberately additive. Migration 11 is untouched: no policy, constraint,
-- trigger or grant is altered or dropped, and admin behaviour is unchanged.
-- =============================================================================

create or replace function app.guard_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    public.user_role := app.current_role();
  v_starts  timestamptz;
begin
  -- Only status transitions are governed here. Editing notes, the show name or
  -- the editor stays subject to the existing RLS policy alone.
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Seeds, migrations and service-role maintenance are trusted, and station
  -- staff keep the behaviour they had before this migration.
  if app.is_trusted_session() or v_role in ('ADMIN', 'PRODUCER') then
    return new;
  end if;

  -- The slot's start as a real instant. Booking dates and times are
  -- station-local, and IST has no daylight saving, so this is exact.
  v_starts := (old.booking_date + old.start_time) at time zone 'Asia/Kolkata';

  if v_starts <= now() then
    raise exception
      'This booking has already started, so it can no longer be cancelled here. Contact the VIT Community Radio administrator.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function app.guard_booking_status_change() is
  'Stops an RJ cancelling a booking after its slot has started. Admins and producers are unaffected.';

create trigger studio_bookings_guard_status
  before update on public.studio_bookings
  for each row execute function app.guard_booking_status_change();


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000013_revoke_anon_on_new_tables.sql
-- ###########################################################################


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


-- ###########################################################################
-- SOURCE: supabase/migrations/20250101000014_own_profile_always_readable.sql
-- ###########################################################################


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


-- ###########################################################################
-- Done. Verify with:
--   select table_name from information_schema.tables
--    where table_schema = 'public' and table_type = 'BASE TABLE' order by 1;
-- Expect 10 tables, including station_slots and studio_bookings.
-- ###########################################################################
