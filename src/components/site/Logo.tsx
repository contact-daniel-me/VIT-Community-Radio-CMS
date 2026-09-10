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
        /* The supplied artwork is a vertical lockup: mic mark on top, wordmark
           beneath. Shrunk to header height the built-in wordmark becomes an
           illegible smudge and duplicates the type beside it, so the frame crops
           to the mark. The mark's own proportions are untouched — see
           --logo-crop-* in site.css for the measurements. */
        <span className="logo-lockup" style={{ height: size }}>
          <img
            src="/brand/vit-community-radio.png"
            alt={withWordmark ? '' : 'VIT Community Radio'}
            className="logo-mark"
            onError={() => setArtworkMissing(true)}
            decoding="async"
          />
        </span>
      )}

      {withWordmark && (
        <span className="logo-text">
          <span className="logo-name">VIT COMMUNITY RADIO</span>
          <span className="logo-freq">90.8 MHz &middot; VIT Vellore</span>
        </span>
      )}
    </span>
  );
}
