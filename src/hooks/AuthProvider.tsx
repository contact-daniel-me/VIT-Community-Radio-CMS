import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authService } from '@/services/authService';
import { errorMessage } from '@/lib/errors';
import type { ProfileRow } from '@/types/database';
import { AuthContext, type AuthContextValue } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const loadProfile = useCallback(async (nextSession: Session | null) => {
    if (!nextSession?.user) {
      if (mounted.current) setProfile(null);
      return;
    }
    try {
      const loaded = await authService.getProfile(nextSession.user.id);
      if (mounted.current) {
        setProfile(loaded);
        setError(null);
      }
    } catch (cause) {
      // A signed-in user with no usable profile (deactivated, or never
      // provisioned) is treated as signed out rather than half-authenticated.
      if (mounted.current) {
        setProfile(null);
        setError(errorMessage(cause));
      }
      await authService.signOut().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    authService
      .getSession()
      .then(async (initial) => {
        if (!mounted.current) return;
        setSession(initial);
        await loadProfile(initial);
      })
      .catch((cause) => mounted.current && setError(errorMessage(cause)))
      .finally(() => mounted.current && setLoading(false));

    const subscription = authService.onAuthStateChange((nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession);
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const nextSession = await authService.signIn(email, password);
      setSession(nextSession);
      await loadProfile(nextSession);
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    await authService.signOut();
    setSession(null);
    setProfile(null);
    setError(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session);
  }, [loadProfile, session]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, profile, loading, error, signIn, signOut, refreshProfile }),
    [session, profile, loading, error, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
