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
  e.created_at
from public.episodes e
join public.programs p on p.id = e.program_id
join public.audio_files a on a.id = e.audio_file_id
where e.status = 'APPROVED'
  and p.active;

comment on view public.v_public_approved_episodes is
  'All approved episodes with their audio paths, for the Whats New section.';

grant select on public.v_public_approved_episodes to anon, authenticated;
