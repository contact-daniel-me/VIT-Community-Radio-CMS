import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/CommunityCTA';
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
      
      // Easing function (easeOutExpo)
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
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    
    return (
      <div className={`lb-podium-slot${isFirst ? ' is-first' : ''}`}>
        {rank === 1 && <span className="lb-podium-crown">👑</span>}
        <div className={`lb-podium-avatar ${sizes[rank]}`}>
          {initials(entry.name)}
          <span className="lb-podium-medal">{medals[rank]}</span>
        </div>
        <div className="lb-podium-info">
          <p className="lb-podium-name" title={entry.name}>{entry.name.split(' ')[0]}</p>
          <p className="lb-podium-xp">{entry.xp.toLocaleString()} XP</p>
          <div className="lb-podium-badges">
            🏅 {entry.badgeCount} {entry.badgeCount === 1 ? 'Badge' : 'Badges'}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="lb-podium" role="list" aria-label="Top 3 users">
      {slot(second, 2)}
      {slot(first, 1, true)}
      {slot(third, 3)}
    </div>
  );
}

function RankingRow({ entry, rank, isMe, style }: { entry: LeaderboardEntry; rank: number; isMe: boolean; style?: React.CSSProperties }) {
  return (
    <div className={`lb-row-card${isMe ? ' is-me' : ''}`} style={style} aria-label={`Rank ${rank}: ${entry.name}`}>
      <span className="lb-row-rank">#{rank}</span>
      <div className="lb-row-avatar">{initials(entry.name)}</div>
      <div className="lb-row-info">
        <p className="lb-row-name">
          {entry.name}
          {isMe && <span style={{ fontSize: '0.65rem', marginLeft: '0.4em', background: 'var(--brand-navy)', color: '#fff', padding: '0.15em 0.5em', borderRadius: '999px', verticalAlign: 'middle' }}>You</span>}
        </p>
        <p className="lb-row-level">Level {entry.level} · {entry.levelTitle}</p>
      </div>
      <div className="lb-row-stats">
        <div className="lb-row-xp-val">{entry.xp.toLocaleString()} <span>XP</span></div>
        <div className="lb-row-badges">🏅 {entry.badgeCount} Badges</div>
      </div>
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
    <div className="lb-card is-highlight">
      <h3 className="lb-card-title">🏆 Your Rank</h3>
      
      <div className="lb-my-main-stat">
        <div className="lb-my-rank">#{rank}</div>
        <div style={{ textAlign: 'right' }}>
          <p className="lb-my-xp">{animatedXp.toLocaleString()} <span>XP</span></p>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Level {entry.level} · 🏅 {entry.badgeCount} Badges</p>
        </div>
      </div>

      <p className="lb-my-message">
        {rank === 1 ? "🔥 You're at the top! Keep going!" : nextEntry ? `🚀 You're only ${xpToNext} XP away from #${rank - 1}!` : "Keep up the great work!"}
      </p>

      {nextEntry && xpToNext && (
        <div className="lb-my-race">
          <p className="lb-my-race-label">
            <span>Race to #{rank - 1}</span>
            <span>{xpToNext} XP to go</span>
          </p>
          <div className="lb-progress-wrap">
            <div className="lb-progress-fill" style={{ width: `${pctToNext}%` }} />
          </div>
        </div>
      )}
      {!nextEntry && (
        <div className="lb-my-race">
          <p className="lb-my-race-label">
            <span>Next Target</span>
            <span>Unstoppable</span>
          </p>
          <div className="lb-progress-wrap">
            <div className="lb-progress-fill" style={{ width: '100%' }} />
          </div>
        </div>
      )}
    </div>
  );
}

