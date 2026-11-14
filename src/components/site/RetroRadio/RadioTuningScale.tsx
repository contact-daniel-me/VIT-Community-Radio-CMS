import { useRef } from 'react';
import type { RadioItem } from './types';

interface RadioTuningScaleProps {
  items: RadioItem[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  initialTuningSettled?: boolean;
}

/**
 * Vintage horizontal FM radio tuning dial scale.
 *
 * Features:
 * - FM frequency scale markings (88 - 108 MHz).
 * - Illuminated station preset markers (CH 1 .. CH N).
 * - Smooth mechanical amber/red tuning needle with glow.
 * - Interactive: click anywhere on the dial glass or on presets to tune immediately.
 */
export function RadioTuningScale({
  items,
  currentIndex,
  onSelectIndex,
  initialTuningSettled = true,
}: RadioTuningScaleProps) {
  const dialRef = useRef<HTMLDivElement>(null);

  // Compute needle percentage position (12% to 88% along the scale)
  // On startup when not yet settled, needle smoothly sweeps from 88 MHz (6%) to 90.8 FM
  const count = items.length;
  const targetPercent =
    count > 1 ? 12 + (currentIndex / (count - 1)) * 76 : 14;
  const needlePercent = !initialTuningSettled ? 6 : targetPercent;

  // Handle clicking anywhere on the scale to tune to the closest item
  const handleDialClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dialRef.current || count <= 1) return;
    const rect = dialRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));

    // Map ratio to closest item index
    const targetIndex = Math.round(ratio * (count - 1));
    onSelectIndex(targetIndex);
  };

  return (
    <div className="retro-tuning-container">
      <div className="retro-tuning-bezel">
        <div
          ref={dialRef}
          className="retro-tuning-glass"
          onClick={handleDialClick}
          role="slider"
          aria-label="Radio frequency tuning dial"
          aria-valuemin={1}
          aria-valuemax={count}
          aria-valuenow={currentIndex + 1}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              onSelectIndex((currentIndex + 1) % count);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              onSelectIndex((currentIndex - 1 + count) % count);
            }
          }}
        >
          {/* Backlit amber dial glow */}
          <div className="retro-dial-backlight" aria-hidden="true" />

          {/* Scale marks and frequency numerals */}
          <div className="retro-dial-track">
            {/* Standard FM frequencies */}
            <div className="retro-dial-frequencies">
              <span className="dial-num">88</span>
              <span className="dial-num highlight-vit">90.8 FM</span>
              <span className="dial-num">94</span>
              <span className="dial-num">98</span>
              <span className="dial-num">102</span>
              <span className="dial-num">106</span>
              <span className="dial-num">108</span>
            </div>

            {/* Micro tick marks */}
            <div className="retro-dial-ticks" aria-hidden="true">
              {Array.from({ length: 41 }).map((_, i) => (
                <span
                  key={i}
                  className={`dial-tick ${i % 5 === 0 ? 'major' : 'minor'} ${
                    i === 5 ? 'vit-channel' : ''
                  }`}
                />
              ))}
            </div>

            {/* Episode Channel Preset Pins */}
            <div className="retro-dial-presets">
              {items.map((it, idx) => {
                const pos = count > 1 ? 12 + (idx / (count - 1)) * 76 : 50;
                const isActive = idx === currentIndex;
                return (
                  <button
                    key={it.id || idx}
                    type="button"
                    className={`retro-preset-pin ${isActive ? 'is-active' : ''}`}
                    style={{ left: `${pos}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectIndex(idx);
                    }}
                    title={`Tune ${it.isLive ? 'Live Broadcast' : it.title}`}
                    aria-label={`Tune channel ${idx + 1}: ${it.title}`}
                  >
                    <span className="preset-led" />
                    <span className="preset-label">
                      {it.isLive ? 'LIVE' : `CH ${idx + 1}`}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Mechanical Tuning Needle */}
            <div
              className="retro-tuning-needle"
              style={{ left: `${needlePercent}%` }}
              aria-hidden="true"
            >
              <div className="needle-wire" />
              <div className="needle-head" />
              <div className="needle-shadow" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

