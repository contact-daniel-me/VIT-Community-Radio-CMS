import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from './authContext';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}

/** For screens that are already behind <RequireAuth>: profile is guaranteed. */
export function useCurrentUser() {
  const { profile } = useAuth();
  if (!profile) {
    throw new Error('useCurrentUser used outside an authenticated route');
  }
  return profile;
}
