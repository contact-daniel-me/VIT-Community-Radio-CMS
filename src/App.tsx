import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/hooks/AuthProvider';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/layouts/AppLayout';
import { Loading } from '@/components/ui';
import { can } from '@/lib/permissions';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { UserRole } from '@/types/database';

import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';

// Route-level code splitting: secondary & admin pages loaded dynamically
const RegisterPage = lazy(() => import('@/pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ProgramsPage = lazy(() => import('@/pages/ProgramsPage').then(m => ({ default: m.ProgramsPage })));
const EpisodesPage = lazy(() => import('@/pages/EpisodesPage').then(m => ({ default: m.EpisodesPage })));
const EpisodeDetailPage = lazy(() => import('@/pages/EpisodeDetailPage').then(m => ({ default: m.EpisodeDetailPage })));
const QcPage = lazy(() => import('@/pages/QcPage').then(m => ({ default: m.QcPage })));
const SchedulePage = lazy(() => import('@/pages/SchedulePage').then(m => ({ default: m.SchedulePage })));
const AudioLibraryPage = lazy(() => import('@/pages/AudioLibraryPage').then(m => ({ default: m.AudioLibraryPage })));
const UsersPage = lazy(() => import('@/pages/UsersPage').then(m => ({ default: m.UsersPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const StudioPublicPage = lazy(() => import('@/pages/StudioPublicPage').then(m => ({ default: m.StudioPublicPage })));
const SchedulePublicPage = lazy(() => import('@/pages/SchedulePublicPage').then(m => ({ default: m.SchedulePublicPage })));
const AboutPublicPage = lazy(() => import('@/pages/AboutPublicPage').then(m => ({ default: m.AboutPublicPage })));
const EpisodesPublicPage = lazy(() => import('@/pages/EpisodesPublicPage').then(m => ({ default: m.EpisodesPublicPage })));
const StudioPage = lazy(() => import('@/pages/StudioPage').then(m => ({ default: m.StudioPage })));
const MyBookingsPage = lazy(() => import('@/pages/MyBookingsPage').then(m => ({ default: m.MyBookingsPage })));
const AnnouncementsPage = lazy(() => import('@/pages/AnnouncementsPage').then(m => ({ default: m.AnnouncementsPage })));
const BadgesPage = lazy(() => import('@/pages/BadgesPage').then(m => ({ default: m.BadgesPage })));
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })));
const HolidaysPage = lazy(() => import('@/pages/HolidaysPage').then(m => ({ default: m.HolidaysPage })));
const FeedbackPage = lazy(() => import('@/pages/FeedbackPage').then(m => ({ default: m.FeedbackPage })));
const AnalyticsPage = lazy(() => import('@/pages/admin/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));

import { GlobalAudioProvider } from '@/hooks/GlobalAudioContext';
import { PwaProvider } from '@/context/PwaProvider';
import { SuccessFeedbackProvider } from '@/context/SuccessFeedbackProvider';
import { PwaUpdateToast, OfflineIndicator } from '@/components/pwa';
import { AnalyticsTracker } from '@/components/analytics/AnalyticsTracker';

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
    return <Navigate to="/dashboard" replace />;
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
    <GlobalAudioProvider>
      <AuthProvider>
        <PwaProvider>
          <BrowserRouter>
            <AnalyticsTracker />
            <SuccessFeedbackProvider>
              <Suspense fallback={<Loading label="Loading..." />}>
                <Routes>
                {/* Public: anyone can reach these, signed in or not. */}
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              {/* Public: anyone can see studio availability. Booking inside it still
                  requires a session, and the database still decides. */}
              <Route path="/studio" element={<StudioPublicPage />} />
              <Route path="/schedule" element={<SchedulePublicPage />} />
              <Route path="/about" element={<AboutPublicPage />} />
              <Route path="/episodes" element={<EpisodesPublicPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />

              {/* Everything below requires a session AND an active profile. */}
              <Route
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              >
                <Route path="dashboard" element={<DashboardPage />} />
                <Route
                  path="programs"
                  element={
                    <RequireRole allow={can.manageProgram}>
                      <ProgramsPage />
                    </RequireRole>
                  }
                />
                <Route path="admin/episodes" element={<EpisodesPage />} />
                <Route path="admin/episodes/:episodeId" element={<EpisodeDetailPage />} />
                <Route path="qc" element={<QcPage />} />
                <Route
                  path="schedule/edit"
                  element={
                    <RequireRole allow={can.schedule}>
                      <SchedulePage />
                    </RequireRole>
                  }
                />
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

                <Route path="studio/book" element={<StudioPage />} />
                <Route path="bookings" element={<MyBookingsPage />} />
                <Route
                  path="admin/holidays"
                  element={
                    <RequireRole allow={can.manageHolidays}>
                      <HolidaysPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="announcements"
                  element={
                    <RequireRole allow={can.manageAnnouncements}>
                      <AnnouncementsPage />
                    </RequireRole>
                  }
                />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="badges" element={<BadgesPage />} />
                <Route path="feedback" element={<FeedbackPage />} />
                <Route
                  path="admin/feedback"
                  element={
                    <RequireRole allow={can.manageFeedback}>
                      <Navigate to="/admin/analytics?tab=feedback" replace />
                    </RequireRole>
                  }
                />
                <Route
                  path="admin/storage"
                  element={
                    <RequireRole allow={can.viewStorage}>
                      <Navigate to="/admin/analytics?tab=storage" replace />
                    </RequireRole>
                  }
                />
                <Route
                  path="admin/analytics"
                  element={
                    <RequireRole allow={can.viewAnalytics}>
                      <AnalyticsPage />
                    </RequireRole>
                  }
                />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
          </Suspense>
          <PwaUpdateToast />
          <OfflineIndicator />
            </SuccessFeedbackProvider>
        </BrowserRouter>
      </PwaProvider>
    </AuthProvider>
  </GlobalAudioProvider>
  );
}
