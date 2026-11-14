import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('Interactive Retro Radio Player Architecture & Styling', () => {
  const css = readSrc('src/styles/retro-radio.css');
  const heroTsx = readSrc('src/components/site/Hero.tsx');
  const radioTsx = readSrc('src/components/site/RetroRadio/RetroRadio.tsx');
  const displayTsx = readSrc('src/components/site/RetroRadio/RadioDisplay.tsx');
  const tuningTsx = readSrc('src/components/site/RetroRadio/RadioTuningScale.tsx');
  const controlsTsx = readSrc('src/components/site/RetroRadio/RadioControls.tsx');
  const speakerTsx = readSrc('src/components/site/RetroRadio/RadioSpeaker.tsx');
  const lampTsx = readSrc('src/components/site/RetroRadio/RadioOnAirLamp.tsx');

  describe('1. Component Architecture & Integration', () => {
    it('implements and exports all retro radio player components', () => {
      expect(radioTsx).toContain('export function RetroRadio');
      expect(lampTsx).toContain('export function RadioOnAirLamp');
      expect(speakerTsx).toContain('export function RadioSpeaker');
      expect(displayTsx).toContain('export function RadioDisplay');
      expect(tuningTsx).toContain('export function RadioTuningScale');
      expect(controlsTsx).toContain('export function RadioControls');
    });

    it('embeds RetroRadio into Hero.tsx in place of the old carousel', () => {
      expect(heroTsx).toContain("import { RetroRadio } from './RetroRadio/RetroRadio'");
      expect(heroTsx).toContain('<RetroRadio now={now} />');
    });

    it('includes dynamic highlight extraction and artwork from CMS episodes', () => {
      expect(radioTsx).toContain('parseHighlights');
      expect(radioTsx).toContain('durationMin');
      expect(radioTsx).toContain('publicService.getApprovedEpisodes');
      expect(radioTsx).toContain('publicService.getShows');
    });
  });

  describe('2. Balanced Two-Column Digital Display & Text Anti-Clipping', () => {
    it('structures the display into balanced left and right columns', () => {
      expect(css).toContain('.retro-display-grid');
      expect(css).toContain('.retro-display-left-col');
      expect(css).toContain('.retro-display-right-col');
      expect(displayTsx).toContain('retro-display-left-col');
      expect(displayTsx).toContain('retro-display-right-col');
    });

    it('prevents title clipping, overlapping and overflow issues with responsive typography', () => {
      expect(css).toContain('word-break: break-word');
      expect(css).toContain('overflow-wrap: break-word');
      expect(css).toContain('min-height: 205px');
      expect(css).toContain('.retro-display-highlights');
    });

    it('implements artwork frame and animated vector oscilloscope fallback', () => {
      expect(displayTsx).toContain('RetroOscilloscope');
      expect(displayTsx).toContain('retro-artwork-container');
      expect(css).toContain('.retro-oscilloscope-screen');
      expect(css).toContain('.retro-display-visual-frame');
    });

    it('features dual-channel stereo VU level meter', () => {
      expect(displayTsx).toContain('retro-display-stereo-meter');
      expect(css).toContain('.retro-vu-channel');
      expect(css).toContain('.vu-seg');
    });
  });

  describe('3. Refined Dimensions (~15–20% Reduction) & Vintage Palette', () => {
    it('adopts warm ivory/cream casing matching VIT Community Radio aesthetic', () => {
      expect(css).toContain('--radio-case-bg');
      expect(css).toContain('--radio-case-rim');
      expect(css).toContain('--radio-faceplate');
    });

    it('implements warm ivory and champagne-gold palette with light speaker cone and warm ivory LCD display', () => {
      expect(css).toContain('--radio-case-bg: #F2EEE5');
      expect(css).toContain('--speaker-panel-bg: #E5DFD2');
      expect(css).toContain('--speaker-cone-color: #B8B1A5');
      expect(css).toContain('--speaker-surround-color: #A9A397');
      expect(css).toContain('--radio-btn-bg: #E9E2D6');
      expect(css).toContain('--radio-play-btn: #D91F2B');
      expect(css).toContain('--lcd-bg: #F8F6F0');
      expect(css).toContain('--lcd-title: #171717');
      expect(css).toContain('--lcd-rj: #202020');
      expect(css).toContain('--lcd-desc: #292929');
      expect(css).toContain('--lcd-highlights-text: #242424');
      expect(css).toContain('--lcd-date: #38342F');
      expect(css).toContain('--lcd-meta: #353535');
      expect(css).toContain('--lcd-freq: #805000');
      expect(css).toContain('--lcd-category: #202020');
      expect(css).toContain('--lcd-highlights-head: #805000');
      expect(css).toContain('--lcd-highlights-bg: #EEE9DE');
    });

    it('reduces overall wrapper width by ~15-20% for hero balance', () => {
      expect(css).toContain('max-width: 505px');
      expect(css).toContain('grid-template-columns: 108px minmax(0, 1fr)');
    });

    it('features warm ivory LCD screen with subtle scanlines and high-contrast typography', () => {
      expect(css).toContain('--lcd-bg');
      expect(css).toContain('--lcd-amber');
      expect(css).toContain('--lcd-amber-glow');
      expect(css).toContain('.retro-display-scanlines');
    });

    it('contains perforated acoustic speaker mesh and audio diaphragm animations', () => {
      expect(css).toContain('.retro-speaker-mesh');
      expect(css).toContain('.retro-speaker-diaphragm');
      expect(css).toContain('.retro-speaker-column.is-playing');
    });

    it('implements realistic circular loudspeaker with metallic bezel and concentric layers', () => {
      expect(speakerTsx).toContain('retro-circular-speaker');
      expect(speakerTsx).toContain('speaker-chassis-ring');
      expect(speakerTsx).toContain('speaker-surround');
      expect(speakerTsx).toContain('speaker-cone');
      expect(speakerTsx).toContain('speaker-dust-cap');
      expect(speakerTsx).toContain('speaker-ribs');
      expect(speakerTsx).toContain('speaker-rivet');
      expect(css).toContain('.retro-circular-speaker');
      expect(css).toContain('.speaker-chassis-ring');
      expect(css).toContain('.speaker-surround');
      expect(css).toContain('.speaker-cone');
      expect(css).toContain('.speaker-dust-cap');
      expect(css).toContain('.speaker-ribs');
    });

    it('implements audio-reactive animation utilizing Web Audio API AnalyserNode with fallback', () => {
      expect(speakerTsx).toContain('getSharedAnalyser');
      expect(speakerTsx).toContain('createAnalyser');
      expect(speakerTsx).toContain('getByteFrequencyData');
      expect(speakerTsx).toContain('requestAnimationFrame');
      expect(speakerTsx).toContain('cancelAnimationFrame');
    });
  });

  describe('4. Premium Startup & Mechanical Tuning Animations', () => {
    it('supports gradual display power-on illumination sequence', () => {
      expect(radioTsx).toContain('isPoweredOn');
      expect(displayTsx).toContain('isPoweredOn');
      expect(css).toContain('.retro-display-screen.is-powered-on');
      expect(css).toContain('lcdPowerWarm');
    });

    it('initiates needle glide from 88 MHz and smoothly settles at 90.8 FM', () => {
      expect(radioTsx).toContain('initialTuningSettled');
      expect(tuningTsx).toContain('initialTuningSettled');
      expect(css).toContain('.retro-tuning-needle');
      expect(css).toContain('cubic-bezier');
    });

    it('implements active breathing glow when live and dark jewel when offline', () => {
      expect(lampTsx).toContain("isLive ? 'is-live' : 'is-offline'");
      expect(css).toContain('.retro-onair-housing.is-live');
      expect(css).toContain('onAirBreathe');
      expect(css).toContain('.retro-onair-text');
    });

    it('features tactile physical button press-down animations', () => {
      expect(css).toContain('.retro-btn:active:not(:disabled) .retro-btn-cap');
      expect(css).toContain('transform: translateY(2px)');
    });

    it('supports live stream and recorded show segregation in RetroRadio.tsx', () => {
      expect(radioTsx).toContain("broadcast_status === 'ON_AIR'");
      expect(radioTsx).toContain('VITE_STREAM_URL');
      expect(radioTsx).toContain('live-broadcast-908');
    });
  });

  describe('5. Mobile Responsiveness & Accessibility', () => {
    it('includes dedicated mobile rules stacking faceplate and maintaining large touch targets', () => {
      expect(css).toContain('@media (max-width: 600px)');
      expect(css).toContain('grid-template-columns: 1fr');
      expect(css).toContain('min-height: 38px');
    });

    it('respects prefers-reduced-motion accessibility preference', () => {
      expect(css).toContain('@media (prefers-reduced-motion: reduce)');
      expect(css).toContain('animation: none !important');
    });

    it('provides keyboard navigation support in RetroRadio', () => {
      expect(radioTsx).toContain("'ArrowLeft'");
      expect(radioTsx).toContain("'ArrowRight'");
      expect(radioTsx).toContain("'Space'");
    });
  });
});
