import { useEffect, useRef } from 'react';
import type { ComputedBadge } from '@/services/badgeService';
import { BADGE_ICON_MAP } from './BadgeIcons';
import { RARITY_COLORS, RARITY_GLOW } from './rarityColors';

interface Props {
  badge: ComputedBadge;
  onDismiss: () => void;
}

const PARTICLE_COUNT = 10;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function BadgeUnlockAnimation({ badge, onDismiss }: Props) {
  const IconComponent = BADGE_ICON_MAP[badge.icon];
  const rarityColor = RARITY_COLORS[badge.rarity];
  const rarityGlow = RARITY_GLOW[badge.rarity];
  const overlayRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss after 4s
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  // Trap focus inside overlay
  useEffect(() => {
    const el = overlayRef.current;
    if (el) el.focus();
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus?.();
  }, []);

  // Generate random particle positions
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    left: `${randomBetween(10, 90)}%`,
    top: `${randomBetween(20, 80)}%`,
    size: randomBetween(4, 10),
    delay: `${randomBetween(0, 0.8)}s`,
  }));

  return (
    <div
      className="badge-unlock-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${badge.name} unlocked`}
      ref={overlayRef}
      tabIndex={-1}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
      style={{ '--rarity-color': rarityColor, '--rarity-glow': rarityGlow } as React.CSSProperties}
    >
      <div className="badge-unlock-panel" style={{ '--rarity-color': rarityColor, '--rarity-glow': rarityGlow } as React.CSSProperties}>

        {/* Expanding radio wave rings */}
        <div className="badge-unlock-wave" aria-hidden="true">
          <svg width="400" height="400" viewBox="0 0 400 400">
            <circle className="unlock-wave-circle" cx="200" cy="200" r="20"
              style={{ '--rarity-color': rarityColor } as React.CSSProperties} />
            <circle className="unlock-wave-circle" cx="200" cy="200" r="20"
              style={{ '--rarity-color': rarityColor } as React.CSSProperties} />
            <circle className="unlock-wave-circle" cx="200" cy="200" r="20"
              style={{ '--rarity-color': rarityColor } as React.CSSProperties} />
          </svg>
        </div>

        {/* Floating particles */}
        <div className="badge-unlock-particles" aria-hidden="true">
          {particles.map((p) => (
            <div
              key={p.id}
              className="badge-unlock-particle"
              style={{
                left: p.left,
                top: p.top,
                width: p.size,
                height: p.size,
                animationDelay: p.delay,
                background: rarityColor,
              }}
            />
          ))}
        </div>

        {/* Shine sweep */}
        <div className="badge-unlock-shine" aria-hidden="true" />

        {/* Title */}
        <p className="badge-unlock-title">✨ Badge Unlocked ✨</p>

        {/* Badge icon */}
        <div className="badge-unlock-icon">
          <div style={{
            width: 100,
            height: 100,
            borderRadius: '50%',
            background: `color-mix(in srgb, ${rarityColor} 15%, transparent)`,
            border: `2.5px solid ${rarityColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 24px -4px ${rarityGlow}`,
          }}>
            {IconComponent && (
              <IconComponent
                size={56}
                style={{ color: rarityColor }}
              />
            )}
          </div>
        </div>

        {/* Badge name */}
        <h2 className="badge-unlock-name">{badge.name}</h2>

        {/* Description */}
        <p className="badge-unlock-desc">{badge.description}</p>

        {/* XP reward */}
        <p className="badge-unlock-xp">+{badge.xp} XP</p>

        {/* Close button */}
        <button
          type="button"
          className="btn btn-outline badge-unlock-close"
          onClick={onDismiss}
          autoFocus
        >
          Continue
        </button>
      </div>
    </div>
  );
}
