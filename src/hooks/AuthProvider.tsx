import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authService } from '@/services/authService';
import { badgeService } from '@/services/badgeService';
import { dataCache } from '@/lib/dataCache';
import { offlineStore } from '@/lib/offlineStore';
import { errorMessage } from '@/lib/errors';
import type { ProfileRow } from '@/types/database';
import { AuthContext, type AuthContextValue } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const inFlightPromise = useRef<Promise<void> | null>(null);
  const loadedUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (nextSession: Session | null, forceRefresh = false) => {
    if (!nextSession?.user) {
      loadedUserId.current = null;
      if (mounted.current) setProfile(null);
      return;
    }

    const userId = nextSession.user.id;

    // Deduplicate: If this user's profile is already loaded and no force refresh requested, skip redundant network call
    if (!forceRefresh && loadedUserId.current === userId && profile) {
      return;
    }

    // Deduplicate in-flight network request: reuse active promise
    if (inFlightPromise.current) {
      return inFlightPromise.current;
    }

    inFlightPromise.current = (async () => {
      try {
        const loaded = await authService.getProfile(userId);
        // Award badge before finalizing profile to prevent race conditions on initial gamification load
        await badgeService.awardFirstSignIn(userId).catch(() => undefined);

        if (mounted.current) {
          setProfile(loaded);
          loadedUserId.current = userId;
          setError(null);
        }
      } catch (cause) {
        // A signed-in user with no usable profile (deactivated, or never
        // provisioned) is treated as signed out rather than half-authenticated.
        loadedUserId.current = null;
        if (mounted.current) {
          setProfile(null);
          setError(errorMessage(cause));
        }
        await authService.signOut().catch(() => undefined);
      } finally {
        inFlightPromise.current = null;
      }
    })();

    return inFlightPromise.current;
  }, [profile]);

  useEffect(() => {
    mounted.current = true;

    // Supabase onAuthStateChange fires with INITIAL_SESSION immediately upon registration.
    // We let onAuthStateChange handle the state and session restoration cleanly.
    let initialResolved = false;

    authService
      .getSession()
      .then(async (initial) => {
        if (!mounted.current) return;
        setSession(initial);
        if (initial?.user) {
          await loadProfile(initial);
        }
      })
      .catch((cause) => mounted.current && setError(errorMessage(cause)))
      .finally(() => {
        initialResolved = true;
        if (mounted.current) setLoading(false);
      });

    const subscription = authService.onAuthStateChange((nextSession) => {
      if (!mounted.current) return;
      setSession(nextSession);
      void loadProfile(nextSession);
      if (!initialResolved && mounted.current) {
        setLoading(false);
      }
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
      await loadProfile(nextSession, true);
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    const currentUserId = profile?.id;
    loadedUserId.current = null;
    inFlightPromise.current = null;
    dataCache.clear();
    if (currentUserId) {
      void offlineStore.clearUserData(currentUserId);
    }
    await authService.signOut();
    setSession(null);
    setProfile(null);
    setError(null);
  }, [profile?.id]);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session, true);
  }, [loadProfile, session]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, profile, loading, error, signIn, signOut, refreshProfile }),
    [session, profile, loading, error, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
