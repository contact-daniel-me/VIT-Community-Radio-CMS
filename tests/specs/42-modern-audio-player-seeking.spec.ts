import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('Modern Audio Player Seeking, Progress Scrubber & Playback Controls', () => {
  const css = readSrc('src/styles/retro-radio.css');
  const displayTsx = readSrc('src/components/site/RetroRadio/RadioDisplay.tsx');
  const radioTsx = readSrc('src/components/site/RetroRadio/RetroRadio.tsx');
  const audioContextTsx = readSrc('src/hooks/GlobalAudioContext.tsx');
  const controlsTsx = readSrc('src/components/site/RetroRadio/RadioControls.tsx');

  describe('1. Forward and Backward Seeking', () => {
    it('implements discrete backward (-10s) and forward (+10s) seek buttons in RadioDisplay', () => {
      expect(displayTsx).toContain('retro-seek-backward');
      expect(displayTsx).toContain('retro-seek-forward');
      expect(displayTsx).toContain('-10s');
      expect(displayTsx).toContain('+10s');
      expect(displayTsx).toContain('Math.max(0, currentTime - 10)');
      expect(displayTsx).toContain('Math.min(effectiveDuration, currentTime + 10)');
    });

    it('supports keyboard forward and backward seeking via arrow keys and page keys', () => {
      expect(displayTsx).toContain("e.key === 'ArrowLeft'");
      expect(displayTsx).toContain("e.key === 'ArrowRight'");
      expect(displayTsx).toContain('currentTime - 5');
      expect(displayTsx).toContain('currentTime + 5');
      expect(displayTsx).toContain("e.key === 'Home'");
      expect(displayTsx).toContain("e.key === 'End'");
      expect(displayTsx).toContain("e.key === 'PageDown'");
      expect(displayTsx).toContain("e.key === 'PageUp'");
    });

    it('wires seek handlers from RetroRadio into RadioDisplay', () => {
      expect(radioTsx).toContain('handleSeek');
      expect(radioTsx).toContain('onSeek={handleSeek}');
      expect(displayTsx).toContain('onSeek?: (seconds: number) => void');
    });
  });

  describe('2. Clickable and Draggable Progress Scrubber', () => {
    it('implements pointer down, pointer move, and pointer up drag/scrub mechanics', () => {
      expect(displayTsx).toContain('onPointerDown={handlePointerDown}');
      expect(displayTsx).toContain('getTimeFromPointer');
      expect(displayTsx).toContain('setIsScrubbing');
      expect(displayTsx).toContain('setScrubTime');
      expect(displayTsx).toContain("window.addEventListener('pointermove'");
      expect(displayTsx).toContain("window.addEventListener('pointerup'");
      expect(displayTsx).toContain("setPointerCapture");
    });

    it('renders a tactile retro scrubber thumb/indicator', () => {
      expect(displayTsx).toContain('retro-progress-thumb');
      expect(css).toContain('.retro-display-compact-progress .retro-progress-thumb');
      expect(css).toContain('var(--radio-play-btn, #D91F2B)');
    });

    it('configures accessible ARIA slider attributes on the progress track', () => {
      expect(displayTsx).toContain('role="slider"');
      expect(displayTsx).toContain('aria-label="Audio progress scrubber"');
      expect(displayTsx).toContain('aria-valuemin');
      expect(displayTsx).toContain('aria-valuemax');
      expect(displayTsx).toContain('aria-valuenow');
      expect(displayTsx).toContain('aria-valuetext');
    });

    it('provides instant visual update during active scrubbing without CSS lag', () => {
      expect(css).toContain('.retro-display-compact-progress .retro-progress-track.is-scrubbing .retro-progress-fill');
      expect(css).toContain('transition: none');
    });
  });

  describe('3. Jumping to Any Timestamp in the Episode', () => {
    it('calculates proportional timestamp from track width and click/drag position', () => {
      expect(displayTsx).toContain('getBoundingClientRect()');
      expect(displayTsx).toContain('ratio * effectiveDuration');
      expect(displayTsx).toContain('onSeek(finalTime)');
    });

    it('allows seeking even when audio track is not yet loaded or when paused', () => {
      expect(radioTsx).toContain('globalAudio.playTrack(ep as unknown as any, targetSeconds)');
      expect(audioContextTsx).toContain('playTrack = async (track: PublicTopAudioRow, startTime = 0)');
      expect(audioContextTsx).toContain('pendingSeekTimeRef');
    });
  });

  describe('4. Support Play and Pause', () => {
    it('supports play and pause both from the main push button and the display seek controls', () => {
      expect(controlsTsx).toContain('retro-btn-play');
      expect(displayTsx).toContain('retro-seek-btn retro-seek-play');
      expect(displayTsx).toContain('onTogglePlay');
      expect(radioTsx).toContain('onTogglePlay={handleTogglePlay}');
    });

    it('switches play/pause button state and text dynamically', () => {
      expect(displayTsx).toContain("{isPlaying ? 'PAUSE' : 'PLAY'}");
      expect(controlsTsx).toContain("{isPlaying ? 'PAUSE' : 'PLAY'}");
    });
  });

  describe('5. Elapsed Time and Total Duration Display', () => {
    it('formats time with formatClock supporting standard and hour-long durations', () => {
      expect(displayTsx).toContain('formatClock(seconds: number)');
      expect(displayTsx).toContain('Math.floor(totalSecs / 3600)');
      expect(displayTsx).toContain('displayCurrentTime');
      expect(displayTsx).toContain('effectiveDuration');
    });

    it('renders current elapsed time and duration separator in time readout', () => {
      expect(displayTsx).toContain('time-curr');
      expect(displayTsx).toContain('time-sep');
      expect(displayTsx).toContain('time-dur');
    });
  });

  describe('6. Retaining Volume Controls', () => {
    it('retains rotary volume knob with scroll, drag, step buttons and keyboard', () => {
      expect(controlsTsx).toContain('retro-rotary-knob volume');
      expect(controlsTsx).toContain('retro-vol-step-btn');
      expect(controlsTsx).toContain('handleVolumeWheel');
      expect(controlsTsx).toContain('handlePointerDown');
      expect(controlsTsx).toContain('handleKeyDown');
    });
  });

  describe('7. Retaining Previous and Next Episode Controls', () => {
    it('retains PREV and NEXT push buttons and rotary tuning dial', () => {
      expect(controlsTsx).toContain('retro-btn-prev');
      expect(controlsTsx).toContain('retro-btn-next');
      expect(controlsTsx).toContain('tuning-knob');
      expect(radioTsx).toContain('handlePrev');
      expect(radioTsx).toContain('handleNext');
    });

    it('auto-plays next episode when pressing next while audio is playing', () => {
      expect(radioTsx).toContain('if (globalAudio.isPlaying && nextItem?.episode)');
    });
  });

  describe('8. Audio URL and Engine Compatibility (Cloudflare R2 & Supabase)', () => {
    it('supports pending seek time when audio element is buffering or awaiting metadata', () => {
      expect(audioContextTsx).toContain('pendingSeekTimeRef');
      expect(audioContextTsx).toContain('onLoadedMetadata');
      expect(audioContextTsx).toContain('onCanPlay');
      expect(audioContextTsx).toContain('onDurationChange');
    });

    it('sets preload to auto for fast range streaming', () => {
      expect(audioContextTsx).toContain("audioRef.current.preload = 'auto'");
    });
  });

  describe('9. Removal of Logic that Resets Playback Position', () => {
    it('does not contain the 12-second autoplay dial interval that auto-advanced paused station', () => {
      expect(radioTsx).not.toContain('12000');
      expect(radioTsx).not.toContain('Autoplay dial cycle: advances tuning');
    });
  });

  describe('10. Responsive Layout and Visual Design', () => {
    it('styles small seek controls with vintage brass/cream palette matching radio aesthetic', () => {
      expect(css).toContain('.retro-display-seek-controls');
      expect(css).toContain('.retro-seek-btn');
      expect(css).toContain('.retro-seek-btn.retro-seek-play.is-playing');
    });

    it('spans compact progress full width on mobile viewports', () => {
      expect(css).toContain('.retro-display-compact-progress {');
      expect(css).toContain('grid-column: 1 / -1;');
    });
  });
});
