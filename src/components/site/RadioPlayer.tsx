import { useEffect, useRef, useState } from 'react';
import type { PublicNowPlayingRow } from '@/types/database';
import { useSpotifyEmbed } from '@/hooks/useSpotifyEmbed';
import { useGlobalAudio } from '@/hooks/GlobalAudioContext';
import { SPOTIFY_SHOW_URL } from '@/lib/spotify';
import { Logo } from './Logo';
import { Waveform } from './Waveform';

/**
 * The persistent station player.
 *
 * Two sources live here and they are never conflated:
 *
 *   A. the live 90.8 FM stream -- VITE_STREAM_URL, played by the <audio>
 *      element below, and only when the station is actually on air
 *   B. the station's Spotify show -- on demand, played by Spotify's own embed
 *
 * The live stream always wins. Spotify is what the transport reaches for when
 * there is no broadcast to play, and it is labelled as Spotify whenever it is
 * the thing playing, so nobody is told a podcast is the FM signal.
 *
 * Nothing here fakes audio. `spotify.playing` is Spotify reporting through the
 * Embed API that it is playing -- not an assumption made after a click -- so
 * pausing inside Spotify's own player moves this bar too.
 *
 * Layout is three sections: what is playing, the transport, and the settings
 * that are not about a particular track. On a phone the third drops away and
 * the first two share the row.
 */
const STREAM_URL = import.meta.env.VITE_STREAM_URL ?? '';
const SKIP_SECONDS = 15;

