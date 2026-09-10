-- =============================================================================
-- 17. The homepage Top 10, and expiry for audio that never aired
--
-- Two related things, both about which recordings matter and for how long.
--
-- PART A -- homepage_featured_audio
--
-- The front page needs a curated ten, in an order an administrator sets, not
-- "the ten newest". So the order is stored rather than derived.
--
-- Only QC-cleared episodes may be featured. That is not a detail: this station
-- reviews everything before broadcast, and a table that could publish a DRAFT
-- to the front page would be a way round QC. APPROVED and ARCHIVED are the two
-- states that have been through it.
--
-- PART B -- raw audio expiry
--
-- There is no separate raw file in this schema: an episode has exactly one
-- recording. "Raw" therefore means a recording that never got anywhere -- an
-- episode still DRAFT or REJECTED long after it was uploaded.
--
-- Anything that reached QC, was scheduled, went out, or is featured on the
-- front page is out of reach of the sweep, by construction rather than by
-- being careful in application code.
--
-- Storage objects cannot be deleted from SQL on hosted Supabase, so this side
-- only decides WHAT should go and records what went. The deleting is done by a
-- scheduled server-side job holding the service-role key, which calls
-- mark_raw_audio_deleted() once the object is actually gone.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The retention window, in one place.
-- -----------------------------------------------------------------------------
create or replace function app.raw_audio_retention_days()
returns integer
language sql
immutable
as $$
  select 30;
$$;

comment on function app.raw_audio_retention_days() is
  'How long an unaired recording is kept. Change here, nowhere else.';

-- -----------------------------------------------------------------------------
-- PART A: the curated ten
-- -----------------------------------------------------------------------------
create table public.homepage_featured_audio (
  id            uuid primary key default gen_random_uuid(),

  -- The playable unit is an episode; the audio hangs off it.
  episode_id    uuid not null unique references public.episodes (id) on delete cascade,

  -- One to ten, and the upper bound is what caps the list at ten rows: with a
  -- unique constraint as well, an eleventh has nowhere to go.
  display_order integer not null check (display_order between 1 and 10),

  -- Take an item off the front page without losing its place in the order.
  is_active     boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Deferrable, so a reorder can swap two rows inside one transaction without
  -- tripping over itself halfway through.
  constraint homepage_featured_order_unique
    unique (display_order) deferrable initially deferred
);

comment on table public.homepage_featured_audio is
  'The front page Top 10, in the order an administrator chose.';

create index homepage_featured_order_idx
  on public.homepage_featured_audio (display_order)
  where is_active;

create trigger homepage_featured_touch
  before update on public.homepage_featured_audio
  for each row execute function app.set_updated_at();

-- Only QC-cleared episodes, and only ones that have audio to play.
create or replace function app.guard_featured_episode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_episode public.episodes%rowtype;
begin
  select * into v_episode from public.episodes where id = new.episode_id;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  if v_episode.status not in ('APPROVED', 'ARCHIVED') then
    raise exception
      'Only QC-approved episodes can appear on the front page (this one is %)',
      v_episode.status
      using errcode = '42501';
  end if;

  if v_episode.audio_file_id is null then
    raise exception 'That episode has no audio, so there is nothing to play'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger homepage_featured_guard
  before insert or update on public.homepage_featured_audio
  for each row execute function app.guard_featured_episode();

alter table public.homepage_featured_audio enable row level security;

-- Anyone signed in may look; only an administrator may arrange.
create policy homepage_featured_select on public.homepage_featured_audio
  for select to authenticated using (true);

create policy homepage_featured_insert on public.homepage_featured_audio
  for insert to authenticated with check (app.is_admin());

create policy homepage_featured_update on public.homepage_featured_audio
  for update to authenticated using (app.is_admin()) with check (app.is_admin());

create policy homepage_featured_delete on public.homepage_featured_audio
  for delete to authenticated using (app.is_admin());

grant select on public.homepage_featured_audio to authenticated;
grant insert, update, delete on public.homepage_featured_audio to authenticated;
grant all on public.homepage_featured_audio to service_role;
revoke all on public.homepage_featured_audio from anon;

