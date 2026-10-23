-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- STUDIO HOLIDAYS AND CLOSURES
--
-- Enables administrators to block studio bookings on selected dates or ranges.
-- Enforces closure in SQL so direct API calls cannot book blocked dates.
-- =============================================================================

create table if not exists public.studio_holidays (
  id          uuid primary key default gen_random_uuid(),
  start_date  date not null,
  end_date    date not null,
  reason      text check (char_length(btrim(reason)) <= 255),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint studio_holidays_date_order check (end_date >= start_date)
);

create index if not exists studio_holidays_dates_idx
  on public.studio_holidays (start_date, end_date);

comment on table public.studio_holidays is
  'Studio holidays and scheduled maintenance closures blocking reservations.';

-- -----------------------------------------------------------------------------
-- Validation: date ordering and non-overlapping ranges
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
  ) then
    raise exception 'A holiday or closure has already been scheduled that overlaps with this date range.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists studio_holidays_validate on public.studio_holidays;
create trigger studio_holidays_validate
  before insert or update on public.studio_holidays
  for each row execute function app.validate_holiday_dates();

-- -----------------------------------------------------------------------------
-- Updated_at trigger
-- -----------------------------------------------------------------------------
drop trigger if exists studio_holidays_set_updated_at on public.studio_holidays;
create trigger studio_holidays_set_updated_at
  before update on public.studio_holidays
  for each row execute function app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.studio_holidays enable row level security;

drop policy if exists "Holidays are readable by everyone" on public.studio_holidays;
create policy "Holidays are readable by everyone"
  on public.studio_holidays for select
  using (true);

drop policy if exists "Only administrators can insert holidays" on public.studio_holidays;
create policy "Only administrators can insert holidays"
  on public.studio_holidays for insert
  with check (app.current_role() = 'ADMIN');

drop policy if exists "Only administrators can update holidays" on public.studio_holidays;
create policy "Only administrators can update holidays"
  on public.studio_holidays for update
  using (app.current_role() = 'ADMIN')
  with check (app.current_role() = 'ADMIN');

drop policy if exists "Only administrators can delete holidays" on public.studio_holidays;
create policy "Only administrators can delete holidays"
  on public.studio_holidays for delete
  using (app.current_role() = 'ADMIN');

grant select on public.studio_holidays to anon, authenticated;
grant insert, update, delete on public.studio_holidays to authenticated;
grant select, insert, update, delete on public.studio_booking_requests to authenticated;

-- -----------------------------------------------------------------------------
-- Prevent bookings and booking requests on blocked dates
-- -----------------------------------------------------------------------------
create or replace function app.enforce_holiday_closure()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (TG_OP = 'INSERT' or (TG_OP = 'UPDATE' and new.booking_date <> old.booking_date)) then
    if exists (
      select 1 from public.studio_holidays
      where new.booking_date between start_date and end_date
    ) then
      raise exception 'Studio bookings are unavailable on this date due to a holiday or scheduled closure.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists studio_bookings_holiday_check on public.studio_bookings;
create trigger studio_bookings_holiday_check
  before insert or update on public.studio_bookings
  for each row execute function app.enforce_holiday_closure();

drop trigger if exists studio_booking_requests_holiday_check on public.studio_booking_requests;
create trigger studio_booking_requests_holiday_check
  before insert or update on public.studio_booking_requests
  for each row execute function app.enforce_holiday_closure();