/** 1271044 -> "21:11" */
function clock(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function RadioPlayer({ now }: { now: PublicNowPlayingRow | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const globalAudio = useGlobalAudio();
  const trackPlaying = globalAudio.isPlaying;
  const trackDrives = globalAudio.currentTrack !== null;

  const live = now?.broadcast_status === 'ON_AIR';
  const configured = STREAM_URL.length > 0;
  const canPlay = configured && live;

  const spotify = useSpotifyEmbed();
  /** Spotify is the transport only when the live stream cannot be. */
  const spotifyDrives = !canPlay && !trackDrives;
  const spotifyPlaying = spotifyDrives && spotify.playing;
  
  const active = playing || spotifyPlaying || trackPlaying;
  
  let progress = 0;
  if (trackDrives && globalAudio.duration > 0) {
    progress = globalAudio.progress;
  } else if (spotify.durationMs > 0) {
    progress = Math.min(1, spotify.positionMs / spotify.durationMs);
  }

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

  const toggle = () => {
    if (trackDrives) {
      if (trackPlaying) globalAudio.pause();
      else void globalAudio.resume();
      return;
    }
    if (spotifyDrives) {
      spotify.toggle();
      return;
    }
    if (playing) stop();
    else void start();
  };

  // A live stream that goes off air should not leave the button showing "pause".
  useEffect(() => {
    if (!live && playing) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // Stop the live stream if a specific episode track starts playing
  useEffect(() => {
    if (trackPlaying && playing) {
      stop();
    }
  }, [trackPlaying, playing]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) {
      el.volume = volume;
      el.muted = muted;
    }
  }, [volume, muted]);

  const status = trackPlaying
    ? 'PLAYING'
    : trackDrives
      ? 'PAUSED'
      : playing
        ? 'ON AIR'
        : spotifyPlaying
          ? 'NOW PLAYING'
          : spotify.loading && spotifyDrives
            ? 'CONNECTING'
            : live
              ? 'LIVE — PRESS PLAY'
              : spotifyDrives && spotify.started
                ? 'PAUSED'
                : spotifyDrives
                  ? 'READY'
                  : 'OFF AIR';

  /** What is on: the live programme, or the episode Spotify named, or the GlobalAudio track. */
  const title = trackDrives
    ? globalAudio.currentTrack?.title
    : live
      ? (now?.program_name ?? 'VIT Community Radio')
      : (spotify.meta?.title ?? 'VIT Community Radio');
      
  const subtitle = trackDrives
    ? globalAudio.currentTrack?.program_name
    : live
      ? (now?.episode_title ?? 'Live now')
      : spotifyDrives && spotify.started
        ? 'The station show on Spotify'
        : '90.8 FM · VIT Vellore';

  const seekable = (spotifyDrives && spotify.started) || trackDrives;

  return (
    <div className={`player ${active ? 'is-playing' : ''}`}>
      {configured && <audio ref={audioRef} src={STREAM_URL} preload="none" />}

      {/*
        The embed, offstage.

        Spotify's audio needs a real iframe on the page, but it does not need
        to be seen: this bar is the interface, and a panel unfolding over the
        page every time someone presses play is not what a transport does. So
        the frame is kept at full size and painted nowhere -- clipped,
        transparent, inert -- rather than display:none or zero-sized, either of
        which risks the player never starting or the audio being torn down.

        Attribution stays where a listener can see it: the green mark, "The
        station show on Spotify", and a link straight to the show.
      */}
      {spotify.started && (
        <div className="player-embed" aria-hidden="true">
          {/* Spotify replaces this element with its iframe. */}
          <div ref={spotify.hostRef} />
        </div>
      )}

      <div className="player-inner">
        {/* ---- what is playing ---- */}
        <div className="player-id">
          <span className={`player-art ${active ? 'is-active' : ''}`}>
            {spotify.meta?.artworkUrl ? (
              <img src={spotify.meta.artworkUrl} alt="" width={46} height={46} loading="lazy" />
            ) : (
              <span className="player-art-fallback">
                <Logo size={26} withWordmark={false} />
              </span>
            )}
          </span>

          <div className="player-id-text">
            <span className="player-station" title={title}>
              {title}
            </span>
            <span className="player-sub">
              {live ? (
                <>
                  <span className="player-live-dot" aria-hidden="true" />
                  {subtitle}
                </>
              ) : spotifyPlaying ? (
                <>
                  <span className="player-source-dot" aria-hidden="true" />
                  {subtitle}
                </>
              ) : (
                subtitle
              )}
            </span>
            <a
              className="player-listen"
              href={SPOTIFY_SHOW_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <SpotifyGlyph size={13} />
              Listen on Spotify
              <span className="visually-hidden"> (opens in a new tab)</span>
            </a>
          </div>
        </div>

        {/* ---- transport ---- */}
        <div className="player-transport">
          <div className="player-controls">
            <button
              type="button"
              className="player-btn player-skip"
              onClick={() => {
                if (trackDrives) globalAudio.seek(Math.max(0, globalAudio.currentTime - SKIP_SECONDS));
                else spotify.nudge(-SKIP_SECONDS);
              }}
              disabled={!seekable}
              aria-label={`Back ${SKIP_SECONDS} seconds`}
              title={`Back ${SKIP_SECONDS} seconds`}
            >
              <SkipGlyph back />
            </button>

            <button
              type="button"
              className="player-btn player-play"
              onClick={toggle}
              disabled={!canPlay && !spotifyDrives && !trackDrives}
              aria-label={
                active
                  ? 'Pause'
                  : trackDrives
                    ? 'Play the selected track'
                    : spotifyDrives
                      ? 'Play the VIT Community Radio show on Spotify'
                      : 'Play the live stream'
              }
              title={
                trackDrives
                  ? 'Play the selected track'
                  : spotifyDrives
                    ? 'Play the station show on Spotify'
                    : !configured
                      ? 'No live stream is configured yet'
                      : !live
                        ? 'The station is off air'
                        : undefined
              }
            >
              <span className={`player-icon ${active ? 'is-pause' : ''}`} aria-hidden="true">
                <svg className="player-icon-play" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="currentColor" d="M8 5.2v13.6a.6.6 0 0 0 .92.51l10.5-6.8a.6.6 0 0 0 0-1.02L8.92 4.69A.6.6 0 0 0 8 5.2Z" />
                </svg>
                <svg className="player-icon-pause" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z" />
                </svg>
              </span>
            </button>

            <button
              type="button"
              className="player-btn player-skip"
              onClick={() => {
                if (trackDrives) globalAudio.seek(Math.min(globalAudio.duration, globalAudio.currentTime + SKIP_SECONDS));
                else spotify.nudge(SKIP_SECONDS);
              }}
              disabled={!seekable}
              aria-label={`Forward ${SKIP_SECONDS} seconds`}
              title={`Forward ${SKIP_SECONDS} seconds`}
            >
              <SkipGlyph />
            </button>
          </div>

          <div className="player-meter">
            <Waveform active={active} bars={18} className="player-wave" />
            <span className="player-state" role="status">
              {status}
            </span>
            {seekable && ((spotify.durationMs > 0) || (trackDrives && globalAudio.duration > 0)) && (
              <span className="player-time">
                <span className="player-elapsed">
                  {trackDrives ? clock(globalAudio.currentTime * 1000) : clock(spotify.positionMs)}
                </span>
                <span className="player-track" aria-hidden="true">
                  <span className="player-track-fill" style={{ transform: `scaleX(${progress})` }} />
                </span>
                {/* Stands in for the bar once it is too narrow to draw, so the
                    two numbers never run together as "0:0021:11". */}
                <span className="player-time-sep" aria-hidden="true">
                  /
                </span>
                <span className="player-duration">
                  {trackDrives ? clock(globalAudio.duration * 1000) : clock(spotify.durationMs)}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* ---- settings ---- */}
        <div className="player-right">
          {/*
            Volume belongs to whatever is making the sound. Spotify keeps its
            own, inside a frame we cannot reach, so while it drives there is
            nothing here for a slider to move -- and a permanently greyed-out
            control is just clutter. The live stream does have volume we can
            set, so the control comes back with it.
          */}
          {!spotifyDrives && (
            <>
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
                value={trackDrives ? (globalAudio.muted ? 0 : globalAudio.volume) : (muted ? 0 : volume)}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (trackDrives) {
                    globalAudio.setVolume(val);
                    globalAudio.setMuted(false);
                  } else {
                    setVolume(val);
                    setMuted(false);
                  }
                }}
                aria-label="Volume"
              />
            </>
          )}

          <a
            className={`player-btn player-spotify-btn ${spotifyPlaying ? 'is-open' : ''}`}
            href={SPOTIFY_SHOW_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open VIT Community Radio on Spotify"
            title="Open the show on Spotify"
          >
            <SpotifyGlyph />
          </a>

          <span className="player-freq">90.8&nbsp;FM</span>
        </div>
      </div>

      {(error || spotify.error || (!configured && live)) && (
        <p className="player-note" role="status">
          {error ??
            spotify.error ??
            'Live now — audio streaming is not connected yet, so there is nothing to play here.'}
        </p>
      )}
    </div>
  );
}

function SpotifyGlyph({ size = 17 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.586 14.424a.623.623 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 1 1-.277-1.215c3.809-.871 7.077-.496 9.712 1.115a.623.623 0 0 1 .207.857Zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.688-1.652-6.786-2.131-9.965-1.166a.78.78 0 1 1-.452-1.492c3.632-1.102 8.147-.568 11.233 1.329a.78.78 0 0 1 .256 1.072Zm.105-2.835c-3.223-1.914-8.54-2.09-11.617-1.156a.935.935 0 1 1-.543-1.79c3.532-1.072 9.404-.865 13.115 1.338a.935.935 0 1 1-.955 1.608Z"
      />
    </svg>
  );
}

/** A circular arrow with 15 inside, the way a podcast app draws a skip. */
function SkipGlyph({ back = false }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <g transform={back ? 'scale(-1,1) translate(-24,0)' : undefined}>
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          d="M12 5.5a7 7 0 1 0 6.7 5"
        />
        <path fill="currentColor" d="M11.4 2.2 15 5l-3.6 2.8Z" />
      </g>
      <text
        x="12"
        y="15.6"
        textAnchor="middle"
        fontSize="7.4"
        fontWeight="700"
        fill="currentColor"
      >
        15
      </text>
    </svg>
  );
}
