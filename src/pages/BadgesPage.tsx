import { useState, useMemo, useEffect, useRef } from 'react';
import { useCurrentUser } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import { Loading, PageHeader } from '@/components/ui';
import {
  badgeService,
  getLevelFromXp,
  BADGE_DEFINITIONS,
  type ComputedBadge,
} from '@/services/badgeService';
import { BadgeCard } from '@/components/badges/BadgeCard';
import { BadgeDetailPanel } from '@/components/badges/BadgeDetailPanel';
import { BadgeUnlockAnimation } from '@/components/badges/BadgeUnlockAnimation';
import { NextBadgeWidget } from '@/components/badges/NextBadgeWidget';
import { AdminGamificationDashboard } from '@/components/admin/gamification/AdminGamificationDashboard';

const SEEN_KEY = 'vit_radio_seen_badges';

function getSeenBadges(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function markBadgeSeen(id: string) {
  try {
    const seen = getSeenBadges();
    seen.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen)));
  } catch {
    // ignore
  }
}

function UserBadgesView({ profile }: { profile: { id: string; role: string; [key: string]: unknown } }) {
  const [selectedBadge, setSelectedBadge] = useState<ComputedBadge | null>(null);
  const [unlockingBadge, setUnlockingBadge] = useState<ComputedBadge | null>(null);
  const hasShownUnlock = useRef(false);

  const progress = useAsync(
    () => badgeService.getUserProgress(profile.id),
    [profile.id],
  );

  const badges = useMemo(() => {
    if (!progress.data) return [];
    return badgeService.computeBadges(progress.data);
  }, [progress.data]);

  const totalXp = useMemo(
    () => badges.filter((b) => b.state === 'unlocked').reduce((sum, b) => sum + b.xp, 0),
    [badges],
  );

  const levelInfo = getLevelFromXp(totalXp);

  const unlockedCount = badges.filter((b) => b.state === 'unlocked').length;
  const almostCount = badges.filter((b) => b.state === 'almost').length;

  const nextBadge = useMemo(() => {
    const locked = badges.filter((b) => b.state !== 'unlocked');
    const almost = locked.filter((b) => b.state === 'almost');
    if (almost.length > 0) {
      return almost.reduce((best, b) =>
        b.current / b.threshold > best.current / best.threshold ? b : best,
      );
    }
    return locked.length > 0
      ? locked.reduce((best, b) =>
          b.current / b.threshold > best.current / best.threshold ? b : best,
        )
      : null;
  }, [badges]);

  useEffect(() => {
    if (hasShownUnlock.current || badges.length === 0) return;
    const seen = getSeenBadges();
    const newlyUnlocked = badges.find((b) => b.state === 'unlocked' && !seen.has(b.id));
    if (newlyUnlocked) {
      hasShownUnlock.current = true;
      setUnlockingBadge(newlyUnlocked);
    }
  }, [badges]);

  const handleDismissUnlock = () => {
    if (unlockingBadge) markBadgeSeen(unlockingBadge.id);
    setUnlockingBadge(null);
    const seen = getSeenBadges();
    const next = badges.find((b) => b.state === 'unlocked' && !seen.has(b.id));
    if (next) setUnlockingBadge(next);
  };

  return (
    <>
      <PageHeader
        title="Your Badges"
        description={`${unlockedCount} of ${BADGE_DEFINITIONS.length} badges unlocked${almostCount > 0 ? ` · ${almostCount} almost there` : ''}`}
      />

      <div className="badges-page">
        {!progress.loading && (
          <div className="badges-level-bar">
            <div className="badges-level-row">
              <div>
                <p className="badges-level-label">Radio Level {levelInfo.level.level}</p>
                <p className="badges-level-title">{levelInfo.level.title}</p>
              </div>
              <span className="badges-xp-amount">
                {totalXp} XP
                {levelInfo.next && ` · ${levelInfo.next.minXp - totalXp} to next`}
              </span>
            </div>
            <div className="badges-level-track">
              <div className="badges-level-fill" style={{ width: `${levelInfo.pct}%` }} />
            </div>
          </div>
        )}

        {!progress.loading && nextBadge && (
          <NextBadgeWidget badge={nextBadge} />
        )}

        {progress.loading ? (
          <Loading label="Loading your badges…" />
        ) : (
          <>
            {unlockedCount > 0 && (
              <section>
                <h2 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-muted)', marginBottom: '1rem' }}>
                  🏆 Earned ({unlockedCount})
                </h2>
                <div className="badges-grid">
                  {badges
                    .filter((b) => b.state === 'unlocked')
                    .map((badge, i) => (
                      <BadgeCard
                        key={badge.id}
                        badge={badge}
                        onCLick={() => setSelectedBadge(badge)}
                        style={{ animationDelay: `${i * 60}ms` }}
                      />
                    ))}
                </div>
              </section>
            )}

            {almostCount > 0 && (
              <section>
                <h2 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-muted)', marginBottom: '1rem' }}>
                  🎯 Almost There ({almostCount})
                </h2>
                <div className="badges-grid">
                  {badges
                    .filter((b) => b.state === 'almost')
                    .map((badge, i) => (
                      <BadgeCard
                        key={badge.id}
                        badge={badge}
                        onCLick={() => setSelectedBadge(badge)}
                        style={{ animationDelay: `${i * 60}ms` }}
                      />
                    ))}
                </div>
              </section>
            )}

            <section>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-muted)', marginBottom: '1rem' }}>
                🔒 Locked ({badges.filter((b) => b.state === 'locked').length})
              </h2>
              <div className="badges-grid">
                {badges
                  .filter((b) => b.state === 'locked')
                  .map((badge, i) => (
                    <BadgeCard
                      key={badge.id}
                      badge={badge}
                      onCLick={() => setSelectedBadge(badge)}
                      style={{ animationDelay: `${i * 60}ms` }}
                    />
                  ))}
              </div>
            </section>
          </>
        )}
      </div>

      {selectedBadge && (
        <BadgeDetailPanel badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
      )}

      {unlockingBadge && (
        <BadgeUnlockAnimation badge={unlockingBadge} onDismiss={handleDismissUnlock} />
      )}
    </>
  );
}

export function BadgesPage() {
  const profile = useCurrentUser();

  if (profile.role === 'ADMIN') {
    return <AdminGamificationDashboard />;
  }

  return <UserBadgesView profile={profile} />;
}
