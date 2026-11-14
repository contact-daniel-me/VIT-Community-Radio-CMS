import { useEffect, useState, useCallback, useRef } from 'react';
import type { PublicApprovedEpisodeRow, PublicNowPlayingRow } from '@/types/database';
import { publicService } from '@/services/publicService';
import { useGlobalAudio } from '@/hooks/GlobalAudioContext';
import { RadioOnAirLamp } from './RadioOnAirLamp';
import { RadioSpeaker } from './RadioSpeaker';
import { RadioDisplay } from './RadioDisplay';
import { RadioTuningScale } from './RadioTuningScale';
import { RadioControls } from './RadioControls';
import type { RadioItem } from './types';
import '@/styles/retro-radio.css';

interface RetroRadioProps {
  now?: PublicNowPlayingRow | null;
}

/** Formats ISO string into retro display date e.g. "11 NOV 2026" */
function formatDisplayDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d
      .toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      .toUpperCase();
  } catch {
    return '';
  }
}

/**
 * Parses dynamic highlights from episode description or generates
 * contextual, authentic highlights based on programme details.
 */
function parseHighlights(ep: PublicApprovedEpisodeRow): string[] {
  const highlights: string[] = [];

  if (ep.description) {
    // Check for explicit bullet lines (-, *, •, ▸, or newlines)
    const lines = ep.description
      .split(/\r?\n|•|▸/)
      .map((l) => l.replace(/^[-*•▸\s]+/, '').trim())
      .filter((l) => l.length > 4 && l.length < 80);

    if (lines.length >= 2) {
      return lines.slice(0, 3);
    }
  }

  // Derive dynamic contextual highlights from CMS metadata
  if (ep.program_name && ep.program_name !== 'Legacy Bookings') {
    highlights.push(`${ep.program_name} Series`);
  } else if (ep.program_category) {
    highlights.push(`${ep.program_category} Feature`);
  }

  if (ep.host_name) {
    highlights.push(`Hosted by ${ep.host_name}`);
  } else {
    highlights.push('Community Radio Feature');
  }

  const durationMin = Math.round(
    (ep.audio_duration_seconds || ep.duration_seconds || 300) / 60,
  );
  highlights.push(`${Math.max(1, durationMin)} min Full Broadcast`);

  return highlights.slice(0, 3);
}

