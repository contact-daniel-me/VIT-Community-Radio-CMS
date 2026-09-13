import { useState } from 'react';
import { LogoMark } from './LogoMark';

/**
 * The station logo.
 *
 * Priority: the supplied artwork at public/brand/vit-community-radio.png. Its
 * height is set and width follows, so the proportions are never forced. If the
 * file is not present, <LogoMark> renders a drawn reproduction of the mic mark
 * instead — see that file for why it is not the wordmark too.
 *
 * Dropping the real PNG in requires no code change: it simply loads and the
 * fallback stops being used.
 */
export function Logo({
  size = 40,
  withWordmark = true,
  className = '',
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  const [artworkMissing, setArtworkMissing] = useState(false);

  return (
    <span className={`logo ${className}`.trim()}>
      {artworkMissing ? (
        <LogoMark size={size} />
      ) : (
        <img
          src="/brand/vit-community-radio.png"
          alt={withWordmark ? '' : 'VIT Community Radio'}
          className="logo-mark"
          style={{ height: size, width: 'auto', objectFit: 'contain' }}
          onError={() => setArtworkMissing(true)}
          decoding="async"
        />
      )}

      {withWordmark && (
        <span className="logo-text">
          <span className="logo-name">VIT COMMUNITY RADIO 90.8 FM</span>
          <span className="logo-freq" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            VIT Vellore 
            <span style={{ 
              background: 'var(--ink-faint)', 
              color: 'var(--surface)', 
              padding: '0.1rem 0.3rem', 
              borderRadius: 'var(--r-sm)', 
              fontSize: '0.65em', 
              fontWeight: 700 
            }}>CMS</span>
          </span>
        </span>
      )}
    </span>
  );
}
