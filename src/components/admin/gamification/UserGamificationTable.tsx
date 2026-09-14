import { useState, useMemo } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { leaderboardService, type LeaderboardEntry } from '@/services/leaderboardService';
import { Loading } from '@/components/ui';
import { UserManagementModal } from './UserManagementModal';

export function UserGamificationTable() {
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<LeaderboardEntry | null>(null);

  const board = useAsync(() => leaderboardService.getLeaderboard('all'), []);

  const filtered = useMemo(() => {
    if (!board.data) return [];
    let list = board.data;
    if (search) {
      const lower = search.toLowerCase();
      list = list.filter(u => u.name.toLowerCase().includes(lower));
    }
    return list;
  }, [board.data, search]);

  if (board.loading) return <Loading label="Loading users..." />;
  if (board.error) return <p className="error">Failed to load gamification data.</p>;

  return (
    <div className="admin-gamification-users">
      <div className="table-header-row">
        <h3 style={{ margin: 0, fontSize: '1.125rem', color: '#0f172a' }}>User Gamification</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Search users..." 
            className="admin-input" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '250px' }}
          />
          <button className="btn btn-primary btn-sm">View All Users</button>
        </div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>XP</th>
              <th>Level</th>
              <th>Badges</th>
              <th>Streak</th>
              <th>Progress</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => {
              const isActive = user.xp > 0 || user.episodeCount > 0 || user.bookingCount > 0;
              return (
                <tr key={user.userId}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">{user.name.charAt(0).toUpperCase()}</div>
                      <strong>{user.name}</strong>
                    </div>
                  </td>
                  <td>
                    <span className="xp-val">{user.xp.toLocaleString()}</span> XP
                  </td>
                  <td>
                    <span className="lvl-badge">Level {user.level}</span>
                  </td>
                  <td>{user.badgeCount}</td>
                  <td>
                    {user.streak > 0 ? (
                      <div className="streak-cell">
                        🔥 {user.streak}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td>
                    <div className="progress-cell">
                      <div className="progress-bar-bg">
                        <div className="progress-bar-fill" style={{ width: `${user.levelPct}%` }}></div>
                      </div>
                      <div className="progress-text">{user.levelPct}% to Lvl {user.level + 1}</div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span className={`status-dot ${isActive ? 'active' : 'inactive'}`}></span>
                      <span style={{ fontSize: '0.875rem', color: isActive ? '#15803d' : '#64748b' }}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </td>
                  <td>
                    <button 
                      className="btn btn-outline btn-sm"
                      onClick={() => setSelectedUser(user)}
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <UserManagementModal 
          user={selectedUser} 
          onClose={() => setSelectedUser(null)} 
          onUpdated={() => board.reload()}
        />
      )}
    </div>
  );
}
