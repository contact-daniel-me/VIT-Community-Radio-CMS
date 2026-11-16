-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- ANALYTICS CENTER SCHEMA & TELEMETRY ENGINE
-- =============================================================================

-- 1. Visitor Sessions (tracks active sessions, device, page, live status)
create table if not exists public.visitor_sessions (
  id                    uuid primary key default gen_random_uuid(),
  anonymous_session_id  text not null,
  user_id               uuid references public.profiles (id) on delete set null,
  started_at            timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  ended_at              timestamptz,
  current_path          text not null default '/',
  current_activity      text not null default 'Viewing Homepage',
  device_category       text not null default 'Desktop' check (device_category in ('Desktop', 'Mobile', 'Tablet')),
  traffic_source        text not null default 'Direct',
  is_active             boolean not null default true,
  is_listening          boolean not null default false,
  metadata              jsonb not null default '{}'::jsonb
);

create index if not exists idx_visitor_sessions_active on public.visitor_sessions (is_active, last_seen_at desc);
create index if not exists idx_visitor_sessions_anon on public.visitor_sessions (anonymous_session_id);
create index if not exists idx_visitor_sessions_user on public.visitor_sessions (user_id);
create index if not exists idx_visitor_sessions_started on public.visitor_sessions (started_at desc);

-- 2. User Activity Logs (event trail for registered and anonymous users)
create table if not exists public.user_activity_logs (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references public.profiles (id) on delete set null,
  anonymous_session_id  text,
  event_name            text not null check (char_length(event_name) between 2 and 80),
  page_path             text not null default '/',
  activity_description  text not null default '',
  event_metadata        jsonb not null default '{}'::jsonb,
  idempotency_key       text unique,
  created_at            timestamptz not null default now()
);

create index if not exists idx_user_activity_logs_user on public.user_activity_logs (user_id, created_at desc);
create index if not exists idx_user_activity_logs_created on public.user_activity_logs (created_at desc);
create index if not exists idx_user_activity_logs_event on public.user_activity_logs (event_name);

-- 3. Audio Listening Sessions (tracks live and episode playback durations)
create table if not exists public.audio_listening_sessions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references public.profiles (id) on delete set null,
  anonymous_session_id    text not null,
  audio_source_id         text not null default 'live_radio_90.8',
  source_type             text not null default 'live' check (source_type in ('live', 'episode', 'podcast')),
  started_at              timestamptz not null default now(),
  last_heartbeat_at       timestamptz not null default now(),
  ended_at                timestamptz,
  total_listening_seconds integer not null default 0 check (total_listening_seconds >= 0),
  listening_status        text not null default 'active' check (listening_status in ('active', 'paused', 'completed', 'stopped', 'error', 'expired')),
  device_category         text not null default 'Desktop'
);

create index if not exists idx_audio_listening_active on public.audio_listening_sessions (listening_status, last_heartbeat_at desc);
create index if not exists idx_audio_listening_user on public.audio_listening_sessions (user_id);
create index if not exists idx_audio_listening_anon on public.audio_listening_sessions (anonymous_session_id);
create index if not exists idx_audio_listening_started on public.audio_listening_sessions (started_at desc);

-- 4. Analytics Events (generic telemetry stream with deduplication)
create table if not exists public.analytics_events (
  id              uuid primary key default gen_random_uuid(),
  session_id      text not null,
  user_id         uuid references public.profiles (id) on delete set null,
  event_name      text not null check (char_length(event_name) between 2 and 80),
  event_timestamp timestamptz not null default now(),
  event_metadata  jsonb not null default '{}'::jsonb,
  idempotency_key text unique
);

create index if not exists idx_analytics_events_name_time on public.analytics_events (event_name, event_timestamp desc);

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
alter table public.visitor_sessions enable row level security;
alter table public.user_activity_logs enable row level security;
alter table public.audio_listening_sessions enable row level security;
alter table public.analytics_events enable row level security;

-- Drop any prior policies
drop policy if exists "Allow anon and users to insert/update visitor_sessions" on public.visitor_sessions;
drop policy if exists "Allow anon and users to insert visitor_sessions" on public.visitor_sessions;
drop policy if exists "Allow anon and users to update visitor_sessions" on public.visitor_sessions;
drop policy if exists "Allow admin to read visitor_sessions" on public.visitor_sessions;

