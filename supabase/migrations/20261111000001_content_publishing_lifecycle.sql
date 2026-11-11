-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- CONTENT SCHEDULING & PUBLISHING LIFECYCLE
--
-- Fixes content scheduling lifecycle across episodes and announcements:
--   - Persists explicit lifecycle statuses:
--       DRAFT | SCHEDULED | PUBLISHED | EXPIRED | FAILED | ARCHIVED
--   - Prevents published content from ever returning automatically to Draft /
--     Unscheduled once published.
--   - Separates Expiration from Scheduling: content only expires when an
--     explicit expires_at timestamp is configured and reached.
--   - Provides atomic, row-locked, idempotent scheduler RPC
--     (public.sync_content_lifecycle) and triggers safe pg_cron if available.
--   - Protects publishing lifecycle columns via BEFORE UPDATE trigger so direct
--     client table writes cannot bypass transactional workflow RPCs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Episodes: lifecycle columns & parity columns (idempotent)
-- ---------------------------------------------------------------------------
alter table public.episodes
  add column if not exists raw_file_delete_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists publish_status text not null default 'DRAFT',
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists publish_error text,
  add column if not exists publish_attempts integer not null default 0,
  add column if not exists last_publish_attempt_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.episodes'::regclass
      and conname = 'episodes_publish_status_check'
  ) then
    alter table public.episodes
      add constraint episodes_publish_status_check
      check (publish_status in ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'EXPIRED', 'FAILED', 'ARCHIVED'));
  end if;
end $$;

create index if not exists episodes_publish_status_idx
  on public.episodes (publish_status);

create index if not exists episodes_publish_schedule_idx
  on public.episodes (scheduled_at)
  where publish_status = 'SCHEDULED';

create index if not exists episodes_publish_expiry_idx
  on public.episodes (expires_at)
  where publish_status = 'PUBLISHED' and expires_at is not null;

comment on column public.episodes.publish_status is
  'Persisted content publishing lifecycle: DRAFT | SCHEDULED | PUBLISHED | EXPIRED | FAILED | ARCHIVED.';
comment on column public.episodes.scheduled_at is
  'Target publication timestamp when scheduled.';
comment on column public.episodes.published_at is
  'Actual UTC timestamp when this episode transitioned to PUBLISHED.';
comment on column public.episodes.expires_at is
  'Optional expiry timestamp; content never expires automatically unless expires_at is configured and reached.';
comment on column public.episodes.publish_error is
  'Error message recorded if scheduled publication fails.';

-- ---------------------------------------------------------------------------
-- 2. Announcements: expand status lifecycle & failure/retry metadata
-- ---------------------------------------------------------------------------
do $$
declare
  v_conname text;
begin
  for v_conname in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.announcements'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.announcements drop constraint if exists %I', v_conname);
  end loop;
end $$;

alter table public.announcements
  add constraint announcements_status_check
  check (status in ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'EXPIRED', 'FAILED', 'ARCHIVED'));

alter table public.announcements
  add column if not exists publish_error text,
  add column if not exists publish_attempts integer not null default 0,
  add column if not exists last_publish_attempt_at timestamptz;

create index if not exists announcements_publish_schedule_idx
  on public.announcements (scheduled_at)
  where status = 'SCHEDULED';

create index if not exists announcements_publish_expiry_idx
  on public.announcements (expires_at)
  where status = 'PUBLISHED' and expires_at is not null;

-- Ensure explicit client table grants exist alongside announcements RLS policies
grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;
grant all on public.announcements to service_role;

-- ---------------------------------------------------------------------------
-- 3. Guard direct client mutations of publishing lifecycle fields on episodes
-- ---------------------------------------------------------------------------
create or replace function app.guard_episode_publish_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('app.workflow', true) = 'on' then
    return new;
  end if;

  if new.publish_status is distinct from old.publish_status
     or new.scheduled_at is distinct from old.scheduled_at
     or new.published_at is distinct from old.published_at
     or new.expires_at is distinct from old.expires_at
     or new.publish_error is distinct from old.publish_error
     or new.publish_attempts is distinct from old.publish_attempts
     or new.last_publish_attempt_at is distinct from old.last_publish_attempt_at
     or new.archived_at is distinct from old.archived_at then
    raise exception 'Publishing lifecycle fields must be changed through workflow functions'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_episode_publish_fields on public.episodes;
create trigger trg_guard_episode_publish_fields
  before update on public.episodes
  for each row
  execute function app.guard_episode_publish_fields();

-- ---------------------------------------------------------------------------
-- 4. Safe idempotent backfill of existing historical records
-- ---------------------------------------------------------------------------
do $$
declare
  v_now timestamptz := now();
