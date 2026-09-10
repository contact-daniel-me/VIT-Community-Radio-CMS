/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Optional: the station's live audio stream. Unset = the player stays idle. */
  readonly VITE_STREAM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
