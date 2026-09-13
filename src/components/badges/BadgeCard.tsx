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

  // SVG progress ring
  const RING_R = 38;
  const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;
  const ringOffset = RING_CIRCUMFERENCE * (1 - pct / 100);

  const stateClass =
    badge.state === 'unlocked' ? 'is-unlocked' :
    badge.state === 'almost'   ? 'is-almost'   : 'is-locked';

  const rarityLabel: Record<string, string> = {
    COMMON: 'Common', UNCOMMON: 'Uncommon', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary',
  };

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
    >
      {/* Icon area */}
      <div className="badge-icon-wrap">
        <div className="badge-icon-circle" />

        {/* Progress ring for almost state */}
        {badge.state !== 'locked' && (
          <svg className="badge-progress-ring-wrap" viewBox="0 0 88 88">
            <circle
              className="badge-progress-ring-bg"
              cx="44" cy="44" r={RING_R}
              strokeWidth="3"
            />
            {badge.state === 'almost' && (
              <circle
                className={`badge-progress-ring-fill ${badge.state === 'almost' ? 'badge-almost-ring' : ''}`}
                cx="44" cy="44" r={RING_R}
                strokeWidth="3"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={ringOffset}
                transform="rotate(-90 44 44)"
              />
            )}
            {badge.state === 'unlocked' && (
              <circle
                className="badge-progress-ring-fill"
                cx="44" cy="44" r={RING_R}
                strokeWidth="3"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={0}
                transform="rotate(-90 44 44)"
              />
            )}
          </svg>
        )}

        {IconComponent && (
          <IconComponent
            className="badge-icon-svg"
            size={40}
          />
        )}

        {/* Lock badge on locked state */}
        {badge.state === 'locked' && (
          <div className="badge-lock-overlay">
            <SmallLockIcon size={12} />
          </div>
        )}
      </div>

      {/* Rarity pill */}
      <span className="badge-rarity-pip" style={{ '--rarity-color': rarityColor } as React.CSSProperties}>
        {rarityLabel[badge.rarity]}
      </span>

      {/* Name */}
      <p className="badge-name">{badge.name}</p>

      {/* Progress */}
      {badge.state !== 'unlocked' && (
        <>
          <div className="badge-progress-bar-wrap">
            <div
              className="badge-progress-bar-fill"
              style={{ width: `${pct}%`, '--rarity-color': rarityColor } as React.CSSProperties}
            />
          </div>
          <p className="badge-progress-text">{badge.current} / {badge.threshold}</p>
          {badge.state === 'almost' && (
            <p className="badge-almost-label">One more!</p>
          )}
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