drop policy if exists "Allow anon and users to insert user_activity_logs" on public.user_activity_logs;
drop policy if exists "Allow admin to read user_activity_logs" on public.user_activity_logs;

drop policy if exists "Allow anon and users to insert/update audio_sessions" on public.audio_listening_sessions;
drop policy if exists "Allow anon and users to insert audio_sessions" on public.audio_listening_sessions;
drop policy if exists "Allow anon and users to update audio_sessions" on public.audio_listening_sessions;
drop policy if exists "Allow admin to read audio_sessions" on public.audio_listening_sessions;

drop policy if exists "Allow anon and users to insert analytics_events" on public.analytics_events;
drop policy if exists "Allow admin to read analytics_events" on public.analytics_events;

-- visitor_sessions RLS
create policy "Allow anon and users to insert visitor_sessions"
  on public.visitor_sessions
  for insert
  with check (true);

create policy "Allow anon and users to update visitor_sessions"
  on public.visitor_sessions
  for update
  using (true)
  with check (true);

create policy "Allow admin to read visitor_sessions"
  on public.visitor_sessions
  for select
  using (app.is_admin());

-- user_activity_logs RLS
create policy "Allow anon and users to insert user_activity_logs"
  on public.user_activity_logs
  for insert
  with check (true);

create policy "Allow admin to read user_activity_logs"
  on public.user_activity_logs
  for select
  using (app.is_admin());

-- audio_listening_sessions RLS
create policy "Allow anon and users to insert audio_sessions"
  on public.audio_listening_sessions
  for insert
  with check (true);

create policy "Allow anon and users to update audio_sessions"
  on public.audio_listening_sessions
  for update
  using (true)
  with check (true);

create policy "Allow admin to read audio_sessions"
  on public.audio_listening_sessions
  for select
  using (app.is_admin());

-- analytics_events RLS
create policy "Allow anon and users to insert analytics_events"
  on public.analytics_events
  for insert
  with check (true);

create policy "Allow admin to read analytics_events"
  on public.analytics_events
  for select
  using (app.is_admin());

-- Grants on tables
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.visitor_sessions to anon, authenticated;
grant select, insert on public.user_activity_logs to anon, authenticated;
grant select, insert, update on public.audio_listening_sessions to anon, authenticated;
grant select, insert on public.analytics_events to anon, authenticated;

-- -----------------------------------------------------------------------------
-- RPC FUNCTIONS (in public schema for PostgREST & app schema for internal calls)
-- -----------------------------------------------------------------------------

-- Periodic stale session cleanup
create or replace function public.cleanup_stale_analytics_sessions()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Mark sessions inactive if last heartbeat is older than 60 seconds
  update public.visitor_sessions
  set is_active = false, ended_at = coalesce(ended_at, now())
  where is_active = true and last_seen_at < now() - interval '60 seconds';

  -- Mark audio sessions stopped if heartbeat older than 60 seconds
  update public.audio_listening_sessions
  set listening_status = 'expired', ended_at = coalesce(ended_at, now())
  where listening_status = 'active' and last_heartbeat_at < now() - interval '60 seconds';
end;
$$;

