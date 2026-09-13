-- Add final_audio_file_id to episodes table
ALTER TABLE public.episodes
ADD COLUMN final_audio_file_id UUID REFERENCES public.audio_files(id) ON DELETE SET NULL;

-- Create an index to support faster lookups
CREATE INDEX idx_episodes_final_audio_file_id ON public.episodes(final_audio_file_id);
