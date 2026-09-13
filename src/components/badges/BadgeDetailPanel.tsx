import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { ComputedBadge } from '@/services/badgeService';
import { BADGE_ICON_MAP, SmallLockIcon } from './BadgeIcons';
import { RARITY_COLORS, RARITY_GLOW } from './rarityColors';
import { RARITY_LABEL } from '@/services/badgeService';

interface Props {
  badge: ComputedBadge;
  onClose: () => void;
}

export function BadgeDetailPanel({ badge, onClose }: Props) {
  const IconComponent = BADGE_ICON_MAP[badge.icon];
  const rarityColor = RARITY_COLORS[badge.rarity];
  const rarityGlow = RARITY_GLOW[badge.rarity];
  const pct = Math.min(100, Math.round((badge.current / badge.threshold) * 100));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const unlockDate = badge.unlockedAt
    ? new Date(badge.unlockedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div
      className="badge-detail-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ '--rarity-color': rarityColor, '--rarity-glow': rarityGlow } as React.CSSProperties}
    >
      <div
        className="badge-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label={badge.name}
        style={{ '--rarity-color': rarityColor, '--rarity-glow': rarityGlow } as React.CSSProperties}
      >
        {/* Close */}
        <button
          type="button"
          className="icon-button badge-detail-close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
            <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {/* Icon */}
        <div style={{
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: badge.state === 'unlocked'
            ? `color-mix(in srgb, ${rarityColor} 12%, transparent)`
            : 'var(--bg-sunk)',
          border: `2px solid ${badge.state === 'unlocked' ? rarityColor : 'var(--line)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: badge.state === 'unlocked' ? `0 0 20px -4px ${rarityGlow}` : 'none',
          position: 'relative',
        }}>
          {IconComponent && (
            <IconComponent
              size={48}
              style={{ color: badge.state === 'unlocked' ? rarityColor : 'var(--ink-faint)', filter: badge.state === 'locked' ? 'grayscale(1)' : 'none' }}
            />
          )}
          {badge.state === 'locked' && (
            <div style={{ position: 'absolute', bottom: -4, right: -4, background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SmallLockIcon size={12} />
            </div>
          )}
        </div>

        {/* Rarity */}
        <span className="badge-rarity-pip" style={{ '--rarity-color': rarityColor } as React.CSSProperties}>
          {RARITY_LABEL[badge.rarity]}
        </span>

        {/* Name */}
        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>{badge.name}</h2>

        {/* Description */}
        <p className="badge-detail-desc">{badge.description}</p>

        {/* Progress bar */}
        {badge.state !== 'unlocked' && (
          <div style={{ width: '100%' }}>
            <div className="badge-progress-bar-wrap" style={{ height: 6 }}>
              <div
                className="badge-progress-bar-fill"
                style={{ width: `${pct}%`, background: rarityColor }}
              />
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', margin: '0.3rem 0 0', textAlign: 'right' }}>
              {badge.current} / {badge.threshold}
            </p>
          </div>
        )}

        {/* Meta grid */}
        <dl className="badge-detail-meta">
          <div className="badge-detail-meta-item">
            <dt>Requirement</dt>
            <dd>{badge.requirement}</dd>
          </div>
          <div className="badge-detail-meta-item">
            <dt>XP Reward</dt>
            <dd className="badge-detail-xp">+{badge.xp} XP</dd>
          </div>
          <div className="badge-detail-meta-item">
            <dt>Status</dt>
            <dd style={{ color: badge.state === 'unlocked' ? rarityColor : 'var(--ink-muted)', textTransform: 'capitalize' }}>
              {badge.state === 'unlocked' ? '✓ Unlocked' : badge.state === 'almost' ? '⬤ Almost there' : '🔒 Locked'}
            </dd>
          </div>
          {unlockDate && (
            <div className="badge-detail-meta-item">
              <dt>Unlocked</dt>
              <dd>{unlockDate}</dd>
            </div>
          )}
        </dl>

        {/* CTA for locked */}
        {badge.state === 'locked' && badge.cta && (
          <Link to={badge.cta.to} className="btn btn-solid" onClick={onClose}>
            {badge.cta.label}
          </Link>
        )}
      </div>
    </div>
  );
}
