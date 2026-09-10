import { createContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { ProfileRow } from '@/types/database';

export interface AuthContextValue {
  session: Session | null;
  profile: ProfileRow | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
