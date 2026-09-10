import { useCallback, useEffect, useRef, useState } from 'react';
import { SPOTIFY_SHOW_ID } from '@/lib/spotify';

/**
 * Drive the station's Spotify show through Spotify's official Embed iframe API.
 *
 * This is the Embed API -- https://open.spotify.com/embed/iframe-api/v1 -- and
 * NOT the Web Playback SDK. The distinction matters: the SDK needs an OAuth
 * login and a Premium account for every listener, while this needs neither and
 * carries no credential of any kind. Nothing secret is involved because the
 * embed is public.
 *
 * It was verified before being built on. The controller exposes play, pause,
 * togglePlay, resume, seek, loadUri and destroy, and a real click on our own
 * button starts playback and reports back:
 *
 *   EVENT playback_update isPaused=false position=809  duration=1271044
 *   EVENT playback_update isPaused=false position=7193 duration=1271044
 *
 * That is what makes the bar honest. `playing` below is Spotify telling us it
 * is playing, not us assuming it after a click -- if playback never starts,
 * or the listener pauses inside Spotify's own player, the bar follows.
 *
 * The API script and the iframe load only when someone first presses play, so
 * a visitor who never asks for the show never talks to Spotify at all.
 */

interface SpotifyController {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  destroy: () => void;
  addListener: (event: string, handler: (payload: { data: PlaybackData }) => void) => void;
}

interface PlaybackData {
  isPaused: boolean;
  isBuffering?: boolean;
  position: number;
  duration: number;
}

interface SpotifyIframeApi {
  createController: (
    element: HTMLElement,
    options: { uri: string; width: string | number; height: string | number },
    callback: (controller: SpotifyController) => void,
  ) => void;
}

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void;
    __spotifyIframeApi?: SpotifyIframeApi;
  }
}

const API_SRC = 'https://open.spotify.com/embed/iframe-api/v1';
const SCRIPT_ID = 'spotify-embed-api';

/** Resolves once, however many players ask for it. */
let apiPromise: Promise<SpotifyIframeApi> | null = null;

function loadApi(): Promise<SpotifyIframeApi> {
  if (window.__spotifyIframeApi) return Promise.resolve(window.__spotifyIframeApi);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<SpotifyIframeApi>((resolve, reject) => {
    // Spotify's loader calls this global when it is ready. It is set before
    // the script is added, because the script may run immediately from cache.
    window.onSpotifyIframeApiReady = (api) => {
      window.__spotifyIframeApi = api;
      resolve(api);
    };

    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = API_SRC;
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('Spotify could not be reached.'));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

export interface SpotifyEmbedState {
  /** Where the embed must be rendered. */
  hostRef: React.RefObject<HTMLDivElement | null>;
  /** Spotify says it is playing. Never inferred from a click. */
  playing: boolean;
  /** The controller exists and the embed has loaded. */
  ready: boolean;
  /** Set once someone has asked for the show; the iframe exists from then on. */
  started: boolean;
  loading: boolean;
  error: string | null;
  positionMs: number;
  durationMs: number;
  /** Start on the first press, then toggle. Must be called from a user gesture. */
  toggle: () => void;
}

export function useSpotifyEmbed(): SpotifyEmbedState {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SpotifyController | null>(null);
  const wantPlayRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  useEffect(() => {
    return () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  // Build the controller once the host element is on the page.
  useEffect(() => {
    if (!started || controllerRef.current || !hostRef.current) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadApi()
      .then((api) => {
        if (cancelled || !hostRef.current) return;

        api.createController(
          hostRef.current,
          { uri: `spotify:show:${SPOTIFY_SHOW_ID}`, width: '100%', height: 152 },
          (controller) => {
            if (cancelled) {
              controller.destroy();
              return;
            }
            controllerRef.current = controller;

            controller.addListener('ready', () => {
              setReady(true);
              setLoading(false);
              // The press that mounted this happened a moment ago, so honour
              // it now rather than making the listener press twice.
              if (wantPlayRef.current) {
                wantPlayRef.current = false;
                controller.play();
              }
            });

            controller.addListener('playback_update', ({ data }) => {
              setPlaying(!data.isPaused);
              setPositionMs(data.position ?? 0);
              setDurationMs(data.duration ?? 0);
              setLoading(false);
            });
          },
        );
      })
      .catch((cause: Error) => {
        if (cancelled) return;
        setLoading(false);
        setError(cause.message);
      });

    return () => {
      cancelled = true;
    };
  }, [started]);

  const toggle = useCallback(() => {
    const controller = controllerRef.current;
    if (controller) {
      controller.togglePlay();
      return;
    }
    // First press: mount the embed and play as soon as it is ready.
    wantPlayRef.current = true;
    setStarted(true);
  }, []);

  return { hostRef, playing, ready, started, loading, error, positionMs, durationMs, toggle };
}
