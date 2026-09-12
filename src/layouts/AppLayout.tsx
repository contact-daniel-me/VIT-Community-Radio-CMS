import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Logo } from '@/components/site/Logo';
import { can, ROLE_LABELS } from '@/lib/permissions';
import type { UserRole } from '@/types/database';

interface NavItem {
  to: string;
  label: string;
  visible: (role: UserRole) => boolean;
}

/**
 * One navigation list, filtered by role. Hiding an item is a convenience, not
 * a control: every route and every service call is checked by the database.
 */
const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', visible: () => true },
  { to: '/studio/book', label: 'Studio', visible: () => true },
  { to: '/bookings', label: 'Bookings', visible: () => true },
  { to: '/programs', label: 'Programs', visible: () => true },
  { to: '/admin/episodes', label: 'Episodes', visible: () => true },
  { to: '/qc', label: 'QC', visible: () => true },
  { to: '/schedule/edit', label: 'Schedule', visible: () => true },
  { to: '/audio', label: 'Audio Library', visible: (role) => can.viewAudioLibrary(role) },
  { to: '/users', label: 'Users', visible: (role) => can.manageUsers(role) },
  { to: '/settings', label: 'Settings', visible: () => true },
];

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  if (!profile) return null;

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner app-header-row">
          <Link className="app-brand" to="/" aria-label="VIT Community Radio, public site">
            <Logo size={30} />
            <span className="app-brand-tag">CMS</span>
          </Link>
          <div className="app-user">
            <span>
              {profile.full_name} &middot; {ROLE_LABELS[profile.role]}
            </span>
            <button
              type="button"
              className="small"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <button type="button" className="small" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <nav className="app-nav" aria-label="Main">
        <div className="app-nav-inner">
          {NAV.filter((item) => item.visible(profile.role)).map((item) => (
            <NavLink key={item.to} to={item.to} end>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="app-main">
        <Outlet />
      </main>
    </>
  );
}
