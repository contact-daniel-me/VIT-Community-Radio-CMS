import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Logo } from './Logo';

/**
 * Shared frame for sign in and request access.
 *
 * Split layout: the station's voice on the left, the form on the right. The
 * panel is hidden below 860px rather than stacked, because on a phone the only
 * thing that matters is the form.
 */
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
  return (
    <div className="auth-wrap">
      <aside className="auth-aside">
        <Link to="/" aria-label="VIT Community Radio, home">
          <Logo size={42} />
        </Link>

        <div>
          <h2 className="auth-aside-title">
            Your voice.
            <br />
            <span>Your radio.</span>
          </h2>
          <p className="auth-aside-copy">
            Programmes, episodes, QC and the broadcast schedule &mdash; the studio behind
            90.8 FM, run by students for the community around VIT Vellore.
          </p>
        </div>

        <p className="auth-aside-foot">MADE BY STUDENTS &middot; FOR THE COMMUNITY</p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <Link to="/" className="auth-back">
            &larr; Back to the station
          </Link>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-sub">{subtitle}</p>
          {children}
          {footer}
        </div>
      </main>
    </div>
  );
}