-- Heartbeat recorder
create or replace function public.record_heartbeat(
  p_anonymous_session_id text,
  p_current_path text default '/',
  p_current_activity text default 'Viewing Website',
  p_device_category text default 'Desktop',
  p_is_listening boolean default false,
  p_traffic_source text default 'Direct',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id uuid;
  v_user_id uuid := auth.uid();
begin
  -- Find existing active session with same anonymous_session_id within 30 minutes
  select id into v_session_id
  from public.visitor_sessions
  where anonymous_session_id = p_anonymous_session_id
    and is_active = true
  order by last_seen_at desc
  limit 1;

  if v_session_id is not null then
    update public.visitor_sessions
    set
      user_id = coalesce(v_user_id, user_id),
      last_seen_at = now(),
      current_path = p_current_path,
      current_activity = p_current_activity,
      device_category = p_device_category,
      is_listening = p_is_listening,
      metadata = metadata || p_metadata
    where id = v_session_id;
  else
    insert into public.visitor_sessions (
      anonymous_session_id,
      user_id,
      started_at,
      last_seen_at,
      current_path,
      current_activity,
      device_category,
      traffic_source,
      is_active,
      is_listening,
      metadata
    ) values (
      p_anonymous_session_id,
      v_user_id,
      now(),
      now(),
      p_current_path,
      p_current_activity,
      p_device_category,
      p_traffic_source,
      true,
      p_is_listening,
      p_metadata
    )
    returning id into v_session_id;
  end if;

  return v_session_id;
end;
$$;

-- User activity recorder
create or replace function public.record_user_activity(
  p_event_name text,
  p_page_path text default '/',
  p_activity_description text default '',
  p_anonymous_session_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_log_id uuid;
  v_user_id uuid := auth.uid();
begin
  -- Check idempotency
  if p_idempotency_key is not null then
    select id into v_log_id
    from public.user_activity_logs
    where idempotency_key = p_idempotency_key;

    if v_log_id is not null then
      return v_log_id;
    end if;
  end if;

  insert into public.user_activity_logs (
    user_id,
    anonymous_session_id,
    event_name,
    page_path,
    activity_description,
    event_metadata,
    idempotency_key,
    created_at
  ) values (
    v_user_id,
    p_anonymous_session_id,
    p_event_name,
    p_page_path,
    p_activity_description,
    p_metadata,
    p_idempotency_key,
    now()
  )
  returning id into v_log_id;

  if p_idempotency_key is not null or p_anonymous_session_id is not null then
    insert into public.analytics_events (
      session_id,
      user_id,
      event_name,
      event_timestamp,
      event_metadata,
      idempotency_key
    ) values (
      coalesce(p_anonymous_session_id, v_log_id::text),
      v_user_id,
      p_event_name,
      now(),
      p_metadata,
      p_idempotency_key
    )
    on conflict (idempotency_key) do nothing;
  end if;

  return v_log_id;
end;
$$;

-- Audio listening session heartbeat
create or replace function public.audio_heartbeat(
  p_session_id uuid,
  p_anonymous_session_id text,
  p_audio_source_id text,
  p_source_type text,
  p_seconds_increment integer,
  p_status text,
  p_device_category text default 'Desktop'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := p_session_id;
  v_user_id uuid := auth.uid();
  v_safe_inc integer := least(greatest(p_seconds_increment, 0), 45);
begin
  if v_id is not null and exists (select 1 from public.audio_listening_sessions where id = v_id) then
    update public.audio_listening_sessions
    set
      last_heartbeat_at = now(),
      total_listening_seconds = total_listening_seconds + v_safe_inc,
      listening_status = p_status,
      ended_at = case when p_status in ('completed', 'stopped', 'error') then now() else ended_at end
    where id = v_id;
  else
    insert into public.audio_listening_sessions (
      user_id,
      anonymous_session_id,
      audio_source_id,
      source_type,
      started_at,
      last_heartbeat_at,
      total_listening_seconds,
      listening_status,
      device_category
    ) values (
      v_user_id,
      p_anonymous_session_id,
      p_audio_source_id,
      p_source_type,
      now(),
      now(),
      v_safe_inc,
      p_status,
      p_device_category
    )
    returning id into v_id;
  end if;

  -- Also update is_listening on visitor_sessions
  update public.visitor_sessions
  set is_listening = (p_status = 'active')
  where anonymous_session_id = p_anonymous_session_id and is_active = true;

  return v_id;
end;
$$;

-- Analytics Overview RPC
create or replace function public.get_analytics_overview(
  p_start_date timestamptz,
  p_end_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_res jsonb;
  v_tot_visitors bigint;
  v_uniq_visitors bigint;
  v_tot_sessions bigint;
  v_page_views bigint;
  v_new_visitors bigint;
  v_ret_visitors bigint;
  v_avg_engagement_secs numeric;
  
  v_act_registered bigint;
  v_act_anon bigint;
  v_act_sessions bigint;
  v_act_listeners bigint;
  
  v_tot_plays bigint;
  v_uniq_listeners bigint;
  v_tot_listening_secs bigint;
  v_avg_listening_secs numeric;
  v_completed_sessions bigint;
  
  v_tot_booking_requests bigint;
  v_pending_bookings bigint;
  v_approved_bookings bigint;
  v_rejected_or_cancelled_bookings bigint;
  v_completed_bookings bigint;
begin
  if not app.is_admin() then
    raise exception 'Unauthorized: Only administrators can view analytics overview' using errcode = '42501';
  end if;

  perform public.cleanup_stale_analytics_sessions();

  -- Website statistics
  select
    count(distinct anonymous_session_id),
    count(*)
  into v_uniq_visitors, v_tot_sessions
  from public.visitor_sessions
  where started_at between p_start_date and p_end_date;

  v_tot_visitors := coalesce(v_uniq_visitors, 0);

  select count(*)
  into v_page_views
  from public.user_activity_logs
  where event_name = 'PAGE_VIEW'
    and created_at between p_start_date and p_end_date;

  -- New vs returning
  select count(distinct s.anonymous_session_id)
  into v_new_visitors
  from public.visitor_sessions s
  where s.started_at between p_start_date and p_end_date
    and not exists (
      select 1 from public.visitor_sessions prev
      where prev.anonymous_session_id = s.anonymous_session_id
        and prev.started_at < p_start_date
    );

  v_ret_visitors := greatest(0, coalesce(v_tot_visitors, 0) - coalesce(v_new_visitors, 0));

  select coalesce(avg(extract(epoch from (last_seen_at - started_at))), 0)
  into v_avg_engagement_secs
  from public.visitor_sessions
  where started_at between p_start_date and p_end_date;

  -- Live statistics (active within last 45 seconds)
  select count(distinct user_id)
  into v_act_registered
  from public.visitor_sessions
  where is_active = true and last_seen_at >= now() - interval '45 seconds' and user_id is not null;

  select count(distinct anonymous_session_id)
  into v_act_anon
  from public.visitor_sessions
  where is_active = true and last_seen_at >= now() - interval '45 seconds' and user_id is null;

  select count(*)
  into v_act_sessions
  from public.visitor_sessions
  where is_active = true and last_seen_at >= now() - interval '45 seconds';

  select count(distinct anonymous_session_id)
  into v_act_listeners
  from public.audio_listening_sessions
  where listening_status = 'active' and last_heartbeat_at >= now() - interval '45 seconds';

  -- Listening statistics
  select
    count(*),
    count(distinct anonymous_session_id),
    coalesce(sum(total_listening_seconds), 0),
    coalesce(avg(case when total_listening_seconds > 0 then total_listening_seconds end), 0),
    count(*) filter (where listening_status = 'completed')
  into
    v_tot_plays,
    v_uniq_listeners,
    v_tot_listening_secs,
    v_avg_listening_secs,
    v_completed_sessions
  from public.audio_listening_sessions
  where started_at between p_start_date and p_end_date;

  -- Booking statistics (authoritative from studio_bookings and studio_booking_requests)
  select count(*)
  into v_tot_booking_requests
  from public.studio_booking_requests
  where created_at between p_start_date and p_end_date;

  select count(*)
  into v_pending_bookings
  from public.studio_booking_requests
  where status = 'PENDING' and created_at between p_start_date and p_end_date;

  select count(*)
  into v_approved_bookings
  from public.studio_bookings
  where status = 'CONFIRMED' and created_at between p_start_date and p_end_date;

  select count(*)
  into v_rejected_or_cancelled_bookings
  from public.studio_bookings
  where status = 'CANCELLED' and created_at between p_start_date and p_end_date;

  select count(*)
  into v_completed_bookings
  from public.studio_bookings
  where status = 'COMPLETED' and created_at between p_start_date and p_end_date;

  v_res := jsonb_build_object(
    'website', jsonb_build_object(
      'total_visitors', coalesce(v_tot_visitors, 0),
      'unique_visitors', coalesce(v_uniq_visitors, 0),
      'total_sessions', coalesce(v_tot_sessions, 0),
      'page_views', coalesce(v_page_views, 0),
      'new_visitors', coalesce(v_new_visitors, 0),
      'returning_visitors', coalesce(v_ret_visitors, 0),
      'avg_engagement_seconds', round(v_avg_engagement_secs, 1)
    ),
    'live', jsonb_build_object(
      'active_registered_users', coalesce(v_act_registered, 0),
      'active_anonymous_visitors', coalesce(v_act_anon, 0),
      'total_active_sessions', coalesce(v_act_sessions, 0),
      'active_audio_listeners', coalesce(v_act_listeners, 0)
    ),
    'listening', jsonb_build_object(
      'total_audio_plays', coalesce(v_tot_plays, 0),
      'unique_listeners', coalesce(v_uniq_listeners, 0),
      'total_listening_seconds', coalesce(v_tot_listening_secs, 0),
      'total_listening_hours', round(coalesce(v_tot_listening_secs, 0) / 3600.0, 2),
      'avg_listening_seconds', round(v_avg_listening_secs, 1),
      'completed_listening_sessions', coalesce(v_completed_sessions, 0)
    ),
    'booking', jsonb_build_object(
      'total_booking_requests', coalesce(v_tot_booking_requests, 0),
      'pending_bookings', coalesce(v_pending_bookings, 0),
      'approved_bookings', coalesce(v_approved_bookings, 0),
      'rejected_or_cancelled_bookings', coalesce(v_rejected_or_cancelled_bookings, 0),
      'completed_bookings', coalesce(v_completed_bookings, 0)
    )
  );

  return v_res;
end;
$$;

-- Live Visitors Details RPC
create or replace function public.get_live_visitors()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_registered jsonb;
  v_anon jsonb;
begin
  if not app.is_admin() then
    raise exception 'Unauthorized: Only administrators can view live visitor data' using errcode = '42501';
  end if;

  perform public.cleanup_stale_analytics_sessions();

  select coalesce(jsonb_agg(r), '[]'::jsonb)
  into v_registered
  from (
    select
      s.id,
      s.user_id,
      p.full_name,
      p.avatar_url,
      p.role,
      s.current_path,
      s.current_activity,
      s.device_category,
      s.last_seen_at,
      s.started_at,
      s.is_listening,
      case
        when s.last_seen_at >= now() - interval '30 seconds' then 'online'
        else 'idle'
      end as status
    from public.visitor_sessions s
    join public.profiles p on p.id = s.user_id
    where s.is_active = true
      and s.last_seen_at >= now() - interval '45 seconds'
    order by s.last_seen_at desc
  ) r;

  select coalesce(jsonb_agg(a), '[]'::jsonb)
  into v_anon
  from (
    select
      s.id,
      s.anonymous_session_id,
      '#A' || substring(md5(s.anonymous_session_id) from 1 for 4) as masked_visitor_id,
      s.current_path,
      s.current_activity,
      s.device_category,
      s.last_seen_at,
      s.started_at,
      s.is_listening,
      case
        when s.last_seen_at >= now() - interval '30 seconds' then 'online'
        else 'idle'
      end as status
    from public.visitor_sessions s
    where s.is_active = true
      and s.user_id is null
      and s.last_seen_at >= now() - interval '45 seconds'
    order by s.last_seen_at desc
  ) a;

  return jsonb_build_object(
    'registered_users', v_registered,
    'anonymous_visitors', v_anon,
    'total_active', jsonb_array_length(v_registered) + jsonb_array_length(v_anon)
  );
end;
$$;

-- Audio Analytics Aggregation RPC
create or replace function public.get_audio_analytics(
  p_start_date timestamptz,
  p_end_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_summary jsonb;
  v_hourly jsonb;
  v_daily jsonb;
  v_devices jsonb;
  v_popular jsonb;
begin
  if not app.is_admin() then
    raise exception 'Unauthorized: Only administrators can view audio analytics' using errcode = '42501';
  end if;

  perform public.cleanup_stale_analytics_sessions();

  -- Summary
  select jsonb_build_object(
    'total_plays', count(*),
    'unique_listeners', count(distinct anonymous_session_id),
    'total_listening_seconds', coalesce(sum(total_listening_seconds), 0),
    'total_listening_hours', round(coalesce(sum(total_listening_seconds), 0) / 3600.0, 2),
    'avg_listening_seconds', round(coalesce(avg(case when total_listening_seconds > 0 then total_listening_seconds end), 0), 1),
    'completed_sessions', count(*) filter (where listening_status = 'completed'),
    'current_live_listeners', (
      select count(distinct anonymous_session_id)
      from public.audio_listening_sessions
      where listening_status = 'active' and last_heartbeat_at >= now() - interval '45 seconds'
    )
  )
  into v_summary
  from public.audio_listening_sessions
  where started_at between p_start_date and p_end_date;

  -- Hourly distribution (0-23)
  select coalesce(jsonb_agg(h), '[]'::jsonb)
  into v_hourly
  from (
    select
      extract(hour from started_at)::integer as hour,
      count(*) as plays,
      coalesce(sum(total_listening_seconds), 0) as total_seconds
    from public.audio_listening_sessions
    where started_at between p_start_date and p_end_date
    group by 1
    order by 1
  ) h;

  -- Daily trend
  select coalesce(jsonb_agg(d), '[]'::jsonb)
  into v_daily
  from (
    select
      to_char(started_at, 'YYYY-MM-DD') as date,
      count(*) as plays,
      count(distinct anonymous_session_id) as listeners,
      coalesce(sum(total_listening_seconds), 0) as total_seconds
    from public.audio_listening_sessions
    where started_at between p_start_date and p_end_date
    group by 1
    order by 1
  ) d;

  -- Device breakdown
  select coalesce(jsonb_agg(dev), '[]'::jsonb)
  into v_devices
  from (
    select
      device_category,
      count(*) as count,
      coalesce(sum(total_listening_seconds), 0) as total_seconds
    from public.audio_listening_sessions
    where started_at between p_start_date and p_end_date
    group by 1
    order by 2 desc
  ) dev;

  -- Popular audio sources
  select coalesce(jsonb_agg(pop), '[]'::jsonb)
  into v_popular
  from (
    select
      audio_source_id,
      source_type,
      count(*) as plays,
      count(distinct anonymous_session_id) as unique_listeners,
      coalesce(sum(total_listening_seconds), 0) as total_seconds
    from public.audio_listening_sessions
    where started_at between p_start_date and p_end_date
    group by 1, 2
    order by 3 desc
    limit 10
  ) pop;

  return jsonb_build_object(
    'summary', v_summary,
    'hourly_distribution', v_hourly,
    'daily_trends', v_daily,
    'device_breakdown', v_devices,
    'popular_content', v_popular
  );
end;
$$;

-- Booking Analytics Funnel & Stats RPC
create or replace function public.get_booking_analytics(
  p_start_date timestamptz,
  p_end_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_page_views bigint;
  v_form_opened bigint;
  v_submitted bigint;
  v_approved bigint;
  v_completed bigint;
  v_rejected bigint;
  v_cancelled bigint;
  v_studios jsonb;
  v_timeline jsonb;
begin
  if not app.is_admin() then
    raise exception 'Unauthorized: Only administrators can view booking analytics' using errcode = '42501';
  end if;

  -- Funnel steps
  select count(*)
  into v_page_views
  from public.user_activity_logs
  where event_name in ('PAGE_VIEW')
    and (page_path like '%studio%' or page_path like '%booking%')
    and created_at between p_start_date and p_end_date;

  select count(*)
  into v_form_opened
  from public.user_activity_logs
  where event_name in ('BOOKING_FORM_OPEN', 'STUDIO_DIALOG_OPENED')
    and created_at between p_start_date and p_end_date;

  select count(*)
  into v_submitted
  from public.studio_booking_requests
  where created_at between p_start_date and p_end_date;

  select count(*)
  into v_approved
  from public.studio_bookings
  where status = 'CONFIRMED' and created_at between p_start_date and p_end_date;

  select count(*)
  into v_completed
  from public.studio_bookings
  where status = 'COMPLETED' and created_at between p_start_date and p_end_date;

  select count(*)
  into v_rejected
  from public.studio_booking_requests
  where status = 'REJECTED' and created_at between p_start_date and p_end_date;

  select count(*)
  into v_cancelled
  from public.studio_bookings
  where status = 'CANCELLED' and created_at between p_start_date and p_end_date;

  -- Most requested studio / facility
  select coalesce(jsonb_agg(st), '[]'::jsonb)
  into v_studios
  from (
    select
      coalesce(studio_facility, 'Main Broadcast Studio (Studio A)') as studio_facility,
      count(*) as total_bookings
    from public.studio_bookings
    where created_at between p_start_date and p_end_date
    group by 1
    order by 2 desc
  ) st;

  -- Daily timeline
  select coalesce(jsonb_agg(tl), '[]'::jsonb)
  into v_timeline
  from (
    select
      to_char(created_at, 'YYYY-MM-DD') as date,
      count(*) as requests,
      count(*) filter (where status = 'CONFIRMED') as confirmed
    from public.studio_bookings
    where created_at between p_start_date and p_end_date
    group by 1
    order by 1
  ) tl;

  return jsonb_build_object(
    'funnel', jsonb_build_object(
      'page_views', coalesce(v_page_views, 0),
      'form_opened', coalesce(v_form_opened, 0),
      'submitted', coalesce(v_submitted, 0),
      'approved', coalesce(v_approved, 0),
      'completed', coalesce(v_completed, 0),
      'conversion_rate', case
        when coalesce(v_page_views, 0) > 0 then round((coalesce(v_completed, 0)::numeric / v_page_views) * 100.0, 2)
        else 0.0
      end
    ),
    'statuses', jsonb_build_object(
      'total_requests', coalesce(v_submitted, 0),
      'pending', (select count(*) from public.studio_booking_requests where status = 'PENDING' and created_at between p_start_date and p_end_date),
      'approved', coalesce(v_approved, 0),
      'rejected', coalesce(v_rejected, 0),
      'cancelled', coalesce(v_cancelled, 0),
      'completed', coalesce(v_completed, 0)
    ),
    'studios', v_studios,
    'timeline', v_timeline
  );
end;
$$;

-- Traffic and Audience Analytics RPC
create or replace function public.get_traffic_audience_analytics(
  p_start_date timestamptz,
  p_end_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_devices jsonb;
  v_sources jsonb;
  v_pages jsonb;
  v_new_vs_ret jsonb;
begin
  if not app.is_admin() then
    raise exception 'Unauthorized: Only administrators can view traffic and audience analytics' using errcode = '42501';
  end if;

  -- Device breakdown
  select coalesce(jsonb_agg(d), '[]'::jsonb)
  into v_devices
  from (
    select
      device_category,
      count(*) as sessions,
      count(distinct anonymous_session_id) as visitors
    from public.visitor_sessions
    where started_at between p_start_date and p_end_date
    group by 1
    order by 2 desc
  ) d;

  -- Traffic sources
  select coalesce(jsonb_agg(s), '[]'::jsonb)
  into v_sources
  from (
    select
      traffic_source as source,
      count(*) as sessions,
      count(distinct anonymous_session_id) as visitors
    from public.visitor_sessions
    where started_at between p_start_date and p_end_date
    group by 1
    order by 2 desc
  ) s;

  -- Top pages visited
  select coalesce(jsonb_agg(p), '[]'::jsonb)
  into v_pages
  from (
    select
      page_path,
      count(*) as page_views,
      count(distinct anonymous_session_id) as unique_visitors
    from public.user_activity_logs
    where event_name = 'PAGE_VIEW'
      and created_at between p_start_date and p_end_date
    group by 1
    order by 2 desc
    limit 10
  ) p;

  -- Retention / New vs Returning
  select jsonb_build_object(
    'new_visitors', count(distinct s.anonymous_session_id) filter (
      where not exists (
        select 1 from public.visitor_sessions prev
        where prev.anonymous_session_id = s.anonymous_session_id
          and prev.started_at < p_start_date
      )
    ),
    'returning_visitors', count(distinct s.anonymous_session_id) filter (
      where exists (
        select 1 from public.visitor_sessions prev
        where prev.anonymous_session_id = s.anonymous_session_id
          and prev.started_at < p_start_date
      )
    )
  )
  into v_new_vs_ret
  from public.visitor_sessions s
  where s.started_at between p_start_date and p_end_date;

  return jsonb_build_object(
    'devices', v_devices,
    'sources', v_sources,
    'top_pages', v_pages,
    'visitor_types', v_new_vs_ret
  );
end;
$$;

-- Schema app aliases so both app.func and public.func work seamlessly
create or replace function app.cleanup_stale_analytics_sessions() returns void language sql as $$ select public.cleanup_stale_analytics_sessions(); $$;
create or replace function app.record_heartbeat(p_anonymous_session_id text, p_current_path text default '/', p_current_activity text default 'Viewing Website', p_device_category text default 'Desktop', p_is_listening boolean default false, p_traffic_source text default 'Direct', p_metadata jsonb default '{}'::jsonb) returns uuid language sql as $$ select public.record_heartbeat(p_anonymous_session_id, p_current_path, p_current_activity, p_device_category, p_is_listening, p_traffic_source, p_metadata); $$;
create or replace function app.record_user_activity(p_event_name text, p_page_path text default '/', p_activity_description text default '', p_anonymous_session_id text default null, p_metadata jsonb default '{}'::jsonb, p_idempotency_key text default null) returns uuid language sql as $$ select public.record_user_activity(p_event_name, p_page_path, p_activity_description, p_anonymous_session_id, p_metadata, p_idempotency_key); $$;
create or replace function app.audio_heartbeat(p_session_id uuid, p_anonymous_session_id text, p_audio_source_id text, p_source_type text, p_seconds_increment integer, p_status text, p_device_category text default 'Desktop') returns uuid language sql as $$ select public.audio_heartbeat(p_session_id, p_anonymous_session_id, p_audio_source_id, p_source_type, p_seconds_increment, p_status, p_device_category); $$;
create or replace function app.get_analytics_overview(p_start_date timestamptz, p_end_date timestamptz) returns jsonb language sql as $$ select public.get_analytics_overview(p_start_date, p_end_date); $$;
create or replace function app.get_live_visitors() returns jsonb language sql as $$ select public.get_live_visitors(); $$;
create or replace function app.get_audio_analytics(p_start_date timestamptz, p_end_date timestamptz) returns jsonb language sql as $$ select public.get_audio_analytics(p_start_date, p_end_date); $$;
create or replace function app.get_booking_analytics(p_start_date timestamptz, p_end_date timestamptz) returns jsonb language sql as $$ select public.get_booking_analytics(p_start_date, p_end_date); $$;
create or replace function app.get_traffic_audience_analytics(p_start_date timestamptz, p_end_date timestamptz) returns jsonb language sql as $$ select public.get_traffic_audience_analytics(p_start_date, p_end_date); $$;

-- Revoke & Grant function permissions
revoke execute on function public.cleanup_stale_analytics_sessions() from public;
grant  execute on function public.cleanup_stale_analytics_sessions() to anon, authenticated;

revoke execute on function public.record_heartbeat(text, text, text, text, boolean, text, jsonb) from public;
grant  execute on function public.record_heartbeat(text, text, text, text, boolean, text, jsonb) to anon, authenticated;

revoke execute on function public.record_user_activity(text, text, text, text, jsonb, text) from public;
grant  execute on function public.record_user_activity(text, text, text, text, jsonb, text) to anon, authenticated;

revoke execute on function public.audio_heartbeat(uuid, text, text, text, integer, text, text) from public;
grant  execute on function public.audio_heartbeat(uuid, text, text, text, integer, text, text) to anon, authenticated;

-- Admin-only RPCs: revoke from anon & public, grant to authenticated only
revoke execute on function public.get_analytics_overview(timestamptz, timestamptz) from public;
revoke execute on function public.get_analytics_overview(timestamptz, timestamptz) from anon;
grant  execute on function public.get_analytics_overview(timestamptz, timestamptz) to authenticated;

revoke execute on function public.get_live_visitors() from public;
revoke execute on function public.get_live_visitors() from anon;
grant  execute on function public.get_live_visitors() to authenticated;

revoke execute on function public.get_audio_analytics(timestamptz, timestamptz) from public;
revoke execute on function public.get_audio_analytics(timestamptz, timestamptz) from anon;
grant  execute on function public.get_audio_analytics(timestamptz, timestamptz) to authenticated;

revoke execute on function public.get_booking_analytics(timestamptz, timestamptz) from public;
revoke execute on function public.get_booking_analytics(timestamptz, timestamptz) from anon;
grant  execute on function public.get_booking_analytics(timestamptz, timestamptz) to authenticated;

revoke execute on function public.get_traffic_audience_analytics(timestamptz, timestamptz) from public;
revoke execute on function public.get_traffic_audience_analytics(timestamptz, timestamptz) from anon;
grant  execute on function public.get_traffic_audience_analytics(timestamptz, timestamptz) to authenticated;
