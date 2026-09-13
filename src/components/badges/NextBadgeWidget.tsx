import { Link } from 'react-router-dom';
import type { ComputedBadge } from '@/services/badgeService';
import { BADGE_ICON_MAP } from './BadgeIcons';
import { RARITY_COLORS, RARITY_GLOW } from './rarityColors';

interface Props {
  badge: ComputedBadge;
}

export function NextBadgeWidget({ badge }: Props) {
  const IconComponent = BADGE_ICON_MAP[badge.icon];
  const rarityColor = RARITY_COLORS[badge.rarity];
  const rarityGlow = RARITY_GLOW[badge.rarity];
  const pct = Math.min(100, Math.round((badge.current / badge.threshold) * 100));
  const remaining = badge.threshold - badge.current;

  return (
    <div
      className="next-badge-widget"
      style={{ '--rarity-color': rarityColor, '--rarity-glow': rarityGlow } as React.CSSProperties}
    >
      {/* Animated badge icon */}
      <div className="next-badge-icon-wrap">
        {/* Dashed rotating ring */}
        <svg className="next-badge-ring" viewBox="0 0 88 88" aria-hidden="true">
          <circle cx="44" cy="44" r="40" />
        </svg>

        {/* Badge circle background */}
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: `color-mix(in srgb, ${rarityColor} 12%, transparent)`,
          border: `2px solid ${rarityColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 14px -3px ${rarityGlow}`,
        }}>
          {IconComponent && (
            <IconComponent
              size={36}
              style={{ color: rarityColor, filter: 'brightness(0.9)' }}
            />
          )}
        </div>
      </div>

      {/* Text content */}
      <div className="next-badge-content">
        <p className="next-badge-label">🎯 Your Next Achievement</p>
        <p className="next-badge-name">{badge.name}</p>
        <p className="next-badge-tagline">
          {remaining === 1
            ? `Just 1 more — you're almost there!`
            : `${remaining} more to unlock this badge`}
        </p>

        <div className="next-badge-bar-wrap">
          <div className="next-badge-bar-track">
            <div
              className="next-badge-bar-fill"
              style={{ width: `${pct}%`, background: rarityColor }}
            />
          </div>
          <span className="next-badge-count">{badge.current} / {badge.threshold}</span>
        </div>
      </div>

      {/* CTA */}
      {badge.cta && (
        <Link
          to={badge.cta.to}
          className="btn btn-outline"
          style={{ flexShrink: 0, borderColor: rarityColor, color: rarityColor, whiteSpace: 'nowrap' }}
        >
          {badge.cta.label}
        </Link>
      )}
    </div>
  );
}
