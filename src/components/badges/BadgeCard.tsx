import { useRef } from 'react';
import { Link } from 'react-router-dom';
import type { ComputedBadge } from '@/services/badgeService';
import { BADGE_ICON_MAP, SmallLockIcon } from './BadgeIcons';
import { RARITY_COLORS, RARITY_GLOW } from './rarityColors';

interface Props {
  badge: ComputedBadge;
  onCLick: () => void;
  style?: React.CSSProperties;
}

export function BadgeCard({ badge, onCLick: onClick, style }: Props) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const IconComponent = BADGE_ICON_MAP[badge.icon];
  const pct = Math.min(100, Math.round((badge.current / badge.threshold) * 100));
  const rarityColor = RARITY_COLORS[badge.rarity];
  const rarityGlow = RARITY_GLOW[badge.rarity];

  const stateClass =
    badge.state === 'unlocked' ? 'is-unlocked' :
    badge.state === 'almost'   ? 'is-almost'   : 'is-locked';

  return (
    <button
      ref={cardRef}
      type="button"
      className={`badge-card ${stateClass}`}
      onClick={onClick}
      style={{
        '--rarity-color': rarityColor,
        '--rarity-glow': rarityGlow,
        ...style,
      } as React.CSSProperties}
      aria-label={`${badge.name} — ${badge.state}`}
      title={badge.state === 'locked' ? `Unlock by: ${badge.description}` : badge.description}
    >
      {/* Icon area */}
      <div className="badge-icon-wrap">
        <div className="badge-icon-circle" />

        {IconComponent && (
          <IconComponent
            className="badge-icon-svg"
            size={24}
          />
        )}

        {/* Lock badge on locked state */}
        {badge.state === 'locked' && (
          <div className="badge-lock-overlay">
            <SmallLockIcon size={8} />
          </div>
        )}
        
        {badge.state === 'unlocked' && (
          <div className="badge-earned-overlay">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>

      {/* Name */}
      <p className="badge-name">{badge.name}</p>

      {/* Progress */}
      {badge.state !== 'unlocked' && (
        <>
          <p className="badge-progress-text">{badge.current} / {badge.threshold}</p>
          <div className="badge-progress-bar-wrap">
            <div
              className="badge-progress-bar-fill"
              style={{ width: `${pct}%`, '--rarity-color': rarityColor } as React.CSSProperties}
            />
          </div>
          {badge.state === 'locked' && badge.cta && (
            <Link
              to={badge.cta.to}
              className="badge-cta-link"
              onClick={(e) => e.stopPropagation()}
            >
              {badge.cta.label}
            </Link>
          )}
        </>
      )}
      {badge.state === 'unlocked' && (
        <p className="badge-progress-text" style={{ color: rarityColor, fontWeight: 600 }}>
          +{badge.xp} XP
        </p>
      )}
    </button>
  );
}
