import { useEffect, useState, useRef } from 'react';
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
  onSeek?: (seconds: number) => void;
  onTogglePlay?: () => void;
  onReturnToDefault?: () => void;
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const totalSecs = Math.floor(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (hrs > 0) {
    return `${hrs}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
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
  onSeek,
  onTogglePlay,
  onReturnToDefault,
}: RadioDisplayProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [vuLevels, setVuLevels] = useState<{ left: number; right: number }>({ left: 1, right: 1 });
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const effectiveDuration = duration > 0 ? duration : (item?.durationSeconds || 0);
  const isSeekable = effectiveDuration > 0 && !item?.isLive;
  const displayCurrentTime = isScrubbing && scrubTime !== null ? scrubTime : currentTime;
  const progressRatio = effectiveDuration > 0
    ? Math.min(1, Math.max(0, displayCurrentTime / effectiveDuration))
    : progress;
  const progressPct = Math.min(100, Math.max(0, progressRatio * 100));

  const getTimeFromPointer = (clientX: number): number => {
    if (!trackRef.current || effectiveDuration <= 0) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const offsetX = Math.min(Math.max(0, clientX - rect.left), rect.width);
    const ratio = offsetX / rect.width;
    return ratio * effectiveDuration;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSeekable || !onSeek) return;
    if (e.button !== 0) return;

    e.preventDefault();
    const targetEl = e.currentTarget;
    try {
      targetEl.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    const targetTime = getTimeFromPointer(e.clientX);
    setIsScrubbing(true);
    setScrubTime(targetTime);

    const onPointerMove = (moveEvt: PointerEvent) => {
      const movedTime = getTimeFromPointer(moveEvt.clientX);
      setScrubTime(movedTime);
    };

    const onPointerUp = (upEvt: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      try {
        targetEl.releasePointerCapture?.(upEvt.pointerId);
      } catch {
        // ignore
      }

      const finalTime = getTimeFromPointer(upEvt.clientX);
      setIsScrubbing(false);
      setScrubTime(null);
      onSeek(finalTime);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isSeekable || !onSeek) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onSeek(Math.max(0, currentTime - 5));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onSeek(Math.min(effectiveDuration, currentTime + 5));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onSeek(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onSeek(effectiveDuration);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      onSeek(Math.max(0, currentTime - 30));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      onSeek(Math.min(effectiveDuration, currentTime + 30));
    }
  };

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
            {item.isSharedScheduled && (
              <span
                className="retro-lcd-badge shared"
                style={{
                  background: 'var(--radio-play-btn, #D91F2B)',
                  color: '#FFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>SHARED</span>
                {onReturnToDefault && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReturnToDefault();
                    }}
                    title="Return to normal radio (live broadcast / default dial)"
                    aria-label="Return to normal radio"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#FFF',
                      cursor: 'pointer',
                      fontSize: '10px',
                      padding: '0 2px',
                      lineHeight: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      fontWeight: 800,
                    }}
                  >
                    ✕
                  </button>
                )}
              </span>
            )}
            {item.isSharedScheduled && onReturnToDefault && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReturnToDefault();
                }}
                className="retro-lcd-return-btn"
                title="Return to normal 90.8 FM radio playback"
                aria-label="Return to live radio"
                style={{
                  background: 'rgba(0, 0, 0, 0.08)',
                  border: '1px solid rgba(0, 0, 0, 0.2)',
                  borderRadius: '3px',
                  color: 'inherit',
                  fontFamily: 'inherit',
                  fontSize: '0.52rem',
                  fontWeight: 700,
                  padding: '0.1rem 0.35rem',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                Return to Live Dial
              </button>
            )}
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
              <div
                ref={trackRef}
                className={`retro-progress-track ${isSeekable ? 'is-seekable' : ''} ${
                  isScrubbing ? 'is-scrubbing' : ''
                }`}
                onPointerDown={handlePointerDown}
                onKeyDown={handleKeyDown}
                role="slider"
                aria-label="Audio progress scrubber"
                aria-valuemin={0}
                aria-valuemax={Math.round(effectiveDuration)}
                aria-valuenow={Math.round(displayCurrentTime)}
                aria-valuetext={`${formatClock(displayCurrentTime)} of ${formatClock(effectiveDuration)}`}
                tabIndex={isSeekable ? 0 : -1}
                title={
                  isSeekable
                    ? `Click or drag to seek [${formatClock(displayCurrentTime)} / ${formatClock(effectiveDuration)}]`
                    : undefined
                }
              >
                <div
                  className="retro-progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
                {isSeekable && (
                  <div
                    className="retro-progress-thumb"
                    style={{ left: `${progressPct}%` }}
                    aria-hidden="true"
                  />
                )}
              </div>

              <div className="retro-time-readout">
                <span className="time-curr">{formatClock(displayCurrentTime)}</span>
                <span className="time-sep">/</span>
                <span className="time-dur">
                  {effectiveDuration > 0 ? formatClock(effectiveDuration) : '--:--'}
                </span>
              </div>

              {/* Small Modern Audio Controls: Seek -10s, Play/Pause, Seek +10s */}
              <div className="retro-display-seek-controls">
                <button
                  type="button"
                  className="retro-seek-btn retro-seek-backward"
                  onClick={() => onSeek && onSeek(Math.max(0, currentTime - 10))}
                  disabled={!isSeekable}
                  aria-label="Seek backward 10 seconds"
                  title="Seek backward 10 seconds [-10s]"
                >
                  <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true" className="seek-icon">
                    <path
                      fill="currentColor"
                      d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.2 3.16-1.98 5.12-1.98 3.79 0 7 2.76 7.7 6.39l2.45-.63C21.65 11.64 17.51 8 12.5 8z"
                    />
                  </svg>
                  <span>-10s</span>
                </button>

                <button
                  type="button"
                  className={`retro-seek-btn retro-seek-play ${isPlaying ? 'is-playing' : ''}`}
                  onClick={onTogglePlay}
                  disabled={!item || (item.isLive && !import.meta.env.VITE_STREAM_URL)}
                  aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
                  title={isPlaying ? 'Pause audio' : 'Play audio'}
                >
                  {isPlaying ? (
                    <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true" className="seek-icon">
                      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true" className="seek-icon">
                      <path
                        fill="currentColor"
                        d="M8 5.2v13.6a.6.6 0 0 0 .92.51l10.5-6.8a.6.6 0 0 0 0-1.02L8.92 4.69A.6.6 0 0 0 8 5.2Z"
                      />
                    </svg>
                  )}
                  <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
                </button>

                <button
                  type="button"
                  className="retro-seek-btn retro-seek-forward"
                  onClick={() => onSeek && onSeek(Math.min(effectiveDuration, currentTime + 10))}
                  disabled={!isSeekable}
                  aria-label="Seek forward 10 seconds"
                  title="Seek forward 10 seconds [+10s]"
                >
                  <span>+10s</span>
                  <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true" className="seek-icon">
                    <path
                      fill="currentColor"
                      d="M11.5 8c2.65 0 5.05.99 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.2-3.16-1.98-5.12-1.98-3.79 0-7 2.76-7.7 6.39l-2.45-.63C2.35 11.64 6.49 8 11.5 8z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
