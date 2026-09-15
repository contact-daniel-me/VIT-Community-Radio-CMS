-- =============================================================================
-- VIT COMMUNITY RADIO CMS
-- Add permanent unique episode_id sequence to episodes
-- =============================================================================

-- 1. Create a sequence for the episode ID
CREATE SEQUENCE IF NOT EXISTS public.episode_id_seq START 1;
GRANT USAGE ON SEQUENCE public.episode_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.episode_id_seq TO service_role;

-- 2. Add the column to the episodes table (initially allowing NULL)
ALTER TABLE public.episodes ADD COLUMN episode_id TEXT;

-- 3. Safely backfill existing episodes
-- We process them in chronological order of creation to maintain timeline consistency
DO $$
DECLARE
  ep_record RECORD;
  seq_val INT;
BEGIN
  -- Bypass the episode lock trigger to backfill APPROVED/PENDING_QC episodes
  PERFORM set_config('app.workflow', 'on', true);
  
  FOR ep_record IN SELECT id FROM public.episodes ORDER BY created_at ASC
  LOOP
    seq_val := nextval('public.episode_id_seq');
    UPDATE public.episodes
    SET episode_id = 'VITCR-EP-' || LPAD(seq_val::text, 4, '0')
    WHERE id = ep_record.id;
  END LOOP;
END $$;

-- 4. Apply constraints now that all rows have a value
ALTER TABLE public.episodes ALTER COLUMN episode_id SET NOT NULL;
ALTER TABLE public.episodes ADD CONSTRAINT episodes_episode_id_unique UNIQUE (episode_id);

CREATE OR REPLACE FUNCTION public.assign_episode_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.episode_id IS NULL THEN
    NEW.episode_id := 'VITCR-EP-' || LPAD(nextval('public.episode_id_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Create the trigger
CREATE TRIGGER tr_episodes_assign_episode_id
BEFORE INSERT ON public.episodes
FOR EACH ROW
EXECUTE FUNCTION public.assign_episode_id();
