-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 22 ADMINISTRATOR BOOKING OVERRIDE
--
-- Enables administrators to manually book any time slot:
-- 1. Book past dates, current date, and future dates.
-- 2. Bypass standard operating hours (before 09:00 or after 20:00).
-- 3. Book during lunch breaks (13:00 - 14:00).
-- 4. Bypass holiday and maintenance closures.
-- 5. Bypass the 24-hour advance booking restriction.
-- 6. Support overlapping bookings for administrators with separate recording.
-- 7. Record detailed audit log entries for all overrides.
-- 8. Add studio selection column.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Studio selection column on studio_bookings
-- -----------------------------------------------------------------------------
alter table public.studio_bookings
  add column if not exists studio_name text default 'Studio 1';

comment on column public.studio_bookings.studio_name is
  'Studio identifier/name for multi-studio facility (e.g. Studio 1, Studio 2, Studio 3).';

-- -----------------------------------------------------------------------------
-- 2. Operating hours check: allow ADMIN_OVERRIDE outside 09:00 - 20:00
-- -----------------------------------------------------------------------------
alter table public.studio_bookings drop constraint if exists bookings_operating_hours;
alter table public.studio_bookings add constraint bookings_operating_hours check (
  origin = 'ADMIN_OVERRIDE'
  or (start_time >= time '09:00' and end_time <= time '20:00')
);

-- -----------------------------------------------------------------------------
-- 3. Lunch break check: allow ADMIN_OVERRIDE during 13:00 - 14:00
-- -----------------------------------------------------------------------------
alter table public.studio_bookings drop constraint if exists bookings_not_lunch;
alter table public.studio_bookings add constraint bookings_not_lunch check (
  origin = 'ADMIN_OVERRIDE'
  or (start_time < time '13:00' or start_time >= time '14:00')
);

-- -----------------------------------------------------------------------------
-- 4. Override reason: minimum 5 characters if provided
-- -----------------------------------------------------------------------------
alter table public.studio_bookings drop constraint if exists bookings_override_needs_reason;
alter table public.studio_bookings add constraint bookings_override_needs_reason check (
  origin <> 'ADMIN_OVERRIDE'
  or char_length(btrim(coalesce(override_reason, ''))) >= 5
);

-- -----------------------------------------------------------------------------
-- 5. Allow overlapping bookings for ADMIN_OVERRIDE while preventing double-booking for regular users
-- -----------------------------------------------------------------------------
drop index if exists public.studio_bookings_slot_key;
create unique index studio_bookings_slot_key
  on public.studio_bookings (booking_date, start_time)
  where status <> 'CANCELLED' and origin <> 'ADMIN_OVERRIDE';

-- Trigger function to ensure regular users cannot double book even if an admin override exists
create or replace function app.prevent_regular_double_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.origin <> 'ADMIN_OVERRIDE' then
    if exists (
      select 1 from public.studio_bookings
      where booking_date = new.booking_date
        and start_time = new.start_time
        and status <> 'CANCELLED'
        and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) then
      raise exception 'duplicate key value violates unique constraint "studio_bookings_slot_key"'
        using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists studio_bookings_prevent_regular_double_booking on public.studio_bookings;
create trigger studio_bookings_prevent_regular_double_booking
  before insert or update on public.studio_bookings
  for each row execute function app.prevent_regular_double_booking();

-- -----------------------------------------------------------------------------
-- 6. Holiday closures: allow ADMIN_OVERRIDE to bypass
-- -----------------------------------------------------------------------------
create or replace function app.enforce_holiday_closure()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  slot_time text;
  matched_holiday record;
begin
  -- Administrator override on studio_bookings bypasses holiday and scheduled closures
  if (to_jsonb(new) ->> 'origin') = 'ADMIN_OVERRIDE' then
    if not app.is_trusted_session() and app.current_role() is distinct from 'ADMIN' then
      raise exception 'Only an administrator can create an override booking'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if (TG_OP = 'INSERT' or (TG_OP = 'UPDATE' and (new.booking_date <> old.booking_date or new.start_time <> old.start_time))) then
    slot_time := to_char(new.start_time, 'HH24:MI');
    select id, slots into matched_holiday
    from public.studio_holidays
    where new.booking_date between start_date and end_date
      and (
        slots is null
        or cardinality(slots) = 0
        or slot_time = any(slots)
      )
    limit 1;

    if matched_holiday.id is not null then
      if matched_holiday.slots is not null and cardinality(matched_holiday.slots) > 0 then
        raise exception 'Studio bookings are unavailable for this slot due to a scheduled holiday or closure.'
          using errcode = '23514';
      else
        raise exception 'Studio bookings are unavailable on this date due to a holiday or scheduled closure.'
          using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Audit logging: capture all 8 required override audit fields
