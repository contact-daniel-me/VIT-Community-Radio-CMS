import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Banner, Loading } from '@/components/ui';
import { AuthShell } from '@/components/site/AuthShell';
import { errorMessage } from '@/lib/errors';

export function LoginPage() {
  const { session, profile, loading, error: authError, signIn } = useAuth();
  const [email, setEmail] = useState(import.meta.env.DEV ? 'vitcr@vit.ac.in' : '');
  const [password, setPassword] = useState(import.meta.env.DEV ? 'growiota@vitcr' : '');
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
        <p className="auth-alt">
          New here? <Link to="/register">Request access</Link>
        </p>
      }
    >
      <Banner>{error ?? authError}</Banner>

      <form onSubmit={onSubmit}>
        <div>
          <label htmlFor="email">Station email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn btn-solid" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}
