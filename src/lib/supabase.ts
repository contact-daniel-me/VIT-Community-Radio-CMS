import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * The single Supabase client for the whole app.
 *
 * Only the anon key is used here, and only ever the anon key. Every request it
 * makes is subject to Row Level Security, which is where authorisation actually
 * lives. The service-role key must never appear in this directory.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Checked by <App> so a missing .env.local shows a setup screen rather than a
 * blank page. Throwing here would happen during module evaluation, before React
 * mounts, where no error boundary can catch it.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient<Database>(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const AUDIO_BUCKET = 'radio-audio';
