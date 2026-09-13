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
      <div className="admin-controls" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
        <input 
          type="text" 
          placeholder="Search users by name..." 
          className="admin-input" 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '300px' }}
        />
        {/* Placeholder for more filters if needed */}
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Level</th>
              <th>XP</th>
              <th>Badges</th>
              <th>Rank</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user, i) => (
              <tr key={user.userId}>
                <td>
                  <strong>{user.name}</strong>
                </td>
                <td>
                  <span className="badge" style={{ background: '#eff6ff', color: '#3b82f6' }}>
                    Level {user.level}
                  </span>
                </td>
                <td>{user.xp.toLocaleString()} XP</td>
                <td>{user.badgeCount}</td>
                <td>#{i + 1}</td>
                <td>
                  <button 
                    className="btn btn-outline btn-sm"
                    onClick={() => setSelectedUser(user)}
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No users found.</td>
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
