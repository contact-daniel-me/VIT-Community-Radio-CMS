-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- PARTICULAR SLOT BLOCKING FOR STUDIO HOLIDAYS
--
-- Adds support for blocking specific time slots on a date rather than only
-- full-day closures. Enforces slot-level blocking in SQL trigger.
-- =============================================================================

alter table public.studio_holidays
  add column if not exists slots text[] default null;

comment on column public.studio_holidays.slots is
  'Optional array of specific slot start times (e.g. {09:00, 09:30}) to block. NULL means all-day block.';

-- -----------------------------------------------------------------------------
-- Updated validation: allow non-overlapping slot blocks on the same date
-- -----------------------------------------------------------------------------
create or replace function app.validate_holiday_dates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.end_date < new.start_date then
    raise exception 'Holiday end date cannot be earlier than start date.'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.studio_holidays
    where id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(start_date, end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
      and (
        slots is null or cardinality(slots) = 0
        or new.slots is null or cardinality(new.slots) = 0
        or slots && new.slots
      )
  ) then
    raise exception 'A holiday or closure has already been scheduled that overlaps with this date range.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Updated booking check: block only matching slots if slots array is set
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
