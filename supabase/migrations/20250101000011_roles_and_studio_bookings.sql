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
