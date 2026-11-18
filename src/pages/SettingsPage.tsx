import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useCurrentUser } from '@/hooks/useAuth';
import { useSuccessFeedback } from '@/hooks/useSuccessFeedback';
import { Banner, PageHeader } from '@/components/ui';
import { authService } from '@/services/authService';
import { yoyoNotificationService } from '@/services/yoyoNotificationService';
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
  const { notifySave } = useSuccessFeedback();

  const [fullName, setFullName] = useState(profile.full_name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // YOYO Native Browser Notifications state
  const [notifSupport, setNotifSupport] = useState(() => yoyoNotificationService.getSupport());
  const [notifEnabled, setNotifEnabled] = useState(() => yoyoNotificationService.isEnabled(profile.id));
  const [busyNotif, setBusyNotif] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);

  const handleEnableNotifications = async () => {
    setBusyNotif(true);
    setNotifFeedback(null);
    try {
      const res = await yoyoNotificationService.requestPermission(profile.id);
      setNotifSupport(yoyoNotificationService.getSupport());
      if (res.granted) {
        setNotifEnabled(true);
        setNotifFeedback('YOYO native browser notifications enabled! Sent test notification.');
        void yoyoNotificationService.sendTestNotification(profile.id, profile.full_name);
      } else if (res.permission === 'denied') {
        setNotifEnabled(false);
        setNotifFeedback('Notification permission was blocked in your browser settings.');
      } else {
        setNotifEnabled(false);
      }
    } catch {
      setNotifFeedback('Could not enable notifications.');
    } finally {
      setBusyNotif(false);
    }
  };

  const handleDisableNotifications = () => {
    yoyoNotificationService.disable(profile.id);
    setNotifEnabled(false);
    setNotifFeedback('YOYO native notifications disabled.');
  };

  const handleSendTestNotification = async () => {
    setBusyNotif(true);
    try {
      await yoyoNotificationService.sendTestNotification(profile.id, profile.full_name);
      setNotifFeedback('Test notification sent!');
    } catch {
      setNotifFeedback('Could not send test notification.');
    } finally {
      setBusyNotif(false);
    }
  };

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
      notifySave({ title: 'Profile updated', dedupeKey: `profile-save:${profile.id}` });
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
            <div>
              <label htmlFor="p-password">Password</label>
              <input id="p-password" type="password" value="••••••••••••" readOnly disabled />
              <p className="small muted" style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)' }}>
                To edit or change your password, contact an administrator.
              </p>
            </div>
          </div>
          <div className="actions-row">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </form>

        <div className="stack" style={{ gap: '1.5rem' }}>
          <section className="card">
            <div className="row spread align-center wrap" style={{ gap: '0.75rem', marginBottom: '0.5rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>YOYO Notifications</h2>
                <p className="small muted" style={{ margin: '0.2rem 0 0' }}>
                  Native browser and background updates from your digital companion YOYO.
                </p>
              </div>
              <div>
                {notifEnabled ? (
                  <span
                    className="tag"
                    style={{
                      background: 'rgba(34, 197, 94, 0.12)',
                      color: '#15803d',
                      border: '1px solid rgba(34, 197, 94, 0.25)',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    Enabled
                  </span>
                ) : notifSupport.permission === 'denied' ? (
                  <span
                    className="tag"
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      color: '#b91c1c',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    Blocked
                  </span>
                ) : (
                  <span
                    className="tag"
                    style={{
                      background: 'var(--surface-muted, #f3f4f6)',
                      color: 'var(--text-muted, #6b7280)',
                      border: '1px solid var(--line, #e5e7eb)',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '999px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    Disabled
                  </span>
                )}
              </div>
            </div>

            <p className="small" style={{ margin: '0 0 1rem', lineHeight: 1.5 }}>
              Receive instant desktop and mobile browser alerts for QC approvals, audio uploads, studio bookings, and show scheduling—even when browsing other tabs or when the browser tab is closed.
            </p>

            {notifFeedback && (
              <div
                className="banner info"
                style={{
                  margin: '0 0 1rem',
                  fontSize: '0.85rem',
                  padding: '0.5rem 0.85rem',
                }}
              >
                <span>{notifFeedback}</span>
              </div>
            )}

            {!notifSupport.isSupported ? (
              <div className="banner info" style={{ margin: 0 }}>
                <span>Native browser notifications are not supported by this browser.</span>
              </div>
            ) : notifSupport.permission === 'denied' ? (
              <div className="banner danger" style={{ margin: 0 }}>
                <span>
                  <strong>Notifications are blocked:</strong> To enable YOYO native alerts, click the lock or settings icon in your browser address bar and change Notifications to <strong>Allow</strong>.
                </span>
              </div>
            ) : notifEnabled ? (
              <div className="row align-center wrap" style={{ gap: '0.65rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary small"
                  onClick={handleSendTestNotification}
                  disabled={busyNotif}
                >
                  Send Test Notification
                </button>
                <button
                  type="button"
                  className="btn btn-outline small"
                  onClick={handleDisableNotifications}
                  disabled={busyNotif}
                >
                  Disable YOYO Notifications
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary small"
                onClick={handleEnableNotifications}
                disabled={busyNotif}
              >
                {busyNotif ? 'Requesting permission...' : 'Enable YOYO Notifications'}
              </button>
            )}
          </section>

          <section className="card">
            <h2>Password & Security</h2>
            <div className="banner info" style={{ margin: '0.5rem 0 0.75rem' }}>
              <span>
                <strong>Password Management:</strong> To edit or reset your password, please contact an administrator.
              </span>
            </div>
            {profile.role === 'ADMIN' ? (
              <p className="small muted" style={{ margin: 0 }}>
                As an administrator, you can change and reset user passwords from the{' '}
                <Link to="/users" style={{ fontWeight: 600, color: 'var(--brand-red)' }}>Users Management</Link> panel.
              </p>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                User credentials are managed by station administrators to protect broadcast operations.
              </p>
            )}
          </section>

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
      </div>
    </>
  );
}
