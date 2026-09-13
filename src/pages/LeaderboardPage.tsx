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

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const LAST_RANK_KEY = 'vit_radio_last_rank';

// ─── Podium ─────────────────────────────────────────────────────────────────

function Podium({ top3 }: { top3: LeaderboardEntry[] }) {
  const [first, second, third] = top3;
  if (!first) return null;

  const slot = (entry: LeaderboardEntry | undefined, rank: 1 | 2 | 3, isFirst?: boolean) => {
    if (!entry) return null;
    const sizes = { 1: 'rank-1', 2: 'rank-2', 3: 'rank-3' } as const;
    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const badgeClasses = { 1: 'rank-badge-1', 2: 'rank-badge-2', 3: 'rank-badge-3' };
    return (
      <div className={`lb-podium-slot${isFirst ? ' is-first' : ''}`}>
        {rank === 1 && <span className="lb-crown">👑</span>}
        <div className={`lb-podium-avatar ${sizes[rank]}`}>
          {initials(entry.name)}
          <span className={`lb-podium-rank-badge ${badgeClasses[rank]}`}>{rank}</span>
        </div>
        <span className="lb-podium-name" title={entry.name}>{entry.name.split(' ')[0]}</span>
        <span className="lb-podium-xp">{entry.xp.toLocaleString()} XP</span>
        <span className="lb-podium-level">{entry.levelTitle}</span>
        <div className={`lb-podium-block ${sizes[rank]}`}>{medals[rank]}</div>
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

// ─── Ranking Row ─────────────────────────────────────────────────────────────

function RankingRow({
  entry,
  rank,
  isMe,
  style,
}: {
  entry: LeaderboardEntry;
  rank: number;
  isMe: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`lb-row${isMe ? ' is-me' : ''}`}
      style={style}
      aria-label={`Rank ${rank}: ${entry.name}, ${entry.xp} XP`}
    >
      <span className="lb-row-rank">#{rank}</span>
      <div className="lb-row-avatar">{initials(entry.name)}</div>
      <div className="lb-row-info">
        <p className="lb-row-name">{entry.name} {isMe && <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--brand-navy)', background: 'var(--info-wash)', padding: '0.1em 0.45em', borderRadius: '999px', marginLeft: '0.3em' }}>You</span>}</p>
        <p className="lb-row-level">Level {entry.level} · {entry.levelTitle}</p>
      </div>
      <div className="lb-row-meta">
        <span className="lb-row-xp">{entry.xp.toLocaleString()} XP</span>
        <span className="lb-row-badges">🏅 {entry.badgeCount} badge{entry.badgeCount !== 1 ? 's' : ''}</span>
      </div>
      <div className="lb-row-bar-wrap">
        <div className="lb-row-bar-fill" style={{ width: `${entry.levelPct}%` }} />
      </div>
    </div>
  );
}

// ─── My Progress Card ────────────────────────────────────────────────────────

function MyProgressCard({
  entry,
  rank,
  total,
  nextEntry,
}: {
  entry: LeaderboardEntry;
  rank: number;
  total: number;
  nextEntry: LeaderboardEntry | null;
}) {
  const xpToNext = nextEntry ? nextEntry.xp - entry.xp + 1 : null;
  const pctToNext = nextEntry
    ? Math.max(0, 100 - Math.round(((nextEntry.xp - entry.xp) / (nextEntry.xp || 1)) * 100))
    : 100;

  return (
    <div className="lb-my-card">
      <div className="lb-my-card-head">
        <span className="lb-my-rank-pill">🏆 You're #{rank}</span>
        <div className="lb-my-stats">
          <div className="lb-my-stat">
            <dt>XP</dt>
            <dd>{entry.xp.toLocaleString()}</dd>
          </div>
          <div className="lb-my-stat">
            <dt>Level</dt>
            <dd>{entry.level}</dd>
          </div>
          <div className="lb-my-stat">
            <dt>Badges</dt>
            <dd>{entry.badgeCount}</dd>
          </div>
          <div className="lb-my-stat">
            <dt>Of</dt>
            <dd>{total}</dd>
          </div>
        </div>
      </div>
      {nextEntry && xpToNext && (
        <>
          <p className="lb-my-progress-label">
            {xpToNext} XP to reach #{rank - 1} ({nextEntry.name.split(' ')[0]})
          </p>
          <div className="lb-my-bar-wrap">
            <div className="lb-my-bar-fill" style={{ width: `${pctToNext}%` }} />
          </div>
        </>
      )}
      {!nextEntry && (
        <p className="lb-my-progress-label" style={{ color: 'var(--ok)', fontWeight: 700 }}>
          🎉 You're at the top! Keep going!
        </p>
      )}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function LeaderboardSkeleton() {
  return (
    <div className="lb-list">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="lb-skeleton-row" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="lb-skeleton-circle" style={{ width: 28, height: 28, borderRadius: 4 }} />
          <div className="lb-skeleton-circle" />
          <div className="lb-skeleton-lines">
            <div className="lb-skeleton-line" style={{ width: '55%' }} />
            <div className="lb-skeleton-line" style={{ width: '35%' }} />
          </div>
          <div className="lb-skeleton-box" />
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function LeaderboardEmpty({ isMe }: { isMe: boolean }) {
  return (
    <div className="lb-empty">
      <span className="lb-empty-icon">🚀</span>
      <h2 className="lb-empty-title">Your journey starts here</h2>
      <p className="lb-empty-desc">
        {isMe
          ? "No one is on the leaderboard yet for this period. Be the first to earn points!"
          : "No activity found for this time period. Check 'All Time' to see the full board."}
      </p>
      <ul className="lb-empty-steps">
        <li>Sign in and create your first show</li>
        <li>Book a studio slot</li>
        <li>Submit your episode for QC</li>
        <li>Unlock badges to earn extra XP</li>
      </ul>
      <Link to="/register" className="btn btn-solid">Start Earning Points</Link>
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
        setRankUpMessage(`🎉 You moved up ${prevRank - myRank} position${prevRank - myRank !== 1 ? 's' : ''}!`);
        setTimeout(() => setRankUpMessage(null), 3500);
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

        {/* Header */}
        <div className="lb-header">
          <div className="lb-header-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"
                stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(255,255,255,0.25)" />
            </svg>
          </div>
          <h1 className="lb-title">Leaderboard</h1>
          <p className="lb-subtitle">Compete. Create. Earn. Rise to the Top.</p>
        </div>

        {/* Time filters */}
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

        {/* My progress card (above list if signed in) */}
        {!board.loading && myEntry && myRank && (
          <MyProgressCard
            entry={myEntry}
            rank={myRank}
            total={entries.length}
            nextEntry={nextEntry}
          />
        )}

        {/* Content */}
        {board.loading ? (
          <LeaderboardSkeleton />
        ) : entries.length === 0 ? (
          <LeaderboardEmpty isMe={!!profile} />
        ) : (
          <>
            {/* Podium */}
            {top3.length > 0 && (
              <>
                <p className="lb-section-label">Top Performers</p>
                <Podium top3={top3} />
              </>
            )}

            {/* Ranking list */}
            {rest.length > 0 && (
              <>
                <p className="lb-section-label">Rankings</p>
                <div className="lb-list" role="list">
                  {rest.map((entry, i) => (
                    <RankingRow
                      key={entry.userId}
                      entry={entry}
                      rank={i + 4}
                      isMe={profile?.id === entry.userId}
                      style={{ animationDelay: `${Math.min(i * 40, 600)}ms` }}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Sign-in nudge for guests */}
        {!profile && entries.length > 0 && (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <p style={{ color: 'var(--ink-muted)', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              Sign in to see your rank and start earning points.
            </p>
            <Link to="/login" className="btn btn-solid">Sign in</Link>
          </div>
        )}
      </main>

      <SiteFooter />

      {/* Rank-up toast */}
      {rankUpMessage && (
        <div className="lb-rankup-toast" role="status" aria-live="polite">
          {rankUpMessage}
        </div>
      )}
    </div>
  );
}
