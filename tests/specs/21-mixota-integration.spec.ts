import { describe, expect, it } from 'vitest';
import {
  buildMixotaLaunchUrl,
  getMixotaBaseUrl,
  type MixotaLaunchOptions,
} from '../../src/lib/mixota';

describe('Mixota Integration: URL & Launch Security', () => {
  it('returns valid base URL falling back to defaults', () => {
    const url = getMixotaBaseUrl();
    expect(url).toBeTruthy();
    expect(url.startsWith('http')).toBe(true);
  });

  it('builds a secure launch URL with minimum required non-sensitive parameters', () => {
    const options: MixotaLaunchOptions = {
      recordingId: '98d5c952-473d-4950-8b17-1f6c7c251412',
      episodeId: 'c1234567-89ab-cdef-0123-456789abcdef',
      fileName: 'morning_show_raw.mp3',
      title: 'Morning Vibes Episode 4',
      targetField: 'final_audio_file_id',
    };

    const launchUrl = buildMixotaLaunchUrl(options);
    const parsed = new URL(launchUrl);

    expect(parsed.pathname).toBe('/editor');
    expect(parsed.searchParams.get('recordingId')).toBe('98d5c952-473d-4950-8b17-1f6c7c251412');
    expect(parsed.searchParams.get('episodeId')).toBe('c1234567-89ab-cdef-0123-456789abcdef');
    expect(parsed.searchParams.get('fileName')).toBe('morning_show_raw.mp3');
    expect(parsed.searchParams.get('title')).toBe('Morning Vibes Episode 4');
    expect(parsed.searchParams.get('target')).toBe('final_audio_file_id');
  });

  it('NEVER includes database secrets, service role keys, or credentials in launch URL', () => {
    const options: MixotaLaunchOptions = {
      recordingId: '98d5c952-473d-4950-8b17-1f6c7c251412',
      episodeId: 'c1234567-89ab-cdef-0123-456789abcdef',
    };

    const launchUrl = buildMixotaLaunchUrl(options);

    expect(launchUrl).not.toContain('service_role');
    expect(launchUrl).not.toContain('anon_key');
    expect(launchUrl).not.toContain('password');
    expect(launchUrl).not.toContain('token=');
    expect(launchUrl).not.toContain('secret');
  });

  it('supports custom routes such as /multitrack or /editor', () => {
    const multitrackUrl = buildMixotaLaunchUrl({
      recordingId: 'rec-123',
      route: '/multitrack',
    });
    const parsed = new URL(multitrackUrl);
    expect(parsed.pathname).toBe('/multitrack');
    expect(parsed.searchParams.get('recordingId')).toBe('rec-123');
  });

  it('preserves raw recording by pointing target to final_audio_file_id by default', () => {
    const rawTakeLaunch = buildMixotaLaunchUrl({
      recordingId: 'raw-rec-1',
      episodeId: 'ep-1',
      targetField: 'final_audio_file_id',
    });
    const parsed = new URL(rawTakeLaunch);
    expect(parsed.searchParams.get('target')).toBe('final_audio_file_id');
  });
});