begin
  perform app.begin_workflow();

  -- 4a. Episodes marked ARCHIVED
  update public.episodes
  set publish_status = 'ARCHIVED',
      archived_at = coalesce(archived_at, updated_at),
      expires_at = coalesce(expires_at, homepage_expires_at),
      scheduled_at = coalesce(scheduled_at, homepage_publish_at),
      published_at = case
        when published_at is not null then published_at
        when show_on_homepage = true then coalesce(homepage_publish_at, reviewed_at, updated_at)
        else null
      end
  where status = 'ARCHIVED'
    and publish_status = 'DRAFT';

  -- 4b. Approved episodes currently/previously configured for homepage release
  update public.episodes
  set publish_status = case
        when homepage_expires_at is not null and homepage_expires_at <= v_now then 'EXPIRED'
        when homepage_publish_at is not null and homepage_publish_at > v_now then 'SCHEDULED'
        else 'PUBLISHED'
      end,
      scheduled_at = coalesce(scheduled_at, homepage_publish_at),
      published_at = case
        when homepage_publish_at is not null and homepage_publish_at > v_now then published_at
        else coalesce(published_at, homepage_publish_at, reviewed_at, updated_at)
      end,
      expires_at = coalesce(expires_at, homepage_expires_at)
  where status = 'APPROVED'
    and show_on_homepage = true
    and publish_status = 'DRAFT';

  -- 4c. Approved episodes already aired via completed broadcast schedules
  update public.episodes e
  set publish_status = 'PUBLISHED',
      published_at = coalesce(e.published_at, s_done.last_aired_at, e.reviewed_at, e.updated_at)
  from (
    select episode_id, max(coalesce(end_time, start_time)) as last_aired_at
    from public.schedules
    where episode_id is not null
      and (status = 'COMPLETED' or (status in ('SCHEDULED', 'ON_AIR') and end_time <= v_now))
    group by episode_id
  ) s_done
  where e.id = s_done.episode_id
    and e.status = 'APPROVED'
    and e.publish_status = 'DRAFT';

  -- 4d. Approved episodes with upcoming / live broadcast schedules
  update public.episodes e
  set publish_status = 'SCHEDULED',
      scheduled_at = coalesce(e.scheduled_at, s_up.next_start_time)
  from (
    select episode_id, min(start_time) as next_start_time
    from public.schedules
    where episode_id is not null
      and status in ('SCHEDULED', 'ON_AIR')
      and end_time > v_now
    group by episode_id
  ) s_up
  where e.id = s_up.episode_id
    and e.status = 'APPROVED'
    and e.publish_status = 'DRAFT';

  -- 4e. Announcements due / expired backfill
  update public.announcements
  set status = case
        when expires_at is not null and expires_at <= v_now then 'EXPIRED'
        when status = 'SCHEDULED' and scheduled_at is not null and scheduled_at <= v_now then 'PUBLISHED'
        else status
      end,
      published_at = case
        when (status = 'SCHEDULED' and scheduled_at is not null and scheduled_at <= v_now)
          or (status in ('PUBLISHED', 'SCHEDULED') and expires_at is not null and expires_at <= v_now)
          or (status = 'PUBLISHED' and published_at is null)
        then coalesce(published_at, scheduled_at, created_at, v_now)
        else published_at
      end
  where status in ('SCHEDULED', 'PUBLISHED');

  perform app.end_workflow();
exception
  when others then
    perform app.end_workflow();
    raise;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Update public.v_public_approved_episodes (append columns at end only)
-- ---------------------------------------------------------------------------
create or replace view public.v_public_approved_episodes
with (security_invoker = off) as
select
  e.id            as episode_id,
  e.title,
  e.description,
  coalesce(e.host_name, p.host_name) as host_name,
  e.duration_seconds,
  p.name          as program_name,
  p.category      as program_category,
  a.storage_path,
  a.file_name,
  a.duration_seconds as audio_duration_seconds,
  e.created_at,
  e.show_on_homepage,
  e.homepage_publish_at,
  e.homepage_expires_at,
  e.publish_status,
  e.scheduled_at,
  e.published_at,
  e.expires_at
from public.episodes e
join public.programs p on p.id = e.program_id
left join public.audio_files a on a.id = coalesce(e.final_audio_file_id, e.audio_file_id)
where e.status = 'APPROVED'
  and p.active
  and (a.id is null or a.deleted_at is null)
  and (
    e.publish_status = 'PUBLISHED'
    or (
      e.publish_status = 'SCHEDULED'
      and e.show_on_homepage = true
      and coalesce(e.scheduled_at, e.homepage_publish_at) is not null
      and coalesce(e.scheduled_at, e.homepage_publish_at) <= now()
    )
  )
  and (coalesce(e.expires_at, e.homepage_expires_at) is null or coalesce(e.expires_at, e.homepage_expires_at) > now());

