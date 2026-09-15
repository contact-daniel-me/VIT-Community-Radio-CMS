import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/CommunityCTA';
import { BADGE_ICON_MAP } from '@/components/badges/BadgeIcons';
import { badgeService } from '@/services/badgeService';
import {
  leaderboardService,
  type LeaderboardFilter,
  type LeaderboardEntry,
} from '@/services/leaderboardService';

// ─── Custom Hooks ────────────────────────────────────────────────────────────

function useCountUp(end: number, duration = 1500) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number | null = null;
    const startValue = count;
    const endValue = end;

    if (startValue === endValue) return;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.floor(startValue + (endValue - startValue) * easeProgress));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [end, duration]);

  return count;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const LAST_RANK_KEY = 'vit_radio_last_rank';

// ─── Components ──────────────────────────────────────────────────────────────

function Podium({ top3 }: { top3: LeaderboardEntry[] }) {
  const [first, second, third] = top3;
  if (!first) return null;

  const slot = (entry: LeaderboardEntry | undefined, rank: 1 | 2 | 3, isFirst?: boolean) => {
    if (!entry) return null;
    const sizes = { 1: 'rank-1', 2: 'rank-2', 3: 'rank-3' } as const;
    
    return (
      <div className={`lb-podium-slot${isFirst ? ' is-first' : ''}`}>
        <div className="lb-podium-avatar-wrap">
          {rank === 1 && <span className="lb-podium-crown">👑</span>}
          {rank === 2 && <span className="lb-podium-crown" style={{ filter: 'grayscale(1)', opacity: 0.8 }}>👑</span>}
          {rank === 3 && <span className="lb-podium-crown" style={{ filter: 'sepia(1) hue-rotate(-50deg) saturate(3)', opacity: 0.9 }}>👑</span>}
          
          <div className={`lb-podium-avatar ${sizes[rank]}`}>
            {initials(entry.name)}
          </div>
          
          <div className="lb-podium-name" title={entry.name}>{entry.name.split(' ')[0]}</div>
          <div className="lb-podium-xp">{entry.xp.toLocaleString()} XP</div>
          
          <div className="lb-podium-badge-pill">
            <span style={{color: '#f59e0b'}}>🏆</span> {entry.levelTitle}
          </div>
        </div>
        
        <div className={`lb-podium-block ${sizes[rank]}`}>
          {rank}
        </div>
      </div>
    );
  };

  return (
    <div className="lb-podium-section">
      <h2 className="lb-section-title">👑 Top 3 Performers</h2>
      <div className="lb-podium" role="list" aria-label="Top 3 users">
        {slot(second, 2)}
        {slot(first, 1, true)}
        {slot(third, 3)}
      </div>
    </div>
  );
}

function RankingTable({ entries, myEntry, myRank }: { entries: LeaderboardEntry[]; myEntry: LeaderboardEntry | null; myRank: number | null }) {
  const isMeInTop = entries.some(e => e.userId === myEntry?.userId);

  return (
    <div className="lb-table-card">
      <h2 className="lb-section-title" style={{ marginBottom: '1rem' }}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20V10M18 20V4M6 20v-4"/>
        </svg>
        Live Rankings
      </h2>
      
      <div className="lb-table-header">
        <div className="th-rank">#</div>
        <div className="th-user">USER</div>
        <div className="th-level">LEVEL</div>
        <div className="th-xp">XP</div>
        <div className="th-badges" style={{ textAlign: 'center' }}>BADGES</div>
        <div className="th-change" style={{ textAlign: 'center' }}>CHANGE</div>
      </div>

      <div className="lb-table-body">
        {entries.map((entry, i) => {
          const rank = i + 4; // since this list skips top 3
          return (
            <div key={entry.userId} className="lb-table-row">
              <div className="lb-td-rank">{rank}</div>
              <div className="lb-td-user">
                <div className="lb-td-user-avatar">{initials(entry.name)}</div>
                <div className="lb-td-user-name">{entry.name}</div>
              </div>
              <div className="lb-td-level">{entry.level}</div>
              <div className="lb-td-xp">{entry.xp.toLocaleString()} XP</div>
              <div className="lb-td-badges">{entry.badgeCount}</div>
              <div className="lb-td-change" style={{ textAlign: 'center' }}>—</div>
            </div>
          );
        })}
      </div>

      {myEntry && myRank && !isMeInTop && myRank > 3 && (
        <div className="lb-table-my-position">
          <div className="lb-my-pos-label">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            Your Position
          </div>
          <div className="lb-table-row" style={{ borderBottom: 'none' }}>
            <div className="lb-td-rank">{myRank}</div>
            <div className="lb-td-user">
              <div className="lb-td-user-avatar" style={{ background: '#7c3aed', color: 'white' }}>{initials(myEntry.name)}</div>
              <div className="lb-td-user-name">{myEntry.name}</div>
            </div>
            <div className="lb-td-level">{myEntry.level}</div>
            <div className="lb-td-xp">{myEntry.xp.toLocaleString()} XP</div>
            <div className="lb-td-badges">{myEntry.badgeCount}</div>
            <div className="lb-td-change" style={{ textAlign: 'center' }}>—</div>
          </div>
        </div>
      )}
    </div>
  );
}

