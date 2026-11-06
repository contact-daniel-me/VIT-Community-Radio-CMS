-- Pre-migration Baseline Inspection Query
SELECT 
  current_database() AS database_name,
  current_user AS db_user,
  version() AS postgres_version;

-- Check audio_files columns
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'audio_files'
ORDER BY ordinal_position;

-- Check episodes columns
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'episodes'
ORDER BY ordinal_position;

-- Count audio_files records and paths
SELECT 
  count(*) AS total_audio_files,
  count(storage_path) AS valid_storage_paths,
  count(*) FILTER (WHERE storage_path IS NULL) AS null_storage_paths
FROM public.audio_files;

-- Count episodes records and audio links
SELECT 
  count(*) AS total_episodes,
  count(audio_file_id) AS episodes_with_audio,
  count(final_audio_file_id) AS episodes_with_final_audio
FROM public.episodes;

-- Check existing indexes on audio_files
SELECT 
  indexname, 
  indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'audio_files';

-- Check existing constraints on audio_files
SELECT 
  conname, 
  contype, 
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public' 
  AND c.conrelid = 'public.audio_files'::regclass;

-- Check existing triggers on audio_files and episodes
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table, 
  action_statement, 
  action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public' 
  AND event_object_table IN ('audio_files', 'episodes');

-- Check RLS policies on audio_files
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual, 
  with_check
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'audio_files';

