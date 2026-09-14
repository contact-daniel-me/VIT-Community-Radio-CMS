import { useMemo } from 'react';
import { type LeaderboardEntry } from '@/services/leaderboardService';
import { type ComputedBadge } from '@/services/badgeService';

function formatRelativeTime(date: Date): string {
  const diffInSeconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
  
  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears} year${diffInYears > 1 ? 's' : ''} ago`;
}

interface RecentAchievementsProps {
  users: LeaderboardEntry[];
}

export function RecentAchievements({ users }: RecentAchievementsProps) {
  const recentBadges = useMemo(() => {
    const list: { user: LeaderboardEntry; badge: ComputedBadge; unlockedAt: Date }[] = [];
    
    users.forEach(user => {
      user.badges.forEach(badge => {
        if (badge.state === 'unlocked' && badge.unlockedAt) {
          list.push({
            user,
            badge,
            unlockedAt: new Date(badge.unlockedAt)
          });
        }
      });
    });

    // Sort descending by unlock date
    list.sort((a, b) => b.unlockedAt.getTime() - a.unlockedAt.getTime());
    
    return list.slice(0, 5);
  }, [users]);

  if (recentBadges.length === 0) {
    return (
      <div className="overview-panel mt-8">
        <h3>Recent Achievements</h3>
        <p className="text-gray-500 text-sm">No recent achievements found.</p>
      </div>
    );
  }

  return (
    <div className="overview-panel" style={{ marginTop: '2rem' }}>
      <h3>Recent Achievements</h3>
      
      <div className="recent-achievements-list">
        {recentBadges.map((item, idx) => (
          <div key={`${item.user.userId}-${item.badge.id}-${idx}`} className="recent-achievement-item">
            <div className="ach-left">
              <div className="ach-user-avatar">
                {item.user.name.charAt(0).toUpperCase()}
              </div>
              <div className="ach-details">
                <h5>{item.user.name} earned {item.badge.name}</h5>
                <p>{item.badge.description}</p>
              </div>
            </div>
            <div className="ach-right">
              <div className="ach-time">
                {formatRelativeTime(item.unlockedAt)}
              </div>
              <div className="ach-xp">+{item.badge.xp} XP</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