function MyProgressCard({ entry, rank, nextEntry }: { entry: LeaderboardEntry; rank: number; nextEntry: LeaderboardEntry | null }) {
  const animatedXp = useCountUp(entry.xp);
  const xpToNext = nextEntry ? nextEntry.xp - entry.xp + 1 : null;
  const pctToNext = nextEntry
    ? Math.max(0, 100 - Math.round(((nextEntry.xp - entry.xp) / (nextEntry.xp || 1)) * 100))
    : 100;

  return (
    <div className="lb-my-card-horizontal">
      <div className="lb-my-card-top">
        <div className="lb-my-rank-sec">
          <div className="lb-my-rank-title">⭐ Your Rank</div>
          <div className="lb-my-rank-num">#{rank}</div>
          <p className="lb-my-rank-msg">
            {rank === 1 ? "You're dominating the leaderboard!" : "Keep creating. Keep inspiring."}
          </p>
        </div>
        
        <div className="lb-my-stats-grid">
          <div className="lb-my-stat-col">
            <span className="lb-my-stat-icon">⭐</span>
            <span className="lb-my-stat-val">{animatedXp}</span>
            <span className="lb-my-stat-label">XP</span>
          </div>
          <div className="lb-my-stat-col">
            <span className="lb-my-stat-icon">📊</span>
            <span className="lb-my-stat-val">Level {entry.level}</span>
            <span className="lb-my-stat-label">Level</span>
          </div>
          <div className="lb-my-stat-col">
            <span className="lb-my-stat-icon">🏅</span>
            <span className="lb-my-stat-val">{entry.badgeCount}</span>
            <span className="lb-my-stat-label">Badges</span>
          </div>
          <div className="lb-my-stat-col">
            <span className="lb-my-stat-icon">🔥</span>
            <span className="lb-my-stat-val">{entry.streak}</span>
            <span className="lb-my-stat-label">Streak</span>
          </div>
        </div>

        <div className="lb-my-graphic">
          Keep creating.<br/>Keep inspiring.
          <svg width="60" height="20" viewBox="0 0 60 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 15Q20 5 35 15T55 5" />
          </svg>
        </div>
      </div>

      {nextEntry && xpToNext && (
        <div className="lb-my-progress-sec">
          <p className="lb-my-progress-text">🏆 <span>{xpToNext} XP</span> ahead of #{rank - 1}</p>
          <div className="lb-my-progress-bar">
            <div className="lb-my-progress-fill" style={{ width: `${pctToNext}%` }} />
          </div>
        </div>
      )}
      {!nextEntry && (
        <div className="lb-my-progress-sec">
          <p className="lb-my-progress-text">👑 You are at the top!</p>
          <div className="lb-my-progress-bar">
            <div className="lb-my-progress-fill" style={{ width: '100%' }} />
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarCards({ userId }: { userId: string | undefined }) {
  const badgeProgress = useAsync(async () => {
    if (!userId) return [];
    const p = await badgeService.getUserProgress(userId);
    return badgeService.computeBadges(p).filter(b => b.state === 'unlocked');
  }, [userId]);

  const unlockedBadges = badgeProgress.data?.slice(0, 4) || [];

  return (
    <div className="lb-sidebar">
      {/* Today's Challenge */}
      <div className="lb-side-card">
        <div className="lb-side-header">
          <h3 className="lb-side-title">🎯 Today's Challenge</h3>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f59e0b', background: '#fef3c7', padding: '0.2rem 0.5rem', borderRadius: '999px' }}>🔥 +100 XP</span>
        </div>
        <div className="lb-challenge-box">
          <div className="lb-challenge-icon">🎙️</div>
          <div className="lb-challenge-info">
            <h4>Create and publish a show</h4>
            <p>Share your voice with the world!</p>
          </div>
        </div>
        <Link to="/studio" className="lb-side-btn">Start Challenge →</Link>
      </div>

      {/* How to Earn XP */}
      <div className="lb-side-card">
        <div className="lb-side-header">
          <h3 className="lb-side-title">⚡ How to Earn XP</h3>
          <Link to="/about" className="lb-side-link">View All</Link>
        </div>
        <ul className="lb-earn-list">
          <li className="lb-earn-item"><span className="lb-earn-label">📅 Daily Sign In</span><span className="lb-earn-xp">+10 XP</span></li>
          <li className="lb-earn-item"><span className="lb-earn-label">🎙️ Create a Show</span><span className="lb-earn-xp">+50 XP</span></li>
          <li className="lb-earn-item"><span className="lb-earn-label">📻 Publish a Show</span><span className="lb-earn-xp">+100 XP</span></li>
          <li className="lb-earn-item"><span className="lb-earn-label">🎧 Complete a Show</span><span className="lb-earn-xp">+25 XP</span></li>
          <li className="lb-earn-item"><span className="lb-earn-label">🏅 Earn a Badge</span><span className="lb-earn-xp">+50 XP</span></li>
          <li className="lb-earn-item"><span className="lb-earn-label">🔥 Maintain a Streak</span><span className="lb-earn-xp">+100 XP</span></li>
        </ul>
      </div>

      {/* Your Badges */}
      {userId && (
        <div className="lb-side-card">
          <div className="lb-side-header">
            <h3 className="lb-side-title">🏅 Your Badges</h3>
            <Link to="/badges" className="lb-side-link">View All</Link>
          </div>
          {badgeProgress.loading ? (
            <div className="lb-skeleton" style={{ height: 60, width: '100%' }} />
          ) : unlockedBadges.length > 0 ? (
            <div className="lb-badges-grid">
              {unlockedBadges.map(b => {
                const IconComponent = BADGE_ICON_MAP[b.icon];
                return (
                  <div key={b.id} className="lb-badge-item">
                    <div className="lb-badge-icon-wrap" style={{ color: '#f59e0b' }}>
                      {IconComponent ? <IconComponent /> : <span style={{fontSize:'1.5rem'}}>🏅</span>}
                    </div>
                    <span className="lb-badge-name">{b.name}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center', margin: 0 }}>You haven't earned any badges yet.</p>
          )}
        </div>
      )}

      {/* Promo Card */}
      <div className="lb-promo-card">
        <div className="lb-promo-content">
          <h3>Your journey makes an impact!</h3>
          <p>Create. Inspire. Climb higher.</p>
        </div>
        <img src="/images/rocket.jpg" alt="Rocket" className="lb-promo-img" style={{ mixBlendMode: 'multiply' }} />
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function LeaderboardPage() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState<LeaderboardFilter>('all');
  const [rankUpMessage, setRankUpMessage] = useState<string | null>(null);

  const board = useAsync(() => leaderboardService.getLeaderboard(filter), [filter]);
  const entries = board.data ?? [];

  const myRank = useMemo(() => {
    if (!profile) return null;
    const idx = entries.findIndex((e) => e.userId === profile.id);
    return idx === -1 ? null : idx + 1;
  }, [entries, profile]);

  const myEntry = useMemo(() => {
    if (!profile) return null;
    return entries.find((e) => e.userId === profile.id) ?? null;
  }, [entries, profile]);

  const nextEntry = useMemo(() => {
    if (!myRank || myRank <= 1) return null;
    return entries[myRank - 2] ?? null;
  }, [entries, myRank]);

  useEffect(() => {
    if (!profile || !myRank || filter !== 'all') return;
    const key = `${LAST_RANK_KEY}_${profile.id}`;
    const prev = localStorage.getItem(key);
    if (prev) {
      const prevRank = parseInt(prev, 10);
      if (myRank < prevRank) {
        setRankUpMessage(`🎉 You climbed ${prevRank - myRank} position${prevRank - myRank !== 1 ? 's' : ''}!`);
        setTimeout(() => setRankUpMessage(null), 4000);
      }
    }
    localStorage.setItem(key, String(myRank));
  }, [myRank, profile, filter]);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3, 13); // Show top 10 in table

  const FILTERS: { label: string; value: LeaderboardFilter }[] = [
    { label: 'All Time', value: 'all' },
    { label: 'This Month', value: 'month' },
    { label: 'This Week', value: 'week' },
  ];

  return (
    <div className="lb-page site">
      
      <div className="lb-hero-wrapper">
        <div className="lb-hero-bg" />
        <SiteHeader />
        
        {/* Hero Section */}
        <div className="lb-inner lb-header">
          <div className="lb-header-content">
            <h1 className="lb-title">Leaderboard</h1>
            <p className="lb-subtitle">Compete. Create. Earn. Rise to the Top.</p>
          </div>
        </div>
      </div>
      
      <main id="main" className="lb-inner" style={{ paddingTop: '2rem' }}>

        {/* Filters */}
        <div className="lb-filters-wrap">
          <div className="lb-filters" role="tablist" aria-label="Time period">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={filter === f.value}
                className={`lb-filter-btn${filter === f.value ? ' is-active' : ''}`}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button className="lb-filter-streak" disabled>
            🔥 Streak
          </button>
        </div>

        {board.loading ? (
          <div className="lb-grid">
            <div><div className="lb-skeleton" style={{ height: 400, width: '100%' }} /></div>
            <div className="lb-sidebar">
              <div className="lb-skeleton" style={{ height: 250, width: '100%', borderRadius: 20 }}/>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="lb-empty">
            <span className="lb-empty-icon">🚀</span>
            <h2 className="lb-empty-title">Your journey starts here</h2>
            <p className="lb-empty-desc">
              {profile
                ? "No one is on the leaderboard yet for this period. Be the first to earn points!"
                : "No activity found for this time period. Check 'All Time' to see the full board."}
            </p>
            <Link to={profile ? "/studio" : "/register"} className="btn btn-solid btn-lg" style={{ background: '#7c3aed', color: 'white', border: 'none' }}>Start Earning XP →</Link>
          </div>
        ) : (
          <div className="lb-grid">
            {/* Left Column: Rankings */}
            <div className="lb-main-col">
              
              {profile && myEntry && myRank && (
                <MyProgressCard entry={myEntry} rank={myRank} nextEntry={nextEntry} />
              )}

              {top3.length > 0 && <Podium top3={top3} />}

              {rest.length > 0 && (
                <RankingTable entries={rest} myEntry={myEntry} myRank={myRank} />
              )}
            </div>

            {/* Right Column: Sidebar */}
            <SidebarCards userId={profile?.id} />
          </div>
        )}

      </main>
      <SiteFooter />

      {/* Rank-up Toast */}
      {rankUpMessage && (
        <div className="lb-rankup-toast" role="status" aria-live="polite">
          <span style={{ fontSize: '1.2rem' }}>🎉</span> {rankUpMessage}
        </div>
      )}
    </div>
  );
}
