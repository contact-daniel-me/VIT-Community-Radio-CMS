import { useEffect, useState } from 'react';
import type { RadioItem } from './types';

interface RadioDisplayProps {
  item: RadioItem | null;
  isPlaying: boolean;
  progress: number; // 0 to 1
  currentTime: number;
  duration: number;
  authMessage: string | null;
  isTuning: boolean;
  isPoweredOn?: boolean;
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Animated CRT Vector Oscilloscope
 *
 * Renders an authentic laboratory/studio CRT oscilloscope waveform monitor
 * with reticle grid and dynamic sine waves that react to audio playback.
 */
function RetroOscilloscope({ isPlaying }: { isPlaying: boolean }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setPhase((prev) => (prev + 0.35) % (Math.PI * 2));
    }, 60);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Generate dynamic waveform path
  const width = 120;
  const height = 54;
  const midY = height / 2;

  let wavePath = `M 0 ${midY}`;
  const points = 24;
  const amp = isPlaying ? 16 : 2;

  for (let i = 0; i <= points; i++) {
    const x = (i / points) * width;
    const y = isPlaying
      ? midY +
        Math.sin(i * 0.7 + phase) * (amp * 0.7) +
        Math.cos(i * 1.3 - phase) * (amp * 0.3)
      : midY + Math.sin(i * 0.3) * amp;
    wavePath += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }

  return (
    <div className="retro-oscilloscope-screen" aria-hidden="true">
      {/* CRT Reticle Grid in Warm Ivory */}
      <svg className="retro-oscilloscope-svg" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <pattern id="reticle-grid" width="12" height="9" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="12" y2="0" stroke="rgba(166, 107, 8, 0.2)" strokeWidth="0.5" />
            <line x1="0" y1="0" x2="0" y2="9" stroke="rgba(166, 107, 8, 0.2)" strokeWidth="0.5" />
          </pattern>
          <linearGradient id="scope-glow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#15803d" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#16a34a" stopOpacity="1" />
            <stop offset="100%" stopColor="#15803d" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        <rect width="100%" height="100%" fill="#EFE9DE" rx="4" />
        <rect width="100%" height="100%" fill="url(#reticle-grid)" rx="4" />

        {/* Center axes */}
        <line x1="0" y1={midY} x2={width} y2={midY} stroke="rgba(166, 107, 8, 0.35)" strokeWidth="0.8" strokeDasharray="2 2" />
        <line x1={width / 2} y1="0" x2={width / 2} y2={height} stroke="rgba(166, 107, 8, 0.35)" strokeWidth="0.8" strokeDasharray="2 2" />

        {/* Dynamic Oscilloscope Beam Trace */}
        <path
          d={wavePath}
          fill="none"
          stroke="url(#scope-glow)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="retro-scope-labels">
        <span className="scope-tag">{isPlaying ? 'AUDIO ACTIVE' : 'CARRIER STANDBY'}</span>
        <span className="scope-freq">90.8 FM</span>
      </div>
    </div>
  );
}

/**
 * Digital retro LCD display representing the electronic readout of the FM radio receiver.
 *
 * Balanced two-column layout:
 * - Left column: category, show title, RJ host, date, description, highlights.
 * - Right column: programme cover artwork or animated CRT oscilloscope, dual-channel VU meter, playback info.
 */
