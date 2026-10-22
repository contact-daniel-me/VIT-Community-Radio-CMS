-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- FIX SCHEDULE BOOKING TIMEZONE PROPAGATION
-- =============================================================================

-- 1. Function in app schema
create or replace function app.propagate_booking_to_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_episode_id uuid;
  v_start_time timestamptz;
  v_end_time   timestamptz;
begin
  -- Convert date + time in station-local timezone (Asia/Kolkata) to timestamptz
  v_start_time := (new.booking_date + new.start_time) at time zone 'Asia/Kolkata';
  v_end_time   := (new.booking_date + new.end_time)   at time zone 'Asia/Kolkata';

  if tg_op = 'UPDATE' and new.status = 'CANCELLED' and old.status <> 'CANCELLED' then
    delete from public.schedules
     where (notes like '%' || new.reference or (program_id = new.program_id and start_time = v_start_time));
    return new;
  end if;

  if (tg_op = 'INSERT' and new.status = 'CONFIRMED') or
     (tg_op = 'UPDATE' and new.status = 'CONFIRMED' and old.status <> 'CONFIRMED') then
    
    select id into v_episode_id
      from public.episodes
     where program_id = new.program_id
       and status = 'APPROVED'
     order by created_at desc
     limit 1;

    if not exists (
      select 1 from public.schedules
       where program_id = new.program_id
         and start_time = v_start_time
         and end_time = v_end_time
         and status <> 'CANCELLED'
    ) then
      insert into public.schedules (program_id, episode_id, start_time, end_time, status, notes, created_by)
      values (
        new.program_id,
        v_episode_id,
        v_start_time,
        v_end_time,
        'SCHEDULED',
        'Auto-scheduled from booking ' || new.reference,
        new.created_by
      )
      on conflict on constraint schedules_no_overlap do nothing;
    end if;
  end if;

  return new;
end;
$$;

-- 2. Function in public schema (for compatibility with existing triggers)
create or replace function public.app_propagate_booking_to_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_episode_id uuid;
  v_start_time timestamptz;
  v_end_time   timestamptz;
begin
  -- Convert date + time in station-local timezone (Asia/Kolkata) to timestamptz
  v_start_time := (new.booking_date + new.start_time) at time zone 'Asia/Kolkata';
  v_end_time   := (new.booking_date + new.end_time)   at time zone 'Asia/Kolkata';

  if tg_op = 'UPDATE' and new.status = 'CANCELLED' and old.status <> 'CANCELLED' then
    delete from public.schedules
     where (notes like '%' || new.reference or (program_id = new.program_id and start_time = v_start_time));
    return new;
  end if;

  if (tg_op = 'INSERT' and new.status = 'CONFIRMED') or
     (tg_op = 'UPDATE' and new.status = 'CONFIRMED' and old.status <> 'CONFIRMED') then
    
    select id into v_episode_id
      from public.episodes
     where program_id = new.program_id
       and status = 'APPROVED'
     order by created_at desc
     limit 1;

    if not exists (
      select 1 from public.schedules
       where program_id = new.program_id
         and start_time = v_start_time
         and end_time = v_end_time
         and status <> 'CANCELLED'
    ) then
      insert into public.schedules (program_id, episode_id, start_time, end_time, status, notes, created_by)
      values (
        new.program_id,
        v_episode_id,
        v_start_time,
        v_end_time,
        'SCHEDULED',
        'Auto-scheduled from booking ' || new.reference,
        new.created_by
      )
      on conflict on constraint schedules_no_overlap do nothing;
    end if;
  end if;

  return new;
end;
$$;

-- 3. Re-bind trigger
drop trigger if exists studio_bookings_to_schedule on public.studio_bookings;
create trigger studio_bookings_to_schedule
  after insert or update on public.studio_bookings
  for each row execute function public.app_propagate_booking_to_schedule();

-- 4. Clean up any leftover test schedules from prior helper scripts
delete from public.schedules
where notes in ('Live Test Schedule', 'Next Up Test Schedule');

-- 5. Safely re-sync all confirmed bookings into schedules without exclusion constraint conflicts:
-- Delete previous auto-scheduled rows that had wrong UTC timestamps
delete from public.schedules
where notes like 'Auto-scheduled from booking%'
   or notes like 'Auto-scheduled from Studio Booking%';

-- Re-populate schedules with correct Asia/Kolkata timestamps
insert into public.schedules (program_id, episode_id, start_time, end_time, status, notes, created_by)
select
  b.program_id,
  (
    select id from public.episodes e 
    where e.program_id = b.program_id and e.status = 'APPROVED'
    order by e.created_at desc limit 1
  ),
  (b.booking_date + b.start_time) at time zone 'Asia/Kolkata',
  (b.booking_date + b.end_time)   at time zone 'Asia/Kolkata',
  'SCHEDULED',
  'Auto-scheduled from booking ' || b.reference,
  b.created_by
from public.studio_bookings b
where b.status = 'CONFIRMED'
on conflict on constraint schedules_no_overlap do nothing;
