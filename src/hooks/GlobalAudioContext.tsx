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
  playTrack: (track: PublicTopAudioRow) => void;
  setTrack: (track: PublicTopAudioRow) => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  volume: number;
  setVolume: (v: number) => void;
  muted: boolean;
  setMuted: (m: boolean) => void;
}

const GlobalAudioContext = createContext<GlobalAudioState | undefined>(undefined);

export function GlobalAudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<PublicTopAudioRow | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
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
      audioRef.current.muted = muted;
    }
  }, [volume, muted]);

  const playTrack = async (track: PublicTopAudioRow) => {
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
    setCurrentTime(0);
    setDuration(track.audio_duration_seconds || 0);

    try {
      const url = await audioService.getPlaybackUrl(track.storage_path);
      console.debug('[GlobalAudio] playTrack url:', url);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.load(); // ensure browser re-reads the new src
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

  const setTrack = async (track: PublicTopAudioRow) => {
    setCurrentTrack(track);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(track.audio_duration_seconds || 0);

    try {
      const url = await audioService.getPlaybackUrl(track.storage_path);
      if (audioRef.current) {
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
          audioRef.current.src = url;
          audioRef.current.load();
        }
        console.debug(
          '[GlobalAudio] resume: paused=', audioRef.current.paused,
          'src=', audioRef.current.src,
          'readyState=', audioRef.current.readyState,
        );
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
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
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
        setVolume,
        muted,
        setMuted,
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
