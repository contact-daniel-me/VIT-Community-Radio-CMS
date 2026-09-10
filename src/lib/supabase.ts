import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * The single Supabase client for the whole app.
 *
 * Only the anon key is used here, and only ever the anon key. Every request it
 * makes is subject to Row Level Security, which is where authorisation actually
 * lives. The service-role key must never appear in this directory.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/**
 * Checked by <App> so missing configuration shows a setup screen rather than a
 * blank page. Throwing here would happen during module evaluation, before React
 * mounts, where no error boundary can catch it.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * The fallbacks use `||`, NOT `??`, and that distinction is the whole point.
 *
 * When a VITE_* variable is not defined at build time, Vite substitutes an
 * EMPTY STRING, not undefined. `?? ` only catches null and undefined, so an
 * empty string sailed through to createClient(''), which throws
 * "supabaseUrl is required." during module evaluation -- before React mounts,
 * so not even the setup screen could render. The result was a blank white page
 * with one console error, which is exactly what a misconfigured deploy looked
 * like. `||` treats the empty string as missing and the placeholder holds.
 *
 * The placeholder is never used for real requests: <App> renders the setup
 * screen whenever isSupabaseConfigured is false.
 */
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-anon-key';

export const supabase = createClient<Database>(url || PLACEHOLDER_URL, anonKey || PLACEHOLDER_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const AUDIO_BUCKET = 'radio-audio';
