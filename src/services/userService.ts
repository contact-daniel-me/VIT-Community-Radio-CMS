import { supabase } from '@/lib/supabase';
import { AppError, assertWritten } from '@/lib/errors';
import { unwrap } from '@/lib/query';
import type { ProfileRow, UserRole } from '@/types/database';

export const userService = {
  async getUsers(): Promise<ProfileRow[]> {
    return unwrap(supabase.from('profiles').select('*').order('full_name'));
  },

  async getActiveUsersByRole(role: UserRole): Promise<ProfileRow[]> {
    return unwrap(
      supabase
        .from('profiles')
        .select('*')
        .eq('role', role)
        .eq('active', true)
        .order('full_name'),
    );
  },

  /**
   * Find a registered user by email address.
   *
   * Returns null when nobody has registered with that address -- which is the
   * answer the admin needs, not an error. Matching is case-insensitive because
   * people type their address however they please; the stored value is whatever
   * they signed up with.
   */
  async findByEmail(email: string): Promise<ProfileRow | null> {
    const rows = await unwrap(
      supabase.from('profiles').select('*').ilike('email', email.trim()).limit(1),
    );
    return rows[0] ?? null;
  },

  /**
   * Give an existing registered user the QC role by email address.
   *
   * Deliberately cannot create an account: the person must already have
   * registered. Inventing a login for someone from an admin form would mean
   * choosing their password, and the station has no way to hand it over
   * safely -- so this grants a role, nothing more.
   *
   * The database has the final say either way: only an admin may change a role
   * (app.guard_profile_update), and not their own.
   */
  async grantQcByEmail(email: string): Promise<ProfileRow> {
    const found = await this.findByEmail(email);

    if (!found) {
      throw new AppError(
        'NOT_FOUND',
        `Nobody has registered with ${email.trim()} yet. Ask them to request access first, then add them here.`,
      );
    }
    if (found.role === 'QC') {
      throw new AppError('VALIDATION', `${found.full_name} is already on the QC desk.`);
    }

    const updated = await this.updateUserRole(found.id, 'QC');

    // A pending account would still be blocked by RLS, so approving is part of
    // the same action rather than a second thing to remember.
    return updated.active ? updated : await this.setUserActive(found.id, true);
  },

  /**
   * Admin only, enforced by a database trigger -- which also refuses to let an
   * admin change their own role, so the station cannot be locked out.
   */
  async updateUserRole(userId: string, role: UserRole): Promise<ProfileRow> {
    const rows = await unwrap(
      supabase.from('profiles').update({ role }).eq('id', userId).select('*'),
    );
    return assertWritten(rows, 'user');
  },

  async setUserActive(userId: string, active: boolean): Promise<ProfileRow> {
    const rows = await unwrap(
      supabase.from('profiles').update({ active }).eq('id', userId).select('*'),
    );
    return assertWritten(rows, 'user');
  },
};
