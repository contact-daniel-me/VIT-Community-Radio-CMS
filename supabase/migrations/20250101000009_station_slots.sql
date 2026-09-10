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
