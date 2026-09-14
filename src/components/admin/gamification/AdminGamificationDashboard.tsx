import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { leaderboardService } from '@/services/leaderboardService';
import { PageHeader, Loading } from '@/components/ui';
import { UserGamificationTable } from './UserGamificationTable';
import { BadgeManagement } from './BadgeManagement';
import { XpManagement } from './XpManagement';
import { GamificationOverview } from './GamificationOverview';
import { RecentAchievements } from './RecentAchievements';
import '@/styles/gamification-admin.css';

type Tab = 'users' | 'badges' | 'xp';

export function AdminGamificationDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const board = useAsync(() => leaderboardService.getLeaderboard('all'), []);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'users', label: 'Users & Progress' },
    { id: 'badges', label: 'Badge Definitions' },
    { id: 'xp', label: 'XP Rules' },
  ];

  // Calculate statistics
  const users = board.data || [];
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.xp > 0 || u.episodeCount > 0 || u.bookingCount > 0).length;
  const totalXp = users.reduce((sum, u) => sum + u.xp, 0);
  const totalBadgesUnlocked = users.reduce((sum, u) => sum + u.badgeCount, 0);
  const avgLevel = totalUsers > 0 ? (users.reduce((sum, u) => sum + u.level, 0) / totalUsers).toFixed(1) : '0.0';

  return (
    <div className="admin-gamification-dashboard">
      <PageHeader
        title="Gamification Management"
        description="Manage badges, XP, levels, streaks and user achievements."
      />

      {board.loading ? (
        <Loading label="Loading gamification stats..." />
      ) : (
        <>
          {/* 1. Stats Grid */}
          <div className="gamification-stats-grid">
            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon-wrapper stat-color-blue">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <span className="stat-label">Total Users</span>
              </div>
              <div>
                <div className="stat-value">{totalUsers}</div>
                <div className="stat-subtext">All registered users</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon-wrapper stat-color-green">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <span className="stat-label">Active Users</span>
              </div>
              <div>
                <div className="stat-value">{activeUsers}</div>
                <div className="stat-subtext">
                  <span className="status-dot active"></span>
                  {totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0}% of total users
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon-wrapper stat-color-purple">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </div>
                <span className="stat-label">Total XP</span>
              </div>
              <div>
                <div className="stat-value">{totalXp.toLocaleString()}</div>
                <div className="stat-subtext">Earned by all users</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon-wrapper stat-color-orange">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
                <span className="stat-label">Badges Unlocked</span>
              </div>
              <div>
                <div className="stat-value">{totalBadgesUnlocked}</div>
                <div className="stat-subtext">Achievements earned</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon-wrapper stat-color-indigo">
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <span className="stat-label">Avg Level</span>
              </div>
              <div>
                <div className="stat-value">{avgLevel}</div>
                <div className="stat-subtext">Community average</div>
              </div>
            </div>
          </div>

          {/* 2. Gamification Overview (XP / Level Progress + Mini Badges) */}
          <GamificationOverview users={users} totalXp={totalXp} avgLevel={parseFloat(avgLevel.toString())} />

          {/* Tabs for Table/Management */}
          <div className="admin-tabs" style={{ marginBottom: '1.5rem' }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="admin-tab-content">
            {activeTab === 'users' && (
              <>
                <UserGamificationTable />
                <RecentAchievements users={users} />
              </>
            )}
            {activeTab === 'badges' && <BadgeManagement />}
            {activeTab === 'xp' && <XpManagement />}
          </div>
        </>
      )}
    </div>
  );
}