export function RetroRadio({ now }: RetroRadioProps) {
  const [items, setItems] = useState<RadioItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isTuning, setIsTuning] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isPoweredOn, setIsPoweredOn] = useState(false);
  const [initialTuningSettled, setInitialTuningSettled] = useState(false);

  const globalAudio = useGlobalAudio();
  const radioRef = useRef<HTMLDivElement>(null);

  const isLive = now?.broadcast_status === 'ON_AIR';

  // Startup animation sequence: display illuminates, tuning needle glides and settles
  useEffect(() => {
    const powerTimer = setTimeout(() => {
      setIsPoweredOn(true);
    }, 120);

    const needleTimer = setTimeout(() => {
      setInitialTuningSettled(true);
    }, 380);

    return () => {
      clearTimeout(powerTimer);
      clearTimeout(needleTimer);
    };
  }, []);

  // Build radio items from CMS approved episodes and live state
  useEffect(() => {
    let cancelled = false;

    async function loadContent() {
      try {
        const [approvedEpisodes, programs] = await Promise.all([
          publicService.getApprovedEpisodes(10),
          publicService.getShows(50).catch(() => []),
        ]);
        if (cancelled) return;

        // Build a lookup map of program cover artwork URLs
        const artworkMap = new Map<string, string>();
        programs.forEach((prog) => {
          if (prog.name && prog.artwork_url) {
            artworkMap.set(prog.name.toLowerCase().trim(), prog.artwork_url);
          }
        });

        const nowDate = new Date();
        const activeEpisodes = approvedEpisodes.filter((ep) => {
          if (ep.show_on_homepage !== true) return false;
          if (ep.homepage_publish_at && new Date(ep.homepage_publish_at) > nowDate) return false;
          if (ep.homepage_expires_at && new Date(ep.homepage_expires_at) <= nowDate) return false;
          return true;
        });

        const radioList: RadioItem[] = [];

        // If station is ON AIR, place Live Broadcast at 90.8 FM
        if (isLive && now) {
          radioList.push({
            id: 'live-broadcast-908',
            isLive: true,
            frequency: 90.8,
            category: 'LIVE ON AIR',
            title:
              now.program_name === 'Legacy Bookings' && now.episode_title
                ? now.episode_title
                : now.program_name || 'VIT Community Radio Live',
            host: now.host_name || 'Station RJ',
            description:
              now.episode_title && now.program_name !== 'Legacy Bookings'
                ? now.episode_title
                : 'Broadcasting live across VIT Vellore on 90.8 FM.',
            highlights: [
              'Real-time FM Transmission',
              'VIT Vellore Campus Studios',
              'Community Voice & Music',
            ],
            date: 'ON AIR NOW',
            isNew: true,
            nowPlaying: now,
            artworkUrl: now.program_name
              ? artworkMap.get(now.program_name.toLowerCase().trim()) || null
              : null,
          });
        }

        // Add published CMS episodes
        activeEpisodes.forEach((ep, idx) => {
          // Compute a frequency spread along the FM band (91.4 .. 106.8 MHz)
          const baseFreq = 91.5 + idx * 2.8;
          const displayFreq = parseFloat(baseFreq.toFixed(1));
          const epArtwork = ep.program_name
            ? artworkMap.get(ep.program_name.toLowerCase().trim()) || null
            : null;

          radioList.push({
            id: ep.episode_id,
            isLive: false,
            frequency: displayFreq,
            category: ep.program_category || 'SPECIAL TALKS',
            title: ep.title,
            host: ep.host_name || 'VIT Community Radio',
            description:
              ep.description ||
              'Catch the latest stories, perspectives and conversation from VIT Community Radio.',
            highlights: parseHighlights(ep),
            date: formatDisplayDate(ep.created_at),
            isNew: idx === 0,
            durationSeconds: ep.audio_duration_seconds || ep.duration_seconds,
            episode: ep,
            artworkUrl: epArtwork,
          });
        });

        // Fallback default item if archive is momentarily empty
        if (radioList.length === 0) {
          radioList.push({
            id: 'station-default',
            isLive: false,
            frequency: 90.8,
            category: 'COMMUNITY RADIO',
            title: 'VIT Community Radio 90.8 FM',
            host: 'Vellore Institute of Technology',
            description:
              'Frequency is ready. Scheduled shows and student podcasts will appear here once live on air.',
            highlights: [
              '90.8 FM Frequency Ready',
              'Student & Campus Voice',
              'VIT Vellore Broadcasts',
            ],
            date: formatDisplayDate(new Date().toISOString()),
            isNew: true,
          });
        }

        setItems(radioList);
      } catch (err) {
        console.error('[RetroRadio] Failed to load radio content:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadContent();
    const interval = setInterval(loadContent, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isLive, now]);

  // Navigate to target item with smooth tuning flicker
  const tuneToIndex = useCallback(
    (nextIdx: number) => {
      if (items.length === 0) return;
      const safeIdx = (nextIdx + items.length) % items.length;
      setIsTuning(true);
      setCurrentIndex(safeIdx);
      setTimeout(() => setIsTuning(false), 220);
    },
    [items.length],
  );

  const handlePrev = useCallback(() => {
    tuneToIndex(currentIndex - 1);
  }, [currentIndex, tuneToIndex]);

  const handleNext = useCallback(() => {
    tuneToIndex(currentIndex + 1);
  }, [currentIndex, tuneToIndex]);

  // Autoplay dial cycle: advances tuning when not playing audio and not hovered
  useEffect(() => {
    if (isHovered || globalAudio.isPlaying || items.length <= 1) {
      return;
    }
    const timer = setInterval(() => {
      tuneToIndex(currentIndex + 1);
    }, 12000);
    return () => clearInterval(timer);
  }, [items.length, isHovered, globalAudio.isPlaying, currentIndex, tuneToIndex]);

  // Active item
  const currentItem = items[currentIndex] ?? null;

  // Track playback status
  const isCurrentEpisodePlaying =
    currentItem?.episode &&
    globalAudio.currentTrack?.episode_id === currentItem.episode.episode_id &&
    globalAudio.isPlaying;

  // Handle Play/Pause
  const handleTogglePlay = async () => {
    if (!currentItem) return;

    // If item is Live broadcast
    if (currentItem.isLive) {
      const streamUrl = import.meta.env.VITE_STREAM_URL;
      if (!streamUrl) {
        setAuthMessage('Live 90.8 FM transmitter active on terrestrial FM.');
        setTimeout(() => setAuthMessage(null), 3500);
        return;
      }
      // If live stream URL is configured, let user toggle playback
      if (globalAudio.isPlaying) {
        globalAudio.pause();
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        globalAudio.playTrack({
          episode_id: 'live-stream',
          title: currentItem.title,
          program_name: currentItem.title,
          host_name: currentItem.host,
          storage_path: streamUrl,
          audio_duration_seconds: 0,
        } as any);
      }
      return;
    }

    // Recorded episode item
    const ep = currentItem.episode;
    if (!ep) return;

    const isThisTrackActive = globalAudio.currentTrack?.episode_id === ep.episode_id;

    if (isThisTrackActive) {
      if (globalAudio.isPlaying) {
        globalAudio.pause();
      } else {
        globalAudio.resume();
      }
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalAudio.playTrack(ep as unknown as any);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === ' ' || e.code === 'Space') {
        // Space to toggle play/pause
        if (radioRef.current?.contains(document.activeElement) || isHovered) {
          e.preventDefault();
          void handleTogglePlay();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, handleTogglePlay, isHovered]);

  const isPlaying = Boolean(isCurrentEpisodePlaying);

  return (
    <div
      ref={radioRef}
      className={`retro-radio-wrapper ${isPlaying ? 'is-broadcasting' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={0}
      role="region"
      aria-label="VIT Community Radio 90.8 FM Interactive Receiver"
    >
      {/* Radio Cabinet Chassis */}
      <div className="retro-radio-chassis">
        {/* Top Trim Screws & Chassis Header */}
        <div className="retro-chassis-topbar">
          <div className="retro-chassis-screw left" aria-hidden="true">
            <span className="screw-slot" />
          </div>

          <div className="retro-brand-plate">
            <span className="brand-dot" />
            <span className="brand-name">VIT COMMUNITY RADIO</span>
            <span className="brand-model">MODEL 90.8-FM</span>
          </div>

          {/* Physical ON AIR Lamp - Only rendered when verified live stream is active */}
          {isLive && (
            <div className="retro-onair-corner">
              <RadioOnAirLamp
                isLive={isLive}
                isCurrentlyTunedToLive={currentItem?.isLive}
                onSelectLive={() => {
                  const liveIdx = items.findIndex((it) => it.isLive);
                  if (liveIdx !== -1) tuneToIndex(liveIdx);
                }}
              />
            </div>
          )}

          <div className="retro-chassis-screw right" aria-hidden="true">
            <span className="screw-slot" />
          </div>
        </div>

        {/* Main Radio Faceplate: Speaker Grille + Digital Display */}
        <div className="retro-radio-faceplate">
          {/* Left Column: Perforated Speaker Grille */}
          <RadioSpeaker isPlaying={isPlaying} />

          {/* Right Column: Digital LCD Display */}
          <div className="retro-display-column">
            <RadioDisplay
              item={currentItem}
              isPlaying={isPlaying}
              progress={globalAudio.progress}
              currentTime={globalAudio.currentTime}
              duration={globalAudio.duration}
              authMessage={authMessage}
              isTuning={isTuning}
              isPoweredOn={isPoweredOn}
            />
          </div>
        </div>

        {/* Lower Deck: Horizontal Frequency Tuning Scale */}
        <div className="retro-scale-deck">
          <RadioTuningScale
            items={items}
            currentIndex={currentIndex}
            onSelectIndex={tuneToIndex}
            initialTuningSettled={initialTuningSettled}
          />
        </div>

        {/* Bottom Hardware Controls: Push-Buttons & Rotary Knobs */}
        <div className="retro-controls-container">
          <RadioControls
            onPrev={handlePrev}
            onNext={handleNext}
            onTogglePlay={handleTogglePlay}
            isPlaying={isPlaying}
            volume={globalAudio.volume}
            onVolumeChange={(vol) => globalAudio.setVolume(vol)}
            disabled={loading || items.length === 0}
          />
        </div>

        {/* Bottom Chassis Feet & Screws */}
        <div className="retro-chassis-base">
          <div className="retro-chassis-screw bot-left" aria-hidden="true">
            <span className="screw-slot" />
          </div>
          <div className="retro-chassis-feet" aria-hidden="true">
            <span className="foot foot-left" />
            <span className="foot foot-right" />
          </div>
          <div className="retro-chassis-screw bot-right" aria-hidden="true">
            <span className="screw-slot" />
          </div>
        </div>
      </div>
    </div>
  );
}

