-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- DASHBOARD METRICS
-- =============================================================================

create or replace function public.get_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booked bigint;
  v_approved bigint;
  v_audio_upload bigint;
  v_final_upload bigint;
  v_qc_done bigint;
  v_todays_slots bigint;
begin
  -- 1. QC Done
  select count(*) into v_qc_done from public.episodes where status = 'APPROVED';

  -- 2. Final Upload
  select count(*) into v_final_upload from public.episodes 
    where final_audio_file_id is not null and status != 'APPROVED';

  -- 3. Audio Upload
  select count(*) into v_audio_upload from public.episodes 
    where audio_file_id is not null and final_audio_file_id is null and status != 'APPROVED';

  -- 4. Approved
  select count(*) into v_approved from public.studio_bookings b
    left join public.episodes e on b.episode_id = e.id
    where b.script_status = 'YES' 
      and (e.id is null or (e.audio_file_id is null and e.final_audio_file_id is null and e.status != 'APPROVED'));

  -- 5. Booked
  select count(*) into v_booked from public.studio_bookings b
    left join public.episodes e on b.episode_id = e.id
    where b.status in ('CONFIRMED', 'COMPLETED') 
      and coalesce(b.script_status, 'NO') != 'YES'
      and (e.id is null or (e.audio_file_id is null and e.final_audio_file_id is null and e.status != 'APPROVED'));

  -- 6. Today's slots
  select count(*) into v_todays_slots from public.schedules
    where start_time >= current_date and start_time < current_date + interval '1 day';

  return jsonb_build_object(
    'pipeline', jsonb_build_object(
      'booked', v_booked,
      'approved', v_approved,
      'audio_upload', v_audio_upload,
      'final_upload', v_final_upload,
      'qc_done', v_qc_done
    ),
    'todays_slots', v_todays_slots,
    'pending_qc', (select count(*) from public.episodes where status = 'PENDING_QC')
  );
end;
$$;

grant execute on function public.get_dashboard_metrics() to authenticated;

-- =============================================================================
-- VIT COMMUNITY RADIO CMS -- RAW AUDIO EXPIRY
-- =============================================================================
-- Fetches raw audio files nearing 30 days old.
create or replace function public.get_expiring_raw_audio()
returns table (
  episode_id uuid,
  title text,
  days_remaining integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select 
    e.id as episode_id,
    e.title,
    greatest(0, 30 - extract(day from current_timestamp - a.created_at)::integer) as days_remaining
  from public.episodes e
  join public.audio_files a on e.audio_file_id = a.id
  where e.status = 'APPROVED'
    and a.deleted_at is null
    and extract(day from current_timestamp - a.created_at) >= 23 -- within 7 days of expiry
  order by days_remaining asc
  limit 3;
end;
$$;

grant execute on function public.get_expiring_raw_audio() to authenticated;

