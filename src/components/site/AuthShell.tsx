import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { useTheme } from '@/hooks/useTheme';

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
      <aside className="auth-aside" style={{ background: `linear-gradient(rgba(0,0,0,0.5), rgba(10,10,10,0.85)), url('/auth-bg.jpg') no-repeat center center`, backgroundSize: 'cover' }}>
        <Link to="/" aria-label="VIT Community Radio, home" style={{ display: 'inline-block', textDecoration: 'none', color: '#fff' }}>
          <Logo size={42} />
        </Link>

        <div>
          <h2 className="auth-aside-title" style={{ marginBottom: '1.5rem', fontSize: '3.5rem' }}>
            Your voice.<br/>
            <span style={{ color: 'var(--brand-red)' }}>Your radio.</span>
          </h2>
          <p className="auth-aside-copy" style={{ maxWidth: '400px', fontSize: '1.05rem', lineHeight: 1.6, opacity: 0.9 }}>
            Programmes, episodes, QC and the broadcast schedule &mdash; the studio behind
            90.8 FM, run by students for the community around VIT Vellore.
          </p>

          <div style={{ display: 'flex', gap: '2rem', marginTop: '3rem', opacity: 0.9 }}>
            <div style={{ textAlign: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.5rem' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>By Students</div>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)' }}></div>
            <div style={{ textAlign: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.5rem' }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>For the Community</div>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)' }}></div>
            <div style={{ textAlign: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.5rem' }}><circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path></svg>
              <div style={{ fontSize: '0.8rem', fontWeight: 500 }}>Around VIT Vellore</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <p className="auth-aside-foot" style={{ letterSpacing: '0.15em', fontSize: '0.75rem', opacity: 0.6, margin: 0 }}>MADE BY STUDENTS &middot; FOR THE COMMUNITY</p>
          <div style={{ fontFamily: 'cursive', transform: 'rotate(-10deg)', fontSize: '1.8rem', color: '#fff', opacity: 0.9, lineHeight: 1 }}>
            <span style={{ color: '#fff' }}>Tune In</span><br/>
            <span style={{ color: 'var(--brand-red)' }}>Make a Difference</span>
          </div>
        </div>
      </aside>

      <main className="auth-main" style={{ position: 'relative' }}>
        {/* Working Light / Dark theme toggle — top right */}
        <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* Sun icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
          <div style={{ display: 'flex', background: 'var(--bg-sunk)', borderRadius: '6px', padding: '0.2rem', border: '1px solid var(--line)' }}>
            <button
              type="button"
              onClick={() => setTheme('light')}
              aria-pressed={theme === 'light'}
              style={{
                padding: '0.2rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.15s',
                background: theme === 'light' ? 'var(--surface)' : 'transparent',
                color: theme === 'light' ? 'var(--brand-red)' : 'var(--muted)',
                boxShadow: theme === 'light' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Light
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              aria-pressed={theme === 'dark'}
              style={{
                padding: '0.2rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.15s',
                background: theme === 'dark' ? 'var(--surface)' : 'transparent',
                color: theme === 'dark' ? 'var(--brand-red)' : 'var(--muted)',
                boxShadow: theme === 'dark' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Dark
            </button>
          </div>
        </div>

        <div className="auth-card" style={{ maxWidth: '440px', width: '100%' }}>
          <Link to="/" className="auth-back" style={{ color: 'var(--muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
            &larr; Back to the station
          </Link>
          <h1 className="auth-title" style={{ fontSize: '2.5rem', margin: '0 0 0.5rem' }}>{title}</h1>
          <p className="auth-sub" style={{ color: 'var(--muted)', margin: '0 0 2rem', fontSize: '1.05rem' }}>{subtitle}</p>
          {children}
          {footer && (
            <div style={{ borderTop: '1px solid var(--line)', marginTop: '3rem', paddingTop: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
              {footer}
              {/* Help & Contact links — always shown at the bottom */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem', opacity: 0.7 }}>
                <a
                  href="mailto:vitcr@vit.ac.in?subject=Help%20with%20VCR%20CMS"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                  title="Email us for help"
                >
                  Help
                </a>
                <span aria-hidden="true">|</span>
                <a
                  href="mailto:vitcr@vit.ac.in?subject=Contact%20VIT%20Community%20Radio"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                  title="Contact VIT Community Radio"
                >
                  Contact
                </a>
                <span aria-hidden="true">|</span>
                <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
                  VIT Community Radio
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
