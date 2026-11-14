import { useState, useRef, useEffect } from 'react';

interface RadioControlsProps {
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  isPlaying: boolean;
  volume: number;
  onVolumeChange: (vol: number) => void;
  disabled?: boolean;
}

/**
 * Physical tactile hardware push-buttons and rotary dials.
 *
 * Modeled after vintage audio components with brushed metallic finishes,
 * tactile depth, press-down states, illuminated central play button,
 * and rotary volume/tuning knobs.
 */
export function RadioControls({
  onPrev,
  onNext,
  onTogglePlay,
  isPlaying,
  volume,
  onVolumeChange,
  disabled = false,
}: RadioControlsProps) {
  const [knobRotation, setKnobRotation] = useState(0);
  const [showVolBadge, setShowVolBadge] = useState(false);
  const hideBadgeTimerRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const triggerVolBadge = () => {
    setShowVolBadge(true);
    if (hideBadgeTimerRef.current !== null) {
      window.clearTimeout(hideBadgeTimerRef.current);
    }
    hideBadgeTimerRef.current = window.setTimeout(() => {
      setShowVolBadge(false);
    }, 2400);
  };

  useEffect(() => {
    return () => {
      if (hideBadgeTimerRef.current !== null) {
        window.clearTimeout(hideBadgeTimerRef.current);
      }
    };
  }, []);

  const handlePrevWithKnob = () => {
    setKnobRotation((prev) => prev - 36);
    onPrev();
  };

  const handleNextWithKnob = () => {
    setKnobRotation((prev) => prev + 36);
    onNext();
  };

  // Step volume forward on direct knob click
  const handleVolumeClick = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      return;
    }
    const currentPct = Math.round(volume * 100);
    let nextVol: number;
    if (currentPct < 25) nextVol = 0.25;
    else if (currentPct < 50) nextVol = 0.50;
    else if (currentPct < 75) nextVol = 0.75;
    else if (currentPct < 95) nextVol = 1.0;
    else nextVol = 0; // Mute after 100%
    onVolumeChange(nextVol);
    triggerVolBadge();
  };

  // Mouse wheel scroll to adjust volume smoothly
  const handleVolumeWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.05 : -0.05;
    const nextVol = Math.min(1, Math.max(0, Math.round((volume + delta) * 100) / 100));
    onVolumeChange(nextVol);
    triggerVolBadge();
  };

  // Drag to adjust volume smoothly
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    isDraggingRef.current = false;
    const startY = e.clientY;
    const startVol = volume;

    const onPointerMove = (moveEvt: PointerEvent) => {
      const deltaY = startY - moveEvt.clientY; // drag up = positive
      if (Math.abs(deltaY) > 3) {
        isDraggingRef.current = true;
        const newVol = Math.min(1, Math.max(0, Math.round((startVol + deltaY / 100) * 100) / 100));
        onVolumeChange(newVol);
        triggerVolBadge();
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Keyboard navigation for volume knob
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      onVolumeChange(Math.min(1, Math.round((volume + 0.05) * 100) / 100));
      triggerVolBadge();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onVolumeChange(Math.max(0, Math.round((volume - 0.05) * 100) / 100));
      triggerVolBadge();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleVolumeClick();
    }
  };

  // Step button helper (+/- 10%)
  const handleStep = (step: number) => {
    const nextVol = Math.min(1, Math.max(0, Math.round((volume + step) * 100) / 100));
    onVolumeChange(nextVol);
    triggerVolBadge();
  };

  return (
    <div className="retro-controls-deck">
      {/* Left Tuning Knob */}
      <div className="retro-knob-container tuning-knob">
        <button
          type="button"
          className="retro-rotary-knob"
          style={{ transform: `rotate(${knobRotation}deg)` }}
          onClick={handleNextWithKnob}
          aria-label="Tuning control knob (click to advance station)"
          title="Tuning Knob: Click to tune"
        >
          <div className="knob-face">
            <div className="knob-indicator" />
          </div>
        </button>
        <span className="knob-label">TUNING</span>
      </div>

      {/* Center Hardware Push-Buttons */}
      <div className="retro-buttons-group">
        {/* PREV BUTTON */}
        <button
          type="button"
          className="retro-btn retro-btn-prev"
          onClick={handlePrevWithKnob}
          disabled={disabled}
          aria-label="Previous episode [Left Arrow]"
          title="Previous episode [Left Arrow]"
        >
          <div className="retro-btn-cap">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6 6h2v12H6zm3.5 6 8.5 6V6z"
              />
            </svg>
            <span className="retro-btn-text">PREV</span>
          </div>
          <span className="retro-key-hint" aria-hidden="true">◄</span>
        </button>

        {/* PLAY / PAUSE BUTTON */}
        <button
          type="button"
          className={`retro-btn retro-btn-play ${isPlaying ? 'is-playing' : 'is-idle'}`}
          onClick={onTogglePlay}
          disabled={disabled}
          aria-label={isPlaying ? 'Pause audio [Space]' : 'Play audio [Space]'}
          title={isPlaying ? 'Pause audio [Space]' : 'Start listening [Space]'}
        >
          {/* Subtle expanding and fading outer pulse ring for idle state */}
          <span className="play-pulse-ring" aria-hidden="true" />

          <div className="retro-btn-cap play-cap">
            {isPlaying ? (
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="play-btn-svg">
                <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" className="play-btn-svg">
                <path
                  fill="currentColor"
                  d="M8 5.2v13.6a.6.6 0 0 0 .92.51l10.5-6.8a.6.6 0 0 0 0-1.02L8.92 4.69A.6.6 0 0 0 8 5.2Z"
                />
              </svg>
            )}
            <span className="retro-btn-text">
              {isPlaying ? 'PAUSE' : 'PLAY'}
            </span>
          </div>

          {/* Listening invitation label */}
          <span
            className={`retro-play-invitation ${isPlaying ? 'is-playing' : 'is-idle'}`}
            aria-hidden="true"
          >
            {isPlaying ? (
              <>
                <span className="now-playing-dot" />
                <span>NOW PLAYING</span>
              </>
            ) : (
              <>
                <span className="listen-prompt-dot" />
                <span>PRESS TO LISTEN</span>
              </>
            )}
          </span>
        </button>

        {/* NEXT BUTTON */}
        <button
          type="button"
          className="retro-btn retro-btn-next"
          onClick={handleNextWithKnob}
          disabled={disabled}
          aria-label="Next episode [Right Arrow]"
          title="Next episode [Right Arrow]"
        >
          <div className="retro-btn-cap">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                fill="currentColor"
                d="m6 18 8.5-6L6 6zm10-12v12h2V6z"
              />
            </svg>
            <span className="retro-btn-text">NEXT</span>
          </div>
          <span className="retro-key-hint" aria-hidden="true">►</span>
        </button>
      </div>

      {/* Right Volume Rotary Knob & Buttons */}
      <div className="retro-knob-container volume-knob">
        <button
          type="button"
          className="retro-rotary-knob volume"
          style={{
            transform: `rotate(${-120 + volume * 240}deg)`,
          }}
          onClick={handleVolumeClick}
          onWheel={handleVolumeWheel}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
          aria-label={`Volume: ${Math.round(volume * 100)}%`}
          title={`Volume: ${Math.round(volume * 100)}% (Click to step, scroll or drag to adjust)`}
        >
          <div className="knob-face">
            <div className="knob-indicator" />
          </div>
        </button>
        <div className="retro-vol-controls">
          <button
            type="button"
            className="retro-vol-step-btn"
            onClick={() => handleStep(-0.1)}
            aria-label="Decrease volume"
            title="Volume down (-10%)"
          >
            −
          </button>
          <span
            className="knob-label"
            title={`Volume: ${Math.round(volume * 100)}%`}
          >
            {showVolBadge ? (volume === 0 ? 'MUTE' : `VOL ${Math.round(volume * 100)}%`) : 'VOLUME'}
          </span>
          <button
            type="button"
            className="retro-vol-step-btn"
            onClick={() => handleStep(0.1)}
            aria-label="Increase volume"
            title="Volume up (+10%)"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

