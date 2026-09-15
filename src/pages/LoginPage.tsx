import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Banner, Loading, PoweredByGrowiota } from '@/components/ui';
import { AuthShell } from '@/components/site/AuthShell';
import { errorMessage } from '@/lib/errors';

export function LoginPage() {
  const { session, profile, loading, error: authError, signIn } = useAuth();
  const [email, setEmail] = useState(import.meta.env.DEV ? 'vitcr@vit.ac.in' : '');
  const [password, setPassword] = useState(import.meta.env.DEV ? 'growiota@vitcr' : '');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading label="Checking your session..." />;
  if (session && profile) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter your station email address and password.');
      return;
    }

    setBusy(true);
    try {
      await signIn(email, password);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="For producers, RJs and the QC desk."
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
          <p className="auth-alt" style={{ textAlign: 'center', margin: 0 }}>
            <span style={{ color: 'var(--muted)' }}>New here?</span> <Link to="/register" style={{ fontWeight: 600, color: 'var(--brand-red)', textDecoration: 'none' }}>Request access</Link>
          </p>
          <PoweredByGrowiota />
        </div>
      }
    >
      <Banner>{error ?? authError}</Banner>

      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: '1.5rem' }}>
          <label htmlFor="email" style={{ fontWeight: 600, color: 'var(--muted)', marginBottom: '0.5rem', display: 'block', fontSize: '0.85rem' }}>Station email</label>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'flex' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
            </div>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vitcr@vit.ac.in"
              required
              style={{ paddingLeft: '3rem', height: '48px', fontSize: '1rem', borderRadius: '8px', width: '100%' }}
            />
          </div>
        </div>
        <div style={{ marginBottom: '2rem' }}>
          <label htmlFor="password" style={{ fontWeight: 600, color: 'var(--muted)', marginBottom: '0.5rem', display: 'block', fontSize: '0.85rem' }}>Password</label>
          <div className="password-wrap" style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'flex', zIndex: 1 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              style={{ paddingLeft: '3rem', paddingRight: '3rem', height: '48px', fontSize: '1rem', borderRadius: '8px', width: '100%' }}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
              style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              )}
            </button>
          </div>
        </div>
        <button type="submit" className="btn-solid" disabled={busy} style={{ width: '100%', height: '48px', fontSize: '1.05rem', fontWeight: 600, borderRadius: '8px', background: 'var(--brand-red)', color: '#fff', border: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
          {busy ? 'Signing in...' : (
            <>
              Sign in <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}
