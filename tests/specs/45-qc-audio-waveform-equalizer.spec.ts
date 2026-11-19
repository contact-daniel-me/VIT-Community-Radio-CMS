import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('QC Review Page Animated Waveform & Equalizer', () => {
  const audioPlayerTsx = readSrc('src/components/AudioPlayer.tsx');
  const episodeDetailTsx = readSrc('src/pages/EpisodeDetailPage.tsx');
  const qcPageTsx = readSrc('src/pages/QcPage.tsx');
  const appCss = readSrc('src/styles/app.css');

  describe('1. AudioPlayer Component & Waveform Implementation', () => {
    it('supports customizable variant prop including raw and final modes', () => {
      expect(audioPlayerTsx).toContain("variant?: 'raw' | 'final' | 'default'");
      expect(audioPlayerTsx).toContain("variant = 'default'");
    });

    it('renders the waveform equalizer track with multiple spectrum bars', () => {
      expect(audioPlayerTsx).toContain('cms-waveform-equalizer');
      expect(audioPlayerTsx).toContain('cms-waveform-bars-track');
      expect(audioPlayerTsx).toContain('cms-waveform-bar');
      expect(audioPlayerTsx).toContain('WAVE_BARS.map');
    });

    it('displays dynamic status pill reflecting active playback or idle ready state', () => {
      expect(audioPlayerTsx).toContain('cms-waveform-state-pill');
      expect(audioPlayerTsx).toContain("isPlaying ? 'Playing' : 'Paused / Ready'");
      expect(audioPlayerTsx).toContain('eq-live-pulse-dot');
    });

    it('binds directly to native HTML5 audio playback events (play, pause, ended, error)', () => {
      expect(audioPlayerTsx).toContain('onPlay={handlePlay}');
      expect(audioPlayerTsx).toContain('onPlaying={handlePlay}');
      expect(audioPlayerTsx).toContain('onPause={handlePause}');
      expect(audioPlayerTsx).toContain('onEnded={handleEnded}');
      expect(audioPlayerTsx).toContain('onError={handleError}');
      expect(audioPlayerTsx).toContain('onEmptied={handlePause}');
    });

    it('notifies parent via onPlayingChange callback when playback state transitions', () => {
      expect(audioPlayerTsx).toContain('onPlayingChange?.(true)');
      expect(audioPlayerTsx).toContain('onPlayingChange?.(false)');
      expect(audioPlayerTsx).toContain('onPlayingChange?: (isPlaying: boolean) => void');
    });

    it('allows toggling playback and seeking without interfering with controls', () => {
      expect(audioPlayerTsx).toContain('togglePlayback');
      expect(audioPlayerTsx).toContain('seekToClientX');
      expect(audioPlayerTsx).toContain('<audio');
      expect(audioPlayerTsx).toContain('controls');
    });
  });

  describe('2. Real-Time Audio and Waveform Playback Synchronization', () => {
    it('listens to time updates and seek events from the audio element', () => {
      expect(audioPlayerTsx).toContain('onTimeUpdate={handleTimeUpdate}');
      expect(audioPlayerTsx).toContain('onSeeked={handleTimeUpdate}');
      expect(audioPlayerTsx).toContain('onLoadedMetadata={handleLoadedMetadata}');
    });

    it('tracks live progress and updates played vs unplayed waveform bars', () => {
      expect(audioPlayerTsx).toContain('activeBarIndex');
      expect(audioPlayerTsx).toContain("isPlayed ? 'is-played' : 'is-unplayed'");
      expect(audioPlayerTsx).toContain("isHead ? 'is-head' : ''");
    });

    it('renders a real-time playhead scrubber line tracking playback progress', () => {
      expect(audioPlayerTsx).toContain('cms-waveform-playhead');
      expect(audioPlayerTsx).toContain('style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }}');
      expect(appCss).toContain('.cms-waveform-playhead');
    });

    it('displays live synchronized timestamp reflecting current audio position', () => {
      expect(audioPlayerTsx).toContain('cms-waveform-time-sync');
      expect(audioPlayerTsx).toContain('formatAudioTime(currentTime)');
      expect(audioPlayerTsx).toContain('formatAudioTime(duration)');
      expect(appCss).toContain('.cms-waveform-time-sync');
    });

    it('supports interactive click and drag scrubbing to seek audio in synchronization', () => {
      expect(audioPlayerTsx).toContain('onPointerDown={handlePointerDown}');
      expect(audioPlayerTsx).toContain('onPointerMove={handlePointerMove}');
      expect(audioPlayerTsx).toContain('onPointerUp={handlePointerUp}');
    });
  });

  describe('3. Independent Raw and Final Audio Integration in EpisodeDetailPage', () => {
    it('tracks independent playback states for Raw Audio and Final Audio', () => {
      expect(episodeDetailTsx).toContain('const [isRawPlaying, setIsRawPlaying] = useState(false);');
      expect(episodeDetailTsx).toContain('const [isFinalPlaying, setIsFinalPlaying] = useState(false);');
    });

    it('passes raw variant and playback listener to Raw Audio player', () => {
      expect(episodeDetailTsx).toContain('variant="raw"');
      expect(episodeDetailTsx).toContain('onPlayingChange={setIsRawPlaying}');
    });

    it('passes final variant and playback listener to Final Audio player', () => {
      expect(episodeDetailTsx).toContain('variant="final"');
      expect(episodeDetailTsx).toContain('onPlayingChange={setIsFinalPlaying}');
    });

    it('displays animated mini equalizer badge beside Raw Audio heading when playing', () => {
      expect(episodeDetailTsx).toContain('isRawPlaying &&');
      expect(episodeDetailTsx).toContain('Playing Raw');
      expect(episodeDetailTsx).toContain('badge-orange eq-badge-pulse');
      expect(episodeDetailTsx).toContain('eq-mini-bars');
    });

    it('displays animated mini equalizer badge beside Final Audio heading when playing', () => {
      expect(episodeDetailTsx).toContain('isFinalPlaying &&');
      expect(episodeDetailTsx).toContain('Playing Final');
      expect(episodeDetailTsx).toContain('badge-pink eq-badge-pulse');
    });

    it('displays active playback badge in Audio Files card title when either stream plays', () => {
      expect(episodeDetailTsx).toContain('isRawPlaying || isFinalPlaying');
      expect(episodeDetailTsx).toContain("isFinalPlaying ? 'Final Audio Playing' : 'Raw Audio Playing'");
    });
  });

  describe('4. QC Review Page Support', () => {
    it('integrates final audio player variant in QcPage', () => {
      expect(qcPageTsx).toContain('variant="final"');
    });
  });

  describe('5. CSS Animations, Styling and Full-Width Distribution', () => {
    it('styles played bars with vibrant stream accent and unplayed bars in calm tone', () => {
      expect(appCss).toContain('.variant-raw .cms-waveform-bar.is-played');
      expect(appCss).toContain('.variant-raw .cms-waveform-bar.is-unplayed');
      expect(appCss).toContain('.variant-final .cms-waveform-bar.is-played');
      expect(appCss).toContain('.variant-final .cms-waveform-bar.is-unplayed');
    });

    it('defines mini equalizer bar dancing animation', () => {
      expect(appCss).toContain('@keyframes eqMiniDance');
      expect(appCss).toContain('.eq-mini-bars');
    });

    it('disables animations when user prefers reduced motion', () => {
      expect(appCss).toContain('@media (prefers-reduced-motion: reduce)');
      expect(appCss).toContain('.cms-waveform-bar');
      expect(appCss).toContain('animation: none !important');
    });

    it('ensures waveform bars fill 100% full width without restrictive max-width bottleneck', () => {
      expect(appCss).toContain('width: 100%');
      expect(appCss).toContain('box-sizing: border-box');
      expect(appCss).toContain('flex: 1 1 0');
      expect(appCss).not.toContain('max-width: 8px');
    });

    it('provides responsive gap and scaling across mobile and desktop viewports', () => {
      expect(appCss).toContain('@media (max-width: 640px)');
      expect(appCss).toContain('gap: 1.5px');
    });
  });
});