-- -----------------------------------------------------------------------------
-- What the public site reads. A view, so anon never touches the table and the
-- columns on offer are a deliberate list rather than whatever exists.
-- -----------------------------------------------------------------------------
create or replace view public.v_public_top_audio
with (security_invoker = off) as
select
  f.display_order,
  e.id            as episode_id,
  e.title,
  e.description,
  e.host_name,
  e.duration_seconds,
  p.name          as program_name,
  p.category      as program_category,
  a.storage_path,
  a.file_name,
  a.duration_seconds as audio_duration_seconds,
  e.created_at
from public.homepage_featured_audio f
join public.episodes e on e.id = f.episode_id
join public.programs p on p.id = e.program_id
join public.audio_files a on a.id = e.audio_file_id
where f.is_active
  and e.status in ('APPROVED', 'ARCHIVED')
order by f.display_order;

comment on view public.v_public_top_audio is
  'The front page Top 10. Readable by anonymous visitors.';

grant select on public.v_public_top_audio to anon, authenticated;

-- -----------------------------------------------------------------------------
-- PART B: expiry for recordings that never aired
-- -----------------------------------------------------------------------------
alter table public.audio_files
  add column if not exists deleted_at timestamptz;

comment on column public.audio_files.deleted_at is
  'Set when the storage object has actually been removed by the cleanup job.';

create index if not exists audio_files_live_idx
  on public.audio_files (created_at)
  where deleted_at is null;

/**
 * Which recordings the sweep may take.
 *
 * Everything that matters is excluded by a join rather than by remembering to
 * check it: anything past QC, anything scheduled, anything featured, anything
 * already gone.
 */
create or replace function public.raw_audio_candidates()
returns table (
  audio_file_id uuid,
  episode_id    uuid,
  storage_path  text,
  file_name     text,
  file_size     bigint,
  uploaded_at   timestamptz,
  age_days      integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    a.id,
    e.id,
    a.storage_path,
    a.file_name,
    a.file_size,
    a.created_at,
    extract(day from now() - a.created_at)::integer
  from public.audio_files a
  join public.episodes e on e.id = a.episode_id
  where a.deleted_at is null
    and e.status in ('DRAFT', 'REJECTED')
    and a.created_at < now() - make_interval(days => app.raw_audio_retention_days())
    and not exists (select 1 from public.schedules s where s.episode_id = e.id)
    and not exists (
      select 1 from public.homepage_featured_audio f where f.episode_id = e.id
    )
  order by a.created_at;
$$;

comment on function public.raw_audio_candidates() is
  'Unaired recordings past the retention window. Read-only; deletes nothing.';

/**
 * Record that a storage object has gone.
 *
 * Called by the cleanup job AFTER the object is actually deleted, so the
 * database never claims a file is gone while it is still sitting in the
 * bucket. Idempotent: running it twice on the same file changes nothing the
 * second time, which is what makes the whole sweep safe to repeat.
 */
create or replace function public.mark_raw_audio_deleted(p_audio_file_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_audio public.audio_files%rowtype;
  v_still_eligible boolean;
begin
  select * into v_audio from public.audio_files where id = p_audio_file_id;
  if not found then
    return false;
  end if;
  if v_audio.deleted_at is not null then
    return false; -- already recorded; nothing to do
  end if;

  -- Check again here rather than trusting the caller: between listing the
  -- candidates and deleting the object, the episode may have been approved.
  select exists (
    select 1 from public.raw_audio_candidates() c where c.audio_file_id = p_audio_file_id
  ) into v_still_eligible;

  if not v_still_eligible then
    raise exception 'That recording is no longer eligible for cleanup'
      using errcode = '42501';
  end if;

  update public.audio_files set deleted_at = now() where id = p_audio_file_id;

  -- The episode keeps its row and its history; it simply has no audio again.
  update public.episodes set audio_file_id = null where audio_file_id = p_audio_file_id;

  insert into public.activity_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    null,
    'RAW_AUDIO_EXPIRED',
    'AUDIO_FILE',
    p_audio_file_id,
    jsonb_build_object(
      'storage_path', v_audio.storage_path,
      'file_name', v_audio.file_name,
      'file_size', v_audio.file_size,
      'retention_days', app.raw_audio_retention_days()
    )
  );

  return true;
end;
$$;

revoke execute on function public.raw_audio_candidates() from public, anon;
revoke execute on function public.mark_raw_audio_deleted(uuid) from public, anon;
grant execute on function public.raw_audio_candidates() to authenticated, service_role;
grant execute on function public.mark_raw_audio_deleted(uuid) to service_role;
