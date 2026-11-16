import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Banner, PoweredByGrowiota } from '@/components/ui';
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
        footer={
          <div className="auth-footer-container">
            <p className="auth-alt-text">
              <span style={{ color: 'var(--muted)' }}>Already on the team?</span>{' '}
              <Link to="/login" className="auth-alt-link">
                Sign in
              </Link>
            </p>
            <PoweredByGrowiota />
          </div>
        }
      >
        <Banner kind="success">
          Your account exists but is <strong>not active yet</strong>. An administrator has to
          approve it before you can sign in.
        </Banner>
        {sent.emailConfirmationRequired && (
          <p className="auth-sub" style={{ marginTop: '1rem' }}>
            We have also sent a confirmation link to {email.trim()} &mdash; click it so your
            address is verified.
          </p>
        )}
        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.5rem', width: '100%' }}>
          <Link
            to="/"
            className="auth-submit-btn btn-solid"
            style={{ textAlign: 'center', textDecoration: 'none' }}
          >
            Back to the station
          </Link>
          <Link
            to="/login"
            className="auth-submit-btn btn-solid"
            style={{
              textAlign: 'center',
              textDecoration: 'none',
              background: 'transparent',
              border: '1px solid var(--line-strong)',
              color: 'var(--ink-strong)',
            }}
          >
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
        <div className="auth-footer-container">
          <p className="auth-alt-text">
            <span style={{ color: 'var(--muted)' }}>Already on the team?</span>{' '}
            <Link to="/login" className="auth-alt-link">
              Sign in
            </Link>
          </p>
          <PoweredByGrowiota />
        </div>
      }
    >
      <Banner>{error}</Banner>

      <form onSubmit={submit}>
        <div className="auth-form-group">
          <label htmlFor="r-name" className="auth-label">
            Full name
          </label>
          <div className="auth-input-container">
            <div className="auth-input-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
            <input
              id="r-name"
              autoComplete="name"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Your name"
              required
              aria-invalid={Boolean(error && fullName.trim().length < 2)}
              className={`auth-input ${error && fullName.trim().length < 2 ? 'has-error' : ''}`}
            />
          </div>
        </div>

        <div className="auth-form-group">
          <label htmlFor="r-email" className="auth-label">
            Station email
          </label>
          <div className="auth-input-container">
            <div className="auth-input-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </div>
            <input
              id="r-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="your@email.com"
              required
              aria-invalid={Boolean(error && !email.includes('@'))}
              className={`auth-input ${error && !email.includes('@') ? 'has-error' : ''}`}
            />
          </div>
        </div>

        <div className="auth-form-group">
          <label htmlFor="r-password" className="auth-label">
            Password
          </label>
          <div className="auth-input-container password-wrap">
            <div className="auth-input-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <input
              id="r-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder={`At least ${MIN_PASSWORD} characters`}
              required
              aria-invalid={Boolean(error && password.length < MIN_PASSWORD)}
              className={`auth-input auth-input-password ${error && password.length < MIN_PASSWORD ? 'has-error' : ''}`}
            />
            <button
              type="button"
              className="auth-password-toggle password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="auth-form-group">
          <label htmlFor="r-confirm" className="auth-label">
            Confirm password
          </label>
          <div className="auth-input-container password-wrap">
            <div className="auth-input-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <input
              id="r-confirm"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••••••"
              required
              className="auth-input auth-input-password"
            />
            <button
              type="button"
              className="auth-password-toggle password-toggle"
              onClick={() => setShowConfirm(!showConfirm)}
              title={showConfirm ? 'Hide password' : 'Show password'}
              tabIndex={-1}
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              )}
            </button>
          </div>
        </div>

        <button type="submit" className="auth-submit-btn btn-solid" disabled={busy}>
          {busy ? (
            'Sending request...'
          ) : (
            <>
              Request access{' '}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
