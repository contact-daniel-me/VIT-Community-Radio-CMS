import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { leaderboardService } from '@/services/leaderboardService';
import { PageHeader, Loading } from '@/components/ui';
import { UserGamificationTable } from './UserGamificationTable';
import { BadgeManagement } from './BadgeManagement';
import { XpManagement } from './XpManagement';

type Tab = 'users' | 'badges' | 'xp';

export function AdminGamificationDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const board = useAsync(() => leaderboardService.getLeaderboard('all'), []);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'users', label: 'Users' },
    { id: 'badges', label: 'Badges' },
    { id: 'xp', label: 'XP & Rewards' },
  ];

  // Calculate statistics
  const users = board.data || [];
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.xp > 0 || u.episodeCount > 0 || u.bookingCount > 0).length;
  const totalXp = users.reduce((sum, u) => sum + u.xp, 0);
  const totalBadgesUnlocked = users.reduce((sum, u) => sum + u.badgeCount, 0);
  const avgLevel = totalUsers > 0 ? (users.reduce((sum, u) => sum + u.level, 0) / totalUsers).toFixed(1) : 0;

  return (
    <>
      <PageHeader
        title="Gamification Management"
        description="Manage badges, XP, levels, streaks and user achievements."
      />

      {board.loading ? (
        <Loading label="Loading gamification stats..." />
      ) : (
        <div className="admin-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div className="admin-card text-center" style={{ padding: '1.5rem 1rem' }}>
            <div className="text-3xl font-bold text-blue-600 mb-1">{totalUsers}</div>
            <div className="text-sm text-gray-500 uppercase tracking-wider">Total Users</div>
          </div>
          <div className="admin-card text-center" style={{ padding: '1.5rem 1rem' }}>
            <div className="text-3xl font-bold text-green-600 mb-1">{activeUsers}</div>
            <div className="text-sm text-gray-500 uppercase tracking-wider">Active Users</div>
          </div>
          <div className="admin-card text-center" style={{ padding: '1.5rem 1rem' }}>
            <div className="text-3xl font-bold text-purple-600 mb-1">{totalXp.toLocaleString()}</div>
            <div className="text-sm text-gray-500 uppercase tracking-wider">Total XP</div>
          </div>
          <div className="admin-card text-center" style={{ padding: '1.5rem 1rem' }}>
            <div className="text-3xl font-bold text-orange-600 mb-1">{totalBadgesUnlocked}</div>
            <div className="text-sm text-gray-500 uppercase tracking-wider">Badges Unlocked</div>
          </div>
          <div className="admin-card text-center" style={{ padding: '1.5rem 1rem' }}>
            <div className="text-3xl font-bold text-indigo-600 mb-1">{avgLevel}</div>
            <div className="text-sm text-gray-500 uppercase tracking-wider">Avg Level</div>
          </div>
        </div>
      )}

      <div className="admin-tabs">
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
        {activeTab === 'users' && <UserGamificationTable />}
        {activeTab === 'badges' && <BadgeManagement />}
        {activeTab === 'xp' && <XpManagement />}
      </div>
    </>
  );
}
