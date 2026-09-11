-- =============================================================================
-- FIX: Apply Migration 19 and Seed a Live Schedule
-- 
-- 1. Applies Migration 19 (which adds program_id to studio_bookings)
-- 2. Creates a live booking for right now so the Dashboard shows "ON AIR"
--
-- Run in: Supabase Dashboard -> SQL Editor -> Run
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PART 1: Migration 19
-- -----------------------------------------------------------------------------

alter table public.studio_bookings
  add column if not exists program_id uuid references public.programs(id) on delete restrict;

create index if not exists idx_studio_bookings_program on public.studio_bookings(program_id);

do $$
declare
  v_rec record;
  v_program_id uuid;
begin
  for v_rec in select id, show_name from public.studio_bookings where program_id is null loop
    select id into v_program_id
      from public.programs
     where name ilike v_rec.show_name
        or v_rec.show_name ilike name || '%'
     limit 1;
    
    if v_program_id is not null then
      update public.studio_bookings
         set program_id = v_program_id
       where id = v_rec.id;
    end if;
  end loop;

  -- Fallback: Create a dummy program for any remaining unmatched bookings
  if exists (select 1 from public.studio_bookings where program_id is null) then
    insert into public.programs (name, category, default_duration_minutes)
    values ('Legacy Bookings', 'GENERAL', 30)
    returning id into v_program_id;

    update public.studio_bookings set program_id = v_program_id where program_id is null;
  end if;
end;
$$;

alter table public.studio_bookings
  drop column if exists show_name;

alter table public.studio_bookings
  alter column program_id set not null;

create or replace function public.app_propagate_booking_to_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_episode_id uuid;
begin
  if tg_op = 'UPDATE' and new.status = 'CANCELLED' and old.status <> 'CANCELLED' then
    delete from public.schedules
     where program_id = new.program_id
       and start_time = new.booking_date + new.start_time;
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

    insert into public.schedules
      (program_id, episode_id, start_time, end_time, status, notes, created_by)
    values
      (new.program_id,
       v_episode_id,
       new.booking_date + new.start_time,
       new.booking_date + new.end_time,
       'SCHEDULED',
       'Auto-scheduled from Studio Booking ' || new.reference,
       new.created_by)
    on conflict on constraint schedules_slot_key do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists studio_bookings_to_schedule on public.studio_bookings;
create trigger studio_bookings_to_schedule
  after insert or update of status
  on public.studio_bookings
  for each row
  execute function public.app_propagate_booking_to_schedule();

-- -----------------------------------------------------------------------------
-- PART 2: Seed a live schedule for "right now"
-- -----------------------------------------------------------------------------
do $$
declare
  v_program_id uuid;
  v_episode_id uuid;
  v_admin_id uuid;
  v_start timestamp;
  v_end timestamp;
begin
  -- Get the first active program
  select id into v_program_id from public.programs where active = true limit 1;
  -- Get an approved episode for it
  select id into v_episode_id from public.episodes where program_id = v_program_id and status = 'APPROVED' limit 1;
  -- Get the admin user
  select id into v_admin_id from public.profiles where role = 'ADMIN' limit 1;

  if v_program_id is not null then
    -- Create a schedule block that started 15 mins ago and ends in 45 mins
    v_start := date_trunc('minute', now() at time zone 'Asia/Kolkata') - interval '15 minutes';
    v_end := v_start + interval '60 minutes';

    insert into public.schedules
      (program_id, episode_id, start_time, end_time, status, notes, created_by)
    values
      (v_program_id, v_episode_id, v_start, v_end, 'SCHEDULED', 'Live Test Schedule', v_admin_id)
    on conflict do nothing;

    -- Create another schedule for "Next up"
    insert into public.schedules
      (program_id, episode_id, start_time, end_time, status, notes, created_by)
    values
      (v_program_id, v_episode_id, v_end, v_end + interval '60 minutes', 'SCHEDULED', 'Next Up Test Schedule', v_admin_id)
    on conflict do nothing;
  end if;
end;
$$;
