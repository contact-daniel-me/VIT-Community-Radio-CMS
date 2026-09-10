import { useEffect, useRef, useState } from 'react';
import type { PublicNowPlayingRow } from '@/types/database';
import { Logo } from './Logo';
import { Waveform } from './Waveform';

/**
 * The persistent station player.
 *
 * This plays a REAL stream, or nothing. VITE_STREAM_URL is the station's live
 * encoder URL; if it is not configured the transport is disabled and the bar
 * says so, rather than pretending to play. Nothing here fakes audio.
 */
const STREAM_URL = import.meta.env.VITE_STREAM_URL ?? '';

export function RadioPlayer({
  now,
  playRequestedAt,
}: {
  now: PublicNowPlayingRow | null;
  /** Bumped by the hero's Listen live button to request playback. */
  playRequestedAt: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = now?.broadcast_status === 'ON_AIR';
  const configured = STREAM_URL.length > 0;
  const canPlay = configured && live;

  const start = async () => {
    const el = audioRef.current;
    if (!el || !canPlay) return;
    try {
      setError(null);
      await el.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
      setError('Your browser blocked playback. Press play again.');
    }
  };

  const stop = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  const toggle = () => (playing ? stop() : void start());

  // The hero button asks the player to start.
  useEffect(() => {
    if (playRequestedAt > 0 && canPlay) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playRequestedAt]);

  // A live stream that goes off air should not leave the button showing "pause".
  useEffect(() => {
    if (!live && playing) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) {
      el.volume = volume;
      el.muted = muted;
    }
  }, [volume, muted]);

  return (
    <div className={`player ${playing ? 'is-playing' : ''}`}>
      {configured && <audio ref={audioRef} src={STREAM_URL} preload="none" />}

      <div className="player-inner">
        <div className="player-id">
          <Logo size={30} withWordmark={false} />
          <div className="player-id-text">
            <span className="player-station">
              {live && now?.program_name ? now.program_name : 'VIT Community Radio'}
            </span>
            <span className="player-sub">
              {live ? (
                <>
                  <span className="player-live-dot" aria-hidden="true" />
                  {now?.episode_title ?? 'Live now'}
                </>
              ) : (
                '90.8 MHz · VIT Vellore'
              )}
            </span>
          </div>
        </div>

        <div className="player-transport">
          <button
            type="button"
            className="player-btn player-play"
            onClick={toggle}
            disabled={!canPlay}
            aria-label={playing ? 'Pause the live stream' : 'Play the live stream'}
            title={
              !configured
                ? 'No live stream is configured yet'
                : !live
                  ? 'The station is off air'
                  : undefined
            }
          >
            {playing ? (
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <path fill="currentColor" d="M8 5.2v13.6a.6.6 0 0 0 .92.51l10.5-6.8a.6.6 0 0 0 0-1.02L8.92 4.69A.6.6 0 0 0 8 5.2Z" />
              </svg>
            )}
          </button>

          <Waveform active={playing} bars={14} className="player-wave" />

          <span className="player-state">
            {playing ? 'ON AIR' : live ? 'LIVE — PRESS PLAY' : 'OFF AIR'}
          </span>
        </div>

        <div className="player-right">
          <button
            type="button"
            className="player-btn"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4Z" />
                <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M16 9.5l4 5M20 9.5l-4 5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4Z" />
                <path fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" d="M16.5 9.2a4 4 0 0 1 0 5.6M19 7a7.3 7.3 0 0 1 0 10" />
              </svg>
            )}
          </button>

          <input
            type="range"
            className="player-volume"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              setMuted(false);
            }}
            aria-label="Volume"
          />

          <span className="player-freq">90.8&nbsp;MHz</span>
        </div>
      </div>

      {(error || (!configured && live)) && (
        <p className="player-note" role="status">
          {error ??
            'Live now — audio streaming is not connected yet, so there is nothing to play here.'}
        </p>
      )}
    </div>
  );
}
