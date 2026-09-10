import { Link } from 'react-router-dom';
import type { PublicNowPlayingRow } from '@/types/database';
import { LiveStatus } from './LiveStatus';

/**
 * The hero.
 *
 * There is no photograph in this project and none is invented. The visual is
 * built from type, rule lines, a broadcast-metadata strip and an SVG studio
 * mic — drawn once, here, so it can inherit the theme instead of fighting it.
 * The layout is deliberately asymmetric: headline sits left and low, the live
 * panel breaks the grid on the right.
 */
export function Hero({ now }: { now: PublicNowPlayingRow | null }) {
  return (
    <section className="hero" id="top">
      <div className="hero-grid">
        <div className="hero-lede">
          <p className="eyebrow">
            <span>90.8 MHz</span>
            <span className="eyebrow-rule" />
            <span>VIT Vellore</span>
            <span className="eyebrow-rule" />
            <span>Community radio</span>
          </p>

          <h1 className="hero-title">
            Your voice.
            <br />
            <span className="hero-title-accent">Your radio.</span>
          </h1>

          <p className="hero-copy">
            Community Voice, student voices, music and conversation &mdash; made by
            students, for everyone around VIT Vellore.
          </p>

          <div className="hero-actions">
            <Link to="/studio" className="btn btn-outline btn-lg">
              Book the studio
            </Link>
          </div>

          <p className="hero-quote">&ldquo;More than radio. A louder community.&rdquo;</p>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <StudioMic />
          <div className="hero-onair-sign">
            <span>ON</span>
            <span>AIR</span>
          </div>
        </div>

        <div className="hero-live">
          <LiveStatus now={now} />
        </div>
      </div>

      <div className="hero-ticker" aria-hidden="true">
        <span>NOW PLAYING</span>
        <span>&middot;</span>
        <span>COMMUNITY RADIO</span>
        <span>&middot;</span>
        <span>90.8 MHz</span>
        <span>&middot;</span>
        <span>VIT VELLORE</span>
        <span>&middot;</span>
        <span>MADE BY STUDENTS</span>
        <span>&middot;</span>
        <span>MORE THAN RADIO. A LOUDER COMMUNITY.</span>
      </div>
    </section>
  );
}

/** Condenser mic on a shock mount, drawn flat so it reads at any size. */
function StudioMic() {
  return (
    <svg viewBox="0 0 220 300" className="studio-mic" role="presentation">
      <defs>
        <linearGradient id="mic-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--mic-hi)" />
          <stop offset="55%" stopColor="var(--mic-mid)" />
          <stop offset="100%" stopColor="var(--mic-lo)" />
        </linearGradient>
      </defs>

      {/* shock mount */}
      <ellipse cx="110" cy="150" rx="86" ry="104" className="mic-ring" />
      <ellipse cx="110" cy="150" rx="74" ry="92" className="mic-ring mic-ring-inner" />

      {/* body */}
      <rect x="76" y="52" width="68" height="150" rx="34" fill="url(#mic-body)" />
      {/* grille lines — uneven spacing on purpose */}
      <g className="mic-grille">
        {[70, 82, 94, 106, 117, 129, 142, 154, 167, 179].map((y) => (
          <line key={y} x1="86" y1={y} x2="134" y2={y} />
        ))}
      </g>
      <rect x="76" y="52" width="68" height="150" rx="34" className="mic-outline" />

      {/* stem + base */}
      <rect x="103" y="202" width="14" height="52" className="mic-stem" />
      <rect x="78" y="252" width="64" height="13" rx="6.5" className="mic-stem" />

      {/* record light */}
      <circle cx="110" cy="86" r="5" className="mic-led" />
    </svg>
  );
}
