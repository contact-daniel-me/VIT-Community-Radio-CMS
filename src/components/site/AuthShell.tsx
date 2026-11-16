import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { useTheme } from '@/hooks/useTheme';

function ThemeToggle({ theme, setTheme }: { theme: 'light' | 'dark'; setTheme: (t: 'light' | 'dark') => void }) {
  return (
    <div className="auth-theme-switcher" role="group" aria-label="Theme selection">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
      <div className="auth-theme-capsule">
        <button
          type="button"
          onClick={() => setTheme('light')}
          aria-pressed={theme === 'light'}
          className={`auth-theme-btn ${theme === 'light' ? 'active' : ''}`}
        >
          Light
        </button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          aria-pressed={theme === 'dark'}
          className={`auth-theme-btn ${theme === 'dark' ? 'active' : ''}`}
        >
          Dark
        </button>
      </div>
    </div>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="auth-wrap">
      <aside className="auth-aside">
        {/* Top bar with Logo and Mobile Theme Toggle */}
        <div className="auth-aside-topbar">
          <Link to="/" aria-label="VIT Community Radio, home" className="auth-logo-link">
            <Logo size={40} />
          </Link>
          <div className="auth-theme-mobile">
            <ThemeToggle theme={theme} setTheme={setTheme} />
          </div>
        </div>

        {/* Branding Body */}
        <div className="auth-aside-body">
          <h2 className="auth-aside-title">
            Your voice.<br className="auth-desktop-br" />
            <span className="auth-title-accent"> Your radio.</span>
          </h2>
          <p className="auth-aside-copy">
            Programmes, episodes, QC and the broadcast schedule &mdash; the studio behind
            90.8 FM, run by students for the community around VIT Vellore.
          </p>

          {/* Desktop feature badges */}
          <div className="auth-aside-features">
            <div className="auth-feature-item">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.5rem' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              <div className="auth-feature-label">By Students</div>
            </div>
            <div className="auth-feature-divider"></div>
            <div className="auth-feature-item">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.5rem' }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              <div className="auth-feature-label">For the Community</div>
            </div>
            <div className="auth-feature-divider"></div>
            <div className="auth-feature-item">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.5rem' }}><circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path></svg>
              <div className="auth-feature-label">Around VIT Vellore</div>
            </div>
          </div>
        </div>

        {/* Desktop aside footer note */}
        <div className="auth-aside-footer">
          <p className="auth-aside-foot">MADE BY STUDENTS &middot; FOR THE COMMUNITY</p>
          <div className="auth-aside-cursive">
            <span>Tune In</span><br/>
            <span className="auth-title-accent">Make a Difference</span>
          </div>
        </div>
      </aside>

      <main className="auth-main">
        {/* Working Light / Dark theme toggle — top right on desktop */}
        <div className="auth-theme-desktop">
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>

        <div className="auth-card">
          <Link to="/" className="auth-back">
            &larr; Back to the station
          </Link>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-sub">{subtitle}</p>
          {children}
          {footer && (
            <div className="auth-footer-wrap" style={{ borderTop: '1px solid var(--line)', marginTop: '3rem', paddingTop: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
              {footer}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