comment on view public.v_public_approved_episodes is
  'Approved active-program episodes currently in PUBLISHED (or due-now) non-expired state for the public website.';

grant select on public.v_public_approved_episodes to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Internal helper: validate whether an episode can be published now
-- ---------------------------------------------------------------------------
create or replace function app.episode_publish_failure_reason(p_episode public.episodes)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prog_active boolean;
  v_audio_id uuid;
  v_audio_deleted timestamptz;
begin
  if p_episode.status <> 'APPROVED' then
    return 'Episode must be QC-approved before publication (current status: ' || p_episode.status || ')';
  end if;

  select active into v_prog_active
  from public.programs
  where id = p_episode.program_id;

  if not found or coalesce(v_prog_active, false) = false then
    return 'Program is inactive or unavailable';
  end if;

  v_audio_id := coalesce(p_episode.final_audio_file_id, p_episode.audio_file_id);
  if v_audio_id is not null then
    select deleted_at into v_audio_deleted
    from public.audio_files
    where id = v_audio_id;

    if not found or v_audio_deleted is not null then
      return 'Linked episode audio file is missing or has been deleted';
    end if;
  end if;

  return null;
end;
$$;

revoke all on function app.episode_publish_failure_reason(public.episodes) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Unified 6-arg schedule_episode_homepage RPC (drop legacy 4-arg overload)
-- ---------------------------------------------------------------------------
drop function if exists public.schedule_episode_homepage(uuid, boolean, timestamptz, timestamptz);

create or replace function public.schedule_episode_homepage(
  p_episode_id          uuid,
  p_show_on_homepage    boolean,
  p_homepage_publish_at timestamptz default null,
  p_homepage_expires_at timestamptz default null,
  p_title               text default null,
  p_description         text default null
)
returns public.episodes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role         public.user_role := app.current_role();
  v_episode      public.episodes%rowtype;
  v_now          timestamptz := now();
  v_next_title   text;
  v_next_desc    text;
  v_publish_err  text;
  v_new_status   text;
  v_sched_at     timestamptz;
  v_pub_at       timestamptz;
  v_exp_at       timestamptz;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only administrators and producers can schedule homepage episodes'
      using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  if p_title is not null then
    v_next_title := btrim(p_title);
    if v_next_title = '' then
      raise exception 'Episode title cannot be empty' using errcode = '22023';
    end if;
  else
    v_next_title := v_episode.title;
  end if;

  if p_description is not null then
    v_next_desc := nullif(btrim(p_description), '');
  else
    v_next_desc := v_episode.description;
  end if;

  if p_show_on_homepage then
    if v_episode.status <> 'APPROVED' then
      raise exception 'Only QC-approved episodes can be scheduled on the homepage'
        using errcode = '42501';
    end if;

    v_publish_err := app.episode_publish_failure_reason(v_episode);
    if v_publish_err is not null then
      raise exception '%', v_publish_err using errcode = '42501';
    end if;

    v_exp_at := p_homepage_expires_at;

    if p_homepage_publish_at is not null and p_homepage_publish_at > v_now then
      if v_exp_at is not null and v_exp_at <= p_homepage_publish_at then
        raise exception 'Expiry time must be after scheduled publish time'
          using errcode = '22023';
      end if;

      v_new_status := 'SCHEDULED';
      v_sched_at := p_homepage_publish_at;
      v_pub_at := null;
    elsif v_episode.publish_status = 'PUBLISHED' then
      -- Preserve existing published_at when updating metadata or expiry of a live episode.
      v_pub_at := coalesce(v_episode.published_at, v_episode.homepage_publish_at, v_now);
      v_sched_at := coalesce(v_episode.scheduled_at, v_episode.homepage_publish_at);

      if v_exp_at is not null and v_exp_at <= v_now then
        v_new_status := 'EXPIRED';
      else
        v_new_status := 'PUBLISHED';
      end if;
    else
      v_pub_at := coalesce(p_homepage_publish_at, v_now);
      if v_pub_at > v_now then
        v_pub_at := v_now;
      end if;
      v_sched_at := p_homepage_publish_at;

      if v_exp_at is not null and v_exp_at <= coalesce(v_sched_at, v_pub_at) then
        raise exception 'Expiry time must be after publish time'
          using errcode = '22023';
      end if;

      if v_exp_at is not null and v_exp_at <= v_now then
        v_new_status := 'EXPIRED';
      else
        v_new_status := 'PUBLISHED';
      end if;
    end if;
  else
    -- Manual unschedule / explicit removal from homepage returns active/scheduled content to DRAFT
    -- (ARCHIVED episodes retain ARCHIVED status).
    if v_episode.status = 'ARCHIVED' or v_episode.publish_status = 'ARCHIVED' then
      v_new_status := 'ARCHIVED';
    else
      v_new_status := 'DRAFT';
    end if;
    v_sched_at := null;
    v_pub_at := null;
    v_exp_at := null;
  end if;

  perform app.begin_workflow();

  update public.episodes
  set title = v_next_title,
      description = v_next_desc,
      show_on_homepage = p_show_on_homepage,
      homepage_publish_at = case
        when not p_show_on_homepage then null
        when v_new_status = 'SCHEDULED' then v_sched_at
        else coalesce(v_sched_at, v_pub_at)
      end,
      homepage_expires_at = case
        when not p_show_on_homepage then null
        else v_exp_at
      end,
      publish_status = v_new_status,
      scheduled_at = v_sched_at,
      published_at = v_pub_at,
      expires_at = v_exp_at,
      publish_error = null
  where id = p_episode_id
  returning * into v_episode;

  perform app.log(
    case
      when not p_show_on_homepage then 'EPISODE_UNSCHEDULED'
      when v_new_status = 'SCHEDULED' then 'EPISODE_HOMEPAGE_SCHEDULED'
      when v_new_status = 'EXPIRED' then 'EPISODE_EXPIRED'
      else 'EPISODE_HOMEPAGE_PUBLISHED'
    end,
    'EPISODE',
    p_episode_id,
    jsonb_build_object(
      'show_on_homepage', p_show_on_homepage,
      'publish_status', v_new_status,
      'scheduled_at', v_sched_at,
      'published_at', v_pub_at,
      'expires_at', v_exp_at
    )
  );

  perform app.end_workflow();
  return v_episode;
