import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { type LeaderboardEntry } from '@/services/leaderboardService';
import { badgeService } from '@/services/badgeService';
import { useAsync } from '@/hooks/useAsync';
import { BADGE_ICON_MAP } from '@/components/badges/BadgeIcons';
import { Loading } from '@/components/ui';

interface Props {
  user: LeaderboardEntry;
  onClose: () => void;
  onUpdated: () => void;
}

export function UserManagementModal({ user, onClose, onUpdated }: Props) {
  const { profile } = useAuth();
  const [xpAmount, setXpAmount] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const progress = useAsync(() => badgeService.getUserProgress(user.userId), [user.userId]);
  const badges = useAsync(async () => {
    if (!progress.data) return [];
    return badgeService.computeBadgesAsync(progress.data);
  }, [progress.data]);

  const handleAdjustXp = async (amount: number) => {
    if (!profile) return;
    const confirmMsg = amount > 0 
      ? `Are you sure you want to ADD ${amount} XP to ${user.name}?`
      : `Are you sure you want to REMOVE ${Math.abs(amount)} XP from ${user.name}?`;
    
    if (!window.confirm(confirmMsg)) return;

    setIsSubmitting(true);
    const { error } = await supabase.from('user_gamification_adjustments').insert({
      user_id: user.userId,
      admin_id: profile.id,
      xp_adjustment: amount,
      reason: reason || (amount > 0 ? 'Admin Manual Addition' : 'Admin Manual Deduction'),
    });

    setIsSubmitting(false);
    if (error) {
      alert(`Failed to adjust XP: ${error.message}`);
    } else {
      setXpAmount(0);
      setReason('');
      onUpdated();
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 800, width: '90%' }}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2 style={{ marginTop: 0 }}>Manage User: {user.name}</h2>
        
        <div className="admin-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '1.5rem' }}>
          
          {/* Left Column: Stats & Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="admin-card">
              <h3 style={{ marginTop: 0 }}>Current Stats</h3>
              <p><strong>Level:</strong> {user.level} ({user.levelTitle})</p>
              <p><strong>XP:</strong> {user.xp.toLocaleString()}</p>
              <p><strong>Badges Earned:</strong> {user.badgeCount}</p>
              <p><strong>Leaderboard Rank:</strong> {user.xp > 0 ? 'Active' : 'Unranked'}</p>
            </div>

            <div className="admin-card">
              <h3 style={{ marginTop: 0 }}>Adjust XP</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <input 
                  type="number" 
                  value={xpAmount || ''} 
                  onChange={e => setXpAmount(parseInt(e.target.value) || 0)} 
                  placeholder="Amount (e.g. 100 or -50)"
                  className="admin-input"
                />
                <input 
                  type="text" 
                  value={reason} 
                  onChange={e => setReason(e.target.value)} 
                  placeholder="Reason (optional)"
                  className="admin-input"
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className="btn btn-solid" 
                    style={{ background: '#10b981', border: 'none', flex: 1 }}
                    onClick={() => handleAdjustXp(Math.abs(xpAmount))}
                    disabled={isSubmitting || !xpAmount}
                  >
                    + Add XP
                  </button>
                  <button 
                    className="btn btn-solid" 
                    style={{ background: '#ef4444', border: 'none', flex: 1 }}
                    onClick={() => handleAdjustXp(-Math.abs(xpAmount))}
                    disabled={isSubmitting || !xpAmount}
                  >
                    - Remove XP
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Badges & Activity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="admin-card" style={{ flex: 1 }}>
              <h3 style={{ marginTop: 0 }}>User Activity (Raw)</h3>
              {progress.loading ? <Loading label="Loading..." /> : progress.data ? (
                <ul style={{ paddingLeft: '1.25rem', margin: 0, color: 'var(--ink)' }}>
                  <li>Shows Created: {progress.data.episodeCount}</li>
                  <li>Shows Approved: {progress.data.approvedCount}</li>
                  <li>Studio Bookings: {progress.data.bookingCount}</li>
                  <li>Consecutive Active Weeks: {progress.data.consecutiveWeeks}</li>
                </ul>
              ) : <p>Failed to load.</p>}
            </div>

            <div className="admin-card" style={{ flex: 2, overflowY: 'auto', maxHeight: '400px' }}>
              <h3 style={{ marginTop: 0 }}>Badges</h3>
              {badges.loading ? <Loading label="Loading..." /> : badges.data ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {badges.data.map(b => {
                    const IconComp = BADGE_ICON_MAP[b.icon];
                    const isUnlocked = b.state === 'unlocked';
                    return (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', opacity: isUnlocked ? 1 : 0.5 }}>
                        <div style={{ width: 40, height: 40, color: isUnlocked ? '#f59e0b' : '#94a3b8' }}>
                          {IconComp ? <IconComp size={40} /> : '🏅'}
                        </div>
                        <div>
                          <p style={{ margin: 0, fontWeight: 700 }}>{b.name} {isUnlocked && '✅'}</p>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                            {isUnlocked ? `Unlocked` : `${b.current} / ${b.threshold} ${b.metric}`}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : <p>Failed to load badges.</p>}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
