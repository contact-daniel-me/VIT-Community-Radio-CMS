-- =============================================================================
-- Migration: 20260924000001_sync_podcast_episodes_rpc.sql
-- Description: RPC function to sync podcast episodes from public RSS feed
-- =============================================================================

create or replace function public.sync_podcast_episodes(p_episodes jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_total integer := 0;
begin
  if p_episodes is null or jsonb_array_length(p_episodes) = 0 then
    select count(*) into v_total from public.podcast_episodes;
    return json_build_object('success', true, 'synced', 0, 'total', v_total);
  end if;

  insert into public.podcast_episodes (
    rss_guid,
    title,
    description,
    audio_url,
    spotify_url,
    artwork_url,
    duration,
    pub_date,
    episode_number,
    last_synced_at
  )
  select
    item->>'rss_guid',
    coalesce(nullif(btrim(item->>'title'), ''), 'Untitled Episode'),
    item->>'description',
    item->>'audio_url',
    item->>'spotify_url',
    item->>'artwork_url',
    item->>'duration',
    nullif(item->>'pub_date', '')::timestamptz,
    nullif(item->>'episode_number', '')::integer,
    now()
  from jsonb_array_elements(p_episodes) as item
  where item->>'rss_guid' is not null
    and item->>'audio_url' is not null
  on conflict (rss_guid) do update set
    title          = excluded.title,
    description    = coalesce(excluded.description, podcast_episodes.description),
    audio_url      = excluded.audio_url,
    spotify_url    = coalesce(excluded.spotify_url, podcast_episodes.spotify_url),
    artwork_url    = coalesce(excluded.artwork_url, podcast_episodes.artwork_url),
    duration       = coalesce(excluded.duration, podcast_episodes.duration),
    pub_date       = coalesce(excluded.pub_date, podcast_episodes.pub_date),
    episode_number = coalesce(excluded.episode_number, podcast_episodes.episode_number),
    last_synced_at = now();

  get diagnostics v_inserted = row_count;
  select count(*) into v_total from public.podcast_episodes;

  return json_build_object(
    'success', true,
    'synced', v_inserted,
    'total', v_total
  );
end;
$$;

-- Allow public and authenticated callers to sync podcast episodes cache
grant execute on function public.sync_podcast_episodes(jsonb) to anon, authenticated;
