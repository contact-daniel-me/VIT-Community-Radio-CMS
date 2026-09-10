import { useEffect, useRef, useState } from 'react';
import type { PublicNowPlayingRow } from '@/types/database';
import { useTheme } from '@/hooks/useTheme';
import { SPOTIFY_SHOW_URL, spotifyEmbedSrc } from '@/lib/spotify';
import { Logo } from './Logo';
import { Waveform } from './Waveform';

/**
 * The persistent station player.
 *
 * This plays a REAL stream, or nothing. VITE_STREAM_URL is the station's live
 * encoder URL; if it is not configured the transport is disabled and the bar
 * says so, rather than pretending to play. Nothing here fakes audio.
 *
 * The Spotify button docks the station's own show above the bar, and Spotify's
 * player does the playing. It is not wired into the transport above, and it
 * cannot be: playing Spotify audio through our own controls needs their Web
 * Playback SDK, which means an OAuth login and a Premium account for every
 * listener. The embed needs neither, so the show is one press away for anyone.
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
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const { theme } = useTheme();

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

      {spotifyOpen && (
        <div className="player-spotify" id="player-spotify">
          <div className="player-spotify-head">
            <span className="player-spotify-label">VIT Community Radio on Spotify</span>
            <a
              className="player-spotify-out"
              href={SPOTIFY_SHOW_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Spotify
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </div>
          <iframe
            key={theme}
            src={spotifyEmbedSrc(theme)}
            title="VIT Community Radio: the official show on Spotify"
            width="100%"
            height="152"
            style={{ border: 0 }}
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

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

          <button
            type="button"
            className={`player-btn player-spotify-btn ${spotifyOpen ? 'is-open' : ''}`}
            onClick={() => setSpotifyOpen((open) => !open)}
            aria-expanded={spotifyOpen}
            aria-controls="player-spotify"
            aria-label={spotifyOpen ? 'Hide the Spotify player' : 'Listen on Spotify'}
            title={spotifyOpen ? 'Hide the Spotify player' : 'Listen on Spotify'}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.586 14.424a.623.623 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 1 1-.277-1.215c3.809-.871 7.077-.496 9.712 1.115a.623.623 0 0 1 .207.857Zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.688-1.652-6.786-2.131-9.965-1.166a.78.78 0 1 1-.452-1.492c3.632-1.102 8.147-.568 11.233 1.329a.78.78 0 0 1 .256 1.072Zm.105-2.835c-3.223-1.914-8.54-2.09-11.617-1.156a.935.935 0 1 1-.543-1.79c3.532-1.072 9.404-.865 13.115 1.338a.935.935 0 1 1-.955 1.608Z"
              />
            </svg>
          </button>

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
