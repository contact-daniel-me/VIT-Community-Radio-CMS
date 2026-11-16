import { useEffect, useRef, useCallback } from 'react';
import { analyticsService } from '@/services/analyticsService';

interface AudioAnalyticsOptions {
  isPlaying: boolean;
  audioSourceId: string;
  sourceType: 'live' | 'episode' | 'podcast';
}

/**
 * Audio playback telemetry hook.
 *
 * Implements Phase 6 specifications:
 * - Listens for actual playback start (never clicking alone).
 * - Periodic progress heartbeats (15s) calculating actual elapsed playback time.
 * - Excludes pause/buffering time from listening duration.
 * - Catches error and completed events.
 * - Safely handles failure: will never interfere with the audio player.
 */
export function useAudioAnalytics({
  isPlaying,
  audioSourceId,
  sourceType,
}: AudioAnalyticsOptions) {
  const sessionIdRef = useRef<string | null>(null);
  const lastHeartbeatRef = useRef<number>(Date.now());
  const wasPlayingRef = useRef<boolean>(false);
  const sourceRef = useRef(audioSourceId);
  const typeRef = useRef(sourceType);

  sourceRef.current = audioSourceId;
  typeRef.current = sourceType;

  // Handle start, pause, and heartbeat ticks
  useEffect(() => {
    if (isPlaying) {
      if (!wasPlayingRef.current) {
        // Playback has actually started
        wasPlayingRef.current = true;
        lastHeartbeatRef.current = Date.now();

        // 1. Log play event
        void analyticsService.logActivity(
          'AUDIO_PLAY',
          window.location.pathname,
          `Started playing ${sourceRef.current}`,
          { source: sourceRef.current, sourceType: typeRef.current },
        );

        // 2. Start listening session in database
        void analyticsService
          .sendAudioHeartbeat(null, sourceRef.current, typeRef.current, 0, 'active')
          .then((id) => {
            sessionIdRef.current = id;
          });

        // 3. Mark visitor presence as listening
        void analyticsService.sendHeartbeat(window.location.pathname, true);
      }

      // Periodic listening duration progress heartbeats every 15 seconds
      const interval = window.setInterval(() => {
        const now = Date.now();
        const elapsed = Math.min(45, Math.max(1, Math.floor((now - lastHeartbeatRef.current) / 1000)));
        lastHeartbeatRef.current = now;

        void analyticsService
          .sendAudioHeartbeat(sessionIdRef.current, sourceRef.current, typeRef.current, elapsed, 'active')
          .then((id) => {
            if (id) sessionIdRef.current = id;
          });

        void analyticsService.sendHeartbeat(window.location.pathname, true);
      }, 15000);

      return () => {
        window.clearInterval(interval);
      };
    } else {
      if (wasPlayingRef.current) {
        // Transitioned from playing to paused
        wasPlayingRef.current = false;
        const now = Date.now();
        const remainder = Math.min(45, Math.max(0, Math.floor((now - lastHeartbeatRef.current) / 1000)));
        lastHeartbeatRef.current = now;

        void analyticsService.sendAudioHeartbeat(
          sessionIdRef.current,
          sourceRef.current,
          typeRef.current,
          remainder,
          'paused',
        );

        void analyticsService.logActivity(
          'AUDIO_PAUSE',
          window.location.pathname,
          `Paused ${sourceRef.current}`,
          { source: sourceRef.current, sourceType: typeRef.current },
        );

        void analyticsService.sendHeartbeat(window.location.pathname, false);
      }
    }
  }, [isPlaying]);

  // Teardown when component unmounts
  useEffect(() => {
    return () => {
      if (wasPlayingRef.current) {
        wasPlayingRef.current = false;
        void analyticsService.sendAudioHeartbeat(
          sessionIdRef.current,
          sourceRef.current,
          typeRef.current,
          0,
          'stopped',
        );
        void analyticsService.sendHeartbeat(window.location.pathname, false);
      }
    };
  }, []);

  const handleEnded = useCallback(() => {
    if (wasPlayingRef.current) {
      wasPlayingRef.current = false;
      const now = Date.now();
      const remainder = Math.min(45, Math.max(0, Math.floor((now - lastHeartbeatRef.current) / 1000)));

      void analyticsService.sendAudioHeartbeat(
        sessionIdRef.current,
        sourceRef.current,
        typeRef.current,
        remainder,
        'completed',
      );

      void analyticsService.logActivity(
        'AUDIO_COMPLETE',
        window.location.pathname,
        `Finished listening to ${sourceRef.current}`,
        { source: sourceRef.current, sourceType: typeRef.current },
      );

      void analyticsService.sendHeartbeat(window.location.pathname, false);
    }
  }, []);

  const handleError = useCallback((errorMsg?: string) => {
    wasPlayingRef.current = false;
    void analyticsService.sendAudioHeartbeat(
      sessionIdRef.current,
      sourceRef.current,
      typeRef.current,
      0,
      'error',
    );

    void analyticsService.logActivity(
      'AUDIO_ERROR',
      window.location.pathname,
      `Audio playback error on ${sourceRef.current}`,
      { source: sourceRef.current, error: errorMsg || 'Playback error' },
    );

    void analyticsService.sendHeartbeat(window.location.pathname, false);
  }, []);

  return { handleEnded, handleError };
}
