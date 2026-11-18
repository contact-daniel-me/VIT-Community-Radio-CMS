import { createContext, useContext, useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { PublicTopAudioRow } from '@/types/database';
import { audioService } from '@/services/audioService';

interface GlobalAudioState {
  currentTrack: PublicTopAudioRow | null;
  isPlaying: boolean;
  progress: number; // 0 to 1
  currentTime: number;
  duration: number;
  playTrack: (track: PublicTopAudioRow, startTime?: number) => void;
  setTrack: (track: PublicTopAudioRow, startTime?: number) => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  volume: number;
  setVolume: (v: number) => void;
  muted: boolean;
  setMuted: (m: boolean) => void;
  getAudioElement?: () => HTMLAudioElement | null;
}

const GlobalAudioContext = createContext<GlobalAudioState | undefined>(undefined);

export function GlobalAudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const [currentTrack, setCurrentTrack] = useState<PublicTopAudioRow | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      try {
        audioRef.current.crossOrigin = 'anonymous';
        audioRef.current.preload = 'metadata';
      } catch {
        // no-op if browser restricts crossOrigin attribute assignment
      }
    }
    const audio = audioRef.current;

    const onTimeUpdate = () => {
      // If a pending seek is not in flight, track audio playback time
      if (pendingSeekTimeRef.current === null) {
        setCurrentTime(audio.currentTime);
      }
    };

    const applyPendingSeek = () => {
      if (pendingSeekTimeRef.current !== null && Number.isFinite(pendingSeekTimeRef.current)) {
        const target = pendingSeekTimeRef.current;
        try {
          audio.currentTime = target;
          setCurrentTime(target);
        } catch (e) {
          console.warn('[GlobalAudio] Failed to apply pending seek:', e);
        }
        pendingSeekTimeRef.current = null;
      }
    };

    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
      applyPendingSeek();
    };

    const onDurationChange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    const onCanPlay = () => {
      applyPendingSeek();
    };

    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.pause();
      audio.src = '';
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = muted || volume === 0;
    }
  }, [volume, muted]);

  const handleSetVolume = (v: number) => {
    const clamped = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.8));
    setVolume(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
      audioRef.current.muted = clamped === 0;
    }
  };

  const playTrack = async (track: PublicTopAudioRow, startTime = 0) => {
    // Stop any currently playing audio first
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }

    // Synchronously unlock the audio element for Safari/mobile before the async fetch
    if (audioRef.current && audioRef.current.src === '') {
      audioRef.current.play().catch(() => {});
      audioRef.current.pause();
    }

    setCurrentTrack(track);
    setIsPlaying(false);
    setCurrentTime(startTime);
    setDuration(track.audio_duration_seconds || 0);
    pendingSeekTimeRef.current = startTime > 0 ? startTime : null;

    try {
      const url = await audioService.getPlaybackUrl(track.storage_path);
      console.debug('[GlobalAudio] playTrack url:', url);
      if (audioRef.current) {
        audioRef.current.preload = 'auto';
        audioRef.current.src = url;
        audioRef.current.volume = volume;
        audioRef.current.muted = muted || volume === 0;
        audioRef.current.load(); // ensure browser re-reads the new src

        if (startTime > 0 && audioRef.current.readyState >= 1) {
          try {
            audioRef.current.currentTime = startTime;
            pendingSeekTimeRef.current = null;
          } catch {
            // will be applied on loadedmetadata / canplay
          }
        }

        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
      }
    } catch (e) {
      console.error('[GlobalAudio] Failed to play track:', e);
      setIsPlaying(false);
    }
  };

  const setTrack = async (track: PublicTopAudioRow, startTime = 0) => {
    setCurrentTrack(track);
    setIsPlaying(false);
    setCurrentTime(startTime);
    setDuration(track.audio_duration_seconds || 0);
    pendingSeekTimeRef.current = startTime > 0 ? startTime : null;

    try {
      const url = await audioService.getPlaybackUrl(track.storage_path);
      if (audioRef.current) {
        audioRef.current.preload = 'metadata';
        audioRef.current.src = url;
      }
    } catch (e) {
      console.error('Failed to set track', e);
    }
  };

  const pause = () => {
    audioRef.current?.pause();
  };

  const resume = async () => {
    if (currentTrack && audioRef.current) {
      try {
        // If src is empty or not a real URL, re-fetch it
        const currentSrc = audioRef.current.src;
        const hasValidSrc =
          currentSrc &&
          currentSrc !== '' &&
          !currentSrc.endsWith(window.location.origin + '/') &&
          currentSrc !== window.location.origin;
        if (!hasValidSrc) {
          const url = await audioService.getPlaybackUrl(currentTrack.storage_path);
          console.debug('[GlobalAudio] resume: re-fetching url', url);
          audioRef.current.preload = 'auto';
          audioRef.current.src = url;
          audioRef.current.load();
          if (currentTime > 0) {
            pendingSeekTimeRef.current = currentTime;
          }
        }
        audioRef.current.volume = volume;
        audioRef.current.muted = muted || volume === 0;
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
      } catch (e) {
        console.error('[GlobalAudio] Failed to resume track:', e);
      }
    }
  };

  const seek = (time: number) => {
    const target = Number.isFinite(time) ? Math.max(0, time) : 0;
    const clamped = duration > 0 ? Math.min(target, duration) : target;
    setCurrentTime(clamped);

    if (audioRef.current) {
      if (audioRef.current.readyState >= 1) {
        try {
          audioRef.current.currentTime = clamped;
          pendingSeekTimeRef.current = null;
        } catch {
          pendingSeekTimeRef.current = clamped;
        }
      } else {
        pendingSeekTimeRef.current = clamped;
      }
    }
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <GlobalAudioContext.Provider
      value={{
        currentTrack,
        isPlaying,
        progress,
        currentTime,
        duration,
        playTrack,
        setTrack,
        pause,
        resume,
        seek,
        volume,
        setVolume: handleSetVolume,
        muted,
        setMuted,
        getAudioElement: () => audioRef.current,
      }}
    >
      {children}
    </GlobalAudioContext.Provider>
  );
}

export function useGlobalAudio() {
  const context = useContext(GlobalAudioContext);
  if (!context) {
    throw new Error('useGlobalAudio must be used within a GlobalAudioProvider');
  }
  return context;
}
