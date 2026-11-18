import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isEpisodePublishedAndShareable, isEpisodeScheduledAndShareable, buildEpisodeShareUrl } from '../../src/utils/sharing';

const ROOT = path.resolve(__dirname, '../../');

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

describe('Published Episode Sharing & Public Playback Validation (VIT Community Radio CMS)', () => {
  const sharingTs = readSrc('src/utils/sharing.ts');
  const migrationSql = readSrc('supabase/migrations/20261118000001_scheduled_episode_sharing.sql');
  const publicServiceTs = readSrc('src/services/publicService.ts');
  const dialogTsx = readSrc('src/components/ShareEpisodeDialog.tsx');
  const heroTsx = readSrc('src/components/site/Hero.tsx');
  const radioTsx = readSrc('src/components/site/RetroRadio/RetroRadio.tsx');
  const displayTsx = readSrc('src/components/site/RetroRadio/RadioDisplay.tsx');
  const homePageTsx = readSrc('src/pages/HomePage.tsx');
  const appTsx = readSrc('src/App.tsx');
  const episodesPageTsx = readSrc('src/pages/EpisodesPage.tsx');
  const episodeDetailTsx = readSrc('src/pages/EpisodeDetailPage.tsx');

  describe('1. Sharing Eligibility & Rules Enforcement', () => {
    it('allows sharing ONLY when episode is APPROVED, show_on_homepage is true, has audio, and status is PUBLISHED', () => {
      expect(sharingTs).toContain('isEpisodePublishedAndShareable');
      const eligibleEpisode = {
        id: 'ep-1',
        status: 'APPROVED',
        publish_status: 'PUBLISHED',
        show_on_homepage: true,
        final_audio_file_id: 'audio-final-1',
      };
      expect(isEpisodePublishedAndShareable(eligibleEpisode, 'PUBLISHED')).toBe(true);
      expect(isEpisodeScheduledAndShareable(eligibleEpisode, 'PUBLISHED')).toBe(true);
    });

    it('rejects Draft, Final Uploaded, QC Pending, Rejected, and Not Scheduled episodes', () => {
      // Draft
      expect(isEpisodePublishedAndShareable({
        status: 'DRAFT',
        publish_status: 'DRAFT',
        show_on_homepage: true,
        final_audio_file_id: null,
      })).toBe(false);

      // Pending QC
      expect(isEpisodePublishedAndShareable({
        status: 'PENDING_QC',
        publish_status: 'PENDING_QC',
        show_on_homepage: true,
        final_audio_file_id: 'audio-1',
      })).toBe(false);

      // Rejected
      expect(isEpisodePublishedAndShareable({
        status: 'REJECTED',
        publish_status: 'DRAFT',
        show_on_homepage: true,
        final_audio_file_id: 'audio-1',
      })).toBe(false);

      // Not Scheduled
      expect(isEpisodePublishedAndShareable({
        status: 'APPROVED',
        publish_status: 'NOT_SCHEDULED',
        show_on_homepage: true,
        final_audio_file_id: 'audio-1',
      }, 'NOT_SCHEDULED')).toBe(false);
    });

    it('rejects future scheduled episodes that are not yet published on the Radio Home Page', () => {
      const futureScheduled = {
        status: 'APPROVED',
        publish_status: 'SCHEDULED',
        show_on_homepage: true,
        homepage_publish_at: new Date(Date.now() + 86400000).toISOString(),
        final_audio_file_id: 'audio-final-2',
      };
      expect(isEpisodePublishedAndShareable(futureScheduled, 'SCHEDULED')).toBe(false);
    });

    it('rejects episodes not selected for the Radio Home Page (show_on_homepage === false)', () => {
      const notOnHomepage = {
        status: 'APPROVED',
        publish_status: 'PUBLISHED',
        show_on_homepage: false,
        final_audio_file_id: 'audio-final-1',
      };
      expect(isEpisodePublishedAndShareable(notOnHomepage, 'PUBLISHED')).toBe(false);
    });

    it('rejects expired episodes', () => {
      const expiredEpisode = {
        status: 'APPROVED',
        publish_status: 'EXPIRED',
        show_on_homepage: true,
        homepage_expires_at: new Date(Date.now() - 3600000).toISOString(),
        final_audio_file_id: 'audio-final-1',
      };
      expect(isEpisodePublishedAndShareable(expiredEpisode, 'EXPIRED')).toBe(false);
    });
  });

  describe('2. Share Functionality & URL Generation', () => {
    it('generates a unique public URL containing the episode ID query param with production domain support', () => {
      const url = buildEpisodeShareUrl('test-ep-123');
      expect(url).toContain('/?episode=test-ep-123');
      expect(sharingTs).toContain('VITE_PUBLIC_SITE_URL');
    });

    it('ShareEpisodeDialog provides Share Public Episode title, Copy Link, Published status badge, and clipboard fallback', () => {
      expect(dialogTsx).toContain('Share Public Episode');
      expect(dialogTsx).toContain('Anyone with this public link can listen to the final QC-approved episode directly from the VIT Community Radio website without logging in.');
      expect(dialogTsx).toContain('buildEpisodeShareUrl(episode.id)');
      expect(dialogTsx).toContain('navigator.clipboard.writeText');
      expect(dialogTsx).toContain('Copy Link');
      expect(dialogTsx).toContain('Copied');
      expect(dialogTsx).toContain('Status: Published');
      expect(dialogTsx).toContain('readOnly');
      expect(dialogTsx).toContain('dialog-footer');
      expect(dialogTsx).toContain("justifyContent: 'flex-end'");
      expect(dialogTsx).toContain('Done');
    });

    it('App.tsx redirects /share/:episodeId to /?episode=:episodeId', () => {
      expect(appTsx).toContain('path="/share/:episodeId"');
      expect(appTsx).toContain('ShareEpisodeRedirect');
      expect(appTsx).toContain('Navigate to={`/?episode=');
    });
  });

  describe('3. Public Navigation, Direct Radio Receiver Playback & No Autoplay', () => {
    it('HomePage reads ?episode or ?shared and loads episode directly into RetroRadio without separate listening card', () => {
      expect(homePageTsx).toContain("searchParams.get('episode')");
      expect(homePageTsx).toContain('publicService.getSharedScheduledEpisode');
      // No extra highlight card above the homepage
      expect(homePageTsx).not.toContain('<SharedEpisodeHighlight');
      expect(homePageTsx).toContain('sharedEpisode={shared.data}');
      expect(homePageTsx).toContain('onReturnToDefault={handleReturnToDefaultRadio}');
    });

    it('RetroRadio tunes to shared episode directly, displaying SHARED badge and return action', () => {
      expect(heroTsx).toContain('sharedEpisode?: SharedScheduledEpisode | null');
      expect(heroTsx).toContain('onReturnToDefault?: () => void');
      expect(heroTsx).toContain('<RetroRadio');
      expect(radioTsx).toContain('sharedEpisode?: SharedScheduledEpisode | null');
      expect(radioTsx).toContain('onReturnToDefault?: () => void');
      expect(radioTsx).toContain('isSharedScheduled: true');
      expect(radioTsx).toContain('globalAudio.setTrack');
      expect(displayTsx).toContain('item.isSharedScheduled');
      expect(displayTsx).toContain('SHARED');
      expect(displayTsx).toContain('Return to Live Dial');
      // Displays title, host RJ, description and duration
      expect(displayTsx).toContain('retro-display-title');
      expect(displayTsx).toContain('retro-display-rj');
      expect(displayTsx).toContain('retro-display-desc');
      expect(displayTsx).toContain('retro-display-compact-progress');
    });

    it('guarantees audio is never autoplays on page load', () => {
      // In HomePage, neither playTrack nor audio.play() is invoked unconditionally on load
      expect(homePageTsx).not.toContain('.playTrack(');
      // In RetroRadio, items are loaded but playTrack is triggered only by user action
      expect(radioTsx).toContain('const isPlaying = Boolean(isThisItemActive && globalAudio.isPlaying);');
    });
  });

  describe('4. Security & Public Playback Validation', () => {
    it('database RPC verifies status = APPROVED, show_on_homepage = true, and published status', () => {
      expect(migrationSql.toLowerCase()).toContain("e.status = 'approved'");
      expect(migrationSql.toLowerCase()).toContain('e.show_on_homepage = true');
      expect(migrationSql.toLowerCase()).toContain("e.publish_status = 'published'");
    });

    it('does not make episode sharing dependent exclusively on broadcast scheduling or broadcast end time', () => {
      // publicService supports published episodes regardless of broadcast schedule end time
      expect(publicServiceTs).toContain('v_public_approved_episodes');
      expect(publicServiceTs).toContain("viewRow.publish_status === 'PUBLISHED'");
    });

    it('publicService validates current published status on every playback request', () => {
      expect(publicServiceTs).toContain('getSharedEpisodePlaybackUrl(episodeId: string)');
      expect(publicServiceTs).toContain('getSharedScheduledEpisode(episodeId)');
    });

    it('HomePage gracefully informs visitors if an episode is not published or no longer available', () => {
      expect(homePageTsx).toContain('sharedEpisodeId && !shared.loading && !shared.data');
      expect(homePageTsx).toContain('This episode is currently not published on the Radio Home Page');
    });
  });

  describe('5. CMS UI Integration for Published Episodes Only', () => {
    it('EpisodesPage displays Share button strictly for published episodes', () => {
      expect(episodesPageTsx).toContain('isEpisodeScheduledAndShareable(episode, pubStatus)');
      expect(episodesPageTsx).toContain('btn-share-episode');
      expect(episodesPageTsx).toContain('setSharingEpisode(episode)');
      expect(episodesPageTsx).toContain('<ShareEpisodeDialog');
    });

    it('EpisodeDetailPage provides Share button only for published episodes in header and lifecycle card', () => {
      expect(episodeDetailTsx).toContain('isEpisodeScheduledAndShareable(ep, headerPubStatus)');
      expect(episodeDetailTsx).toContain('isEpisodeScheduledAndShareable(ep, pubStatus)');
      expect(episodeDetailTsx).toContain('setShowShareDialog(true)');
      expect(episodeDetailTsx).toContain('<ShareEpisodeDialog');
    });
  });
});
