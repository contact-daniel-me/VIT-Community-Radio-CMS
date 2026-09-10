import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Logo } from './Logo';

const SECTIONS = [
  { label: 'Home', to: '/' },
  { label: 'Studio', to: '/studio' },
  { label: 'Schedule', to: '/#schedule' },
  { label: 'Episodes', to: '/#episodes' },
  { label: 'About', to: '/#about' },
];

export function SiteHeader() {
  const { session, profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [condensed, setCondensed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Condense once past the hero's first fold. A single threshold with a dead
  // zone, so the header never flickers while scrolling around the boundary.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        setCondensed((was) => (was ? y > 40 : y > 90));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Escape closes the mobile sheet and returns focus where it came from.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <header className={`site-header ${condensed ? 'is-condensed' : ''}`}>
      <div className="site-header-inner">
        <Link to="/" className="site-brand" aria-label="VIT Community Radio, home">
          <Logo size={condensed ? 30 : 38} />
        </Link>

        <nav className="site-nav" aria-label="Sections">
          {SECTIONS.map((item) => (
            <NavLink key={item.label} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="site-actions">
          <button
            type="button"
            className="icon-button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? (
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M20 14.5A8.5 8.5 0 0 1 9.5 4a.75.75 0 0 0-1-.86A10 10 0 1 0 20.86 15.5a.75.75 0 0 0-.86-1Z"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
                </g>
              </svg>
            )}
          </button>

          {session && profile ? (
            <Link to="/dashboard" className="btn btn-solid">
              Open the CMS
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost site-signin">
                Sign in
              </Link>
              <Link to="/register" className="btn btn-solid">
                Request access
              </Link>
            </>
          )}

          <button
            ref={menuButton}
            type="button"
            className="icon-button site-burger"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                d="M4 7h16M4 12h16M4 17h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="site-sheet" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="site-sheet-top">
            <Logo size={34} />
            <button
              type="button"
              className="icon-button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  d="M6 6l12 12M18 6L6 18"
                />
              </svg>
            </button>
          </div>

          <nav className="site-sheet-nav" aria-label="Sections">
            {SECTIONS.map((item) => (
              <Link key={item.label} to={item.to} onClick={() => setMenuOpen(false)}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="site-sheet-actions">
            {session && profile ? (
              <Link to="/dashboard" className="btn btn-solid" onClick={() => setMenuOpen(false)}>
                Open the CMS
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost" onClick={() => setMenuOpen(false)}>
                  Sign in
                </Link>
                <Link to="/register" className="btn btn-solid" onClick={() => setMenuOpen(false)}>
                  Request access
                </Link>
              </>
            )}
          </div>

          <p className="site-sheet-foot">MADE BY STUDENTS &middot; FOR THE COMMUNITY</p>
        </div>
      )}
    </header>
  );
}
