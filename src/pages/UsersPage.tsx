import { useState, type FormEvent } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useCurrentUser } from '@/hooks/useAuth';
import { Banner, ConfirmButton, Loading, PageHeader } from '@/components/ui';
import { userService } from '@/services/userService';
import { activityService, describeAction, describeSubject } from '@/services/activityService';
import { ROLE_LABELS, ROLE_SUMMARY } from '@/lib/permissions';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatRelative } from '@/utils/datetime';
import type { UserRole } from '@/types/database';

const ROLES: UserRole[] = ['ADMIN', 'PRODUCER', 'RJ', 'QC'];

export function UsersPage() {
  const profile = useCurrentUser();
  const users = useAsync(() => userService.getUsers(), []);
  const activity = useAsync(() => activityService.getRecentActivity(20), []);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [qcEmail, setQcEmail] = useState('');
  const [addingQc, setAddingQc] = useState(false);

  const changeRole = async (userId: string, role: UserRole) => {
    setError(null);
    setNotice(null);
    try {
      await userService.updateUserRole(userId, role);
      setNotice('Role updated.');
      await Promise.all([users.reload(), activity.reload()]);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  // Add someone to the QC desk by email. They must already have registered --
  // the service refuses to invent an account, and says so plainly.
  const addQc = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const email = qcEmail.trim();
    if (!email.includes('@')) {
      setError('Enter the email address they registered with.');
      return;
    }

    setAddingQc(true);
    try {
      const granted = await userService.grantQcByEmail(email);
      setNotice(`${granted.full_name} (${granted.email}) can now review QC.`);
      setQcEmail('');
      await Promise.all([users.reload(), activity.reload()]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAddingQc(false);
    }
  };

  const toggleActive = async (userId: string, active: boolean) => {
    setError(null);
    setNotice(null);
    try {
      await userService.setUserActive(userId, active);
      setNotice(
        active
          ? 'Account activated. They can sign in now.'
          : 'Account deactivated. Their access stops immediately.',
      );
      await Promise.all([users.reload(), activity.reload()]);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  /**
   * Permanent removal, for the accounts an open registration form collects by
   * accident: typos, duplicates, people who never came back.
   *
   * No pre-check runs here. The database refuses an account that has station
   * records and says exactly what is attached, so the refusal is shown as-is
   * rather than second-guessed in the browser.
   */
  const removeUser = async (userId: string) => {
    setError(null);
    setNotice(null);
    try {
      const removed = await userService.deleteUser(userId);
      setNotice(`${removed.full_name} (${removed.email}) has been permanently deleted.`);
      await Promise.all([users.reload(), activity.reload()]);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  // Never activated = still waiting. Activated then switched off = removed.
  const allUsers = users.data ?? [];
  const pending = allUsers.filter((u) => !u.active && !u.approved_at);
  const sorted = [...allUsers].sort((a, b) => {
    const aPending = !a.active && !a.approved_at ? 0 : 1;
    const bPending = !b.active && !b.approved_at ? 0 : 1;
    return aPending - bPending || a.full_name.localeCompare(b.full_name);
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="Roles decide what each person can do. The database enforces them, not the interface."
      />

      <Banner>{error}</Banner>
      <Banner kind="success">{notice}</Banner>
      {pending.length > 0 ? (
        <Banner kind="info">
          <strong>
            {pending.length} access request{pending.length === 1 ? '' : 's'} waiting.
          </strong>{' '}
          {pending.map((u) => u.full_name).join(', ')} registered and cannot see anything until
          you activate them. Set the right role first, then press Activate.
        </Banner>
      ) : (
        <Banner kind="info">
          People request access from the public homepage, or you can create them directly in
          Supabase Auth. Either way the account starts inactive and appears here for approval,
          as a Radio Jockey until you change the role.
        </Banner>
      )}

      <section className="card qc-add">
        <div className="card-title">
          <h2>Add someone to the QC desk</h2>
        </div>
        <p className="small muted">
          Enter the email address they registered with. They must already have an account
          &mdash; ask them to <strong>Request access</strong> first if they do not.
        </p>
        <form className="qc-add-form" onSubmit={addQc}>
          <div className="field">
            <label htmlFor="qc-email">Email address</label>
            <input
              id="qc-email"
              type="email"
              value={qcEmail}
              onChange={(e) => setQcEmail(e.target.value)}
              placeholder="name@vit.ac.in"
              disabled={addingQc}
            />
          </div>
          <button type="submit" className="btn btn-solid" disabled={addingQc}>
            {addingQc ? 'Adding…' : 'Give QC access'}
          </button>
        </form>
        <p className="small muted">
          Current QC reviewers:{' '}
          {(users.data ?? []).filter((u) => u.role === 'QC' && u.active).length === 0
            ? 'nobody yet'
            : (users.data ?? [])
                .filter((u) => u.role === 'QC' && u.active)
                .map((u) => u.full_name)
                .join(', ')}
        </p>
      </section>

      <section className="card">
        {users.loading ? (
          <Loading />
        ) : users.error ? (
          <Banner>{users.error}</Banner>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((user) => {
                  const isSelf = user.id === profile.id;
                  return (
                    <tr key={user.id}>
                      <td>
                        {user.full_name}
                        {isSelf && <span className="muted small"> (you)</span>}
                      </td>
                      <td className="small">{user.email}</td>
                      <td>
                        <select
                          value={user.role}
                          disabled={isSelf}
                          aria-label={`Role for ${user.full_name}`}
                          onChange={(e) => void changeRole(user.id, e.target.value as UserRole)}
                          style={{ width: 'auto' }}
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="small muted">{formatDate(user.created_at)}</td>
                      <td>
                        {user.active ? (
                          <span className="badge badge-green">Active</span>
                        ) : user.approved_at ? (
                          <span className="badge badge-grey">Deactivated</span>
                        ) : (
                          <span className="badge badge-amber">Pending approval</span>
                        )}
                      </td>
                      <td className="actions">
                        {!isSelf && (
                          <>
                            <ConfirmButton
                              className="small"
                              confirmLabel={user.active ? 'Deactivate?' : 'Activate?'}
                              onConfirm={() => void toggleActive(user.id, !user.active)}
                            >
                              {user.active
                                ? 'Deactivate'
                                : user.approved_at
                                  ? 'Activate'
                                  : 'Approve'}
                            </ConfirmButton>
                            <ConfirmButton
                              className="small danger-action"
                              confirmLabel="Delete for good?"
                              onConfirm={() => void removeUser(user.id)}
                            >
                              Delete
                            </ConfirmButton>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted" style={{ marginTop: '0.6rem' }}>
          You cannot change your own role, deactivate yourself or delete your own account &mdash;
          those rules are enforced in the database, so the station can never be locked out.
        </p>
        <p className="small muted" style={{ marginTop: '0.35rem' }}>
          <strong>Deactivate</strong> stops someone signing in but keeps them and their work on the
          record &mdash; use it for anyone who has presented, recorded or booked the studio.{' '}
          <strong>Delete</strong> removes the account for good and only works when nothing is
          attached to it, which makes it the right tool for duplicate or mistaken registrations. The
          deletion itself is kept in the activity log.
        </p>
      </section>

      <section className="card">
        <h2>What each role can do</h2>
        <div className="stack small">
          {ROLES.map((role) => (
            <div key={role} className="list-item">
              <strong>{ROLE_LABELS[role]}</strong> &middot;{' '}
              <span className="muted">{ROLE_SUMMARY[role]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Activity log</h2>
        {activity.loading ? (
          <Loading />
        ) : (
          <div className="stack small">
            {(activity.data ?? []).map((entry) => (
              <div key={entry.id} className="list-item">
                <strong>{entry.user?.full_name ?? 'System'}</strong> {describeAction(entry.action)}{' '}
                <span className="muted">{describeSubject(entry)}</span>
                <span className="muted"> &middot; {formatRelative(entry.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
