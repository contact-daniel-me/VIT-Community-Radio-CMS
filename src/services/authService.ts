import type { Session, Subscription } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { AppError, toAppError } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type { ProfileRow } from '@/types/database';

export interface SignedInUser {
  session: Session;
  profile: ProfileRow;
}

export const authService = {
  async signIn(email: string, password: string): Promise<Session> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      // GoTrue is deliberately vague here, and so are we: never reveal whether
      // an address exists.
      const message = /invalid login/i.test(error.message)
        ? 'That email address and password do not match.'
        : /email not confirmed/i.test(error.message)
          ? 'This account has not been confirmed yet. Ask an administrator.'
          : 'Could not sign you in. Please try again.';
      throw new AppError('AUTH', message, error);
    }

    if (!data.session) {
      throw new AppError('AUTH', 'Could not start a session. Please try again.');
    }
    return data.session;
  },

  /**
   * Self-registration is a REQUEST, not an entry.
   *
   * The database creates the profile inactive (migration 07), so the new
   * account can read and write nothing until an administrator activates it.
   * Any session GoTrue hands back is discarded here so the app never shows a
   * half-signed-in state to someone who has not been approved.
   */
  async requestAccess(input: {
    fullName: string;
    email: string;
    password: string;
  }): Promise<{ emailConfirmationRequired: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      // Goes to raw_user_meta_data, which the profile trigger uses for the
      // display name only -- it is user-controlled and never decides a role.
      options: { data: { full_name: input.fullName.trim() } },
    });

    if (error) {
      const message = /already registered|already exists/i.test(error.message)
        ? 'An account with that email address already exists. Try signing in instead.'
        : /signups not allowed|signup is disabled/i.test(error.message)
          ? 'Registration is currently closed. Please contact a station administrator.'
          : /password/i.test(error.message)
            ? 'That password is too weak. Use at least 8 characters.'
            : /email/i.test(error.message)
              ? 'That email address does not look valid.'
              : 'Could not send your request. Please try again.';
      throw new AppError('VALIDATION', message, error);
    }

    const emailConfirmationRequired = !data.session;
    if (data.session) {
      await supabase.auth.signOut().catch(() => undefined);
    }
    return { emailConfirmationRequired };
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw toAppError(error);
  },

  async getSession(): Promise<Session | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw toAppError(error);
    return data.session;
  },

  /**
   * The profile row carries the role. A signed-in user with no profile row, or
   * a deactivated one, has no access at all -- RLS returns nothing.
   */
  async getProfile(userId: string): Promise<ProfileRow> {
    const profile = await unwrap(
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    );
    if (!profile.active) {
      // approved_at distinguishes "never let in yet" from "let in, then removed".
      throw new AppError(
        'PERMISSION',
        profile.approved_at
          ? 'This account has been deactivated. Please contact a station administrator.'
          : 'Your access request is still waiting for a station administrator to approve it.',
      );
    }
    return profile;
  },

  async updateOwnProfile(
    userId: string,
    patch: { full_name?: string; avatar_url?: string | null },
  ): Promise<ProfileRow> {
    return unwrap(
      supabase.from('profiles').update(patch).eq('id', userId).select('*').single(),
    );
  },

  onAuthStateChange(handler: (session: Session | null) => void): Subscription {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => handler(session));
    return data.subscription;
  },
};
