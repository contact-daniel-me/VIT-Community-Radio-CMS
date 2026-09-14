import { useMemo } from 'react';
import { type LeaderboardEntry } from '@/services/leaderboardService';
import { type ComputedBadge, XP_LEVELS } from '@/services/badgeService';

interface GamificationOverviewProps {
  users: LeaderboardEntry[];
  totalXp: number;
  avgLevel: number;
}

export function GamificationOverview({ users, totalXp, avgLevel }: GamificationOverviewProps) {
  const { allBadges, unlockedCount } = useMemo(() => {
    let unlocked = 0;
    const badgeMap = new Map<string, ComputedBadge>();
    
    users.forEach(u => {
      u.badges.forEach(b => {
        if (b.state === 'unlocked') {
          unlocked++;
          if (!badgeMap.has(b.id) || !badgeMap.get(b.id)!.unlockedAt) {
             badgeMap.set(b.id, b);
          } else if (b.unlockedAt && new Date(b.unlockedAt) > new Date(badgeMap.get(b.id)!.unlockedAt!)) {
             badgeMap.set(b.id, b);
          }
        } else if (!badgeMap.has(b.id)) {
           badgeMap.set(b.id, b);
        }
      });
    });

    const all = Array.from(badgeMap.values());
    all.sort((a, b) => {
      if (a.state === 'unlocked' && b.state !== 'unlocked') return -1;
      if (b.state === 'unlocked' && a.state !== 'unlocked') return 1;
      return 0;
    });

    return { allBadges: all, unlockedCount: unlocked };
  }, [users]);

  const displayBadges = allBadges.slice(0, 6);

  // Compute progress for avg level
  const currentLvlIdx = Math.floor(avgLevel) - 1;
  const clampedIdx = Math.max(0, Math.min(XP_LEVELS.length - 1, currentLvlIdx));
  
  const progressDecimal = avgLevel - Math.floor(avgLevel);
  const progressPct = progressDecimal * 100;

  return (
    <div className="gamification-overview-grid">
      <div className="overview-panel">
        <h3>XP & Level Progress</h3>
        
        <div className="progress-viz-header">
          <div>
            <div className="progress-viz-lbl">Station Average Level</div>
            <div className="progress-viz-val">{avgLevel.toFixed(1)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="progress-viz-lbl">Total Station XP</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a' }}>{totalXp.toLocaleString()}</div>
          </div>
        </div>

        <div className="milestone-track">
          <div className="milestone-fill" style={{ width: `${Math.min(100, Math.max(0, (clampedIdx / 4) * 100 + (progressPct / 4)))}%` }}></div>
          <div className="milestone-markers">
            {[1, 2, 3, 4, 5].map(lvl => (
              <div 
                key={lvl} 
                className={`milestone-dot ${avgLevel >= lvl ? 'reached' : ''} ${Math.floor(avgLevel) === lvl ? 'current' : ''}`}
              >
                {lvl}
              </div>
            ))}
          </div>
        </div>
        <p className="text-sm text-center text-gray-500 mt-4">
          Community is {Math.round(progressPct)}% towards Level {clampedIdx + 2}.
        </p>
      </div>

      <div className="overview-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>Achievement Overview</h3>
          <span className="badge" style={{ background: '#fef3c7', color: '#d97706' }}>{unlockedCount} Unlocked</span>
        </div>

        <div className="mini-badge-grid">
          {displayBadges.map(badge => (
            <div key={badge.id} className={`mini-badge-card ${badge.state === 'unlocked' ? 'unlocked' : 'locked'}`}>
              <div className="mini-badge-icon">
                {badge.state === 'unlocked' ? '🏆' : '🔒'}
              </div>
              <div className="mini-badge-info">
                <h4>{badge.name}</h4>
                <p>{badge.description.length > 35 ? badge.description.substring(0, 35) + '...' : badge.description}</p>
              </div>
            </div>
          ))}
          {displayBadges.length === 0 && (
            <p className="text-sm text-gray-500">No badges available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
