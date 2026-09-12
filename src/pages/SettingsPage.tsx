import { useState, type FormEvent } from 'react';
import { useAuth, useCurrentUser } from '@/hooks/useAuth';
import { Banner, PageHeader } from '@/components/ui';
import { authService } from '@/services/authService';
import { ROLE_LABELS, ROLE_SUMMARY } from '@/lib/permissions';
import { errorMessage } from '@/lib/errors';
import { STATION_TIMEZONE } from '@/utils/datetime';

/**
 * Station details are fixed facts about the licence, not editable settings, so
 * they are shown rather than stored in a table nobody would ever change.
 */
const STATION = [
  ['Station', 'VIT Community Radio'],
  ['Frequency', '90.8 FM'],
  ['Campus', 'VIT Vellore'],
  ['Timezone', STATION_TIMEZONE],
];

export function SettingsPage() {
  const profile = useCurrentUser();
  const { refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(profile.full_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (fullName.trim().length < 2) {
      setError('Enter your name.');
      return;
    }

    setBusy(true);
    try {
      await authService.updateOwnProfile(profile.id, { full_name: fullName.trim() });
      await refreshProfile();
      setNotice('Profile updated.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Your profile and the station details." />

      <Banner>{error}</Banner>
      <Banner kind="success">{notice}</Banner>

      <div className="grid grid-2">
        <form className="card" onSubmit={save}>
          <h2>Your profile</h2>
          <div className="form-grid">
            <div>
              <label htmlFor="p-name">Full name</label>
              <input
                id="p-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={120}
                required
              />
            </div>
            <div>
              <label htmlFor="p-email">Email</label>
              <input id="p-email" value={profile.email} readOnly disabled />
              <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                Managed by Supabase Auth.
              </p>
            </div>
            <div>
              <label htmlFor="p-role">Role</label>
              <input id="p-role" value={ROLE_LABELS[profile.role]} readOnly disabled />
              <p className="small muted" style={{ margin: '0.25rem 0 0' }}>
                {ROLE_SUMMARY[profile.role]} Only an administrator can change this.
              </p>
            </div>
          </div>
          <div className="actions-row">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </form>

        <section className="card">
          <h2>Station</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {STATION.map(([label, value]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: '0.7rem' }}>
            All times in this CMS are stored in UTC and displayed in station time (IST).
          </p>
        </section>
      </div>
    </>
  );
}