export function RadioDisplay({
  item,
  isPlaying,
  progress,
  currentTime,
  duration,
  authMessage,
  isTuning,
  isPoweredOn = true,
}: RadioDisplayProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [vuLevels, setVuLevels] = useState<{ left: number; right: number }>({ left: 1, right: 1 });

  // Reset image failure state when item changes
  useEffect(() => {
    setImgFailed(false);
  }, [item?.id]);

  // Animated stereo VU meter levels
  useEffect(() => {
    if (!isPlaying) {
      setVuLevels({ left: 1, right: 1 });
      return;
    }

    const interval = setInterval(() => {
      setVuLevels({
        left: Math.floor(Math.random() * 5) + 2,
        right: Math.floor(Math.random() * 5) + 2,
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying]);

  if (!item) {
    return (
      <div className="retro-display-screen" role="region" aria-label="Radio display">
        <div className="retro-display-scanlines" aria-hidden="true" />
        <div className="retro-display-glare" aria-hidden="true" />
        <div className="retro-display-body">
          <div className="retro-display-toprow">
            <span className="retro-lcd-tag freq">90.8 FM</span>
            <span className="retro-lcd-tag status">SCANNING...</span>
          </div>
          <div className="retro-display-empty">
            <p className="retro-display-title">TUNING RECEIVER</p>
            <p className="retro-display-desc">Connecting to Community Radio feed...</p>
          </div>
        </div>
      </div>
    );
  }

  const hasArtwork = Boolean(item.artworkUrl && !imgFailed);

  return (
    <div
      className={`retro-display-screen ${isPoweredOn ? 'is-powered-on' : 'is-dormant'} ${
        isTuning ? 'is-tuning' : ''
      } ${isPlaying ? 'is-playing' : ''}`}
      role="region"
      aria-label="Radio display"
    >
      {/* CRT Scanline & Glass Overlays */}
      <div className="retro-display-scanlines" aria-hidden="true" />
      <div className="retro-display-glare" aria-hidden="true" />

      <div className="retro-display-body">
        {/* Top Status Header Row */}
        <div className="retro-display-toprow">
          <div className="retro-display-left-tags">
            <span className="retro-lcd-tag freq">
              {item.isLive ? '90.8 FM · LIVE' : '90.8 FM'}
            </span>
            <span className="retro-lcd-tag category">{item.category}</span>
            {item.isNew && <span className="retro-lcd-badge new">NEW</span>}
          </div>

          <div className="retro-display-right-status">
            <span className="retro-lcd-stereo">
              {item.isLive ? 'BROADCAST' : 'STEREO HI-FI'}
            </span>
            <span className="retro-lcd-signal" title="FM Signal Strength">
              <span className="sig-bar active" />
              <span className="sig-bar active" />
              <span className="sig-bar active" />
              <span className="sig-bar active" />
              <span className="sig-bar active" />
            </span>
          </div>
        </div>

        {/* Auth Notice (if user clicked play while signed out) */}
        {authMessage && (
          <div className="retro-display-alert" role="alert">
            <span className="alert-icon">⚠</span> {authMessage}
          </div>
        )}

        {/* Balanced Two-Column Display Body */}
        <div className="retro-display-grid">
          {/* ================= LEFT COLUMN ================= */}
          <div className="retro-display-left-col">
            {/* RJ Host & Date Strip */}
            <div className="retro-display-host-row">
              <span className="retro-display-rj">
                {item.host
                  ? /^(rj|vit)/i.test(item.host)
                    ? item.host
                    : `RJ ${item.host}`
                  : 'VIT Community Radio'}
              </span>
              {item.date && <span className="retro-display-date">{item.date}</span>}
            </div>

            {/* Show Title */}
            <h2 className="retro-display-title" title={item.title}>
              {item.title}
            </h2>

            {/* Short Description */}
            {item.description && (
              <p className="retro-display-desc">{item.description}</p>
            )}

            {/* Episode Highlights */}
            {item.highlights && item.highlights.length > 0 && (
              <div className="retro-display-highlights">
                <div className="retro-highlights-label">HIGHLIGHTS</div>
                <ul className="retro-highlights-list">
                  {item.highlights.slice(0, 3).map((h, i) => (
                    <li key={i} className="retro-highlight-item">
                      <span className="highlight-bullet">▸</span>
                      <span className="highlight-text">{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ================= RIGHT COLUMN ================= */}
          <div className="retro-display-right-col">
            {/* Programme Artwork or Oscilloscope Visualizer */}
            <div className="retro-display-visual-frame">
              {hasArtwork ? (
                <div className="retro-artwork-container">
                  <img
                    src={item.artworkUrl!}
                    alt={item.title}
                    className="retro-display-artwork"
                    onError={() => setImgFailed(true)}
                  />
                  <div className="retro-artwork-overlay" />
                </div>
              ) : (
                <RetroOscilloscope isPlaying={isPlaying} />
              )}
            </div>

            {/* Stereo Dual-Channel VU Level Meter */}
            <div className="retro-display-stereo-meter" title="Stereo Peak Level">
              <div className="retro-vu-channel">
                <span className="vu-label">L</span>
                <div className="vu-bars">
                  {[1, 2, 3, 4, 5, 6].map((seg) => (
                    <span
                      key={seg}
                      className={`vu-seg seg-${seg} ${
                        vuLevels.left >= seg ? 'active' : ''
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="retro-vu-channel">
                <span className="vu-label">R</span>
                <div className="vu-bars">
                  {[1, 2, 3, 4, 5, 6].map((seg) => (
                    <span
                      key={seg}
                      className={`vu-seg seg-${seg} ${
                        vuLevels.right >= seg ? 'active' : ''
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Compact Playback Progress & Time */}
            <div className="retro-display-compact-progress">
              <div className="retro-progress-track">
                <div
                  className="retro-progress-fill"
                  style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
                />
              </div>
              <div className="retro-time-readout">
                <span className="time-curr">{formatClock(currentTime)}</span>
                <span className="time-sep">/</span>
                <span className="time-dur">
                  {duration > 0
                    ? formatClock(duration)
                    : item.durationSeconds
                    ? formatClock(item.durationSeconds)
                    : '--:--'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
