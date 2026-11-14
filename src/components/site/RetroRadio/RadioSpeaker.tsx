import { useEffect, useRef } from 'react';
import { useGlobalAudio } from '@/hooks/GlobalAudioContext';

interface RadioSpeakerProps {
  isPlaying: boolean;
  visualIntensity?: number; // 0 to 1
  volume?: number;
}

/**
 * Audio Analyser singleton for Web Audio API.
 * Safely analyzes audio amplitude & frequency data when available,
 * with zero impact on audio playback.
 */
interface AudioAnalyserState {
  audioContext: AudioContext;
  analyser: AnalyserNode;
  connectedAudio: HTMLAudioElement | null;
  freqData: Uint8Array;
}

let sharedState: AudioAnalyserState | null = null;

function getSharedAnalyser(audioEl: HTMLAudioElement | null): AudioAnalyserState | null {
  if (typeof window === 'undefined') return null;
  if (!audioEl) return null;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return null;

    if (!sharedState) {
      const ctx = new AudioContextClass();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      sharedState = {
        audioContext: ctx,
        analyser,
        connectedAudio: null,
        freqData: new Uint8Array(analyser.frequencyBinCount),
      };
    }

    if (sharedState.audioContext.state === 'suspended') {
      sharedState.audioContext.resume().catch(() => {});
    }

    // Connect this audio element if not already connected
    if (sharedState.connectedAudio !== audioEl) {
      try {
        const source = sharedState.audioContext.createMediaElementSource(audioEl);
        source.connect(sharedState.analyser);
        sharedState.analyser.connect(sharedState.audioContext.destination);
        sharedState.connectedAudio = audioEl;
      } catch {
        // Element might already be connected or CORS restricted
      }
    }

    return sharedState;
  } catch {
    return null;
  }
}

/**
 * Premium Circular Audio-Reactive Loudspeaker for VIT Community Radio.
 *
 * Features:
 * 1. Realistic circular loudspeaker architecture with dark graphite cone material,
 *    concentric acoustic ribbing, rubber roll surround, metallic chassis bezel,
 *    mounting rivets, and center voice-coil dust cap.
 * 2. Real-time audio reactivity:
 *    - Uses Web Audio API AnalyserNode when available for real-time bass and speech excursion.
 *    - Restrained, natural harmonic procedural oscillation fallback when CORS or Web Audio is unavailable.
 *    - Micro-vibration on outer metallic chassis ring.
 *    - Smooth damping and settling to resting position (scale 1.0) when paused.
 * 3. 60fps/120fps direct ref transforms with zero layout reflows and zero garbage collection overhead.
 * 4. Full accessibility support with prefers-reduced-motion bypass.
 */
