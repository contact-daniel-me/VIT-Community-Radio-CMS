import { useEffect, useState, useCallback, useRef } from 'react';
import type { PublicApprovedEpisodeRow, PublicNowPlayingRow, SharedScheduledEpisode } from '@/types/database';
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
  sharedEpisode?: SharedScheduledEpisode | null;
  onReturnToDefault?: () => void;
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

export function RetroRadio({ now, sharedEpisode, onReturnToDefault }: RetroRadioProps) {
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

  // When a shared episode is loaded, pre-load its audio source metadata directly without autoplaying
  useEffect(() => {
    if (sharedEpisode && sharedEpisode.is_eligible && sharedEpisode.storage_path) {
      const epRow: PublicApprovedEpisodeRow = {
        episode_id: sharedEpisode.episode_id,
        title: sharedEpisode.title,
        description: sharedEpisode.description,
        host_name: sharedEpisode.host_name,
        program_name: sharedEpisode.program_name,
        program_category: sharedEpisode.program_category,
        audio_duration_seconds: sharedEpisode.duration_seconds,
        created_at: sharedEpisode.scheduled_at || new Date().toISOString(),
        storage_path: sharedEpisode.storage_path,
        storage_provider: sharedEpisode.storage_provider,
        file_name: sharedEpisode.file_name,
        duration_seconds: sharedEpisode.duration_seconds,
        show_on_homepage: true,
        scheduled_at: sharedEpisode.scheduled_at,
      };

      if (!globalAudio.isPlaying && globalAudio.currentTrack?.episode_id !== sharedEpisode.episode_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        globalAudio.setTrack(epRow as unknown as any);
      }
    }
  }, [sharedEpisode?.episode_id, sharedEpisode?.storage_path, globalAudio]);

  // Scroll into view if opened via shared episode link
  useEffect(() => {
    if (sharedEpisode && radioRef.current) {
      radioRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [sharedEpisode]);

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

        // If a scheduled episode was shared via link, add it as a highlighted radio item
        if (sharedEpisode && sharedEpisode.is_eligible) {
          const sharedEpRow: PublicApprovedEpisodeRow = {
            episode_id: sharedEpisode.episode_id,
            title: sharedEpisode.title,
            description: sharedEpisode.description,
            host_name: sharedEpisode.host_name,
            program_name: sharedEpisode.program_name,
            program_category: sharedEpisode.program_category,
            audio_duration_seconds: sharedEpisode.duration_seconds,
            created_at: sharedEpisode.scheduled_at || new Date().toISOString(),
            storage_path: sharedEpisode.storage_path,
            storage_provider: sharedEpisode.storage_provider,
            file_name: sharedEpisode.file_name,
            duration_seconds: sharedEpisode.duration_seconds,
            show_on_homepage: true,
            scheduled_at: sharedEpisode.scheduled_at,
          };

          const sharedFreq = radioList.length > 0 ? 91.2 : 90.8;
          radioList.push({
            id: sharedEpisode.episode_id,
            isLive: false,
            frequency: sharedFreq,
            category: `PUBLISHED • ${sharedEpisode.program_category || 'COMMUNITY'}`,
            title: sharedEpisode.title,
            host: sharedEpisode.host_name || 'VIT Community Radio',
            description:
              sharedEpisode.description ||
              'Catch the latest stories, perspectives and conversation from VIT Community Radio.',
            highlights: [
              sharedEpisode.scheduled_at
                ? `Published: ${new Date(sharedEpisode.scheduled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                : 'Available on Radio',
              `${sharedEpisode.program_name} Series`,
              `${Math.max(1, Math.round((sharedEpisode.duration_seconds || 300) / 60))} min Full Audio`,
            ],
            date: sharedEpisode.scheduled_at ? formatDisplayDate(sharedEpisode.scheduled_at) : formatDisplayDate(new Date().toISOString()),
            isNew: true,
            durationSeconds: sharedEpisode.duration_seconds,
            episode: sharedEpRow,
            artworkUrl: sharedEpisode.artwork_url,
            isSharedScheduled: true,
          });
        }

        // Add published CMS episodes, avoiding duplicate if this episode is already shared
        const filteredEpisodes = sharedEpisode
          ? activeEpisodes.filter((ep) => ep.episode_id !== sharedEpisode.episode_id)
          : activeEpisodes;

        filteredEpisodes.forEach((ep, idx) => {
          // Compute a frequency spread along the FM band (91.4 .. 106.8 MHz)
          const baseFreq = (sharedEpisode ? 92.0 : 91.5) + idx * 2.8;
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
            isNew: idx === 0 && !sharedEpisode,
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
        if (sharedEpisode) {
          const targetIdx = radioList.findIndex((it) => it.id === sharedEpisode.episode_id);
          if (targetIdx !== -1) {
            setCurrentIndex(targetIdx);
          }
        }
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
  }, [isLive, now, sharedEpisode]);

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
    if (items.length === 0) return;
    const nextIdx = (currentIndex - 1 + items.length) % items.length;
    tuneToIndex(nextIdx);
    const nextItem = items[nextIdx];
    if (globalAudio.isPlaying && nextItem?.episode) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      globalAudio.playTrack(nextItem.episode as unknown as any);
    }
  }, [currentIndex, items, tuneToIndex, globalAudio]);

  const handleNext = useCallback(() => {
    if (items.length === 0) return;
    const nextIdx = (currentIndex + 1) % items.length;
    tuneToIndex(nextIdx);
    const nextItem = items[nextIdx];
    if (globalAudio.isPlaying && nextItem?.episode) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      globalAudio.playTrack(nextItem.episode as unknown as any);
    }
  }, [currentIndex, items, tuneToIndex, globalAudio]);

  const handleReturnToDefault = useCallback(() => {
    if (items.length > 0) {
      tuneToIndex(0);
    }
    if (onReturnToDefault) {
      onReturnToDefault();
    }
  }, [items, tuneToIndex, onReturnToDefault]);

  // Active item
  const currentItem = items[currentIndex] ?? null;

  // Determine if currently tuned item is active in global audio
  const isThisItemActive = Boolean(
    currentItem?.episode &&
    globalAudio.currentTrack?.episode_id === currentItem.episode.episode_id
  );

  const activeDuration = isThisItemActive
    ? (globalAudio.duration > 0 ? globalAudio.duration : (currentItem?.durationSeconds || 0))
    : (currentItem?.durationSeconds || 0);

  const activeCurrentTime = isThisItemActive ? globalAudio.currentTime : 0;
  const activeProgress = activeDuration > 0 ? activeCurrentTime / activeDuration : 0;
  const isPlaying = Boolean(isThisItemActive && globalAudio.isPlaying);

  // Seek handler allowing listeners to jump to any timestamp
  const handleSeek = useCallback(
    (targetSeconds: number) => {
      if (!currentItem) return;

      if (currentItem.isLive) {
        setAuthMessage('Live 90.8 FM broadcast is in real time.');
        setTimeout(() => setAuthMessage(null), 3000);
        return;
      }

      const ep = currentItem.episode;
      if (!ep) return;

      if (isThisItemActive) {
        globalAudio.seek(targetSeconds);
      } else {
        // Cue and play this episode starting at target timestamp
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        globalAudio.playTrack(ep as unknown as any, targetSeconds);
      }
    },
    [currentItem, isThisItemActive, globalAudio],
  );

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
              progress={activeProgress}
              currentTime={activeCurrentTime}
              duration={activeDuration}
              authMessage={authMessage}
              isTuning={isTuning}
              isPoweredOn={isPoweredOn}
              onSeek={handleSeek}
              onTogglePlay={handleTogglePlay}
              onReturnToDefault={onReturnToDefault ? handleReturnToDefault : undefined}
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

