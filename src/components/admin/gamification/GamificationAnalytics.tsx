import { useAsync } from '@/hooks/useAsync';
import { leaderboardService } from '@/services/leaderboardService';
import { Loading } from '@/components/ui';

export function GamificationAnalytics() {
  const board = useAsync(() => leaderboardService.getLeaderboard('all'), []);

  if (board.loading) return <Loading label="Loading analytics..." />;
  if (!board.data) return <p>No data available for analytics.</p>;

  // Basic analytics based on current snapshot
  // Note: True historical analytics requires a ledger table
  const users = board.data;
  const levelDistribution = users.reduce((acc, u) => {
    acc[u.level] = (acc[u.level] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const badgeDistribution = users.reduce((acc, u) => {
    acc[u.badgeCount] = (acc[u.badgeCount] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return (
    <div className="admin-gamification-analytics">
      <div className="admin-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div className="admin-card">
          <h3>User Level Distribution</h3>
          <p className="admin-text-muted" style={{ marginBottom: '1.5rem' }}>Current active users across all levels.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {Object.entries(levelDistribution).map(([level, count]) => {
              const pct = Math.round((count / users.length) * 100);
              return (
                <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '60px', fontWeight: 600 }}>Lvl {level}</div>
                  <div style={{ flex: 1, background: 'var(--surface-sunken)', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand-primary)' }} />
                  </div>
                  <div style={{ width: '40px', textAlign: 'right', color: 'var(--ink-muted)', fontSize: '0.85rem' }}>{count}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="admin-card">
          <h3>Badge Distribution</h3>
          <p className="admin-text-muted" style={{ marginBottom: '1.5rem' }}>Users by number of badges earned.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {Object.entries(badgeDistribution).map(([count, usersCount]) => {
              const pct = Math.round((usersCount / users.length) * 100);
              return (
                <div key={count} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '80px', fontWeight: 600 }}>{count} Badges</div>
                  <div style={{ flex: 1, background: 'var(--surface-sunken)', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#f59e0b' }} />
                  </div>
                  <div style={{ width: '40px', textAlign: 'right', color: 'var(--ink-muted)', fontSize: '0.85rem' }}>{usersCount}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="admin-card" style={{ gridColumn: '1 / -1' }}>
          <h3>Historical Analytics Note</h3>
          <p>
            Currently, gamification data is computed dynamically based on the user's live activity on the platform (shows created, studio bookings, etc.). 
          </p>
          <p>
            To provide rich historical analytics (such as "Badges Earned Over Time" charts or "XP Growth Last 30 Days"), a <strong>Gamification Ledger</strong> table needs to be implemented to record exactly when each badge was awarded and when XP was earned.
          </p>
          <div style={{ padding: '1rem', background: 'var(--surface-sunken)', borderRadius: '8px', marginTop: '1rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>Recommended Next Step</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink-muted)' }}>Implement the <code>gamification_ledger</code> table to start capturing gamification events over time for deeper insights.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
