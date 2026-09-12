-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- 21: PODCAST EPISODES CACHE
--
-- A dedicated cache table for episodes pulled from the public Spotify/Anchor
-- RSS feed.  This is intentionally SEPARATE from the CMS `episodes` table:
--   * `episodes`         = internal CMS content created by RJs/Producers
--   * `podcast_episodes` = public RSS feed snapshot, populated by a sync job
--
-- The RSS GUID is the canonical identifier for deduplication.  The sync
-- process performs an UPSERT keyed on rss_guid so it is safe to run
-- repeatedly and incremental updates only touch changed rows.
-- =============================================================================

create table public.podcast_episodes (
  id            uuid        primary key default gen_random_uuid(),
  -- RSS <guid> — the canonical de-duplication key.
  rss_guid      text        not null unique check (char_length(rss_guid) between 1 and 500),
  title         text        not null check (char_length(title) between 1 and 500),
  description   text,
  -- Raw audio URL from <enclosure url="…">. Never stored locally.
  audio_url     text        not null,
  -- Anchor/Spotify canonical episode page.
  spotify_url   text,
  artwork_url   text,
  -- HH:MM:SS or MM:SS string from <itunes:duration>.
  duration      text,
  pub_date      timestamptz,
  episode_number integer,
  -- ISO-8601 timestamp of the last successful RSS sync pass.
  last_synced_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Fast ordered pagination (newest-first is the default).
create index podcast_episodes_pub_date_idx  on public.podcast_episodes (pub_date desc nulls last);
-- Point lookup when checking for stale episodes during sync.
create index podcast_episodes_rss_guid_idx  on public.podcast_episodes (rss_guid);
-- Generic PK lookup.
create index podcast_episodes_id_idx        on public.podcast_episodes (id);

comment on table public.podcast_episodes is
  'Server-side cache of episodes from the Spotify/Anchor RSS feed. '
  'Populated by the sync-podcast-episodes Edge Function. '
  'Never contains audio bytes — only metadata.';

-- ---------------------------------------------------------------------------
-- Auto-update updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_podcast_episodes_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger podcast_episodes_updated_at
  before update on public.podcast_episodes
  for each row execute function public.touch_podcast_episodes_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.podcast_episodes enable row level security;

-- Anyone (including anonymous visitors) can read cached episode metadata.
create policy "podcast_episodes_public_read"
  on public.podcast_episodes for select
  using (true);

-- Only the service-role key (used by the Edge Function) may write.
-- The anon / authenticated roles cannot insert, update, or delete.
-- No explicit write policy is needed: RLS denies by default for non-service roles.

-- Grant read to anonymous and authenticated users.
grant select on public.podcast_episodes to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Manual sync trigger available to admin users via RPC.
-- The Edge Function is the primary sync mechanism; this RPC is a convenience
-- for admins who want to force an immediate refresh from the dashboard.
-- ---------------------------------------------------------------------------
create or replace function public.admin_trigger_podcast_sync()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  -- Only ADMIN role may call this.
  if (select role from public.profiles where id = auth.uid()) <> 'ADMIN' then
    raise exception 'Permission denied: admin only';
  end if;

  -- Return last sync metadata so the caller can display it.
  select count(*) into v_count from public.podcast_episodes;
  return json_build_object(
    'cached_episodes', v_count,
    'message', 'Use the Edge Function endpoint to trigger a fresh sync.'
  );
end;
$$;

grant execute on function public.admin_trigger_podcast_sync() to authenticated;

-- ---------------------------------------------------------------------------
-- pg_cron scheduled sync (runs every 20 minutes)
-- Requires the pg_cron extension to be enabled in Supabase Dashboard
-- (Database → Extensions → pg_cron).
--
-- The cron job calls the Edge Function via pg_net (also requires the pg_net
-- extension). If either extension is not available, comment this block out —
-- the Edge Function can still be called manually from the admin dashboard.
-- ---------------------------------------------------------------------------
-- SELECT cron.schedule(
--   'sync-podcast-episodes',
--   '*/20 * * * *',
--   $$
--     SELECT net.http_post(
--       url     := current_setting('app.edge_function_url') || '/sync-podcast-episodes',
--       headers := jsonb_build_object(
--         'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
--         'Content-Type', 'application/json'
--       ),
--       body    := '{}'::jsonb
--     );
--   $$
-- );
