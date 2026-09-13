import { useMemo } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { leaderboardService } from '@/services/leaderboardService';
import { Loading } from '@/components/ui';

export function GamificationOverview() {
  const board = useAsync(() => leaderboardService.getLeaderboard('all'), []);

  const stats = useMemo(() => {
    if (!board.data) return null;
    const users = board.data;
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.xp > 0).length;
    const totalXp = users.reduce((sum, u) => sum + u.xp, 0);
    const totalBadges = users.reduce((sum, u) => sum + u.badgeCount, 0);
    const avgLevel = totalUsers > 0 
      ? Math.round(users.reduce((sum, u) => sum + u.level, 0) / totalUsers) 
      : 0;

    return { totalUsers, activeUsers, totalXp, totalBadges, avgLevel };
  }, [board.data]);

  if (board.loading) return <Loading label="Loading gamification data..." />;
  if (!stats) return <p>No data available.</p>;

  return (
    <div className="admin-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
      <div className="admin-stat-card">
        <h3>Total Users</h3>
        <p className="admin-stat-value">{stats.totalUsers}</p>
      </div>
      <div className="admin-stat-card">
        <h3>Active Users</h3>
        <p className="admin-stat-value" style={{ color: 'var(--ok)' }}>{stats.activeUsers}</p>
      </div>
      <div className="admin-stat-card">
        <h3>Badges Unlocked</h3>
        <p className="admin-stat-value" style={{ color: '#f59e0b' }}>{stats.totalBadges}</p>
      </div>
      <div className="admin-stat-card">
        <h3>Total XP Earned</h3>
        <p className="admin-stat-value" style={{ color: '#7c3aed' }}>{stats.totalXp.toLocaleString()}</p>
      </div>
      <div className="admin-stat-card">
        <h3>Avg User Level</h3>
        <p className="admin-stat-value">{stats.avgLevel}</p>
      </div>
    </div>
  );
}
