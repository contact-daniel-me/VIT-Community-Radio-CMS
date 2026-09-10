import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Banner } from '@/components/ui';
import { AuthShell } from '@/components/site/AuthShell';
import { authService } from '@/services/authService';
import { errorMessage } from '@/lib/errors';

const MIN_PASSWORD = 8;

export function RegisterPage() {
  const { session, profile } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ emailConfirmationRequired: boolean } | null>(null);

  if (session && profile) return <Navigate to="/dashboard" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (fullName.trim().length < 2) {
      setError('Enter your full name.');
      return;
    }
    if (!email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      setSent(await authService.requestAccess({ fullName, email, password }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Request sent"
        subtitle={`Thanks, ${fullName.trim().split(' ')[0]}. The station team will take a look.`}
      >
        <Banner kind="success">
          Your account exists but is <strong>not active yet</strong>. An administrator has to
          approve it before you can sign in.
        </Banner>
        {sent.emailConfirmationRequired && (
          <p className="auth-sub">
            We have also sent a confirmation link to {email.trim()} &mdash; click it so your
            address is verified.
          </p>
        )}
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          <Link to="/" className="btn btn-solid">
            Back to the station
          </Link>
          <Link to="/login" className="btn btn-outline">
            Sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Request access"
      subtitle="For station members. An administrator approves every account."
      footer={
        <p className="auth-alt">
          Already on the team? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      <Banner>{error}</Banner>

      <form onSubmit={submit}>
        <div>
          <label htmlFor="r-name">Full name</label>
          <input
            id="r-name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            maxLength={120}
          />
        </div>
        <div>
          <label htmlFor="r-email">Email</label>
          <input
            id="r-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="r-password">Password ({MIN_PASSWORD}+ characters)</label>
          <input
            id="r-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD}
          />
        </div>
        <div>
          <label htmlFor="r-confirm">Confirm password</label>
          <input
            id="r-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-solid" disabled={busy}>
          {busy ? 'Sending request...' : 'Send request'}
        </button>
      </form>
    </AuthShell>
  );
}