function HowToEarnCard() {
  return (
    <div className="lb-card">
      <h3 className="lb-card-title">✨ How to Earn XP</h3>
      <ul className="lb-earn-list">
        <li className="lb-earn-item">
          <span className="lb-earn-label">🎙️ Create a Show</span>
          <span className="lb-earn-xp">+10 XP</span>
        </li>
        <li className="lb-earn-item">
          <span className="lb-earn-label">📻 Publish a Show</span>
          <span className="lb-earn-xp">+25 XP</span>
        </li>
        <li className="lb-earn-item">
          <span className="lb-earn-label">📅 Book Studio</span>
          <span className="lb-earn-xp">+15 XP</span>
        </li>
        <li className="lb-earn-item">
          <span className="lb-earn-label">🎧 Submit for QC</span>
          <span className="lb-earn-xp">+5 XP</span>
        </li>
        <li className="lb-earn-item">
          <span className="lb-earn-label">🏆 Unlock Badges</span>
          <span className="lb-earn-xp" style={{ background: 'rgba(18, 24, 38, 0.08)', color: 'var(--ink)' }}>Varies</span>
        </li>
      </ul>
    </div>
  );
}

function DailyChallengeCard() {
  return (
    <div className="lb-challenge">
      <div className="lb-challenge-head">
        <span>🎯</span> Today's Challenge
      </div>
      <h4 className="lb-challenge-title">Create and publish a new show episode</h4>
      <div className="lb-challenge-xp">+35 XP</div>
      <Link to="/studio" className="lb-challenge-btn">Start Challenge →</Link>
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="lb-list">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="lb-row-card" style={{ opacity: 0.6 }}>
          <div className="lb-skeleton" style={{ width: 24, height: 24, borderRadius: 4 }} />
          <div className="lb-skeleton" style={{ width: 44, height: 44, borderRadius: '50%' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="lb-skeleton" style={{ width: '40%', height: 12 }} />
            <div className="lb-skeleton" style={{ width: '20%', height: 10 }} />
          </div>
          <div className="lb-skeleton" style={{ width: 50, height: 20 }} />
        </div>
      ))}
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

  // Check rank-up vs last visit
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
  const rest = entries.slice(3);

  const FILTERS: { label: string; value: LeaderboardFilter }[] = [
    { label: 'All Time', value: 'all' },
    { label: 'This Month', value: 'month' },
    { label: 'This Week', value: 'week' },
  ];

  return (
    <div className="lb-page site">
      <SiteHeader />
      <main id="main" className="lb-inner" style={{ paddingTop: '5rem' }}>

        {/* Hero Section */}
        <div className="lb-header">
          <div className="lb-header-icon" aria-hidden="true">🏆</div>
          <div className="lb-header-content">
            <h1 className="lb-title">Leaderboard</h1>
            <p className="lb-subtitle">Compete. Create. Earn. Rise to the Top.</p>
          </div>
          
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
        </div>

        {board.loading ? (
          <div className="lb-grid">
            <div><LeaderboardSkeleton /></div>
            <div className="lb-sidebar">
              <div className="lb-card" style={{ height: 250 }}><div className="lb-skeleton" style={{ height: '100%' }}/></div>
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
            <Link to={profile ? "/studio" : "/register"} className="btn btn-solid btn-lg">Start Earning XP →</Link>
          </div>
        ) : (
          <div className="lb-grid">
            {/* Left Column: Rankings */}
            <div className="lb-main-col">
              
              {/* Podium */}
              {top3.length > 0 && <Podium top3={top3} />}

              {/* Live Rankings List */}
              {rest.length > 0 && (
                <>
                  <div className="lb-list-header">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                    </svg>
                    Live Rankings
                  </div>
                  <div className="lb-list" role="list">
                    {rest.map((entry, i) => (
                      <RankingRow
                        key={entry.userId}
                        entry={entry}
                        rank={i + 4}
                        isMe={profile?.id === entry.userId}
                        style={{ animationDelay: `${Math.min(i * 50, 800)}ms` }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Right Column: Sidebar */}
            <div className="lb-sidebar">
              {profile && myEntry && myRank ? (
                <MyProgressCard entry={myEntry} rank={myRank} nextEntry={nextEntry} />
              ) : !profile ? (
                <div className="lb-card" style={{ textAlign: 'center' }}>
                  <h3 className="lb-card-title" style={{ justifyContent: 'center' }}>👋 Welcome</h3>
                  <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>Sign in to see your rank and start competing!</p>
                  <Link to="/login" className="btn btn-solid" style={{ width: '100%' }}>Sign In</Link>
                </div>
              ) : null}

              <HowToEarnCard />
              
              <DailyChallengeCard />
            </div>
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
