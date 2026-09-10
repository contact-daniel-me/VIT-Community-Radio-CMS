import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/hooks/AuthProvider';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/layouts/AppLayout';
import { Banner, Loading } from '@/components/ui';
import { can } from '@/lib/permissions';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { UserRole } from '@/types/database';

import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProgramsPage } from '@/pages/ProgramsPage';
import { EpisodesPage } from '@/pages/EpisodesPage';
import { EpisodeDetailPage } from '@/pages/EpisodeDetailPage';
import { QcPage } from '@/pages/QcPage';
import { SchedulePage } from '@/pages/SchedulePage';
import { LivePage } from '@/pages/LivePage';
import { AudioLibraryPage } from '@/pages/AudioLibraryPage';
import { UsersPage } from '@/pages/UsersPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StudioPublicPage } from '@/pages/StudioPublicPage';
import { StudioPage } from '@/pages/StudioPage';
import { MyBookingsPage } from '@/pages/MyBookingsPage';

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loading label="Checking your session..." />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  return children;
}

/** Route-level gate. The database enforces the same rule independently. */
function RequireRole({
  allow,
  children,
}: {
  allow: (role: UserRole) => boolean;
  children: React.ReactElement;
}) {
  const { profile } = useAuth();
  if (!profile) return null;
  if (!allow(profile.role)) {
    return (
      <Banner kind="error">
        This section is not available for your role ({profile.role}).
      </Banner>
    );
  }
  return children;
}

/** First-run guidance instead of a blank page when .env.local is missing. */
function SetupRequired() {
  return (
    <div className="login-wrap">
      <div className="login-card card">
        <h1>Configuration needed</h1>
        <p className="small">
          The CMS cannot reach Supabase because its environment variables are not set.
        </p>
        <p className="small">
          <strong>Running locally?</strong>
        </p>
        <ol className="small">
          <li>
            Copy <code>.env.example</code> to <code>.env.local</code>
          </li>
          <li>
            Fill in <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from
            your Supabase project (Settings &rarr; API)
          </li>
          <li>Restart the dev server</li>
        </ol>
        <p className="small">
          <strong>Deployed to Vercel, Netlify or similar?</strong>
        </p>
        <ol className="small">
          <li>
            Add the same two variables in the host&rsquo;s environment settings
          </li>
          <li>
            <strong>Redeploy.</strong> Vite bakes these in at build time, so an existing
            build will not pick them up
          </li>
        </ol>
        <p className="small muted">
          Use the anon key only. The service-role key must never be placed in frontend code.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />;

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public: anyone can reach these, signed in or not. */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          {/* Public: anyone can see studio availability. Booking inside it still
              requires a session, and the database still decides. */}
          <Route path="/studio" element={<StudioPublicPage />} />

          {/* Everything below requires a session AND an active profile. */}
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="live" element={<LivePage />} />
            <Route path="programs" element={<ProgramsPage />} />
            <Route path="episodes" element={<EpisodesPage />} />
            <Route path="episodes/:episodeId" element={<EpisodeDetailPage />} />
            <Route path="qc" element={<QcPage />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route
              path="audio"
              element={
                <RequireRole allow={can.viewAudioLibrary}>
                  <AudioLibraryPage />
                </RequireRole>
              }
            />
            <Route
              path="users"
              element={
                <RequireRole allow={can.manageUsers}>
                  <UsersPage />
                </RequireRole>
              }
            />
            {/* Signed-in staff book from inside the portal. The public
                /studio page stays public and renders the same calendar. */}
            <Route path="studio/book" element={<StudioPage />} />
            <Route path="bookings" element={<MyBookingsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