-- -----------------------------------------------------------------------------
create or replace function app.log_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start_ist timestamptz;
  v_prev_status text := 'AVAILABLE';
  v_override_type text := 'STANDARD_OVERRIDE';
  v_existing_count int := 0;
  v_is_holiday boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.origin = 'ADMIN_OVERRIDE' then
      -- 1. Check if the slot was already booked (overlapping booking)
      select count(*) into v_existing_count
      from public.studio_bookings
      where booking_date = new.booking_date
        and start_time = new.start_time
        and status <> 'CANCELLED'
        and id <> new.id;

      -- 2. Check if the slot was blocked by a holiday
      select exists (
        select 1 from public.studio_holidays
        where new.booking_date between start_date and end_date
          and (
            slots is null
            or cardinality(slots) = 0
            or to_char(new.start_time, 'HH24:MI') = any(slots)
          )
      ) into v_is_holiday;

      -- 3. Check start time in IST
      v_start_ist := (new.booking_date + new.start_time) at time zone 'Asia/Kolkata';

      -- Determine previous slot status and override type
      if v_existing_count > 0 then
        v_prev_status := 'BOOKED';
        v_override_type := 'OVERLAPPING_BOOKING';
      elsif v_is_holiday then
        v_prev_status := 'BLOCKED';
        v_override_type := 'HOLIDAY_OVERRIDE';
      elsif new.start_time >= time '13:00' and new.start_time < time '14:00' then
        v_prev_status := 'LUNCH';
        v_override_type := 'LUNCH_BREAK_OVERRIDE';
      elsif new.start_time < time '09:00' or new.start_time >= time '20:00' then
        v_prev_status := 'OUTSIDE_HOURS';
        v_override_type := 'OUTSIDE_OPERATING_HOURS';
      elsif v_start_ist < now() then
        v_prev_status := 'PAST';
        v_override_type := 'PAST_DATE_OVERRIDE';
      elsif v_start_ist < now() + interval '24 hours' then
        v_prev_status := 'NOTICE';
        v_override_type := 'INSIDE_24_HOURS_OVERRIDE';
      else
        v_prev_status := 'AVAILABLE';
        v_override_type := 'ADMIN_MANUAL_OVERRIDE';
      end if;

      perform app.log(
        'BOOKING_OVERRIDE_CREATED',
        'SCHEDULE',
        new.id,
        jsonb_build_object(
          'reference', new.reference,
          'administrator_id', coalesce(auth.uid(), new.created_by),
          'booking_id', new.id,
          'booking_date', new.booking_date,
          'selected_time_slot', to_char(new.start_time, 'HH24:MI') || ' - ' || to_char(new.end_time, 'HH24:MI'),
          'override_reason', coalesce(new.override_reason, 'Administrator manual override'),
          'previous_slot_status', v_prev_status,
          'override_type', v_override_type,
          'booking_timestamp', now(),
          'studio_name', coalesce(new.studio_name, 'Studio 1'),
          'rj_id', new.rj_id,
          'program_id', new.program_id
        )
      );
    else
      perform app.log(
        'BOOKING_CREATED',
        'SCHEDULE',
        new.id,
        jsonb_build_object(
          'reference', new.reference,
          'program_id', new.program_id,
          'date', new.booking_date,
          'start_time', new.start_time,
          'rj_id', new.rj_id,
          'studio_name', coalesce(new.studio_name, 'Studio 1')
        )
      );
    end if;
  elsif new.status is distinct from old.status then
    perform app.log('BOOKING_' || new.status::text, 'SCHEDULE', new.id,
      jsonb_build_object('reference', new.reference, 'program_id', new.program_id));
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

-- -----------------------------------------------------------------------------
-- 8. Distinct public calendar view (handles overlapping bookings cleanly)
-- -----------------------------------------------------------------------------
create or replace view public.v_public_studio_calendar
with (security_invoker = off) as
select distinct
  b.booking_date,
  b.start_time,
  b.end_time
from public.studio_bookings b
where b.status <> 'CANCELLED';

grant select on public.v_public_studio_calendar to anon, authenticated;
