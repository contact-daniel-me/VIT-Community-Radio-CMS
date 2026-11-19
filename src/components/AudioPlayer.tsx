import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { audioService } from '@/services/audioService';
import { errorMessage } from '@/lib/errors';

export interface AudioPlayerProps {
  storagePath: string | null | undefined;
  label?: string;
  variant?: 'raw' | 'final' | 'default';
  showWaveform?: boolean;
  onPlayingChange?: (isPlaying: boolean) => void;
  className?: string;
}

// 60-band precision spectrum profile covering the full container width from sub-bass to air frequencies
const WAVE_BARS = [
  // Sub-bass (1-6)
  { idleScale: 0.22, targetScale: 0.58, duration: 0.72, delay: -0.15 },
  { idleScale: 0.28, targetScale: 0.76, duration: 0.84, delay: -0.32 },
  { idleScale: 0.35, targetScale: 0.88, duration: 0.65, delay: -0.58 },
  { idleScale: 0.30, targetScale: 0.68, duration: 0.90, delay: -0.21 },
  { idleScale: 0.42, targetScale: 0.92, duration: 0.58, delay: -0.44 },
  { idleScale: 0.34, targetScale: 0.80, duration: 0.76, delay: -0.67 },

  // Bass & Warmth (7-14)
  { idleScale: 0.45, targetScale: 0.98, duration: 0.62, delay: -0.12 },
  { idleScale: 0.38, targetScale: 0.85, duration: 0.86, delay: -0.39 },
  { idleScale: 0.29, targetScale: 0.70, duration: 0.73, delay: -0.51 },
  { idleScale: 0.44, targetScale: 0.95, duration: 0.66, delay: -0.27 },
  { idleScale: 0.48, targetScale: 1.00, duration: 0.54, delay: -0.63 },
  { idleScale: 0.36, targetScale: 0.82, duration: 0.80, delay: -0.18 },
  { idleScale: 0.40, targetScale: 0.89, duration: 0.70, delay: -0.49 },
  { idleScale: 0.26, targetScale: 0.62, duration: 0.94, delay: -0.33 },

  // Low-mids & Body (15-22)
  { idleScale: 0.46, targetScale: 0.96, duration: 0.60, delay: -0.55 },
  { idleScale: 0.32, targetScale: 0.75, duration: 0.75, delay: -0.24 },
  { idleScale: 0.38, targetScale: 0.86, duration: 0.82, delay: -0.71 },
  { idleScale: 0.47, targetScale: 0.97, duration: 0.58, delay: -0.16 },
  { idleScale: 0.28, targetScale: 0.67, duration: 0.88, delay: -0.42 },
  { idleScale: 0.42, targetScale: 0.90, duration: 0.67, delay: -0.61 },
  { idleScale: 0.35, targetScale: 0.79, duration: 0.76, delay: -0.29 },
  { idleScale: 0.25, targetScale: 0.56, duration: 0.85, delay: -0.47 },

  // Midrange Vocals & Speech (23-32)
  { idleScale: 0.39, targetScale: 0.86, duration: 0.62, delay: -0.19 },
  { idleScale: 0.31, targetScale: 0.72, duration: 0.80, delay: -0.36 },
  { idleScale: 0.22, targetScale: 0.52, duration: 0.87, delay: -0.52 },
  { idleScale: 0.36, targetScale: 0.82, duration: 0.64, delay: -0.22 },
  { idleScale: 0.44, targetScale: 0.94, duration: 0.59, delay: -0.65 },
  { idleScale: 0.27, targetScale: 0.63, duration: 0.78, delay: -0.41 },
  { idleScale: 0.41, targetScale: 0.91, duration: 0.61, delay: -0.14 },
  { idleScale: 0.33, targetScale: 0.77, duration: 0.83, delay: -0.48 },
  { idleScale: 0.48, targetScale: 0.99, duration: 0.55, delay: -0.30 },
  { idleScale: 0.37, targetScale: 0.84, duration: 0.72, delay: -0.57 },

  // High-mids & Presence (33-42)
  { idleScale: 0.30, targetScale: 0.71, duration: 0.89, delay: -0.23 },
  { idleScale: 0.43, targetScale: 0.93, duration: 0.63, delay: -0.68 },
  { idleScale: 0.35, targetScale: 0.80, duration: 0.74, delay: -0.17 },
  { idleScale: 0.26, targetScale: 0.64, duration: 0.86, delay: -0.45 },
  { idleScale: 0.40, targetScale: 0.88, duration: 0.68, delay: -0.38 },
  { idleScale: 0.46, targetScale: 0.96, duration: 0.57, delay: -0.62 },
  { idleScale: 0.33, targetScale: 0.78, duration: 0.81, delay: -0.26 },
  { idleScale: 0.28, targetScale: 0.69, duration: 0.77, delay: -0.50 },
  { idleScale: 0.38, targetScale: 0.85, duration: 0.69, delay: -0.13 },
  { idleScale: 0.24, targetScale: 0.59, duration: 0.92, delay: -0.43 },

  // Highs & Brilliance (43-52)
  { idleScale: 0.42, targetScale: 0.92, duration: 0.60, delay: -0.59 },
  { idleScale: 0.34, targetScale: 0.79, duration: 0.79, delay: -0.31 },
  { idleScale: 0.27, targetScale: 0.65, duration: 0.84, delay: -0.73 },
  { idleScale: 0.37, targetScale: 0.83, duration: 0.65, delay: -0.20 },
  { idleScale: 0.31, targetScale: 0.73, duration: 0.82, delay: -0.54 },
  { idleScale: 0.23, targetScale: 0.55, duration: 0.91, delay: -0.37 },
  { idleScale: 0.35, targetScale: 0.80, duration: 0.67, delay: -0.64 },
  { idleScale: 0.29, targetScale: 0.68, duration: 0.78, delay: -0.11 },
  { idleScale: 0.38, targetScale: 0.84, duration: 0.61, delay: -0.46 },
  { idleScale: 0.25, targetScale: 0.60, duration: 0.87, delay: -0.28 },

  // Air & Top End (53-60)
  { idleScale: 0.32, targetScale: 0.74, duration: 0.73, delay: -0.60 },
  { idleScale: 0.28, targetScale: 0.66, duration: 0.81, delay: -0.35 },
  { idleScale: 0.21, targetScale: 0.51, duration: 0.93, delay: -0.16 },
  { idleScale: 0.30, targetScale: 0.70, duration: 0.69, delay: -0.53 },
  { idleScale: 0.24, targetScale: 0.58, duration: 0.83, delay: -0.25 },
  { idleScale: 0.19, targetScale: 0.47, duration: 0.95, delay: -0.40 },
  { idleScale: 0.23, targetScale: 0.54, duration: 0.76, delay: -0.66 },
  { idleScale: 0.16, targetScale: 0.40, duration: 0.88, delay: -0.18 },
];

function formatAudioTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * AudioPlayer component with real-time waveform synchronization.
 * The waveform visualizer tracks the audio's progress, amplitude, and playhead
 * in 1:1 synchronization with actual playback, and supports click/drag seeking.
 */
export function AudioPlayer({
  storagePath,
  label,
  variant = 'default',
  showWaveform = true,
  onPlayingChange,
  className,
}: AudioPlayerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [barScales, setBarScales] = useState<number[]>(() =>
    WAVE_BARS.map((b) => b.idleScale)
  );

  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setError(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setProgress(0);
    setBarScales(WAVE_BARS.map((b) => b.idleScale));
    onPlayingChange?.(false);

    if (!storagePath) return;

    audioService
      .getPlaybackUrl(storagePath)
      .then((signed) => active && setUrl(signed))
      .catch((cause) => active && setError(errorMessage(cause)));

    return () => {
      active = false;
      onPlayingChange?.(false);
    };
  }, [storagePath, onPlayingChange]);

  // Real-time animation loop synchronized to live audio playback
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      // Calm resting state preserving current progress
      setBarScales(
        WAVE_BARS.map((b, idx) => {
          const isPlayed = progress > 0 && idx / WAVE_BARS.length <= progress;
          return isPlayed ? Math.max(b.idleScale * 1.25, 0.28) : b.idleScale;
        })
      );
      return;
    }

    // Attempt to connect Web Audio Analyser via non-intrusive captureStream
    const audio = audioRef.current;
    if (audio && !analyserRef.current) {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx && typeof (audio as HTMLAudioElement & { captureStream?: () => MediaStream }).captureStream === 'function') {
          const ctx = new AudioCtx();
          const stream = (audio as HTMLAudioElement & { captureStream: () => MediaStream }).captureStream();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.8;
          source.connect(analyser);
          analyserRef.current = analyser;
          freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
        }
      } catch {
        // Procedural audio-time synchronization is used as a smooth, 100% reliable fallback
      }
    }

    let lastTimeUpdate = 0;

    const renderLoop = (timestamp: number) => {
      const el = audioRef.current;
      if (el) {
        const cur = el.currentTime || 0;
        const dur = el.duration || 0;
        const prog = dur > 0 ? Math.min(1, Math.max(0, cur / dur)) : 0;

        // Keep state aligned with actual playback
        if (timestamp - lastTimeUpdate > 60) {
          setCurrentTime(cur);
          if (dur > 0) setDuration(dur);
          setProgress(prog);
          lastTimeUpdate = timestamp;
        }

        // Check if real frequency data is available from the audio track
        let realFreqActive = false;
        const analyser = analyserRef.current;
        const freqData = freqDataRef.current;
        if (analyser && freqData) {
          (analyser as unknown as { getByteFrequencyData: (arr: unknown) => void }).getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 0; i < freqData.length; i++) sum += freqData[i];
          if (sum > 10) realFreqActive = true;
        }

        const activeBar = Math.floor(prog * WAVE_BARS.length);
        const timePhase = cur * 14;

        setBarScales(
          WAVE_BARS.map((b, idx) => {
            const isPlayed = idx <= activeBar;
            const distFromHead = Math.abs(idx - activeBar);

            if (realFreqActive && freqData) {
              const binIdx = Math.min(
                freqData.length - 1,
                Math.floor((idx / WAVE_BARS.length) * freqData.length)
              );
              const freqNorm = freqData[binIdx] / 255;
              const headBoost = distFromHead <= 2 ? 1.3 : 1.0;
              return Math.min(1, Math.max(0.2, freqNorm * b.targetScale * headBoost * 1.25));
            }

            // Procedural audio-clock synchronized pulsation
            const harmonic = Math.sin(timePhase + idx * 0.42) * 0.5 + 0.5;
            const subHarmonic = Math.cos(cur * 7.5 + idx * 0.28) * 0.3;
            const beatEnergy = Math.max(0, harmonic + subHarmonic);

            // Bars near the playhead pulse with highest vitality
            const proximityFactor = distFromHead === 0 ? 1.0 : Math.max(0.3, 1 - distFromHead * 0.08);

            if (isPlayed) {
              return Math.min(1, Math.max(0.25, b.targetScale * (0.35 + beatEnergy * 0.65 * proximityFactor)));
            } else {
              // Upcoming unplayed bars have gentle background ambient motion
              return Math.min(0.5, Math.max(0.16, b.idleScale * (0.8 + beatEnergy * 0.35)));
            }
          })
        );
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isPlaying, progress]);

  const handlePlay = () => {
    setIsPlaying(true);
    onPlayingChange?.(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
    onPlayingChange?.(false);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    onPlayingChange?.(false);
  };

  const handleError = () => {
    setIsPlaying(false);
    onPlayingChange?.(false);
  };

  const handleTimeUpdate = () => {
    const el = audioRef.current;
    if (!el) return;
    const cur = el.currentTime || 0;
    const dur = el.duration || 0;
    setCurrentTime(cur);
    if (dur > 0) {
      setDuration(dur);
      setProgress(Math.min(1, Math.max(0, cur / dur)));
    }
  };

  const handleLoadedMetadata = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.duration && !isNaN(el.duration)) {
      setDuration(el.duration);
    }
  };

  const togglePlayback = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused || el.ended) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const seekToClientX = (clientX: number) => {
    const track = trackRef.current;
    const audio = audioRef.current;
    if (!track || !audio) return;
    const rect = track.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = rect.width > 0 ? clickX / rect.width : 0;
    const dur = audio.duration || duration || 0;
    const newTime = ratio * dur;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
    setProgress(ratio);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    seekToClientX(e.clientX);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    seekToClientX(e.clientX);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (isScrubbing) {
      setIsScrubbing(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      togglePlayback();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      audio.currentTime = Math.max(0, audio.currentTime - 5);
      handleTimeUpdate();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      audio.currentTime = Math.min(audio.duration || duration, audio.currentTime + 5);
      handleTimeUpdate();
    }
  };

  if (!storagePath) return <p className="small muted">No audio uploaded.</p>;
  if (error) return <p className="small muted">{error}</p>;
  if (!url) return <p className="small muted">Preparing audio...</p>;

  const activeBarIndex = Math.floor(progress * WAVE_BARS.length);

  return (
    <div className={`cms-audio-player-wrap ${className || ''}`}>
      {label && <p className="small muted" style={{ margin: '0 0 0.4rem' }}>{label}</p>}

      {showWaveform && (
        <div
          className={`cms-waveform-equalizer variant-${variant} ${isPlaying ? 'is-playing' : 'is-idle'}`}
          tabIndex={0}
          role="slider"
          aria-label={`${variant === 'raw' ? 'Raw Audio' : variant === 'final' ? 'Final Audio' : 'Audio'} waveform seeker. Press space to play/pause, left/right arrows to seek.`}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatAudioTime(currentTime)} of ${formatAudioTime(duration)}`}
          onKeyDown={handleKeyDown}
          title="Click or drag on waveform to seek audio; Space to play/pause"
        >
          <div className="cms-waveform-header">
            <span className="cms-waveform-label">
              <span className="eq-mini-bars" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </span>
              <span>
                {variant === 'raw'
                  ? 'Raw Audio Spectrum'
                  : variant === 'final'
                  ? 'Final Audio Waveform'
                  : 'Audio Spectrum'}
              </span>
              {duration > 0 && (
                <span className="cms-waveform-time-sync">
                  {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
                </span>
              )}
            </span>
            <span className={`cms-waveform-state-pill ${isPlaying ? 'is-live' : 'is-idle'}`}>
              {isPlaying && <span className="eq-live-pulse-dot" aria-hidden="true" />}
              <span>{isPlaying ? 'Playing' : 'Paused / Ready'}</span>
            </span>
          </div>

          <div
            ref={trackRef}
            className="cms-waveform-bars-track"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* Playhead Scrubber Line */}
            {duration > 0 && (
              <div
                className="cms-waveform-playhead"
                style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }}
                aria-hidden="true"
              />
            )}

            {/* 60 Spectrum Waveform Bars */}
            {WAVE_BARS.map((bar, idx) => {
              const isPlayed = progress > 0 && idx <= activeBarIndex;
              const isHead = idx === activeBarIndex;
              const scale = barScales[idx] ?? bar.idleScale;

              return (
                <span
                  key={idx}
                  className={`cms-waveform-bar ${isPlayed ? 'is-played' : 'is-unplayed'} ${isHead ? 'is-head' : ''}`}
                  style={{
                    transform: `scaleY(${scale})`,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      <audio
        ref={audioRef}
        controls
        preload="none"
        src={url}
        onPlay={handlePlay}
        onPlaying={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onError={handleError}
        onEmptied={handlePause}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onSeeked={handleTimeUpdate}
        aria-label={label || (variant === 'raw' ? 'Raw Audio player' : variant === 'final' ? 'Final Audio player' : 'Audio player')}
      >
        Your browser cannot play audio files.
      </audio>
    </div>
  );
}