exception
  when others then
    perform app.end_workflow();
    raise;
end;
$$;

revoke all on function public.schedule_episode_homepage(uuid, boolean, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.schedule_episode_homepage(uuid, boolean, timestamptz, timestamptz, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Explicit episode lifecycle RPCs: unschedule, retry, fail, archive, activate, reopen
-- ---------------------------------------------------------------------------
create or replace function public.unschedule_episode_homepage(p_episode_id uuid)
returns public.episodes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    public.user_role := app.current_role();
  v_episode public.episodes%rowtype;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only administrators and producers can unschedule episodes'
      using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  if v_episode.status = 'ARCHIVED' or v_episode.publish_status = 'ARCHIVED' then
    raise exception 'Archived episodes cannot be moved directly to Draft; reactivate first'
      using errcode = '42501';
  end if;

  perform app.begin_workflow();

  update public.episodes
  set show_on_homepage = false,
      homepage_publish_at = null,
      homepage_expires_at = null,
      publish_status = 'DRAFT',
      scheduled_at = null,
      published_at = null,
      expires_at = null,
      publish_error = null
  where id = p_episode_id
  returning * into v_episode;

  perform app.log(
    'EPISODE_UNSCHEDULED',
    'EPISODE',
    p_episode_id,
    jsonb_build_object('publish_status', 'DRAFT')
  );

  perform app.end_workflow();
  return v_episode;
exception
  when others then
    perform app.end_workflow();
    raise;
end;
$$;

revoke all on function public.unschedule_episode_homepage(uuid) from public, anon;
grant execute on function public.unschedule_episode_homepage(uuid) to authenticated, service_role;

create or replace function public.fail_episode_publish(
  p_episode_id uuid,
  p_error      text
)
returns public.episodes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    public.user_role := app.current_role();
  v_episode public.episodes%rowtype;
  v_err     text := coalesce(nullif(btrim(p_error), ''), 'Scheduled publication failed');
begin
  if v_role is not null and v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only administrators and producers can mark publication failure'
      using errcode = '42501';
  elsif v_role is null
        and current_setting('role', true) not in ('service_role', 'supabase_admin', 'postgres')
        and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  if v_episode.publish_status not in ('SCHEDULED', 'FAILED') then
    raise exception 'Only SCHEDULED or FAILED episodes can be marked FAILED (current: %)', v_episode.publish_status
      using errcode = '22023';
  end if;

  perform app.begin_workflow();

  update public.episodes
  set publish_status = 'FAILED',
      publish_error = v_err,
      publish_attempts = coalesce(publish_attempts, 0) + 1,
      last_publish_attempt_at = now(),
      published_at = null
  where id = p_episode_id
  returning * into v_episode;

  perform app.log(
    'EPISODE_PUBLISH_FAILED',
    'EPISODE',
    p_episode_id,
    jsonb_build_object('error', v_err, 'attempts', v_episode.publish_attempts)
  );

  perform app.end_workflow();
  return v_episode;
exception
  when others then
    perform app.end_workflow();
    raise;
end;
$$;

revoke all on function public.fail_episode_publish(uuid, text) from public, anon;
grant execute on function public.fail_episode_publish(uuid, text) to authenticated, service_role;

create or replace function public.retry_episode_publish(
  p_episode_id   uuid,
  p_scheduled_at timestamptz default null
)
returns public.episodes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role        public.user_role := app.current_role();
  v_episode     public.episodes%rowtype;
  v_target_time timestamptz;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only administrators and producers can retry publication'
      using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  if v_episode.publish_status <> 'FAILED' then
    raise exception 'Only FAILED episodes can be retried (current: %)', v_episode.publish_status
      using errcode = '22023';
  end if;

  v_target_time := coalesce(p_scheduled_at, v_episode.scheduled_at, v_episode.homepage_publish_at, now());

  perform app.begin_workflow();

  update public.episodes
  set publish_status = 'SCHEDULED',
      publish_error = null,
      show_on_homepage = true,
      scheduled_at = v_target_time,
      homepage_publish_at = v_target_time
  where id = p_episode_id
  returning * into v_episode;

  perform app.log(
    'EPISODE_PUBLISH_RETRIED',
    'EPISODE',
    p_episode_id,
    jsonb_build_object('scheduled_at', v_target_time)
  );

  perform app.end_workflow();
  return v_episode;
exception
  when others then
    perform app.end_workflow();
    raise;
end;
$$;

revoke all on function public.retry_episode_publish(uuid, timestamptz) from public, anon;
grant execute on function public.retry_episode_publish(uuid, timestamptz) to authenticated, service_role;

create or replace function public.archive_episode(p_episode_id uuid)
returns public.episodes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role     public.user_role := app.current_role();
  v_episode  public.episodes%rowtype;
  v_blocking integer;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only administrators and producers can archive episodes'
      using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  select count(*) into v_blocking
  from public.schedules
  where episode_id = p_episode_id
    and status in ('SCHEDULED', 'ON_AIR');

  if v_blocking > 0 then
    raise exception 'This episode has % upcoming or live slot(s). Cancel them first.', v_blocking
      using errcode = '42501';
  end if;

  perform app.begin_workflow();

  update public.episodes
  set status = 'ARCHIVED',
      publish_status = 'ARCHIVED',
      archived_at = coalesce(archived_at, now()),
      show_on_homepage = false
  where id = p_episode_id
  returning * into v_episode;

  perform app.log(
    'EPISODE_ARCHIVED',
    'EPISODE',
    p_episode_id,
    jsonb_build_object('title', v_episode.title, 'publish_status', 'ARCHIVED', 'published_at', v_episode.published_at)
  );

  perform app.end_workflow();
  return v_episode;
exception
  when others then
    perform app.end_workflow();
    raise;
end;
$$;

revoke all on function public.archive_episode(uuid) from public, anon;
grant execute on function public.archive_episode(uuid) to authenticated, service_role;

create or replace function public.activate_episode(p_episode_id uuid)
returns public.episodes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role    public.user_role := app.current_role();
  v_episode public.episodes%rowtype;
  v_next_editorial public.episode_status;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only administrators and producers can reactivate episodes'
      using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  if v_episode.status <> 'ARCHIVED' then
    raise exception 'Only ARCHIVED episodes can be reactivated' using errcode = '42501';
  end if;

  v_next_editorial := case when v_episode.reviewed_at is not null then 'APPROVED' else 'DRAFT' end;

  perform app.begin_workflow();

  update public.episodes
  set status = v_next_editorial,
      archived_at = null,
      publish_status = 'DRAFT',
      show_on_homepage = false
  where id = p_episode_id
  returning * into v_episode;

  perform app.log(
    'EPISODE_ACTIVATED',
    'EPISODE',
    p_episode_id,
    jsonb_build_object('status', v_next_editorial, 'publish_status', 'DRAFT')
  );

  perform app.end_workflow();
  return v_episode;
exception
  when others then
    perform app.end_workflow();
    raise;
end;
$$;

revoke all on function public.activate_episode(uuid) from public, anon;
grant execute on function public.activate_episode(uuid) to authenticated, service_role;

create or replace function public.reopen_episode(p_episode_id uuid)
returns public.episodes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role     public.user_role := app.current_role();
  v_episode  public.episodes%rowtype;
  v_blocking integer;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only administrators and producers can reopen episodes'
      using errcode = '42501';
  end if;

  select * into v_episode from public.episodes where id = p_episode_id for update;
  if not found then
    raise exception 'Episode not found' using errcode = 'P0002';
  end if;

  if v_episode.status not in ('REJECTED', 'APPROVED', 'ARCHIVED') then
    raise exception 'Cannot reopen an episode in % state', v_episode.status
      using errcode = '42501';
  end if;

  select count(*) into v_blocking
  from public.schedules
  where episode_id = p_episode_id
    and status in ('SCHEDULED', 'ON_AIR');

  if v_blocking > 0 then
    raise exception 'Cancel the % scheduled slot(s) for this episode before reopening it', v_blocking
      using errcode = '42501';
  end if;

  perform app.begin_workflow();

  update public.episodes
  set status = 'DRAFT',
      submitted_at = null,
      archived_at = null,
      publish_status = 'DRAFT',
      show_on_homepage = false,
      scheduled_at = null,
      published_at = null,
      expires_at = null,
      homepage_publish_at = null,
      homepage_expires_at = null,
      publish_error = null
  where id = p_episode_id
  returning * into v_episode;

  perform app.log('EPISODE_REOPENED', 'EPISODE', p_episode_id, jsonb_build_object('title', v_episode.title));
  perform app.end_workflow();
  return v_episode;
exception
  when others then
    perform app.end_workflow();
    raise;
end;
$$;

revoke all on function public.reopen_episode(uuid) from public, anon;
grant execute on function public.reopen_episode(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Explicit announcement lifecycle RPCs: unschedule, fail, retry, archive
-- ---------------------------------------------------------------------------
create or replace function public.unschedule_announcement(p_announcement_id uuid)
returns public.announcements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := app.current_role();
  v_ann  public.announcements%rowtype;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only administrators and producers can unschedule announcements'
      using errcode = '42501';
  end if;

  select * into v_ann from public.announcements where id = p_announcement_id for update;
  if not found then
    raise exception 'Announcement not found' using errcode = 'P0002';
  end if;

  update public.announcements
  set status = 'DRAFT',
      scheduled_at = null,
      published_at = null,
      expires_at = null,
      publish_error = null,
      updated_at = now()
  where id = p_announcement_id
  returning * into v_ann;

  return v_ann;
end;
$$;

revoke all on function public.unschedule_announcement(uuid) from public, anon;
grant execute on function public.unschedule_announcement(uuid) to authenticated, service_role;

create or replace function public.fail_announcement_publish(
  p_announcement_id uuid,
  p_error           text
)
returns public.announcements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role := app.current_role();
  v_ann  public.announcements%rowtype;
  v_err  text := coalesce(nullif(btrim(p_error), ''), 'Announcement publication failed');
begin
  if v_role is not null and v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only administrators and producers can mark announcement failure'
      using errcode = '42501';
  elsif v_role is null
        and current_setting('role', true) not in ('service_role', 'supabase_admin', 'postgres')
        and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_ann from public.announcements where id = p_announcement_id for update;
  if not found then
    raise exception 'Announcement not found' using errcode = 'P0002';
  end if;

  update public.announcements
  set status = 'FAILED',
      publish_error = v_err,
      publish_attempts = coalesce(publish_attempts, 0) + 1,
      last_publish_attempt_at = now(),
      published_at = null,
      updated_at = now()
  where id = p_announcement_id
  returning * into v_ann;

  return v_ann;
end;
$$;

revoke all on function public.fail_announcement_publish(uuid, text) from public, anon;
grant execute on function public.fail_announcement_publish(uuid, text) to authenticated, service_role;

create or replace function public.retry_announcement_publish(
  p_announcement_id uuid,
  p_scheduled_at    timestamptz default null
)
returns public.announcements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role        public.user_role := app.current_role();
  v_ann         public.announcements%rowtype;
  v_target_time timestamptz;
begin
  if v_role is null or v_role not in ('ADMIN', 'PRODUCER') then
    raise exception 'Only administrators and producers can retry announcement publication'
      using errcode = '42501';
  end if;

  select * into v_ann from public.announcements where id = p_announcement_id for update;
  if not found then
    raise exception 'Announcement not found' using errcode = 'P0002';
  end if;

  if v_ann.status <> 'FAILED' then
    raise exception 'Only FAILED announcements can be retried' using errcode = '22023';
  end if;

  v_target_time := coalesce(p_scheduled_at, v_ann.scheduled_at, now());

  update public.announcements
  set status = 'SCHEDULED',
      publish_error = null,
      scheduled_at = v_target_time,
      updated_at = now()
  where id = p_announcement_id
  returning * into v_ann;

  return v_ann;
end;
$$;

revoke all on function public.retry_announcement_publish(uuid, timestamptz) from public, anon;
grant execute on function public.retry_announcement_publish(uuid, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Transactional & idempotent content lifecycle scheduler RPC
-- ---------------------------------------------------------------------------
create or replace function app._run_content_lifecycle_sync()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now                   timestamptz := now();
  v_ep                    public.episodes%rowtype;
  v_ann                   public.announcements%rowtype;
  v_sched                 record;
  v_closed_ids            uuid[];
  v_err                   text;
  v_exp                   timestamptz;
  v_promoted_episodes     integer := 0;
  v_expired_episodes      integer := 0;
  v_failed_episodes       integer := 0;
  v_promoted_ann          integer := 0;
  v_expired_ann           integer := 0;
  v_failed_ann            integer := 0;
  v_synced_schedules      integer := 0;
begin
  perform app.begin_workflow();

  -- 10a. Close overdue broadcast schedules (SCHEDULED / ON_AIR with end_time <= now)
  with closed as (
    update public.schedules
    set status = 'COMPLETED'
    where status in ('SCHEDULED', 'ON_AIR')
      and end_time <= v_now
    returning id, episode_id, start_time, end_time
  )
  select array_agg(id) into v_closed_ids from closed;

  if v_closed_ids is not null then
    v_synced_schedules := coalesce(array_length(v_closed_ids, 1), 0);

    update public.broadcast_state
    set status = 'OFF_AIR',
        current_schedule_id = null,
        started_at = null,
        updated_at = v_now
    where id = true
      and current_schedule_id = any(v_closed_ids);

    -- Ensure episodes that aired via completed broadcast schedules transition
    -- cleanly to PUBLISHED instead of dropping back to DRAFT/Not Scheduled.
    for v_sched in
      select distinct on (s.episode_id)
        s.episode_id,
        coalesce(s.end_time, s.start_time) as aired_at
      from public.schedules s
      where s.id = any(v_closed_ids)
        and s.episode_id is not null
    loop
      update public.episodes
      set publish_status = 'PUBLISHED',
          published_at = coalesce(published_at, v_sched.aired_at, v_now),
          publish_error = null
      where id = v_sched.episode_id
        and status = 'APPROVED'
        and publish_status in ('DRAFT', 'SCHEDULED')
        and show_on_homepage = false;
    end loop;
  end if;

  -- 10b. Promote due SCHEDULED episodes and expire PUBLISHED episodes with expires_at <= now()
  -- Uses FOR UPDATE SKIP LOCKED for strict idempotency under concurrent execution.
  for v_ep in
    select *
    from public.episodes
    where (
      publish_status = 'SCHEDULED'
      and coalesce(scheduled_at, homepage_publish_at) is not null
      and coalesce(scheduled_at, homepage_publish_at) <= v_now
    ) or (
      publish_status = 'PUBLISHED'
      and coalesce(expires_at, homepage_expires_at) is not null
      and coalesce(expires_at, homepage_expires_at) <= v_now
    )
    for update skip locked
  loop
    v_exp := coalesce(v_ep.expires_at, v_ep.homepage_expires_at);

    if v_ep.publish_status = 'SCHEDULED' then
      v_err := app.episode_publish_failure_reason(v_ep);

      if v_err is not null then
        update public.episodes
        set publish_status = 'FAILED',
            publish_error = v_err,
            publish_attempts = coalesce(publish_attempts, 0) + 1,
            last_publish_attempt_at = v_now,
            published_at = null
        where id = v_ep.id;

        perform app.log(
          'EPISODE_PUBLISH_FAILED',
          'EPISODE',
          v_ep.id,
          jsonb_build_object('error', v_err, 'attempts', coalesce(v_ep.publish_attempts, 0) + 1)
        );
        v_failed_episodes := v_failed_episodes + 1;
      elsif v_exp is not null and v_exp <= v_now then
        update public.episodes
        set publish_status = 'EXPIRED',
            published_at = coalesce(published_at, coalesce(scheduled_at, homepage_publish_at), v_now),
            expires_at = v_exp,
            homepage_expires_at = v_exp,
            publish_error = null,
            publish_attempts = coalesce(publish_attempts, 0) + 1,
            last_publish_attempt_at = v_now
        where id = v_ep.id;

        perform app.log(
          'EPISODE_EXPIRED',
          'EPISODE',
          v_ep.id,
          jsonb_build_object('expires_at', v_exp)
        );
        v_expired_episodes := v_expired_episodes + 1;
      else
        update public.episodes
        set publish_status = 'PUBLISHED',
            published_at = coalesce(published_at, v_now),
            expires_at = v_exp,
            homepage_expires_at = v_exp,
            publish_error = null,
            publish_attempts = coalesce(publish_attempts, 0) + 1,
            last_publish_attempt_at = v_now
        where id = v_ep.id;

        perform app.log(
          'EPISODE_PUBLISHED',
          'EPISODE',
          v_ep.id,
          jsonb_build_object('published_at', v_now, 'expires_at', v_exp)
        );
        v_promoted_episodes := v_promoted_episodes + 1;
      end if;
    elsif v_ep.publish_status = 'PUBLISHED' and v_exp is not null and v_exp <= v_now then
      update public.episodes
      set publish_status = 'EXPIRED',
          expires_at = v_exp,
          homepage_expires_at = v_exp
      where id = v_ep.id;

      perform app.log(
        'EPISODE_EXPIRED',
        'EPISODE',
        v_ep.id,
        jsonb_build_object('expires_at', v_exp, 'published_at', v_ep.published_at)
      );
      v_expired_episodes := v_expired_episodes + 1;
    end if;
  end loop;

  -- 10c. Promote due SCHEDULED announcements and expire PUBLISHED announcements with expires_at <= now()
  for v_ann in
    select *
    from public.announcements
    where (
      status = 'SCHEDULED'
      and scheduled_at is not null
      and scheduled_at <= v_now
    ) or (
      status = 'PUBLISHED'
      and expires_at is not null
      and expires_at <= v_now
    )
    for update skip locked
  loop
    if v_ann.status = 'SCHEDULED' then
      if coalesce(btrim(v_ann.title), '') = '' or coalesce(btrim(v_ann.message), '') = '' then
        update public.announcements
        set status = 'FAILED',
            publish_error = 'Announcement title and message cannot be empty',
            publish_attempts = coalesce(publish_attempts, 0) + 1,
            last_publish_attempt_at = v_now,
            updated_at = v_now
        where id = v_ann.id;
        v_failed_ann := v_failed_ann + 1;
      elsif v_ann.expires_at is not null and v_ann.expires_at <= v_ann.scheduled_at then
        update public.announcements
        set status = 'FAILED',
            publish_error = 'Announcement expiry time must be after scheduled publish time',
            publish_attempts = coalesce(publish_attempts, 0) + 1,
            last_publish_attempt_at = v_now,
            updated_at = v_now
        where id = v_ann.id;
        v_failed_ann := v_failed_ann + 1;
      elsif v_ann.expires_at is not null and v_ann.expires_at <= v_now then
        update public.announcements
        set status = 'EXPIRED',
            published_at = coalesce(published_at, v_now),
            publish_error = null,
            publish_attempts = coalesce(publish_attempts, 0) + 1,
            last_publish_attempt_at = v_now,
            updated_at = v_now
        where id = v_ann.id;
        v_expired_ann := v_expired_ann + 1;
      else
        update public.announcements
        set status = 'PUBLISHED',
            published_at = coalesce(published_at, v_now),
            publish_error = null,
            publish_attempts = coalesce(publish_attempts, 0) + 1,
            last_publish_attempt_at = v_now,
            updated_at = v_now
        where id = v_ann.id;
        v_promoted_ann := v_promoted_ann + 1;
      end if;
    elsif v_ann.status = 'PUBLISHED' and v_ann.expires_at is not null and v_ann.expires_at <= v_now then
      update public.announcements
      set status = 'EXPIRED',
          updated_at = v_now
      where id = v_ann.id;
      v_expired_ann := v_expired_ann + 1;
    end if;
  end loop;

  perform app.end_workflow();

  return jsonb_build_object(
    'promoted_episodes', v_promoted_episodes,
    'expired_episodes', v_expired_episodes,
    'failed_episodes', v_failed_episodes,
    'promoted_announcements', v_promoted_ann,
    'expired_announcements', v_expired_ann,
    'failed_announcements', v_failed_ann,
    'synced_schedules', v_synced_schedules,
    'synced_at', v_now
  );
exception
  when others then
    perform app.end_workflow();
    raise;
end;
$$;

revoke all on function app._run_content_lifecycle_sync() from public, anon, authenticated;

create or replace function public.sync_content_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if app.current_role() is null
     and current_setting('role', true) not in ('service_role', 'supabase_admin', 'postgres')
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return app._run_content_lifecycle_sync();
end;
$$;

revoke all on function public.sync_content_lifecycle() from public, anon;
grant execute on function public.sync_content_lifecycle() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Conditional pg_cron registration (runs every minute in production DB)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('vit-radio-content-lifecycle-sync');
    exception
      when others then null;
    end;

    perform cron.schedule(
      'vit-radio-content-lifecycle-sync',
      '* * * * *',
      'select public.sync_content_lifecycle();'
    );
  end if;
exception
  when others then
    -- Safe no-op if pg_cron schema/permissions are absent (e.g. PGlite local tests)
    null;
end $$;
