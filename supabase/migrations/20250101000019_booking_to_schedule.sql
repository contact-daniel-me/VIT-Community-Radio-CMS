-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 19 AUTOMATIC SCHEDULE CREATION FROM BOOKINGS
-- =============================================================================

-- 1. Add program_id to studio_bookings
alter table public.studio_bookings
add column program_id uuid references public.programs (id) on delete restrict;

-- 2. Link existing bookings to a program based on name, or create a dummy one
do $$
declare
  v_dummy_id uuid;
begin
  -- Try to match existing bookings by show_name
  update public.studio_bookings b
  set program_id = p.id
  from public.programs p
  where lower(btrim(b.show_name)) = lower(btrim(p.name))
    and b.program_id is null;

  -- Create a dummy program for any remaining unmatched bookings
  if exists (select 1 from public.studio_bookings where program_id is null) then
    insert into public.programs (name, category, default_duration_minutes)
    values ('Legacy Bookings', 'GENERAL', 30)
    returning id into v_dummy_id;

    update public.studio_bookings set program_id = v_dummy_id where program_id is null;
  end if;
end;
$$;

-- 3. Make program_id NOT NULL and drop show_name (since program_id replaces it)
alter table public.studio_bookings alter column program_id set not null;
alter table public.studio_bookings drop column show_name;

-- 4. Create trigger to automatically insert/cancel a schedule row
create or replace function app.propagate_booking_to_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start_time timestamptz;
  v_end_time timestamptz;
begin
  -- Convert date + time to station-local timestamp
  v_start_time := (new.booking_date + new.start_time) at time zone 'Asia/Kolkata';
  v_end_time := (new.booking_date + new.end_time) at time zone 'Asia/Kolkata';

  if tg_op = 'INSERT' then
    if new.status = 'CONFIRMED' then
      -- Do not insert if there is already a schedule (avoids conflict on retry)
      if not exists (
        select 1 from public.schedules 
        where start_time = v_start_time 
          and end_time = v_end_time 
          and status <> 'CANCELLED'
      ) then
        insert into public.schedules (program_id, start_time, end_time, notes, created_by)
        values (
          new.program_id,
          v_start_time,
          v_end_time,
          'Auto-scheduled from booking ' || new.reference,
          new.created_by
        );
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    -- If a booking is cancelled, cancel the corresponding auto-created schedule
    if new.status = 'CANCELLED' and old.status = 'CONFIRMED' then
      delete from public.schedules
      where start_time = v_start_time
        and end_time = v_end_time
        and status = 'SCHEDULED'
        and notes like 'Auto-scheduled from booking ' || new.reference;
    end if;
  end if;

  return null;
end;
$$;

create trigger studio_bookings_to_schedule
  after insert or update on public.studio_bookings
  for each row execute function app.propagate_booking_to_schedule();

-- 5. Fix app.log_booking_change to not read the deleted show_name column
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
      jsonb_build_object('reference', new.reference, 'program_id', new.program_id,
                         'date', new.booking_date, 'start_time', new.start_time,
                         'rj_id', new.rj_id, 'reason', new.override_reason));
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