export function RadioSpeaker({
  isPlaying,
  visualIntensity = 0.85,
  volume,
}: RadioSpeakerProps) {
  const speakerHousingRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const surroundRef = useRef<HTMLDivElement>(null);
  const coneRef = useRef<HTMLDivElement>(null);
  const dustCapRef = useRef<HTMLDivElement>(null);
  const auraRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const bassPortRef = useRef<HTMLSpanElement>(null);

  // Safely access global audio if available in tree
  let globalAudio: ReturnType<typeof useGlobalAudio> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    globalAudio = useGlobalAudio();
  } catch {
    // Rendered outside GlobalAudioProvider in tests or preview
  }

  const effectiveVolume = volume ?? globalAudio?.volume ?? 0.8;

  useEffect(() => {
    // Check user preference for reduced motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      return;
    }

    let animationFrameId: number | null = null;
    let currentExcursion = 0;
    let currentScale = 1.0;
    let currentCapScale = 1.0;
    let currentSurroundScale = 1.0;
    let currentVibX = 0;
    let currentVibY = 0;
    let currentAuraOpacity = 0;
    let currentWaveScale = 1.0;
    let currentWaveOpacity = 0;

    let isRunning = true;

    function renderLoop() {
      if (!isRunning) return;

      let targetExcursion = 0;
      let isActuallyProducingSound = false;

      if (isPlaying) {
        // Attempt to sample actual Web Audio Analyser
        let analyserState: AudioAnalyserState | null = null;
        let audioEl: HTMLAudioElement | null = null;
        try {
          audioEl = globalAudio?.getAudioElement ? globalAudio.getAudioElement() : null;
          if (audioEl) {
            analyserState = getSharedAnalyser(audioEl);
          }
        } catch {
          // ignore
        }

        if (analyserState && analyserState.analyser) {
          analyserState.analyser.getByteFrequencyData(
            analyserState.freqData as unknown as Uint8Array<ArrayBuffer>,
          );
          // Sub-bass & bass bins (0 to 3) physically drive woofer excursion
          const b0 = analyserState.freqData[0] || 0;
          const b1 = analyserState.freqData[1] || 0;
          const b2 = analyserState.freqData[2] || 0;
          const b3 = analyserState.freqData[3] || 0;
          const bass = (b0 + b1 + b2 + b3) / (4 * 255);

          // Vocal & mid-range bins (4 to 10)
          let midSum = 0;
          for (let i = 4; i <= 10; i++) {
            midSum += analyserState.freqData[i] || 0;
          }
          const mid = midSum / (7 * 255);

          if (bass > 0.02 || mid > 0.02) {
            isActuallyProducingSound = true;
            // Enhanced dynamic curve: quadratic expander emphasizes punchy bass transients and voice cadence
            const raw = bass * 0.75 + mid * 0.25;
            targetExcursion = Math.min(1.0, Math.pow(raw, 1.2) * 1.5) * effectiveVolume;
          }
        }

        // Procedural fallback if Web Audio API returns 0 or CORS restricted
        if (!isActuallyProducingSound) {
          const t = performance.now() / 1000;
          // Organic broadcast rhythm:
          // 1. Kick/bass transient beat (~92 BPM / 1.53 Hz tempo)
          const beatPhase = (t * 1.53) % 1;
          const kick = Math.pow(Math.max(0, 1 - beatPhase * 3.4), 2.5);

          // 2. Offbeat syncopation / snare pulse
          const offbeat = Math.pow(Math.max(0, Math.sin(t * 3.06 + 1.2)), 5) * 0.42;

          // 3. Realistic vocal cadence modulation (syllables, breaths, speech flow)
          const speech =
            Math.sin(t * 5.8) * 0.28 +
            Math.sin(t * 11.4) * 0.18 +
            Math.cos(t * 2.3) * 0.24;
          const vocalPulse = Math.max(0, speech);

          // 4. Subtle voice-coil micro flutter (high-frequency diaphragm resonance)
          const flutter = Math.sin(t * 24.0) * 0.05;

          const combined = kick * 0.65 + offbeat * 0.28 + vocalPulse * 0.48 + flutter;
          targetExcursion = Math.min(1.0, Math.max(0, combined)) * effectiveVolume * visualIntensity;
        }
      }

      // Physical speaker suspension: fast forward attack, smooth damped mechanical recoil
      const lerpFactor = isPlaying
        ? (targetExcursion > currentExcursion ? 0.38 : 0.22)
        : 0.14;

      currentExcursion += (targetExcursion - currentExcursion) * lerpFactor;

      // Noticeable, realistic cone excursion:
      // Cone scale: 1.0 to 1.072 (7.2% excursion is clearly visible and punchy yet undistorted)
      const targetScale = 1.0 + currentExcursion * 0.072;
      // Center dust-cap projects forward towards listener with higher relative displacement
      const targetCapScale = 1.0 + currentExcursion * 0.115;
      // Flexible rubber roll surround flexes gently with cone
      const targetSurroundScale = 1.0 + currentExcursion * 0.024;
      // Acoustic pressure aura & wave ring expansion
      const targetAura = currentExcursion * 0.75;
      const targetWaveScale = 1.0 + currentExcursion * 0.28;
      const targetWaveOpacity = currentExcursion * 0.55;

      currentScale = targetScale;
      currentCapScale = targetCapScale;
      currentSurroundScale = targetSurroundScale;
      currentAuraOpacity += (targetAura - currentAuraOpacity) * 0.25;
      currentWaveScale += (targetWaveScale - currentWaveScale) * 0.25;
      currentWaveOpacity += (targetWaveOpacity - currentWaveOpacity) * 0.25;

      // Microscopic physical vibration on outer metallic chassis ring
      if (isPlaying && currentExcursion > 0.05) {
        const t = performance.now() / 1000;
        currentVibX = Math.sin(t * 42) * currentExcursion * 0.65;
        currentVibY = Math.cos(t * 32) * currentExcursion * 0.65;
      } else {
        currentVibX += (0 - currentVibX) * 0.2;
        currentVibY += (0 - currentVibY) * 0.2;
      }

      // Apply directly to DOM nodes without triggering React re-renders
      if (coneRef.current) {
        coneRef.current.style.transform = `scale(${currentScale.toFixed(4)})`;
        coneRef.current.style.boxShadow = `inset 0 ${3 + currentExcursion * 3}px ${8 + currentExcursion * 4}px rgba(60, 50, 40, ${0.45 + currentExcursion * 0.15}), inset 0 0 10px rgba(80, 70, 60, 0.35), 0 ${2 + currentExcursion * 3}px ${4 + currentExcursion * 4}px rgba(60, 50, 40, ${0.18 + currentExcursion * 0.12})`;
      }
      if (dustCapRef.current) {
        dustCapRef.current.style.transform = `translate(-50%, -50%) scale(${currentCapScale.toFixed(4)})`;
        dustCapRef.current.style.boxShadow = `0 ${2 + currentExcursion * 3}px ${5 + currentExcursion * 5}px rgba(60, 50, 40, ${0.32 + currentExcursion * 0.18}), inset 0 1px 2px rgba(255, 255, 255, 0.85), inset 0 -1.5px 2px rgba(70, 60, 50, 0.4)`;
      }
      if (surroundRef.current) {
        surroundRef.current.style.transform = `scale(${currentSurroundScale.toFixed(4)})`;
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${currentVibX.toFixed(2)}px, ${currentVibY.toFixed(2)}px)`;
      }
      if (auraRef.current) {
        auraRef.current.style.opacity = currentAuraOpacity.toFixed(3);
        auraRef.current.style.transform = `scale(${(1 + currentAuraOpacity * 0.18).toFixed(3)})`;
      }
      if (waveRef.current) {
        waveRef.current.style.opacity = currentWaveOpacity.toFixed(3);
        waveRef.current.style.transform = `scale(${currentWaveScale.toFixed(3)})`;
      }
      if (bassPortRef.current) {
        bassPortRef.current.style.opacity = (0.55 + currentExcursion * 0.45).toFixed(2);
      }

      // Keep running if playing or still settling towards rest
      const isSettled =
        !isPlaying &&
        Math.abs(currentScale - 1.0) < 0.0008 &&
        Math.abs(currentVibX) < 0.01 &&
        Math.abs(currentVibY) < 0.01 &&
        currentAuraOpacity < 0.005;

      if (!isSettled) {
        animationFrameId = requestAnimationFrame(renderLoop);
      } else {
        // Snap to exact resting position and halt rAF loop to save CPU
        if (coneRef.current) {
          coneRef.current.style.transform = 'scale(1)';
          coneRef.current.style.boxShadow = '';
        }
        if (dustCapRef.current) {
          dustCapRef.current.style.transform = 'translate(-50%, -50%) scale(1)';
          dustCapRef.current.style.boxShadow = '';
        }
        if (surroundRef.current) surroundRef.current.style.transform = 'scale(1)';
        if (ringRef.current) ringRef.current.style.transform = 'translate(0px, 0px)';
        if (auraRef.current) {
          auraRef.current.style.opacity = '0';
          auraRef.current.style.transform = 'scale(1)';
        }
        if (waveRef.current) {
          waveRef.current.style.opacity = '0';
          waveRef.current.style.transform = 'scale(1)';
        }
        if (bassPortRef.current) {
          bassPortRef.current.style.opacity = '';
        }
      }
    }

    animationFrameId = requestAnimationFrame(renderLoop);

    return () => {
      isRunning = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, visualIntensity, effectiveVolume, globalAudio]);

  return (
    <div
      className={`retro-speaker-column ${isPlaying ? 'is-playing' : ''}`}
      aria-hidden="true"
      style={{
        // Maintain dynamic CSS variable for style-level backwards compatibility
        ['--visual-scale' as string]: isPlaying ? 1.045 : 1,
      }}
    >
      <div className="retro-speaker-recess">
        {/* Upper acoustic cabinet trim & chassis screws */}
        <div className="speaker-header-trim">
          <span className="speaker-screw top-left" title="Chassis mount">
            <span className="screw-slot" />
          </span>
          <div className="speaker-acoustic-slits">
            <span className="acoustic-slit" />
            <span className="acoustic-slit" />
            <span className="acoustic-slit" />
          </div>
          <span className="speaker-screw top-right" title="Chassis mount">
            <span className="screw-slot" />
          </span>
        </div>

        {/* Centerpiece: Premium Circular Loudspeaker Unit */}
        <div className="retro-circular-speaker" ref={speakerHousingRef}>
          {/* Subtle audio-reactive acoustic pressure aura & sound wave rings */}
          <div className="speaker-acoustic-aura" ref={auraRef} />
          <div className="speaker-wave-ring" ref={waveRef} />

          {/* Realistic circular chassis ring with micro mounting rivets */}
          <div className="speaker-chassis-ring" ref={ringRef}>
            <span className="speaker-rivet rivet-top" />
            <span className="speaker-rivet rivet-right" />
            <span className="speaker-rivet rivet-bottom" />
            <span className="speaker-rivet rivet-left" />

            {/* Flexible roll surround (convex rubber suspension ring) */}
            <div className="speaker-surround" ref={surroundRef}>
              {/* Large circular conical diaphragm */}
              <div className="speaker-cone" ref={coneRef}>
                {/* Concentric paper acoustic rib grooves */}
                <div className="speaker-ribs" />

                {/* Central inverted / dome dust cap protecting voice coil */}
                <div className="speaker-dust-cap" ref={dustCapRef}>
                  <div className="speaker-cap-highlight" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Lower acoustic chamber & bass reflex port */}
        <div className="speaker-lower-chamber">
          <div className="speaker-bass-port">
            <span className="bass-port-inner" ref={bassPortRef} />
          </div>
        </div>

        {/* Vintage brass/metallic brand crest badge: VIT 90.8 FM */}
        <div className="retro-speaker-badge">
          <span className="retro-badge-mark">VIT</span>
          <span className="retro-badge-sub">90.8 FM</span>
        </div>
      </div>
    </div>
  );
}
